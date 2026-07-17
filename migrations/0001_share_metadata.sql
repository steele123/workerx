CREATE TABLE shares (
	id TEXT PRIMARY KEY,
	public_id TEXT NOT NULL UNIQUE,
	kind TEXT NOT NULL CHECK (kind IN ('image', 'file', 'link')),
	storage_key TEXT,
	destination_url TEXT,
	original_name TEXT,
	content_type TEXT,
	size INTEGER NOT NULL DEFAULT 0 CHECK (size >= 0),
	delete_token_hash TEXT NOT NULL,
	password_hash TEXT,
	expires_at INTEGER,
	max_downloads INTEGER CHECK (max_downloads IS NULL OR max_downloads > 0),
	download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
	created_at INTEGER NOT NULL,
	last_accessed_at INTEGER,
	CHECK (
		(kind = 'link' AND destination_url IS NOT NULL AND storage_key IS NULL)
		OR
		(kind IN ('image', 'file') AND storage_key IS NOT NULL AND destination_url IS NULL)
	)
);

CREATE INDEX shares_kind_created_at_idx ON shares (kind, created_at DESC);
CREATE INDEX shares_expires_at_idx ON shares (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE api_keys (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	key_hash TEXT NOT NULL UNIQUE,
	scopes TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	last_used_at INTEGER,
	revoked_at INTEGER
);

CREATE INDEX api_keys_active_hash_idx ON api_keys (key_hash) WHERE revoked_at IS NULL;

CREATE TABLE daily_stats (
	day TEXT NOT NULL,
	metric TEXT NOT NULL,
	value INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (day, metric)
);
