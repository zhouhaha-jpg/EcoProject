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
