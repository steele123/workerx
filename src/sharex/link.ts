import { Hono } from 'hono';
import { isBot } from 'isbot';
import type { App } from '../app';
import { requireUpload } from '../auth';
import { createShare, findShare, recordMetric } from '../data';
import { appendQuery, escapeHtml, publicUrl } from '../http';
import { createPublicId, parseShareOptions } from '../share-options';
import { canDeleteShare, claimShare, deleteTrackedShare, ensureAliasAvailable, prepareShareAccess, unlockShare } from '../shares';
import { hashString, randomToken } from '../security';

export const linkRouter = new Hono<App>();

linkRouter.post('/:id/unlock', (c) => unlockShare(c, 'link', c.req.param('id')));

linkRouter.get('/:id', async (c) => {
	const publicId = c.req.param('id');
	const access = await prepareShareAccess(c, 'link', publicId);
	if (access.response) {
		return access.response;
	}

	if (access.share) {
		if (isBot(c.req.header('User-Agent')) || c.req.query('preview') === '1') {
			const destination = escapeHtml(access.share.destination_url ?? c.env.SITE_URL);
			return c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8" />
				<meta property="og:title" content="Shared link" /><meta property="og:url" content="${destination}" />
				<meta property="og:description" content="Open the shared destination" /><meta property="og:type" content="website" />
				<meta http-equiv="refresh" content="0;url=${destination}" /><title>Shared link</title></head>
				<body><a href="${destination}">Continue to shared link</a></body></html>`);
		}

		const claimed = await claimShare(c, access.share);
		if (claimed instanceof Response) {
			return claimed;
		}
		return c.redirect(claimed.destination_url ?? c.env.SITE_URL);
	}

	const legacyLink = await c.env.KV.get(`link_${publicId}`);
	return legacyLink ? c.redirect(legacyLink) : c.json({ error: 'Not found' }, 404);
});

linkRouter.delete('/link/:id', async (c) => {
	const publicId = c.req.param('id');
	const share = await findShare(c.env.DB, 'link', publicId);
	if (share) {
		return deleteTrackedShare(c, share);
	}

	if (!(await canDeleteShare(c, null))) {
		return c.json({ success: false, error: 'Unauthorized' }, 401);
	}
	await c.env.KV.delete(`link_${publicId}`);
	return c.json({ success: true });
});

linkRouter.post('/link', requireUpload, async (c) => {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ success: false, error: 'Invalid JSON body' }, 400);
	}

	if (typeof body !== 'object' || body === null || !('link' in body) || typeof body.link !== 'string') {
		return c.json({ success: false, error: 'No link provided' }, 400);
	}

	let destination: URL;
	try {
		destination = new URL(body.link);
	} catch {
		return c.json({ success: false, error: 'Invalid link' }, 400);
	}
	if (!['http:', 'https:'].includes(destination.protocol)) {
		return c.json({ success: false, error: 'Only HTTP and HTTPS links are supported' }, 400);
	}

	let options;
	try {
		options = await parseShareOptions(
			{
				alias: 'alias' in body ? body.alias : undefined,
				expiresIn: 'expiresIn' in body ? body.expiresIn : undefined,
				maxDownloads: 'maxDownloads' in body ? body.maxDownloads : undefined,
				password: 'password' in body ? body.password : undefined,
			},
			c.env,
		);
	} catch (error) {
		return c.json({ success: false, error: error instanceof Error ? error.message : 'Invalid share options' }, 400);
	}

	const publicId = createPublicId(options.alias);
	if (!(await ensureAliasAvailable(c.env, 'link', publicId, null))) {
		return c.json({ success: false, error: 'That alias is already in use' }, 409);
	}

	const deleteToken = randomToken();
	await createShare(c.env.DB, {
		id: crypto.randomUUID(),
		public_id: publicId,
		kind: 'link',
		storage_key: null,
		destination_url: destination.toString(),
		original_name: null,
		content_type: null,
		size: 0,
		delete_token_hash: await hashString(deleteToken),
		password_hash: options.passwordHash,
		expires_at: options.expiresAt,
		max_downloads: options.maxDownloads,
		created_at: Date.now(),
	});

	const url = publicUrl(c.env.SITE_URL, publicId);
	c.executionCtx.waitUntil(recordMetric(c.env.DB, 'links_created'));

	return c.json({
		success: true,
		id: publicId,
		url,
		delete: appendQuery(publicUrl(c.env.SITE_URL, `link/${publicId}`), { token: deleteToken }),
		expiresAt: options.expiresAt ? new Date(options.expiresAt).toISOString() : null,
	});
});
