-- Skema SIGAP Bencana (PostgreSQL). Idempoten: aman dijalankan berulang kali.

CREATE TABLE IF NOT EXISTS users (
	id SERIAL PRIMARY KEY,
	username VARCHAR(32) NOT NULL,
	name VARCHAR(100) NOT NULL,
	password_hash TEXT NOT NULL,
	role VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
	ai_credits INTEGER NOT NULL DEFAULT 0 CHECK (ai_credits >= 0),
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(10) NOT NULL DEFAULT 'user'
	CHECK (role IN ('user', 'admin'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_credits INTEGER NOT NULL DEFAULT 0
	CHECK (ai_credits >= 0);
-- Username unik tanpa membedakan huruf besar/kecil.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));

CREATE TABLE IF NOT EXISTS reports (
	id SERIAL PRIMARY KEY,
	user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
	category VARCHAR(20) NOT NULL DEFAULT 'lainnya'
		CHECK (category IN ('banjir', 'longsor', 'gempa', 'karhutla', 'erupsi', 'cuaca', 'lainnya')),
	severity VARCHAR(10) NOT NULL DEFAULT 'sedang'
		CHECK (severity IN ('rendah', 'sedang', 'tinggi')),
	description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
	image_data TEXT NOT NULL DEFAULT '',
	lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
	lon DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN -180 AND 180),
	status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_data TEXT NOT NULL DEFAULT '';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'pending'
	CHECK (status IN ('pending', 'verified', 'rejected'));
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS reports_user_id_idx ON reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_status_created_at_idx ON reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS news (
	id SERIAL PRIMARY KEY,
	slug VARCHAR(120) NOT NULL UNIQUE,
	title TEXT NOT NULL,
	category VARCHAR(50) NOT NULL,
	author VARCHAR(100) NOT NULL,
	excerpt TEXT NOT NULL,
	content TEXT NOT NULL,
	image TEXT NOT NULL DEFAULT '',
	published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS news_published_at_idx ON news (published_at DESC);

-- Titik panas (karhutla) hasil sinkronisasi NASA FIRMS.
CREATE TABLE IF NOT EXISTS hotspots (
	id BIGSERIAL PRIMARY KEY,
	lat DOUBLE PRECISION NOT NULL,
	lon DOUBLE PRECISION NOT NULL,
	confidence SMALLINT NOT NULL,
	frp REAL,
	satellite VARCHAR(20),
	detected_at TIMESTAMPTZ NOT NULL,
	UNIQUE (lat, lon, detected_at)
);
CREATE INDEX IF NOT EXISTS hotspots_detected_at_idx ON hotspots (detected_at);

CREATE TABLE IF NOT EXISTS sync_state (
	key VARCHAR(50) PRIMARY KEY,
	synced_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_payments (
	id BIGSERIAL PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	package_id VARCHAR(20) NOT NULL,
	amount_idr INTEGER NOT NULL CHECK (amount_idr > 0),
	credits INTEGER NOT NULL CHECK (credits > 0),
	payment_reference VARCHAR(120) NOT NULL,
	status VARCHAR(10) NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'approved', 'rejected')),
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ai_payments_user_created_idx ON ai_payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_payments_pending_idx ON ai_payments (status, created_at)
	WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS ai_knowledge (
	document_key TEXT PRIMARY KEY,
	source_type VARCHAR(20) NOT NULL,
	content_hash CHAR(64) NOT NULL,
	content TEXT NOT NULL,
	embedding JSONB NOT NULL,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
