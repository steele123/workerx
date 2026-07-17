import type { Context } from 'hono';
import type { App, ShareKind } from './app';
import { authorizeRequest } from './auth';
import { claimDownload, deleteShareRecord, findShare, recordMetric, type ShareRow } from './data';
import { escapeHtml } from './http';
import { hashString, signValue, timingSafeStringEqual, verifyPassword } from './security';

export type ShareAccessResult = { share: ShareRow; response: null } | { share: null; response: Response } | { share: null; response: null };

function passwordPage(path: string, error: boolean): Response {
	const safePath = escapeHtml(path);
	return new Response(
		`<!doctype html>
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>Protected share</title>
				<style>body{font:16px system-ui;max-width:28rem;margin:15vh auto;padding:1rem;color:#171717}form{display:grid;gap:.75rem}input,button{font:inherit;padding:.75rem}p{color:#b42318}</style>
			</head>
			<body>
				<h1>Protected share</h1>
				${error ? '<p>That password was not accepted.</p>' : ''}
				<form method="post" action="${safePath}/unlock">
					<label for="password">Password</label>
					<input id="password" name="password" type="password" required autofocus />
					<button type="submit">Open share</button>
				</form>
			</body>
		</html>`,
		{
			status: 401,
			headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' },
		},
	);
}

async function hasPasswordCookie(c: Context<App>, share: ShareRow): Promise<boolean> {
	const expected = `${share.id}.${await signValue(share.id, c.env.ACCESS_KEY)}`;
	const cookies =
		c.req
			.header('Cookie')
			?.split(';')
			.map((part) => part.trim()) ?? [];
	const values = cookies.filter((cookie) => cookie.startsWith('workerx_share=')).map((cookie) => cookie.slice('workerx_share='.length));

	for (const value of values) {
		if (await timingSafeStringEqual(value, expected)) {
			return true;
		}
	}
	return false;
}

export async function unlockShare(c: Context<App>, kind: ShareKind, publicId: string): Promise<Response> {
	const share = await findShare(c.env.DB, kind, publicId);
	if (!share?.password_hash) {
		return c.json({ error: 'Protected share not found' }, 404);
	}

	const form = await c.req.parseBody().catch(() => null);
	const password = form?.password;
	if (typeof password !== 'string' || !(await verifyPassword(password, share.password_hash))) {
		return passwordPage(c.req.path.replace(/\/unlock$/, ''), true);
	}

	const path = c.req.path.replace(/\/unlock$/, '');
	const value = `${share.id}.${await signValue(share.id, c.env.ACCESS_KEY)}`;
	const maxAge = share.expires_at ? Math.max(1, Math.min(3600, Math.floor((share.expires_at - Date.now()) / 1000))) : 3600;
	const headers = new Headers({ Location: path });
	headers.append('Set-Cookie', `workerx_share=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
	return new Response(null, { status: 303, headers });
}

export async function prepareShareAccess(c: Context<App>, kind: ShareKind, publicId: string): Promise<ShareAccessResult> {
	const share = await findShare(c.env.DB, kind, publicId);
	if (!share) {
		return { share: null, response: null };
	}

	const now = Date.now();
	if (share.expires_at !== null && share.expires_at <= now) {
		return { share: null, response: c.json({ error: 'This share has expired' }, 410) };
	}

	if (share.max_downloads !== null && share.download_count >= share.max_downloads) {
		return { share: null, response: c.json({ error: 'This share has reached its download limit' }, 410) };
	}

	if (share.password_hash) {
		if (!(await hasPasswordCookie(c, share))) {
			return { share: null, response: passwordPage(c.req.path, false) };
		}
	}

	return { share, response: null };
}

export async function claimShare(c: Context<App>, share: ShareRow): Promise<ShareRow | Response> {
	if (c.req.method === 'HEAD') {
		return share;
	}

	const claimed = await claimDownload(c.env.DB, share.id, Date.now());
	if (!claimed) {
		return c.json({ error: 'This share is no longer available' }, 410);
	}

	c.executionCtx.waitUntil(recordMetric(c.env.DB, 'downloads'));
	return claimed;
}

export function maximumUploadBytes(env: Env): number {
	const configured = Number.parseInt(env.MAX_UPLOAD_BYTES, 10);
	return Number.isSafeInteger(configured) && configured > 0 ? configured : 50 * 1024 * 1024;
}

export function validateContentLength(headers: Headers, env: Env): string | null {
	const value = headers.get('Content-Length');
	if (!value) {
		return null;
	}

	const size = Number.parseInt(value, 10);
	return size > maximumUploadBytes(env) ? `Upload exceeds the ${maximumUploadBytes(env)} byte limit` : null;
}

export function isMimeTypeAllowed(contentType: string, env: Env): boolean {
	const allowed = env.ALLOWED_MIME_TYPES.split(',').map((value) => value.trim().toLowerCase());
	const normalized = contentType.toLowerCase();
	return allowed.some((pattern) => {
		if (pattern === '*' || pattern === '*/*') {
			return true;
		}
		return pattern.endsWith('/*') ? normalized.startsWith(pattern.slice(0, -1)) : normalized === pattern;
	});
}

export async function canDeleteShare(c: Context<App>, share: ShareRow | null): Promise<boolean> {
	const token = c.req.query('token');
	if (share && token) {
		const tokenHash = await hashString(token);
		if (await timingSafeStringEqual(tokenHash, share.delete_token_hash)) {
			return true;
		}
	}

	const auth = await authorizeRequest(c);
	return Boolean(auth?.scopes.has('delete') || auth?.scopes.has('admin'));
}

export async function deleteTrackedShare(c: Context<App>, share: ShareRow): Promise<Response> {
	if (!(await canDeleteShare(c, share))) {
		return c.json({ success: false, error: 'Unauthorized' }, 401);
	}

	if (share.storage_key) {
		await c.env.STORAGE.delete(share.storage_key);
	}
	await deleteShareRecord(c.env.DB, share.id);
	c.executionCtx.waitUntil(recordMetric(c.env.DB, 'deletes'));

	return c.json({ success: true });
}

export async function ensureAliasAvailable(env: Env, kind: ShareKind, publicId: string, storageKey: string | null): Promise<boolean> {
	const [share, object] = await Promise.all([
		findShare(env.DB, kind, publicId),
		storageKey ? env.STORAGE.head(storageKey) : Promise.resolve(null),
	]);
	return !share && !object;
}
