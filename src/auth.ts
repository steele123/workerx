import type { Context, MiddlewareHandler } from 'hono';
import { SCOPES, type App, type AuthContext, type Scope } from './app';
import { findApiKey } from './data';
import { hashString, timingSafeStringEqual, verifyAccessJwt } from './security';

function credentialFromRequest(request: Request): string {
	const authorization = request.headers.get('Authorization')?.trim() ?? '';
	return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : authorization;
}

function parseScopes(value: string): Set<Scope> {
	const scopes = value.split(',').filter((scope): scope is Scope => SCOPES.includes(scope as Scope));
	return new Set(scopes);
}

export async function authorizeRequest(c: Context<App>): Promise<AuthContext | null> {
	const existing = c.get('auth');
	if (existing) {
		return existing;
	}

	const credential = credentialFromRequest(c.req.raw);
	if (!credential) {
		return null;
	}

	if (c.env.ACCESS_KEY && (await timingSafeStringEqual(credential, c.env.ACCESS_KEY))) {
		const auth: AuthContext = {
			name: 'master key',
			scopes: new Set(SCOPES),
			via: 'master',
		};
		c.set('auth', auth);
		return auth;
	}

	const keyHash = await hashString(credential);
	const apiKey = await findApiKey(c.env.DB, keyHash);
	if (!apiKey) {
		return null;
	}

	const auth: AuthContext = {
		name: apiKey.name,
		scopes: parseScopes(apiKey.scopes),
		via: 'api-key',
	};
	c.set('auth', auth);
	c.executionCtx.waitUntil(c.env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(Date.now(), apiKey.id).run());

	return auth;
}

export function requireScope(scope: Scope): MiddlewareHandler<App> {
	return async (c, next) => {
		const auth = await authorizeRequest(c);
		if (!auth || (!auth.scopes.has(scope) && !auth.scopes.has('admin'))) {
			return c.json({ success: false, error: 'Unauthorized' }, 401);
		}

		return next();
	};
}

export const requireUpload = requireScope('upload');

export const requireAdmin: MiddlewareHandler<App> = async (c, next) => {
	const accessUser = await verifyAccessJwt(c.req.raw, c.env);
	if (accessUser) {
		c.set('auth', {
			name: accessUser,
			scopes: new Set(SCOPES),
			via: 'cloudflare-access',
		});
		return next();
	}

	return requireScope('admin')(c, next);
};
