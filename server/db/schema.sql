-- EcoProject 数据集存储
-- 前缀: ca=电解槽, pv=光伏, gm=燃气轮机, pem=质子膜燃料电池, g=电网
-- 后缀: uci, cicos, cicar, cicom, pv, es

CREATE TABLE IF NOT EXISTS datasets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '默认数据集',
  data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_datasets_created ON datasets(created_at DESC);

-- AI Agent 对话历史
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '新对话',
  mode TEXT NOT NULL DEFAULT 'agent',
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

-- ══════════════════════════════════════════════════════════
--  实时/历史外部数据存储
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS realtime_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_date TEXT NOT NULL,
  hour INTEGER NOT NULL CHECK(hour >= 0 AND hour <= 23),
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

-- 数据源健康状态
CREATE TABLE IF NOT EXISTS data_source_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ok',
  last_success DATETIME,
  last_error TEXT,
  fallback_active INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent 预警事件日志
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

-- 园区配置（坐标等）
CREATE TABLE IF NOT EXISTS park_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认园区坐标（杭州）
INSERT OR IGNORE INTO park_config (key, value) VALUES ('latitude', '30.26');
INSERT OR IGNORE INTO park_config (key, value) VALUES ('longitude', '120.19');
INSERT OR IGNORE INTO park_config (key, value) VALUES ('park_name', '杭州示范园区');

-- 插入默认数据源健康状态
INSERT OR IGNORE INTO data_source_health (source_name, status) VALUES ('solar', 'ok');
INSERT OR IGNORE INTO data_source_health (source_name, status) VALUES ('price', 'ok');
INSERT OR IGNORE INTO data_source_health (source_name, status) VALUES ('carbon', 'ok');
