# 实时数据驱动与 Agent 智能升级 — 完整技术方案

> **文档性质**：可执行技术规划（非概念稿），所有方案均已对照当前代码结构验证可行性。
> **生成日期**：2026-03-07
> **关联文件**：`initial.md`（项目记忆）、`实时数据获取与agent能力升级.md`（早期讨论）

---

## 0. 决策摘要

| 决策项 | 结论 | 理由 |
|---|---|---|
| 目标定位 | 比赛演示 | 效果优先，合规无风险 |
| 光照数据源 | **Open-Meteo** (免费 API) | 已验证：杭州坐标逐时太阳辐射 + 风速完美返回，支持预报 + 历史 |
| 电价数据源 | **三级降级**：爬虫 → 现货模拟器 → 浙江省内置分时电价表 | 兼顾真实性与稳定性 |
| 碳因子数据源 | **Open-Meteo 风光出力 → 反推电网碳强度模型** | 无需第三方碳排 API，学术可引用性更强 |
| 数据库 | **继续使用 SQLite**（WAL 模式） | 年数据量 < 3MB，无高并发场景，零部署成本 |
| 前端刷新 | **WebSocket 实时推送** + 前端轮询兜底 | 数据变化时即时通知，否则每 60s 轮询 |
| Agent 升级 | P1/P2 完整实现，P3/P4 骨架框架 | 主动预警 + 碳电套利，比赛展示效果最佳 |

---

## 1. 系统架构升级全景图

```
┌───────────────────────────────────────────────────────────────────────┐
│                         外部数据源 (External)                         │
│                                                                       │
│  ┌─────────────┐   ┌─────────────────┐   ┌──────────────────────┐    │
│  │ Open-Meteo   │   │ 浙江电力交易中心  │   │ Open-Meteo 风速数据   │    │
│  │ 太阳辐射 API │   │ 现货电价爬虫      │   │ → 碳因子反推模型      │    │
│  └──────┬──────┘   └───────┬─────────┘   └──────────┬───────────┘    │
│         │                  │                        │                 │
│         │            ┌─────┴──────┐                 │                 │
│         │            │  降级链路   │                 │                 │
│         │            │ 爬虫失败 → │                 │                 │
│         │            │ 现货模拟器 │                 │                 │
│         │            │ 模拟器异常→│                 │                 │
│         │            │ 内置电价表 │                 │                 │
│         │            └─────┬──────┘                 │                 │
└─────────┼──────────────────┼────────────────────────┼─────────────────┘
          │                  │                        │
          ▼                  ▼                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│                   Python 数据采集调度器 (APScheduler)                  │
│            server/python/data_fetcher.py — 每小时自动执行              │
│                                                                       │
│  fetch_solar() ──┐                                                    │
│  fetch_price() ──┼──► 标准化 24h 数组 ──► SQLite realtime_data 表     │
│  fetch_carbon()──┘          │                                         │
│                             ▼                                         │
│                    异动检测 (Anomaly Detector)                         │
│                    电价方差/碳因子突变 → 触发事件                       │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                     Node.js 后端 (Express + WS)                       │
│                                                                       │
│  新增接口：                                                           │
│  GET  /api/realtime/latest     ← 最新 24h 三路数据                    │
│  GET  /api/realtime/history    ← 历史某日数据(时光回溯)               │
│  GET  /api/realtime/health     ← 数据源健康状态                       │
│  POST /api/optimize            ← 已有，自动注入实时数据 overrides     │
│  WS   /ws                      ← 实时推送数据更新 & Agent 事件        │
│                                                                       │
│  事件引擎：                                                           │
│  on("data_updated") → diff 检测 → 自动触发优化 → Agent 预警推送       │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                     React 前端 (Vite + WS Client)                     │
│                                                                       │
│  新增：                                                               │
│  - WebSocket 连接管理 Hook (useRealtimeData)                          │
│  - 数据源健康度指示器 (DataSourceHealth)                              │
│  - 优化器输入可视化面板 (OptimizerInputPanel)                         │
│  - Agent 预警消息弹窗 (ProactiveAlert)                                │
│  - 时光回溯日期选择器 (TimeTravel)                                    │
│  - 碳电协同叠加图表 (CarbonElectricityCurve)                          │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据采集层详细设计

### 2.1 光照辐射数据 — Open-Meteo API

#### 已验证的 API 调用

```
# 预报 API（免费，无需 Key，返回逐时数据）
GET https://api.open-meteo.com/v1/forecast
  ?latitude=30.26&longitude=120.19          # 杭州（可替换为实际园区坐标）
  &hourly=shortwave_radiation,temperature_2m
  &timezone=Asia/Shanghai
  &forecast_days=2

# 历史 API（用于"时光回溯"）
GET https://archive-api.open-meteo.com/v1/archive
  ?latitude=30.26&longitude=120.19
  &start_date=2025-07-15&end_date=2025-07-15
  &hourly=shortwave_radiation,wind_speed_10m,wind_speed_80m
  &timezone=Asia/Shanghai
```

#### 实测数据样本（2026-03-07 杭州）

```
太阳辐射 (W/m²): [0, 0, 0, 0, 0, 0, 0, 11, 89, 282, 507, 671, 777, 769, 723, 639, 463, 244, 57, 0, 0, 0, 0, 0]
```

#### 与优化器的对接

当前 `optimizer.py` 中的 `G_profile` 是归一化的 0~1 曲线，`G_scale` 是缩放因子。Open-Meteo 返回的是绝对 W/m² 值。转换公式：

$$G_{profile}[t] = \frac{shortwave\_radiation[t]}{G_{max}}$$

其中 $G_{max}$ 取该地区晴天理论最大辐射（浙江夏季约 1000 W/m²，冬季约 700 W/m²），`G_scale` 设为 $G_{max}/1000$ 即可复用现有 `P_PV` 计算公式。

**采集频率**：每小时 1 次，拉取当前 + 未来 23 小时的预报数据。

---

### 2.2 电价数据 — 三级降级机制

#### Level 1：浙江电力交易中心爬虫（真实数据）

浙江省电力交易中心（https://zhdl.zj.gov.cn）每日发布日前现货出清电价。技术方案：

```python
# 爬虫技术栈
playwright + asyncio       # 无头浏览器，处理 JS 渲染页面
lxml / BeautifulSoup4     # HTML 解析
```

**降级触发条件**：连续 3 次请求失败（网络超时/页面改版/反爬拦截），自动切换到 Level 2。

#### Level 2：现货价格波动模拟器（模拟数据）

基于浙江省分时电价基准 + 随机波动，生成逼近真实市场特征的 24h 价格曲线。

**模拟器核心算法**：

```python
import numpy as np

def simulate_spot_price(date, seed=None):
    """
    基于浙江省分时电价结构 + 随机GBM扰动，生成24h现货模拟价格。
    
    模型: P(t) = P_base(t) × exp(σ·W(t))
    其中 P_base 为分时基准电价，W(t) 为标准布朗运动，σ 为波动率。
    """
    rng = np.random.default_rng(seed)
    
    # 浙江省分时电价基准 (元/kWh，大工业 1-10kV，2025年参考)
    # 依据：浙发改价格〔2024〕21号 + 国网浙江2025年代理购电价格公告
    month = date.month
    is_summer_winter = month in [1, 7, 8, 12]  # 夏冬季有尖峰时段
    
    # 基准价格档位
    SHARP_PEAK = 1.25   # 尖峰 (夏冬季)
    PEAK       = 0.95   # 高峰
    NORMAL     = 0.62   # 平段
    VALLEY     = 0.35   # 低谷
    
    # 时段划分 (浙发改价格〔2024〕21号)
    # 高峰: 8:00-11:00, 13:00-17:00
    # 平段: 11:00-13:00, 17:00-22:00
    # 低谷: 22:00-次日8:00
    # 尖峰(夏季): 13:00-15:00 | 尖峰(冬季): 18:00-20:00
    base = np.array([
        VALLEY, VALLEY, VALLEY, VALLEY, VALLEY, VALLEY, VALLEY, VALLEY,  # 0-7
        PEAK, PEAK, PEAK,                                                  # 8-10
        NORMAL, NORMAL,                                                    # 11-12
        PEAK, PEAK, PEAK, PEAK,                                           # 13-16
        NORMAL, NORMAL, NORMAL, NORMAL, NORMAL,                           # 17-21
        VALLEY, VALLEY,                                                    # 22-23
    ])
    
    if is_summer_winter:
        if month in [7, 8]:  # 夏季尖峰 13:00-15:00
            base[13:15] = SHARP_PEAK
        else:                # 冬季尖峰 18:00-20:00
            base[18:20] = SHARP_PEAK
    
    # 叠加现货市场随机波动 (几何布朗运动)
    sigma = 0.15  # 波动率，现货市场通常 10%-20%
    dW = rng.normal(0, 1, 24)
    # 加入日内相关性：相邻时段波动有正相关
    for i in range(1, 24):
        dW[i] = 0.6 * dW[i-1] + 0.8 * dW[i]
    
    spot = base * np.exp(sigma * dW - 0.5 * sigma**2)
    
    # 偶尔制造极端事件 (5%概率出现某时段价格尖峰)
    if rng.random() < 0.05:
        spike_hour = rng.integers(8, 22)  # 白天时段
        spot[spike_hour] *= rng.uniform(1.5, 2.5)
    
    return np.round(np.clip(spot, 0.15, 2.50), 4)
```

**特征**：
- 基准价格锚定浙江省真实分时电价政策
- 几何布朗运动(GBM)确保价格始终为正，波动符合金融市场特征
- 相邻时段有自相关性，避免价格"锯齿形跳跃"
- 5% 概率产生极端价格尖峰，模拟真实市场的尾部风险事件
- 可控随机种子，演示时可复现

#### Level 3：浙江省内置分时电价表（兜底 Fallback）

写死在代码中的浙江省大工业分时电价基准，确保优化器在任何情况下都有输入：

```python
ZHEJIANG_TOU_FALLBACK = np.array([
    0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35,  # 0:00-7:00 低谷
    0.95, 0.95, 0.95,                                    # 8:00-10:00 高峰
    0.62, 0.62,                                          # 11:00-12:00 平段
    0.95, 0.95, 0.95, 0.95,                              # 13:00-16:00 高峰
    0.62, 0.62, 0.62, 0.62, 0.62,                        # 17:00-21:00 平段
    0.35, 0.35,                                          # 22:00-23:00 低谷
])
```

**三级降级的触发和日志**：

```
data_source 字段值：
  "crawler"    → Level 1 (真实爬虫数据)
  "simulator"  → Level 2 (模拟器生成)
  "fallback"   → Level 3 (内置电价表)
```

---

### 2.3 碳排放因子 — 风光出力反推模型

#### 设计原理

电网碳排放因子与发电结构直接相关。当风电/光伏出力占比高时，碳因子低；当火电占比高时，碳因子高。利用 Open-Meteo 提供的同区域风速和辐射数据，可以间接估算电网的可再生能源出力比例，进而推算碳强度。

#### 碳因子估算模型

$$EF_{grid}(t) = EF_{thermal} \times (1 - R_{re}(t)) + EF_{re} \times R_{re}(t)$$

其中：
- $EF_{thermal} = 0.85 \text{ kgCO}_2\text{/kWh}$（火电碳因子，全国煤电平均值）
- $EF_{re} \approx 0$（可再生能源碳因子）
- $R_{re}(t)$ = 该时段可再生能源出力占总发电的估算比例

$$R_{re}(t) = \min\left(R_{max},\ \alpha \cdot \frac{P_{wind}(t)}{P_{wind,rated}} + \beta \cdot \frac{G(t)}{G_{max}}\right)$$

其中：
- $\alpha, \beta$ 为风电、光伏在浙江电网中的装机权重（浙江约 $\alpha=0.08, \beta=0.12$）
- $P_{wind}$ 由风速经风机功率曲线转换
- $R_{max} = 0.45$（浙江电网可再生能源+核电+水电的历史最高占比上限）

```python
def estimate_carbon_factor(wind_speed_80m, shortwave_radiation):
    """
    基于风速和太阳辐射估算浙江电网实时碳排放因子。
    
    返回: 24h 碳因子数组 (tCO2/kWh)，注意与现有 optimizer.py 单位一致。
    """
    EF_THERMAL = 0.85e-3  # tCO2/kWh (与现有 ef_g 同量纲)
    ALPHA_WIND = 0.08     # 风电装机权重
    BETA_SOLAR = 0.12     # 光伏装机权重
    R_MAX = 0.45          # 可再生+核+水电最高占比
    
    # 风机功率曲线近似 (cut-in 3m/s, rated 12m/s, cut-out 25m/s)
    wind = np.array(wind_speed_80m)
    P_wind_ratio = np.where(wind < 3, 0,
                   np.where(wind < 12, (wind - 3) / 9,
                   np.where(wind < 25, 1.0, 0)))
    
    # 光伏出力归一化
    G = np.array(shortwave_radiation)
    G_MAX = 1000.0  # W/m², 晴天最大
    P_solar_ratio = np.clip(G / G_MAX, 0, 1)
    
    # 可再生能源综合占比
    R_re = np.clip(ALPHA_WIND * P_wind_ratio + BETA_SOLAR * P_solar_ratio, 0, R_MAX)
    
    # 碳因子
    ef = EF_THERMAL * (1 - R_re / R_MAX * 0.6)  
    # 0.6 系数：可再生占满时碳因子降至 ~0.34e-3 (考虑核电水电恒定贡献)
    
    return np.round(ef, 7).tolist()
```

**优势**：
1. 完全基于公开气象数据，无需第三方碳排 API
2. 学术可引用性强（可在论文中写出完整公式和参数来源）
3. 与 Open-Meteo 数据源统一，一次 API 调用同时获取光照和碳因子所需原始数据

---

## 3. 数据存储层设计

### 3.1 SQLite 可行性结论：完全满足需求

| 评估维度 | 情况 | 结论 |
|---|---|---|
| 数据量 | 3 路 × 24 条/天 × 365 天 ≈ 26,280 条/年，每条 ~100B | 年数据量 < 3MB，SQLite 轻松处理 |
| 并发读 | 单 Node.js 进程 + 前端 WebSocket | WAL 模式支持并发读写，毫无压力 |
| 并发写 | Python 采集器每小时写 1 次，Node.js 偶尔写 | 写冲突概率极低 |
| 时序查询 | 按时间戳 + 数据类型查询 | 加索引后毫秒级 |
| 部署成本 | 零（已有 better-sqlite3） | 比赛演示场景下 PG 反而增加部署复杂度 |

**结论**：继续使用 SQLite，启用 WAL 模式。**不需要迁移到 PostgreSQL**——对于比赛演示级别的数据量和并发，SQLite 实际上是更优选择（零配置、单文件、便于在任何机器上演示）。

### 3.2 新增数据表结构

```sql
-- 实时/历史外部数据存储
CREATE TABLE IF NOT EXISTS realtime_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_date TEXT NOT NULL,              -- 日期 'YYYY-MM-DD'
  hour INTEGER NOT NULL CHECK(hour >= 0 AND hour <= 23),
  
  -- 三路核心数据
  shortwave_radiation REAL,             -- 太阳辐射 W/m²
  wind_speed_10m REAL,                  -- 10m风速 m/s
  wind_speed_80m REAL,                  -- 80m风速 m/s
  temperature REAL,                     -- 气温 ℃
  price_grid REAL,                      -- 电价 元/kWh
  ef_grid REAL,                         -- 碳因子 tCO2/kWh
  
  -- 元数据
  price_source TEXT DEFAULT 'fallback', -- 'crawler' | 'simulator' | 'fallback'
  solar_source TEXT DEFAULT 'openmeteo',-- 'openmeteo' | 'fallback'
  carbon_source TEXT DEFAULT 'model',   -- 'model' | 'fallback'
  
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(data_date, hour)               -- 同一天同一时段只保留最新数据
);

CREATE INDEX IF NOT EXISTS idx_rt_date ON realtime_data(data_date);
CREATE INDEX IF NOT EXISTS idx_rt_date_hour ON realtime_data(data_date, hour);

-- 数据源健康状态
CREATE TABLE IF NOT EXISTS data_source_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,             -- 'solar' | 'price' | 'carbon'
  status TEXT NOT NULL DEFAULT 'ok',     -- 'ok' | 'degraded' | 'error'
  last_success DATETIME,
  last_error TEXT,
  fallback_active INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent 预警事件日志
CREATE TABLE IF NOT EXISTS alert_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,             -- 'price_spike' | 'carbon_surge' | 'solar_drop'
  severity TEXT NOT NULL DEFAULT 'info',-- 'info' | 'warning' | 'critical'
  title TEXT NOT NULL,
  detail TEXT,
  auto_optimization_id INTEGER,         -- 关联自动触发的优化结果
  acknowledged INTEGER DEFAULT 0,       -- 用户是否已确认
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. 后端服务层改造

### 4.1 Python 数据采集调度器

新增文件：`server/python/data_fetcher.py`

**职责**：
- 使用 `APScheduler` 每小时执行一次数据采集
- 三路数据独立采集、独立降级，互不影响
- 采集完成后写入 SQLite
- 检测数据异动，生成 alert_events 记录
- 通过 stdout JSON 通知 Node.js 进程

**依赖新增**：`server/python/requirements.txt` 追加：
```
apscheduler>=3.10
requests>=2.31
playwright>=1.40    # 可选，仅爬虫 Level 1 需要
```

**异动检测逻辑**：
```python
def detect_anomaly(new_prices, baseline_prices):
    """
    检测电价是否出现需要预警的异动。
    
    规则：
    1. 任意时段电价 > 基准 × 1.5 → price_spike (warning)
    2. 任意时段电价 > 基准 × 2.0 → price_spike (critical)
    3. 24h 平均电价偏离基准均值 > 20% → price_shift (warning)
    """
    alerts = []
    ratio = np.array(new_prices) / np.array(baseline_prices)
    
    critical_hours = np.where(ratio > 2.0)[0]
    if len(critical_hours) > 0:
        alerts.append({
            'event_type': 'price_spike',
            'severity': 'critical',
            'title': f'电价极端飙升预警：{len(critical_hours)}个时段电价超基准200%',
            'detail': f'涉及时段: {critical_hours.tolist()}, 最高倍率: {ratio.max():.1f}x'
        })
    else:
        warning_hours = np.where(ratio > 1.5)[0]
        if len(warning_hours) > 0:
            alerts.append({
                'event_type': 'price_spike',
                'severity': 'warning',
                'title': f'电价异常波动：{len(warning_hours)}个时段电价超基准150%',
                'detail': f'涉及时段: {warning_hours.tolist()}'
            })
    
    mean_shift = abs(np.mean(new_prices) - np.mean(baseline_prices)) / np.mean(baseline_prices)
    if mean_shift > 0.2:
        alerts.append({
            'event_type': 'price_shift',
            'severity': 'warning',
            'title': f'日均电价偏移 {mean_shift*100:.0f}%',
            'detail': f'新均价: {np.mean(new_prices):.4f}, 基准均价: {np.mean(baseline_prices):.4f}'
        })
    
    return alerts
```

### 4.2 Node.js 后端新增接口 & WebSocket

**新增 Express 路由**：`server/routes/realtime.js`

```javascript
// GET /api/realtime/latest - 获取最新一天的 24h 实时数据
// GET /api/realtime/history?date=2025-07-15 - 历史某日数据 (时光回溯)
// GET /api/realtime/health - 三路数据源健康状态
// POST /api/realtime/fetch - 手动触发一次数据采集
```

**WebSocket 服务**：`server/ws.js`

```javascript
// 消息类型：
// { type: 'data_updated', payload: { date, prices, solar, carbon, sources } }
// { type: 'alert', payload: { event_type, severity, title, detail } }
// { type: 'optimization_complete', payload: { scenario_id, summary } }
```

### 4.3 优化器自动注入实时数据

**改造 `server/routes/optimize.js`**：在调用 `runPython()` 之前，自动从 `realtime_data` 表读取最新数据并合并到 `params.overrides`。

```javascript
// 伪代码
async function injectRealtimeData(params) {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const rows = db.prepare(
    'SELECT hour, price_grid, ef_grid, shortwave_radiation FROM realtime_data WHERE data_date = ? ORDER BY hour'
  ).all(today)
  
  if (rows.length === 24) {
    // 将实时数据注入优化器参数（用户显式传的 overrides 优先级更高）
    params.price_grid = params.price_grid ?? rows.map(r => r.price_grid)
    params.EF_grid = params.EF_grid ?? rows.map(r => r.ef_grid)
    
    // 太阳辐射 → G_profile 转换
    const radiation = rows.map(r => r.shortwave_radiation)
    const gMax = Math.max(...radiation, 1)
    params.G_profile = params.G_profile ?? radiation.map(v => v / gMax)
    params.G_scale = params.G_scale ?? (gMax / 1000 * 1.5)  // 保持与原始换算兼容
  }
  
  return params
}
```

**关键设计**：用户通过 `run_whatif` 传入的显式参数 > 实时数据 > 默认硬编码值。三级优先级确保灵活性。

### 4.4 事件驱动自动优化（影子模式）

当数据采集器检测到异动事件时，后端自动触发一次"影子优化"：

```
数据采集完成 → 异动检测 → 发现 critical 级别事件
    → 自动调用 /api/optimize（使用最新实时数据，save=true）
    → 将优化结果与上一次结果 diff
    → 生成预警话术（调用 LLM）
    → 通过 WebSocket 推送给前端
    → 前端弹出 Agent 预警卡片
```

---

## 5. 前端实时化改造

### 5.1 新增 Hook: `useRealtimeData`

```typescript
// src/hooks/useRealtimeData.ts
interface RealtimeState {
  prices: number[]          // 24h 电价
  solar: number[]           // 24h 太阳辐射
  carbon: number[]          // 24h 碳因子
  sources: {                // 各路数据来源标识
    price: 'crawler' | 'simulator' | 'fallback'
    solar: 'openmeteo' | 'fallback'
    carbon: 'model' | 'fallback'
  }
  lastUpdated: string       // 最后更新时间
  health: DataSourceHealth  // 三路健康状态
  connected: boolean        // WebSocket 连接状态
}
```

### 5.2 数据源健康度指示器

在 `MainLayout.tsx` 顶栏的 3 个状态芯片旁新增数据源状态指示器：

```
┌──────────────────────────────────────────────────────────────────┐
│  智慧园区节能减排调度平台    ☀️实时 ⚡实时 🌿模型  │ 更新: 14:05 │
│                             (绿)  (绿)  (绿)                    │
└──────────────────────────────────────────────────────────────────┘
```

颜色语义：
- 🟢 绿色：数据源正常（真实 API/爬虫数据）
- 🟡 黄色：降级中（使用模拟器或模型估算）
- 🔴 红色：离线（使用兜底 Fallback）

### 5.3 优化器输入可视化面板

在 Agent 工作区（`ScenarioComparePage.tsx`）新增可折叠面板，展示当前用于求解的三路输入曲线：

```
┌─ 优化器当前输入 ────────────────────────────────┐
│                                                   │
│  📈 电价曲线（来源: 模拟器）   更新: 14:05       │
│  [ECharts line chart: 24h price_grid]             │
│                                                   │
│  ☀️ 光照曲线（来源: Open-Meteo）               │
│  [ECharts area chart: 24h G_profile × G_scale]    │
│                                                   │
│  🌿 碳因子曲线（来源: 风光反推模型）            │
│  [ECharts line chart: 24h ef_grid]                │
│                                                   │
│  ⚡ 含碳税等效电价 = 电价 + 碳因子×碳价         │
│  [ECharts overlay chart: price + carbon cost]     │
│                                                   │
└───────────────────────────────────────────────────┘
```

这个面板不仅用于调试，更是**向评委展示"输入变了→输出变了"因果逻辑**的关键 UI。

### 5.4 Agent 预警弹窗组件

```typescript
// src/components/agent/ProactiveAlert.tsx
interface AlertProps {
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
  suggestion?: string        // LLM 生成的建议话术
  optimizationId?: number    // 关联的影子优化结果 ID
  onApply: () => void        // "一键应用" 按钮回调
  onDismiss: () => void      // "稍后再看" 按钮回调
}
```

**交互流程**：
1. WebSocket 收到 `alert` 消息
2. 前端在 Agent 侧边栏顶部弹出预警卡片（带动画）
3. 卡片包含："预警标题 + 简要分析 + 一键应用建议方案 / 查看详情 / 忽略"
4. 点击"一键应用"→ 加载影子优化结果到 scenarioDataset → 跳转 Agent 工作区

---

## 6. Agent 能力升级

### 6.1 [P1] 主动事件驱动 Agent（Proactive Event-Driven Agent）— 完整实现

#### 核心思路

Agent 不再只是"你问我答"，而是像一个 7×24 数字调度员，主动监控市场变化并推送策略建议。

#### 实现架构

```
数据采集器 (每小时)
    │
    ▼
异动检测器 ──┬── 无异动 → 安静运行
             │
             ├── warning → 写入 alert_events + WS 通知前端
             │
             └── critical → 写入 alert_events 
                            + 自动触发优化求解 (影子模式)
                            + 获取优化结果
                            + 调用 LLM 生成预警话术
                            + WS 推送[预警+建议方案+一键应用]
```

#### 新增后端工具

在 `server/index.js` 的 TOOLS 数组中新增：

```javascript
{
  type: 'function',
  function: {
    name: 'get_realtime_data',
    description: '获取当前实时外部数据（电价、太阳辐射、碳因子），用于分析市场趋势和制定策略。',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '日期 YYYY-MM-DD，省略则取今天' },
      },
    },
  },
},
{
  type: 'function',
  function: {
    name: 'get_alerts',
    description: '获取最近的市场异动预警事件列表。',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: '返回条数，默认5' },
        severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
      },
    },
  },
},
```

#### 演示场景脚本

```
[系统自动检测到明日电价异动]

Agent 主动弹窗 ⚠️：
"检测到明日晚高峰(18:00-20:00)现货电价飙升至 1.52元/度，较基准上涨 60%。
我已自动为您运行了一套【避峰防御调度方案】：
  • 白天 10:00-15:00 利用光伏高出力时段加大电解槽功率制氢
  • 18:00-20:00 降低电解槽至最低功率，启用储氢罐+PEM燃料电池替代网电
  • 预计可节省成本 ¥8,240（-12.4%），碳排增加 0.3%（可接受）
  
[一键应用此方案] [查看对比详情] [暂时忽略]"
```

---

### 6.2 [P2] 碳电协同实时套利引擎（Carbon-Electricity Arbitrage Engine）— 完整实现

#### 核心思路

将实时电价曲线和实时碳因子曲线叠加，计算出**含碳税等效电价**，揭示"便宜的电≠绿色的电"这一反直觉洞察。

#### 含碳税等效电价公式

$$P_{effective}(t) = P_{grid}(t) + EF_{grid}(t) \times C_{carbon}$$

其中 $C_{carbon}$ 为碳交易价格（当前默认 90 元/tCO₂）。

#### 新增 Agent 工具

```javascript
{
  type: 'function',
  function: {
    name: 'carbon_electricity_analysis',
    description: '碳电协同分析：将实时电价与碳因子叠加，计算含碳税等效电价曲线，找出"伪节能真排碳"的时段。',
    parameters: {
      type: 'object',
      properties: {
        carbon_price: { type: 'number', description: '碳交易价格(元/tCO2)，默认90' },
        compare_mode: { type: 'string', enum: ['cost_only', 'carbon_only', 'combined'], 
                        description: '对比模式：纯成本/纯碳排/综合' },
      },
    },
  },
},
```

#### 前端可视化

在 `generate_chart` 工具中新增图表类型 `carbon_electricity_overlay`：

```
Y轴左: 电价 (元/kWh)  — 蓝色实线
Y轴右: 碳因子 (gCO₂/kWh) — 绿色虚线
叠加: 含碳税等效电价 — 橙色粗线（醒目高亮）
标注: 红色区域 = "便宜但碳高"(需警惕)，绿色区域 = "贵但碳低"(值得)
```

#### 演示场景脚本

```
用户: "现在这套调度方案，到底是在省钱还是在减碳？"

Agent: "我来帮你算一笔碳电协同账。

当前 10:00 时段：
  • 现货电价: 0.58 元/度（偏低，看似划算）
  • 实时碳因子: 0.82 kg/度（火电高峰，碳排严重）  
  • 碳税折算: 0.82 × 90/1000 = 0.074 元/度
  • ⚡ 含碳税等效电价: 0.58 + 0.074 = 0.654 元/度

而 13:00 时段：
  • 现货电价: 0.95 元/度（高峰电价，看似贵）
  • 实时碳因子: 0.35 kg/度（光伏大量出力，碳排低）
  • 碳税折算: 0.35 × 90/1000 = 0.032 元/度
  • ⚡ 含碳税等效电价: 0.95 + 0.032 = 0.982 元/度

结论：虽然 13:00 的等效电价确实更贵，但如果把电力负荷集中在 10:00 的'低价高碳'时段，
全天碳排将增加 8.3%，按全国碳市场计价将额外支出 ¥2,160。
当前 CICOM 综合优化策略已为您找到了碳电套利最佳平衡点。

[查看碳电叠加曲线图]"
```

---

### 6.3 [P3] 现货市场与虚拟电厂(VPP)博弈交易员 — 骨架框架

#### 优化器扩展（预留接口）

在 `optimizer.py` 的目标函数中预留需求侧响应(DR)收益项：

```python
# 在 _objective() 中新增：
if self.p.get('enable_dr', False):
    dr_price = self.p.get('dr_price', 0.5)  # 需求响应补贴 元/kWh
    dr_baseline = self.p.get('dr_baseline', self.P_CA_rated)  # 基线功率
    P_CA, _, _, _ = self._derived(v)
    dr_reduction = np.maximum(dr_baseline - P_CA - v['P_grid'], 0)  # 削减量
    dr_revenue = np.sum(dr_reduction * dr_price)
    obj_cost -= dr_revenue  # 需求响应收益作为负成本
```

#### 新增 Agent 工具（骨架）

```javascript
{
  type: 'function',
  function: {
    name: 'vpp_arbitrage_scan',
    description: '虚拟电厂套利扫描：分析实时电价曲线，识别低买高卖的套利窗口（低电价时段增大制氢储能，高电价时段释放），评估需求侧响应收益。',
    parameters: {
      type: 'object',
      properties: {
        dr_price: { type: 'number', description: '需求响应补贴(元/kWh)' },
        flexibility_pct: { type: 'number', description: '可调节负荷比例(0-1)' },
      },
    },
  },
},
```

---

### 6.4 [P4] 多智能体博弈决策（MAS）— 骨架框架

#### 后端架构

在 `server/index.js` 的 `/api/chat` 路由中预留多 Agent 并发调用逻辑：

```javascript
// 当用户触发 "multi_agent_debate" 工具时：
// 1. 并行向 LLM 发送 3 个请求，分别使用 3 套不同的 system prompt
// 2. 收集 3 个 Agent 的观点
// 3. 用第 4 个"协调 Agent"综合三方意见
// 4. 前端展示辩论过程 + 最终方案

const AGENT_ROLES = {
  production: {
    name: '🏭 生产Agent',
    system: '你是工厂生产调度主管，追求产量稳定和设备安全...',
    priority: 'maximize_production',
  },
  trading: {
    name: '💰 交易Agent',  
    system: '你是电力市场交易员，追求最低购电成本和最大套利收益...',
    priority: 'minimize_cost',
  },
  green: {
    name: '🌿 环保Agent',
    system: '你是企业ESG负责人，追求最低碳排放和最高绿电比例...',
    priority: 'minimize_carbon',
  },
  coordinator: {
    name: '🧠 协调Agent',
    system: '你是总调度长，需要平衡三方意见，给出Pareto最优折中方案...',
  },
}
```

#### 前端展示（骨架）

在 `AgentChat.tsx` 中新增多 Agent 消息展示模式：

```
┌─ 多Agent辩论 ────────────────────────────┐
│                                            │
│ 🏭 生产Agent:                             │
│ "建议维持电解槽 95% 恒定负载..."           │
│                                            │
│ 💰 交易Agent:                             │
│ "强烈反对！11:00-13:00 是负电价窗口..."    │
│                                            │
│ 🌿 环保Agent:                             │
│ "我支持交易Agent的中午提产建议..."         │
│                                            │
│ ──────── 协调结论 ────────                │
│ 🧠 综合考虑三方观点，建议采用 CICOM...     │
│                                            │
└────────────────────────────────────────────┘
```

---

## 7. 时光回溯模式（Historical Replay）

### 7.1 功能定义

用户选择一个历史日期 → 系统从数据库拉取该日真实天气/电价/碳因子 → 重新跑优化 → 展示结果。

### 7.2 数据来源

| 数据 | 历史来源 | 说明 |
|---|---|---|
| 太阳辐射 | Open-Meteo Archive API | 已验证可用（2025-07-15 测试通过） |
| 电价 | 本地数据库 `realtime_data` 表 | 系统运行后自动积累 |
| 碳因子 | Open-Meteo Archive + 碳因子模型 | 用历史风速+辐射重新计算 |

### 7.3 前端组件

在总览页或 Agent 工作区新增日期选择器：

```typescript
// src/components/ui/TimeTravel.tsx
interface TimeTravelProps {
  onDateSelect: (date: string) => void  // YYYY-MM-DD
  availableDates: string[]               // 数据库中有数据的日期列表
}
```

交互流程：

1. 用户点击"时光回溯"按钮 → 弹出日历选择器
2. 日历中有数据的日期高亮（有绿点标记）
3. 选择日期后 → 调用 `GET /api/realtime/history?date=2025-07-15`
4. 如果数据库无该日电价数据 → 调用 Open-Meteo Archive 获取天气 + 使用模拟器生成电价
5. 以该组历史数据为输入 → 调用 `/api/optimize` → 展示结果
6. 结果标题醒目显示"🕐 历史回溯: 2025年7月15日（高温日）"

### 7.4 Agent 集成

新增 Agent 工具：

```javascript
{
  type: 'function',
  function: {
    name: 'time_travel',
    description: '时光回溯：选择一个历史日期，用该日的真实天气和电价数据重新运行优化，复盘历史调度决策。',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '目标日期 YYYY-MM-DD' },
        question: { type: 'string', description: '用户想了解的问题，如"去年夏天最热那天该怎么调度"' },
      },
      required: ['date'],
    },
  },
},
```

---

## 8. 新增文件清单与目录结构变化

```
server/
├── python/
│   ├── data_fetcher.py          ← [新增] 数据采集调度器（APScheduler + 三路数据源）
│   ├── price_simulator.py       ← [新增] 现货价格波动模拟器
│   ├── carbon_model.py          ← [新增] 碳因子风光反推模型
│   ├── optimizer.py             ← [改动] 无硬改，overrides 机制已支持
│   └── requirements.txt         ← [改动] 新增 apscheduler, requests
├── routes/
│   ├── realtime.js              ← [新增] 实时数据 REST API
│   └── optimize.js              ← [改动] 注入实时数据 overrides
├── ws.js                        ← [新增] WebSocket 服务
├── db/
│   └── schema.sql               ← [改动] 新增 realtime_data / data_source_health / alert_events 表
└── index.js                     ← [改动] 挂载 /api/realtime、WebSocket、新增 Agent 工具定义

src/
├── hooks/
│   └── useRealtimeData.ts       ← [新增] WebSocket 客户端 + 实时数据状态管理
├── components/
│   ├── agent/
│   │   └── ProactiveAlert.tsx   ← [新增] Agent 预警弹窗
│   ├── charts/
│   │   └── CarbonElecOverlay.tsx← [新增] 碳电协同叠加图表
│   └── ui/
│       ├── DataSourceHealth.tsx ← [新增] 数据源健康度指示器
│       ├── TimeTravel.tsx       ← [新增] 时光回溯日期选择器
│       └── OptimizerInputPanel.tsx ← [新增] 优化器输入可视化面板
├── lib/
│   └── agentActions.ts          ← [改动] 新增 get_realtime_data / carbon_electricity_analysis / time_travel 等工具映射
└── context/
    └── StrategyContext.tsx       ← [改动] 新增 realtimeData 状态切片
```

---

## 9. 实施阶段与优先级

### 阶段一：数据管道基础设施（最优先）

| 任务 | 预估工作量 | 说明 |
|---|---|---|
| 创建 `realtime_data` / `data_source_health` / `alert_events` 表 | 小 | 改 schema.sql + 重建 DB |
| 实现 `data_fetcher.py` + Open-Meteo 光照采集 | 中 | 已验证 API 可用 |
| 实现 `carbon_model.py` 碳因子模型 | 小 | 纯数学计算 |
| 实现 `price_simulator.py` 现货模拟器 | 中 | GBM 模型 + 浙江分时基准 |
| 实现 `server/routes/realtime.js` REST API | 小 | CRUD 操作 |
| 改造 `optimize.js` 自动注入实时数据 | 小 | 在 runPython 前插入读取逻辑 |

### 阶段二：前端实时化 + Agent P1（主动预警）

| 任务 | 预估工作量 | 说明 |
|---|---|---|
| 实现 `server/ws.js` WebSocket 服务 | 中 | 用 `ws` 库 |
| 实现 `useRealtimeData.ts` Hook | 中 | WS 客户端 + 状态管理 |
| 实现 `DataSourceHealth.tsx` 健康指示器 | 小 | UI 组件 |
| 实现 `ProactiveAlert.tsx` 预警弹窗 | 中 | 含动画和一键应用 |
| 后端异动检测 + 影子优化 + LLM 话术生成 | 大 | Agent P1 核心逻辑 |
| 新增 `get_realtime_data` / `get_alerts` 工具 | 小 | 后端 TOOLS 扩展 |

### 阶段三：Agent P2（碳电套利）+ 输入可视化

| 任务 | 预估工作量 | 说明 |
|---|---|---|
| 实现 `CarbonElecOverlay.tsx` 叠加图表 | 中 | ECharts 双 Y 轴 |
| 实现 `OptimizerInputPanel.tsx` | 中 | 三条曲线可视化 |
| 新增 `carbon_electricity_analysis` 工具 | 中 | 含碳税等效电价计算 |
| 在 Agent system prompt 中加入碳电套利知识 | 小 | 更新 AGENT_SYSTEM_PROMPT |

### 阶段四：时光回溯 + Agent P3/P4 骨架

| 任务 | 预估工作量 | 说明 |
|---|---|---|
| 实现 `TimeTravel.tsx` UI | 中 | 日历选择器 + 数据可用性标记 |
| 后端 `/api/realtime/history` + Open-Meteo Archive 集成 | 中 | 自动回补缺失数据 |
| 新增 `time_travel` Agent 工具 | 小 | 调用 history API + optimize |
| `vpp_arbitrage_scan` 工具骨架 | 小 | P3 预留接口 |
| `multi_agent_debate` 工具骨架 | 中 | P4 预留并发 LLM 调用 |

### 阶段五：电价爬虫（可选锦上添花）

| 任务 | 预估工作量 | 说明 |
|---|---|---|
| 浙江电力交易中心爬虫 | 大 | Playwright 无头浏览器，反爬风险高 |
| 降级链路完整集成测试 | 中 | 爬虫 → 模拟器 → 兜底 三级切换 |

> **建议**：阶段五放在最后，甚至纯比赛演示可以跳过。模拟器在演示时的效果完全不输真实爬虫，且更可控。

---

## 10. 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| Open-Meteo API 不可用/限流 | 低 | 光照+碳因子断供 | 本地缓存 + Fallback 曲线 |
| 电价爬虫长期维护成本高 | 高 | 爬虫失效 | 模拟器作为稳定替代，演示效果等价 |
| LLM 预警话术生成延迟 | 中 | 主动预警体验下降 | 预置模板话术，LLM 失败时退化为模板 |
| SQLite WAL 模式写锁竞争 | 极低 | 采集器写入失败 | 重试 3 次 + 错开写入时机 |
| 碳因子模型精度争议 | 中 | 学术严谨性 | 论文中说明模型假设和参数来源，标注为"估算值" |
| WebSocket 断连 | 中 | 前端收不到推送 | 自动重连 + 轮询兜底（每60s GET /api/realtime/latest） |

---

## 11. 与 `initial.md` 的同步更新清单

文档输出但尚未编码实施。待各阶段代码落地后，需同步更新 `initial.md` 中：

- [ ] 目录结构：新增 `server/python/data_fetcher.py` 等文件
- [ ] 技术栈表：新增 APScheduler、ws (WebSocket)、Open-Meteo
- [ ] 后端接口表：新增 `/api/realtime/*`、WebSocket `/ws`
- [ ] Agent 工具表：新增 `get_realtime_data`、`carbon_electricity_analysis`、`time_travel`、`get_alerts`
- [ ] 数据库表结构：新增 `realtime_data`、`data_source_health`、`alert_events`
- [ ] 当前限制表：标记新功能完成状态

---

## 附录 A：浙江省大工业分时电价基准参考

> 依据：浙发改价格〔2024〕21号，《省发展改革委关于调整工商业峰谷分时电价政策有关事项的通知》

| 时段类型 | 时段 | 参考电价 (元/kWh) |
|---|---|---|
| 低谷 | 22:00 - 次日 8:00 | 0.35 |
| 高峰 | 8:00-11:00, 13:00-17:00 | 0.95 |
| 平段 | 11:00-13:00, 17:00-22:00 | 0.62 |
| 尖峰(夏季 7-8月) | 13:00-15:00 | 1.25 |
| 尖峰(冬季 12-1月) | 18:00-20:00 | 1.25 |

> 注：以上为代理购电大工业用户（1-10kV）参考价格，实际到户电价还包含输配电费、政府性基金及附加，每月略有浮动。

---

## 附录 B：Open-Meteo API 集成规格

| 参数 | 值 |
|---|---|
| 预报端点 | `https://api.open-meteo.com/v1/forecast` |
| 历史端点 | `https://archive-api.open-meteo.com/v1/archive` |
| 坐标(杭州) | `latitude=30.26, longitude=120.19` |
| 请求字段 | `shortwave_radiation, wind_speed_10m, wind_speed_80m, temperature_2m` |
| 时区 | `Asia/Shanghai` |
| 频率限制 | 免费：10,000 次/天（足够每小时调用） |
| 认证 | 无需 API Key |
| 数据格式 | JSON，`hourly` 对象包含 24 个浮点数组 |

---

## 附录 C：现有优化器参数对接映射表

| 外部数据 | 优化器参数 | 转换逻辑 |
|---|---|---|
| 电价 24h (元/kWh) | `price_grid` | 直接替换，无需转换 |
| 碳因子 24h (tCO₂/kWh) | `EF_grid` | 直接替换，注意单位是 tCO₂ 不是 kg |
| 太阳辐射 24h (W/m²) | `G_profile` + `G_scale` | `G_profile = radiation / max(radiation)`, `G_scale = max(radiation)/1000×1.5` |
| 碳交易价格 (元/tCO₂) | `c_carbon` | 直接传入 |
| 风速 (m/s) | 无直接对应 | 仅用于碳因子模型中间计算 |

> **关键**：`optimizer.py` 的 `overrides` 机制已原生支持以上所有参数的运行时替换，**无需修改优化器核心代码**。
