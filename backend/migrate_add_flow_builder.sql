-- DB-backed Flow Builder (flows + versions + nodes + options)

-- A flow is versioned so admins can safely edit a draft and publish when ready.
CREATE TABLE IF NOT EXISTS flows (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE, -- stable identifier used by bot command/config
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flow_versions (
  id SERIAL PRIMARY KEY,
  flow_id INT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  start_node_key TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(flow_id, version)
);

-- Each node has a stable key within a flow version.
CREATE TABLE IF NOT EXISTS flow_nodes (
  id SERIAL PRIMARY KEY,
  flow_version_id INT NOT NULL REFERENCES flow_versions(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text','single_choice','multi_choice','number','date','file','end')),
  prompt_i18n JSONB NOT NULL DEFAULT '{"en":""}'::jsonb,
  help_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
  save_as TEXT,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_node_key TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(flow_version_id, node_key)
);

CREATE TABLE IF NOT EXISTS flow_options (
  id SERIAL PRIMARY KEY,
  flow_node_id INT NOT NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
  option_key TEXT NOT NULL,
  label_i18n JSONB NOT NULL DEFAULT '{"en":""}'::jsonb,
  value TEXT,
  next_node_key TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(flow_node_id, option_key)
);

-- Track which version is currently published for a flow.
CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_versions_published_unique
  ON flow_versions(flow_id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_flow_nodes_flow_version ON flow_nodes(flow_version_id);
CREATE INDEX IF NOT EXISTS idx_flow_options_node ON flow_options(flow_node_id);

-- Extend flow_sessions to point to a specific flow version (so sessions are stable even when admins publish new versions)
ALTER TABLE IF EXISTS flow_sessions
  ADD COLUMN IF NOT EXISTS flow_version_id INT NULL REFERENCES flow_versions(id) ON DELETE SET NULL;

-- Helper: set flow_sessions.flow_id to flow slug semantics moving forward
-- (existing rows may contain old ids; bot code will handle both)
