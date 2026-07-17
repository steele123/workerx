import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 100_000;

// This cache contains only public signing-key resolvers, never request-scoped data.
const accessKeySets = new Map<string, JWTVerifyGetKey>();

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string): Uint8Array | null {
	if (!/^[a-f0-9]+$/i.test(value) || value.length % 2 !== 0) {
		return null;
	}

	return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

export async function hashString(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
	return bytesToHex(new Uint8Array(digest));
}

export async function timingSafeStringEqual(left: string, right: string): Promise<boolean> {
	const [leftHash, rightHash] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(left)),
		crypto.subtle.digest('SHA-256', encoder.encode(right)),
	]);

	return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

export function randomToken(byteLength = 32): string {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function signValue(value: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
	const binary = Array.from(signature, (byte) => String.fromCharCode(byte)).join('');
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function hashPassword(password: string): Promise<string> {
	const salt = new Uint8Array(16);
	crypto.getRandomValues(salt);
	const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
	const derived = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			hash: 'SHA-256',
			salt,
			iterations: PASSWORD_ITERATIONS,
		},
		key,
		256,
	);

	return `pbkdf2-sha256:${PASSWORD_ITERATIONS}:${bytesToHex(salt)}:${bytesToHex(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
	const [algorithm, iterationsValue, saltValue, expectedValue] = encodedHash.split(':');
	const iterations = Number.parseInt(iterationsValue ?? '', 10);
	const salt = hexToBytes(saltValue ?? '');
	const expected = hexToBytes(expectedValue ?? '');

	if (algorithm !== 'pbkdf2-sha256' || !Number.isSafeInteger(iterations) || !salt || !expected) {
		return false;
	}

	const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
	const derived = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			hash: 'SHA-256',
			salt,
			iterations,
		},
		key,
		expected.byteLength * 8,
	);

	return crypto.subtle.timingSafeEqual(derived, expected);
}

export async function verifyAccessJwt(request: Request, env: Env): Promise<string | null> {
	if (!env.TEAM_DOMAIN || !env.POLICY_AUD) {
		return null;
	}

	const token = request.headers.get('Cf-Access-Jwt-Assertion');
	if (!token) {
		return null;
	}

	const teamDomain = env.TEAM_DOMAIN.replace(/\/$/, '');
	let keySet = accessKeySets.get(teamDomain);

	if (!keySet) {
		keySet = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
		accessKeySets.set(teamDomain, keySet);
	}

	try {
		const { payload } = await jwtVerify(token, keySet, {
			issuer: teamDomain,
			audience: env.POLICY_AUD,
		});

		return typeof payload.email === 'string' ? payload.email : 'Cloudflare Access user';
	} catch {
		return null;
	}
}
