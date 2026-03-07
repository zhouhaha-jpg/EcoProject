# EcoProject — 记忆注入文档（现状版）

> **新 Agent 必须在开始开发前完整阅读此文档。**
> 本文档以当前仓库代码为准，记录真实架构、已落地能力、遗留限制与注意事项。
> 生成日期：2026-03-07

---

## 1. 项目概述

**项目名称**：智慧园区节能减排综合调度平台  
**工程目录**：`e:\科研绘图\EcoProject`  
**参考原型**：`e:\科研绘图\power_dashboard.html`（所有视觉效果的最终参照标准）  
**前端开发命令**：`npm run dev`（可通过 `-- --port 3006` 指定端口）  
**前端构建命令**：`npm run build`（`tsc && vite build`）  
**后端开发命令**：`cd server && npm run dev`  
**优化器依赖**：`pip install -r server/python/requirements.txt`

### 业务背景

平台用于展示和分析氯碱工业多能互补系统在 24 小时时序下的优化调度结果，重点比较 6 种方案（UCI / CICOS / CICAR / CICOM / PV / ES）在功率、储氢、运行成本、碳排放等指标上的差异。

当前系统已从“静态数据看板”升级为“带 Agent 的调度分析平台”，能够通过自然语言触发 What-If 推演、附加约束求解、因果追溯和 Pareto 参数扫描。

---

## 2. 技术栈

| 类型 | 技术 | 说明 |
|---|---|---|
| 前端框架 | React 18.3.1 | 主应用 UI |
| 类型系统 | TypeScript 5.5.3 | 前端类型约束 |
| 构建工具 | Vite 5.4.8 | 前端开发与构建 |
| 样式系统 | Tailwind CSS v3.4.13 | 必须保持 `.cjs` 配置 |
| 图表库 | ECharts 5.5.1 | 所有业务图表 |
| 3D 引擎 | Three.js + React Three Fiber + Drei | 总览页园区白模、镜头聚焦、Hover 动画与能量流线 |
| 路由 | React Router DOM 7.1.1 | 前端页面切换 |
| 图标 | Lucide React 0.441.0 | UI 图标 |
| 后端框架 | Express 4.21 | Agent、数据集、优化接口 |
| LLM SDK | OpenAI SDK 4.52 | 兼容 OpenAI / 智谱等 OpenAI 风格接口 |
| 数据库存储 | better-sqlite3 | 数据集和对话历史持久化 |
| 优化求解 | Python + NumPy + SciPy | 当前主求解链路 |
| 桌面端 | Electron | 仓库含 `electron/`，用于 Windows 客户端构建 |

> ⚠️ `zustand` 已安装，但当前主状态管理仍是 React Context，不是 Zustand。

---

## 3. 当前目录结构

```
EcoProject/
├── .github/
│   └── prompts/
│       └── ecoproject-domain.prompt.md   ← 项目专用 Prompt（当前已加入 .gitignore）
├── electron/
│   ├── main.js                           ← Electron 主进程入口
│   └── preload.cjs                       ← 预加载脚本
├── server/
│   ├── index.js                          ← Express 后端入口 + /api/chat
│   ├── config.js                         ← API Key / Base URL / 模型配置
│   ├── routes/
│   │   ├── conversations.js              ← 对话历史 API
│   │   ├── datasets.js                   ← 数据集 API
│   │   └── optimize.js                   ← 优化求解 API
│   ├── db/
│   │   ├── index.js                      ← SQLite 初始化与访问
│   │   ├── schema.sql                    ← 数据集与对话历史表结构
│   │   └── seed.js                       ← 默认数据集种子
│   ├── python/
│   │   ├── optimizer.py                  ← 当前主优化器（Python + SciPy）
│   │   └── requirements.txt              ← Python 依赖
│   └── matlab/
│       └── optimize_system.m             ← 参数化 MATLAB 版本，当前非主执行链路
├── src/
│   ├── App.tsx                           ← 当前路由入口
│   ├── main.tsx                          ← React 入口，挂载 StrategyProvider + BrowserRouter
│   ├── index.css                         ← 全局样式系统
│   ├── layout/
│   │   └── MainLayout.tsx                ← 顶栏 + 导航 + Agent 侧边栏
│   ├── context/
│   │   └── StrategyContext.tsx           ← 全局数据、场景数据、Pareto 数据状态
│   ├── hooks/
│   │   ├── useAgentChat.ts               ← Ask/Agent 对话与 tool_calls 编排
│   │   └── useAgentContext.ts            ← 注入 LLM 的完整上下文
│   ├── lib/
│   │   ├── agentActions.ts               ← Agent 工具映射与执行
│   │   └── api.ts                        ← 前端 API 客户端
│   ├── components/
│   │   ├── agent/
│   │   │   ├── AgentSidebar.tsx          ← 侧边栏容器、历史对话、拖拽宽度
│   │   │   ├── AgentChat.tsx             ← 聊天窗口、工具链显示
│   │   │   ├── AgentModeSwitch.tsx       ← Ask / Agent 模式切换
│   │   │   └── ConversationList.tsx      ← 历史对话列表
│   │   ├── charts/
│   │   │   ├── PrefixPowerChart.tsx      ← 按设备前缀的 6 方案功率图
│   │   │   ├── EconomicIndicatorChart.tsx← 成本/碳排/综合指标图
│   │   │   ├── HydrogenStorageChart.tsx  ← 储氢罐图
│   │   │   ├── EnergyStorageChart.tsx    ← 储能图
│   │   │   ├── ScenarioCompareChart.tsx  ← 基准 vs 推演对比图
│   │   │   ├── ParetoFrontierChart.tsx   ← Pareto 前沿散点图
│   │   │   └── useEChart.ts              ← ECharts Hook 与基础主题
│   │   ├── 3d/
│   │   │   ├── Park3DScene.tsx           ← 总览页 3D 园区主视图（聚焦 / Hover / 流线）
│   │   │   ├── parkDeviceConfig.ts       ← 设备坐标、路由、指标映射与状态规则
│   │   │   └── MetricSparkline.tsx       ← 信息卡与缩略趋势迷你图
│   │   └── ui/
│   │       ├── StrategySwitcher.tsx      ← 顶部策略高亮开关
│   │       ├── PanelBox.tsx              ← 通用面板容器
│   │       ├── DigitalNumber.tsx         ← KPI 数字卡
│   │       ├── StatusBadge.tsx           ← 状态标签
│   │       └── SystemLog.tsx             ← 系统日志
│   ├── pages/
│   │   ├── OverviewPage.tsx              ← 总览页
│   │   ├── EconomicIndicatorsPage.tsx    ← 经济指标页
│   │   ├── StorageModulePage.tsx         ← 存储模块页
│   │   ├── ScenarioComparePage.tsx       ← Agent 工作区
│   │   └── PrefixPage.tsx                ← 电解槽/光伏/燃机/PEM/电网统一模板页
│   ├── types/
│   │   └── index.ts                      ← 核心 TS 类型
│   └── data/
│       └── realData.ts                   ← 前端本地兜底数据
├── public/
│   └── models/
│       └── equipment/
│           ├── README.md                 ← 真实模型资源命名规范与下载建议
│           └── manifest.json             ← 计划接入的 glb 资源清单
├── initial.md                            ← 本文档
└── agent能力升级方案_168d7722.plan.md     ← Agent 能力设计方案文档（可参考，不可替代代码事实）
```

> ⚠️ `src/pages` 下仍保留 `Overview.tsx`、`Energy.tsx`、`Equipment.tsx`、`Production.tsx`、`HSE.tsx` 等旧页面文件，但它们**不是当前 `App.tsx` 正在使用的主路由**。

---

## 4. 当前路由与页面职责

当前主路由由 `src/App.tsx` 定义，共 9 个入口：

| 路由 | 页面 | 职责 |
|---|---|---|
| `/overview` | `OverviewPage.tsx` | 5 类设备功率总览 + 经济指标入口 |
| `/scenario` | `ScenarioComparePage.tsx` | Agent 工作区，展示推演结果或 Pareto 前沿 |
| `/economic` | `EconomicIndicatorsPage.tsx` | 成本 / 碳排 / 综合指标表格与图表 |
| `/storage` | `StorageModulePage.tsx` | 储氢罐与储能数据分析 |
| `/ca` | `PrefixPage.tsx` | 电解槽功率详情 |
| `/pv` | `PrefixPage.tsx` | 光伏功率详情 |
| `/gm` | `PrefixPage.tsx` | 燃气轮机功率详情 |
| `/pem` | `PrefixPage.tsx` | 质子膜燃料电池功率详情 |
| `/g` | `PrefixPage.tsx` | 电网购电功率详情 |

---

## 5. 数据结构与状态管理

### 5.1 核心类型

当前 `EcoDataset` 的关键字段如下：

```typescript
type StrategyKey = 'uci' | 'cicos' | 'cicar' | 'cicom' | 'pv' | 'es'

interface EcoDataset {
  summary: Record<StrategyKey, { cost: number; carbon: number; combined: number }>
  P_CA: Record<StrategyKey, number[]>
  P_PV: Record<StrategyKey, number[]>
  P_GM: Record<StrategyKey, number[]>
  P_PEM: Record<StrategyKey, number[]>
  P_G: Record<StrategyKey, number[]>
  P_es_es: number[]
  ef_g: number[]
  H_CA: Record<StrategyKey, number[]>
  H_PEM: Record<StrategyKey, number[]>
  H_CH: Record<StrategyKey, number[]>
  H_HS: Record<StrategyKey, number[]>
}
```

> ⚠️ **重要**：访问模式必须是 `dataset.P_CA[activeStrategy]`，不要写成 `dataset[activeStrategy]`。

### 5.2 `StrategyContext.tsx`

当前 Context 不再只是“当前策略 + 静态数据”，还额外承载了 Agent 结果状态：

- `activeStrategy` / `setActiveStrategy`：当前高亮策略
- `selectedStrategies` / `toggleStrategy`：图表曲线高亮筛选
- `dataset`：当前基础数据集
- `datasetLoading` / `datasetError`：默认数据集加载状态与错误
- `scenarioDataset` / `scenarioLabel`：What-If 或约束求解结果
- `paretoData` / `paretoLabel`：Pareto 扫描结果
- `loadScenarioDataset()`：将新的优化结果载入 Agent 工作区
- `loadParetoData()`：保存 Pareto 扫描结果，并自动计算建议区间

### 5.3 默认数据来源

- 前端启动时优先调用 `/api/datasets/default`
- 如果后端不可用，则回退到 `src/data/realData.ts` 的本地静态数据
- SQLite 中 `id` 最小的数据集被视为全局“基准数据集”

---

## 6. Agent 与后端架构

### 6.1 当前后端接口

| 接口 | 说明 |
|---|---|
| `POST /api/chat` | Ask / Agent 模式统一入口 |
| `GET /api/datasets` | 数据集列表 |
| `GET /api/datasets/default` | 默认基准数据集 |
| `GET /api/datasets/:id` | 指定数据集详情 |
| `POST /api/optimize` | 全 6 策略求解，支持参数覆写与附加约束 |
| `POST /api/optimize/single` | 单策略求解，用于 Pareto 扫描 |
| `GET/POST/PUT/DELETE /api/conversations...` | 对话历史增删改查 |

### 6.2 Ask / Agent 两种模式

- **Ask 模式**：纯问答，`/api/chat` 返回流式文本，前端按 SSE 增量显示
- **Agent 模式**：允许 LLM 发起 tool_calls，前端按工具链步骤执行并展示结果

### 6.3 已落地的 Agent 工具能力

当前 `server/index.js` 与 `src/lib/agentActions.ts` 已经注册并实现以下工具：

| 工具 | 状态 | 实际行为 |
|---|---|---|
| `navigate` | ✅ 完成 | 切换到指定页面 |
| `switchStrategy` | ✅ 完成 | 切换高亮策略 |
| `run_whatif` | ✅ 完成 | 调 `/api/optimize` 运行新情景，结果写入数据库并加载到 `/scenario` |
| `add_constraint` | ✅ 完成 | 调 `/api/optimize` 添加约束后重算 |
| `trace_causality` | ✅ 完成 | 从完整 24h 数据中抽取指定时段设备状态，交给 LLM 解释 |
| `pareto_scan` | ✅ 完成 | 多次调用 `/api/optimize/single` 扫描参数区间，并在前端生成 Pareto 图 |
| `generate_chart` | ⚠️ 部分完成 | 当前只返回图表元信息，不会动态插入任意 ECharts 图表面板 |

### 6.4 当前优化求解链路

**当前主链路不是 MATLAB Engine，而是 Python 优化器：**

1. 前端通过 `run_whatif` / `add_constraint` / `pareto_scan` 发起请求
2. `server/routes/optimize.js` 用 `child_process.spawn` 调用 `server/python/optimizer.py`
3. `optimizer.py` 使用 NumPy + SciPy 的 `minimize(..., method='SLSQP')` 完成求解
4. 返回结果后写入 SQLite 或直接回传前端
5. 前端将结果显示在 Agent 工作区

`server/matlab/optimize_system.m` 仍然保留在仓库中，但**当前不是线上主调用路径**。相关设计方案可参考 `agent能力升级方案_168d7722.plan.md`，但实现事实必须以当前代码为准。

### 6.5 SQLite 持久化

数据库表结构定义在 `server/db/schema.sql`：

- `datasets`：存储默认数据集和每次推演/约束求解生成的新数据集
- `conversations`：存储对话元信息（标题、模式、时间）
- `conversation_messages`：存储具体消息和工具执行记录

---

## 7. 当前页面说明

### 7.1 总览页 `OverviewPage.tsx`

- 当前已重构为三栏结构：左侧趋势缩略栏、中部 3D 园区主视图、右侧设备信息与状态栏
- 3D 主视图已支持设备点击后的镜头聚焦、Hover 浮动动画和能量流线演示
- 点击设备时只执行一次平滑聚焦动画，结束后 OrbitControls 会恢复自由缩放和拖拽，不持续锁定视角
- 点击 3D 场景空白区域后，会回到可覆盖全园区模型的默认纵览机位
- 总览页中的 3D 场景已改为动态导入，优先压缩首屏体积
- Vite 构建已对 `three/@react-three`、`echarts`、React vendor 做手动分包，避免 3D 继续挤占主包
- 3D 主视图默认仍采用程序化白模，不依赖外部 glb 模型即可演示点击交互
- 左侧总览缩略图已补充渐变描边、发光滤镜和 hover 增强，视觉效果向业务图表靠齐
- 右侧信息卡中的 24h 迷你图已统一为同样的发光视觉风格，并修正了常值序列贴底导致“看不见曲线”的问题
- 迷你图组件已针对低波动/常值序列做可见性增强，并加入轻微呼吸与扫光动画，提升总览页活性观感
- 6 类核心设备已具备点击查看数据能力：氯碱电解槽、PEM、光伏、燃气轮机、储氢罐、储能模块
- 点击设备后，不直接跳转，而是在右侧信息卡中显示实时指标、24h 迷你图、状态说明和“查看详情”按钮
- 已建立 `public/models/equipment/` 资源目录和模型命名清单，后续可逐类替换当前白模

### 7.2 经济指标页 `EconomicIndicatorsPage.tsx`

- 顶部为 6 策略的成本 / 碳排 / 综合指标表格
- 底部为 3 张柱状图，对应三类指标

### 7.3 存储模块页 `StorageModulePage.tsx`

- 主图为 `HydrogenStorageChart`
- 底部为 `EnergyStorageChart`
- 右侧实时统计、方案排行、与 UCI 差值均已接入

### 7.4 前缀页 `PrefixPage.tsx`

- 统一承载电解槽、光伏、燃机、PEM、电网五类详情页
- 包含主图、实时统计、排行、UCI 差值面板
- 底部 Brush 区间统计仍是占位提示，尚未输出实际统计结果

### 7.5 Agent 工作区 `ScenarioComparePage.tsx`

- 如果当前有 `scenarioDataset`：展示“基准 vs 推演”的表格和 3 张对比图
- 如果当前有 `paretoData`：展示 Pareto 前沿散点图、建议区间和说明文字
- 如果两者都没有：显示示例指令引导用户在 Agent 面板发起操作

---

## 8. 当前 UI 与交互规范

### 8.1 视觉标准

所有视觉设计继续以 `power_dashboard.html` 为准，重点保留：

- 深色微蓝背景体系：`#070c14 / #0d1422 / #111b2e`
- 统一边框色：`#1e3256`
- 高亮色：`#00d4ff`
- 字体：`Rajdhani`、`Noto Sans SC`、`Share Tech Mono`

### 8.2 `MainLayout.tsx`

当前布局由三部分组成：

1. 顶栏：平台标题 + 3 个状态芯片
2. 导航栏：总览、Agent工作区、经济指标、存储模块、5 个设备页 + 策略切换器
3. 右侧 Agent 侧边栏：可折叠、可拖拽宽度、可切换历史对话

### 8.3 Agent 侧边栏

- `AgentSidebar.tsx`：负责注册 Agent 处理器，并承载历史对话列表
- `AgentChat.tsx`：展示聊天内容、模式切换、工具链执行过程
- 工具链显示风格参考 Cursor，显示为非气泡背景条

---

## 9. 历史决策与当前事实

### 9.1 已确认的重要演进

1. 项目主路由已经从旧版页面体系切换为“总览 / 经济指标 / 存储模块 / Agent工作区 / 设备前缀页”结构。
2. Agent 已不再只是页面导航助手，而是具备优化重算、附加约束、因果追溯、Pareto 扫描等执行能力。
3. 后端已从“仅聊天代理”升级为“聊天 + SQLite + 优化求解 + 对话历史”的完整服务层。
4. 当前真正执行优化的是 Python `optimizer.py`，不是 MATLAB Engine。
5. 对话历史与求解结果都会落库，前端可重复打开历史对话。
6. 总览页已进入 3D 化改造阶段，第一版采用白模园区而不是外部模型资源，优先验证布局、交互和数据映射。
7. 总览页 3D 已完成镜头聚焦、Hover 动效、能量流线与动态导入，但真实 glb 资源仍处于准备阶段。

### 9.2 当前限制与未完成项

| 能力 | 状态 | 说明 |
|---|---|---|
| What-If 推演 | ✅ 已完成 | 可修改参数并生成场景结果 |
| 约束注入 | ✅ 已完成 | 当前仅支持 `P_grid_max` / `P_grid_min` |
| 因果追溯 | ✅ 已完成 | 依赖结构化设备状态 + LLM 解释 |
| Pareto 扫描 | ✅ 已完成 | 已有前端图和建议区间 |
| 总览页 3D 园区白模 | ✅ 已完成 | 中央主视图 + 点击设备信息卡 |
| 镜头聚焦 / Hover / 能量流线 | ✅ 已完成 | 已用于总览页演示增强 |
| 空白点击回默认纵览视角 | ✅ 已完成 | 可回到覆盖全园区模型的默认机位 |
| 总览页 3D 动态导入 | ✅ 已完成 | 3D 场景已从主包拆分 |
| 动态图表生成 | ⚠️ 部分完成 | 工具存在，但尚未落成通用动态图表面板 |
| Brush 区间统计表 | ⏳ 未实现 | PrefixPage 底部仍是提示占位 |
| 真实 glb/gltf 模型替换 | ⏳ 未实现 | 当前先用程序化白模跑通交互 |
| 模型资产下载与 Blender 清洗 | ⏳ 未实现 | 已建立目录与命名清单，但资源尚未入仓 |
| MATLAB Engine 桥接 | ⏳ 未接入主链路 | 仅保留 `.m` 文件 |
| 自然语言约束全量解析 | ⏳ 未完成 | 目前约束类型较少 |

---

## 10. 严禁操作（不要做）

- ❌ 不要把当前优化执行路径描述成 MATLAB 主执行链路，真实主链路是 Python `optimizer.py`
- ❌ 不要用 `dataset[activeStrategy]` 访问数据，正确写法是 `dataset.P_CA[activeStrategy]` 等
- ❌ 不要修改 `tailwind.config.cjs` 的后缀，必须保持 `.cjs`
- ❌ 不要在未核实代码的情况下把 `agent能力升级方案_168d7722.plan.md` 中的设想直接写成“已完成”
- ❌ 不要误以为旧页面 `Energy.tsx` / `Production.tsx` / `Equipment.tsx` / `HSE.tsx` 仍是当前主路由
- ❌ 不要擅自删除 Agent 工具名或接口名，前后端已有耦合：`run_whatif`、`add_constraint`、`trace_causality`、`generate_chart`、`pareto_scan`
- ❌ 任何视觉改动前，必须先对照 `power_dashboard.html`
- ❌ 只要改动了项目结构、能力边界、路由或架构事实，就必须同步更新本 `initial.md`

---

## 11. 启动步骤

```powershell
# 1. 前端
cd "e:\科研绘图\EcoProject"
npm install
npm run dev -- --port 3006

# 2. 后端
cd server
npm install
copy .env.example .env
npm run dev

# 3. Python 优化器依赖（首次）
pip install -r server/python/requirements.txt

# 4. 构建验证
cd "e:\科研绘图\EcoProject"
npm run build
```

默认开发时前端可通过 Vite 代理访问 `/api`，后端默认监听 `5000`。

---

## 12. 参考文件

| 文件 | 用途 |
|---|---|
| `e:\科研绘图\power_dashboard.html` | UI 视觉最终参照 |
| `e:\科研绘图\EcoProject\src\data\realData.ts` | 前端本地兜底数据 |
| `e:\科研绘图\EcoProject\agent能力升级方案_168d7722.plan.md` | Agent 能力扩展方案文档，仅作规划参考 |

> **核心原则**：代码事实优先于规划文档；视觉标准优先于个人发挥；架构变化后必须回写本文件。

