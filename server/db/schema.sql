CREATE TABLE IF NOT EXISTS datasets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '默认数据集',
  data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_datasets_created ON datasets(created_at DESC);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '新对话',
  mode TEXT NOT NULL DEFAULT 'agent',
  workspace_state TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  actions TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conv_msgs_cid ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS realtime_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_date TEXT NOT NULL,
  hour INTEGER NOT NULL CHECK(hour >= 0 AND hour <= 23),
  is_forecast INTEGER NOT NULL DEFAULT 0,
  shortwave_radiation REAL,
  wind_speed_10m REAL,
  wind_speed_80m REAL,
  temperature REAL,
  price_grid REAL,
  ef_grid REAL,
  price_source TEXT DEFAULT 'fallback',
  solar_source TEXT DEFAULT 'openmeteo',
  carbon_source TEXT DEFAULT 'model',
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(data_date, hour)
);

CREATE INDEX IF NOT EXISTS idx_rt_date ON realtime_data(data_date);
CREATE INDEX IF NOT EXISTS idx_rt_date_hour ON realtime_data(data_date, hour);

CREATE TABLE IF NOT EXISTS data_source_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ok',
  last_success DATETIME,
  last_error TEXT,
  fallback_active INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alert_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  detail TEXT,
  auto_optimization_id INTEGER,
  acknowledged INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emergency_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'planned',
  degraded INTEGER NOT NULL DEFAULT 0,
  baseline_dataset_id INTEGER,
  emergency_dataset_id INTEGER,
  baseline_payload TEXT,
  event_spec TEXT NOT NULL,
  detail_payload TEXT NOT NULL,
  explanation TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  applied_at DATETIME,
  restored_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_emergency_runs_created ON emergency_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_runs_status ON emergency_runs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS investment_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  baseline_dataset_id INTEGER,
  plan_payload TEXT NOT NULL,
  explanation TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_investment_runs_created ON investment_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS anomaly_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'planned',
  baseline_dataset_id INTEGER,
  anomaly_dataset_id INTEGER,
  baseline_payload TEXT,
  event_spec TEXT NOT NULL,
  detail_payload TEXT NOT NULL,
  explanation TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  applied_at DATETIME,
  restored_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_anomaly_runs_created ON anomaly_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_runs_status ON anomaly_runs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS park_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO park_config (key, value) VALUES ('latitude', '30.26');
INSERT OR IGNORE INTO park_config (key, value) VALUES ('longitude', '120.19');
INSERT OR IGNORE INTO park_config (key, value) VALUES ('park_name', '杭州示范园区');

INSERT OR IGNORE INTO data_source_health (source_name, status) VALUES ('solar', 'ok');
INSERT OR IGNORE INTO data_source_health (source_name, status) VALUES ('price', 'ok');
INSERT OR IGNORE INTO data_source_health (source_name, status) VALUES ('carbon', 'ok');
