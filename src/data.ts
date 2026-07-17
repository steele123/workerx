import type { Scope, ShareKind } from './app';

export type ShareRow = {
	id: string;
	public_id: string;
	kind: ShareKind;
	storage_key: string | null;
	destination_url: string | null;
	original_name: string | null;
	content_type: string | null;
	size: number;
	delete_token_hash: string;
	password_hash: string | null;
	expires_at: number | null;
	max_downloads: number | null;
	download_count: number;
	created_at: number;
	last_accessed_at: number | null;
};

export type NewShare = Omit<ShareRow, 'download_count' | 'last_accessed_at'>;

export type ApiKeyRow = {
	id: string;
	name: string;
	key_hash: string;
	scopes: string;
	created_at: number;
	last_used_at: number | null;
	revoked_at: number | null;
};

export async function createShare(db: D1Database, share: NewShare): Promise<void> {
	await db
		.prepare(
			`INSERT INTO shares (
				id, public_id, kind, storage_key, destination_url, original_name, content_type, size,
				delete_token_hash, password_hash, expires_at, max_downloads, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			share.id,
			share.public_id,
			share.kind,
			share.storage_key,
			share.destination_url,
			share.original_name,
			share.content_type,
			share.size,
			share.delete_token_hash,
			share.password_hash,
			share.expires_at,
			share.max_downloads,
			share.created_at,
		)
		.run();
}

export function findShare(db: D1Database, kind: ShareKind, publicId: string): Promise<ShareRow | null> {
	return db.prepare('SELECT * FROM shares WHERE kind = ? AND public_id = ?').bind(kind, publicId).first<ShareRow>();
}

export function findShareById(db: D1Database, id: string): Promise<ShareRow | null> {
	return db.prepare('SELECT * FROM shares WHERE id = ?').bind(id).first<ShareRow>();
}

export function claimDownload(db: D1Database, id: string, now: number): Promise<ShareRow | null> {
	return db
		.prepare(
			`UPDATE shares
			SET download_count = download_count + 1, last_accessed_at = ?
			WHERE id = ?
				AND (expires_at IS NULL OR expires_at > ?)
				AND (max_downloads IS NULL OR download_count < max_downloads)
			RETURNING *`,
		)
		.bind(now, id, now)
		.first<ShareRow>();
}

export async function deleteShareRecord(db: D1Database, id: string): Promise<void> {
	await db.prepare('DELETE FROM shares WHERE id = ?').bind(id).run();
}

export async function recordMetric(db: D1Database, metric: string, value = 1, now = new Date()): Promise<void> {
	const day = now.toISOString().slice(0, 10);
	await db
		.prepare(
			`INSERT INTO daily_stats (day, metric, value) VALUES (?, ?, ?)
			ON CONFLICT(day, metric) DO UPDATE SET value = value + excluded.value`,
		)
		.bind(day, metric, value)
		.run();
}

export async function listShares(db: D1Database, query: string | null, kind: string | null, limit: number): Promise<ShareRow[]> {
	const filters: string[] = [];
	const values: (string | number)[] = [];

	if (query) {
		filters.push('(public_id LIKE ? OR original_name LIKE ? OR destination_url LIKE ?)');
		const pattern = `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
		values.push(pattern, pattern, pattern);
	}

	if (kind && ['image', 'file', 'link'].includes(kind)) {
		filters.push('kind = ?');
		values.push(kind);
	}

	const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
	const result = await db
		.prepare(`SELECT * FROM shares ${where} ORDER BY created_at DESC LIMIT ?`)
		.bind(...values, limit)
		.all<ShareRow>();

	return result.results;
}

export async function getStatistics(db: D1Database) {
	const [totals, metrics] = await db.batch([
		db.prepare(
			`SELECT
				COUNT(*) AS shares,
				COALESCE(SUM(size), 0) AS stored_bytes,
				COALESCE(SUM(download_count), 0) AS downloads
			FROM shares`,
		),
		db.prepare(`SELECT day, metric, value FROM daily_stats WHERE day >= date('now', '-30 days') ORDER BY day DESC, metric`),
	]);

	return {
		totals: totals.results[0] ?? { shares: 0, stored_bytes: 0, downloads: 0 },
		daily: metrics.results,
	};
}

export function findApiKey(db: D1Database, keyHash: string): Promise<ApiKeyRow | null> {
	return db.prepare('SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL').bind(keyHash).first<ApiKeyRow>();
}

export async function createApiKey(
	db: D1Database,
	input: { id: string; name: string; keyHash: string; scopes: Scope[]; createdAt: number },
): Promise<void> {
	await db
		.prepare('INSERT INTO api_keys (id, name, key_hash, scopes, created_at) VALUES (?, ?, ?, ?, ?)')
		.bind(input.id, input.name, input.keyHash, input.scopes.join(','), input.createdAt)
		.run();
}

export async function listApiKeys(db: D1Database): Promise<Omit<ApiKeyRow, 'key_hash'>[]> {
	const result = await db
		.prepare('SELECT id, name, scopes, created_at, last_used_at, revoked_at FROM api_keys ORDER BY created_at DESC')
		.all<Omit<ApiKeyRow, 'key_hash'>>();
	return result.results;
}

export async function revokeApiKey(db: D1Database, id: string, now: number): Promise<void> {
	await db.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ?').bind(now, id).run();
}

export async function cleanupExpiredShares(env: Env, now = Date.now()): Promise<number> {
	const expired = await env.DB.prepare('SELECT * FROM shares WHERE expires_at IS NOT NULL AND expires_at <= ? LIMIT 100')
		.bind(now)
		.all<ShareRow>();

	for (const share of expired.results) {
		if (share.storage_key) {
			await env.STORAGE.delete(share.storage_key);
		}
	}

	if (expired.results.length) {
		await env.DB.batch(expired.results.map((share) => env.DB.prepare('DELETE FROM shares WHERE id = ?').bind(share.id)));
		await recordMetric(env.DB, 'expired', expired.results.length);
	}

	return expired.results.length;
}
