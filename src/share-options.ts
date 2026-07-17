import { createId } from './id';
import { hashPassword } from './security';

const RESERVED_ALIASES = new Set(['admin', 'api', 'file', 'health', 'img', 'ip', 'link', 'me', 'ua']);

export type ShareOptionsInput = {
	alias?: unknown;
	expiresIn?: unknown;
	maxDownloads?: unknown;
	password?: unknown;
};

export type ShareOptions = {
	alias: string | null;
	expiresAt: number | null;
	maxDownloads: number | null;
	passwordHash: string | null;
};

function optionalString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalPositiveInteger(value: unknown, label: string): number | null {
	if (value === undefined || value === null || value === '') {
		return null;
	}

	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`${label} must be a positive integer`);
	}

	return parsed;
}

function normalizeAlias(value: unknown): string | null {
	const alias = optionalString(value)?.toLowerCase() ?? null;
	if (!alias) {
		return null;
	}

	if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(alias) || RESERVED_ALIASES.has(alias)) {
		throw new Error('Alias must be 3-64 URL-safe characters and cannot use a reserved route name');
	}

	return alias;
}

export async function parseShareOptions(input: ShareOptionsInput, env: Env, now = Date.now()): Promise<ShareOptions> {
	const expiresIn = optionalPositiveInteger(input.expiresIn, 'Expiry');
	const maxDownloads = optionalPositiveInteger(input.maxDownloads, 'Maximum downloads');
	const maxTtlSeconds = Number.parseInt(env.MAX_TTL_SECONDS, 10);

	if (expiresIn && expiresIn > maxTtlSeconds) {
		throw new Error(`Expiry cannot exceed ${maxTtlSeconds} seconds`);
	}

	if (maxDownloads && maxDownloads > 1_000_000) {
		throw new Error('Maximum downloads cannot exceed 1000000');
	}

	const password = optionalString(input.password);
	if (password && password.length > 256) {
		throw new Error('Password cannot exceed 256 characters');
	}

	return {
		alias: normalizeAlias(input.alias),
		expiresAt: expiresIn ? now + expiresIn * 1000 : null,
		maxDownloads,
		passwordHash: password ? await hashPassword(password) : null,
	};
}

export function createPublicId(alias: string | null, extension?: string): string {
	const base = alias ?? createId();
	return extension ? `${base}.${extension}` : base;
}

export function optionsFromHeaders(headers: Headers): ShareOptionsInput {
	return {
		alias: headers.get('X-Share-Alias'),
		expiresIn: headers.get('X-Share-Expires-In'),
		maxDownloads: headers.get('X-Share-Max-Downloads'),
		password: headers.get('X-Share-Password'),
	};
}
