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
