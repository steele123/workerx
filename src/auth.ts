import type { MiddlewareHandler } from 'hono';

const encoder = new TextEncoder();

async function isAuthorized(providedKey: string, expectedKey: string): Promise<boolean> {
	const [providedHash, expectedHash] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(providedKey)),
		crypto.subtle.digest('SHA-256', encoder.encode(expectedKey)),
	]);

	return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

export const requireAccess: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	const providedKey = c.req.header('Authorization') ?? '';

	if (!(await isAuthorized(providedKey, c.env.ACCESS_KEY))) {
		return c.json({ success: false, error: 'Unauthorized' }, 401);
	}

	return next();
};
