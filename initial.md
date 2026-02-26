# EcoProject — 记忆注入文档（现状版）

> **新 Agent 必须在开始开发前完整阅读此文档。**  
> 本文档记录了项目完整架构、所有历史决策、已完成工作和当前状态，确保开发连续性。  
> 生成日期：2026-02-25

---

## 1. 项目概述

**项目名称**：氯碱制氢数字孪生 · 功率对比分析平台  
**工程目录**：`e:\科研绘图\EcoProject`  
**参考原型**：`e:\科研绘图\power_dashboard.html`（独立 HTML，是所有 UI 风格的最终参照标准）  
**开发服务器**：`npm run dev -- --port 3006`（vite.config 默认 3005，须显式指定 3006）  
**构建命令**：`npm run build`（`tsc && vite build`，当前可无错误完成）

### 业务背景

模拟氯碱制氢工业系统中 6 种优化调度方案（UCI / CICOS / CICAR / CICOM / PV / ES）在 24 小时时序下的功率、制氢量、碳排放等关键指标对比分析。数据来源于 `output.xlsx`，已完整硬编码进 `src/data/realData.ts`。

---

## 2. 技术栈

| 类型 | 技术 | 版本 |
|---|---|---|
| UI 框架 | React | 18.3.1 |
| 类型系统 | TypeScript | 5.5.3 |
| 构建工具 | Vite | 5.4.8 |
| 样式系统 | Tailwind CSS | **v3**.4.13（非 v4）|
| 图表库 | ECharts | 5.5.1（core 按需引入）|
| 路由 | React Router DOM | 7.1.1 |
| 图标 | Lucide React | 0.441.0 |
| 状态 | Zustand | 5.0.1（已安装，**未实际使用**，用 React Context 代替）|

---

## 3. 目录结构

```
EcoProject/
├── index.html
├── package.json
├── tailwind.config.cjs         ← Tailwind v3 配置（必须是 .cjs，因为 package.json "type":"module"）
├── vite.config.ts              ← @/ 别名指向 ./src
├── tsconfig.json
├── initial.md                  ← 本文档
├── src/
    ├── main.tsx                ← React 入口，挂载 StrategyProvider + BrowserRouter
    ├── App.tsx                 ← Routes 定义（5个路由）
    ├── index.css               ← 全局样式（@layer base/components）
    ├── types/
    │   └── index.ts            ← 所有 TS 类型（StrategyKey, EcoDataset 等）
    ├── data/
    │   └── realData.ts         ← 真实数据 + STRATEGY_META + DATASET + getHours()
    ├── context/
    │   └── StrategyContext.tsx ← 全局 Context（activeStrategy / dataset / currentTime）
    ├── layout/
    │   └── MainLayout.tsx      ← 顶栏 + 导航 Tab + <Outlet />
    ├── pages/
    │   ├── Overview.tsx        ← 总览（主图 + 3个右侧联动面板 + 区间统计占位）
    │   ├── Energy.tsx          ← 能源
    │   ├── Production.tsx      ← 生产
    │   ├── Equipment.tsx       ← 装备
    │   └── HSE.tsx             ← HSE
    └── components/
        ├── charts/
        │   ├── useEChart.ts            ← ECharts 通用 Hook（含全局 BASE_THEME）
        │   ├── PowerBalanceChart.tsx   ← 核心多策略功率曲线图（6策略同时显示）
        │   ├── CarbonTrendChart.tsx    ← 碳排放时序图
        │   ├── WaterfallChart.tsx      ← 瀑布/柱状对比图（metric: 'combined'|'cost'|'carbon'）
        │   ├── HydrogenChart.tsx       ← 制氢量堆叠图
        │   └── StrategyRadarChart.tsx  ← 策略雷达图
        ├── ui/
            ├── PanelBox.tsx            ← 通用面板容器
            ├── StrategySwitcher.tsx    ← 顶部导航栏右侧策略按钮组
            ├── DigitalNumber.tsx       ← KPI 数字展示
            ├── StatusBadge.tsx         ← 状态标签（success/warning/info/idle）
            └── SystemLog.tsx           ← 系统日志列表
        └── agent/
            ├── AgentSidebar.tsx        ← Agent 侧边栏（可折叠、可拖拽宽度）
            ├── AgentChat.tsx           ← 消息列表 + 输入框
            └── AgentModeSwitch.tsx     ← Ask / Agent 模式切换
    ├── hooks/
    │   ├── useAgentContext.ts         ← 构建注入 LLM 的上下文
    │   └── useAgentChat.ts             ← 发送消息、流式接收、解析 tool_calls
    └── lib/
        └── agentActions.ts             ← Agent 模式动作（navigate/switchStrategy）
└── server/                             ← Agent 后端（Express + OpenAI SDK）
    ├── index.js
    ├── package.json
    └── .env.example
```

---

## 4. 数据架构

### 4.1 核心类型（`src/types/index.ts`）

```typescript
type StrategyKey = 'uci' | 'cicos' | 'cicar' | 'cicom' | 'pv' | 'es'

interface EcoDataset {
  summary: Record<StrategyKey, { cost: number; carbon: number; combined: number }>
  P_CA:    Record<StrategyKey, number[]>   // 电解槽功率 (kW)，24h
  P_PV:    Record<StrategyKey, number[]>   // 光伏功率
  P_GM:    Record<StrategyKey, number[]>   // 燃气轮机
  P_PEM:   Record<StrategyKey, number[]>   // PEM 制氢功率
  P_G:     Record<StrategyKey, number[]>   // 电网功率
  P_es_es: number[]                        // 储能功率（仅 es 方案有意义）
  ef_g:    number[]                        // 碳排放因子 (tCO2/kWh)
  H_CA:    Record<StrategyKey, number[]>   // 氯碱制氢 (kg/s)
  H_PEM:   Record<StrategyKey, number[]>   // PEM 制氢 (kg/s)
  H_CH:    Record<StrategyKey, number[]>   // 压缩储氢 (kg/s)
}
```

> ⚠️ **重要**：数据访问模式必须是 `dataset.P_CA[activeStrategy]`，**不是** `dataset[activeStrategy]`。

### 4.2 策略元数据颜色

```
uci   → '#4E9EFF'  统一控制综合（基准方案，24h 恒定 9020.51 kW）
cicos → '#FF7043'  成本优化集成
cicar → '#29D4FF'  碳排优化集成
cicom → '#CE93D8'  综合优化集成
pv    → '#C6F135'  光伏优先优化
es    → '#FFD740'  储能综合优化
```

### 4.3 全局 Context（`src/context/StrategyContext.tsx`）

- `activeStrategy`：当前激活策略，默认 `'uci'`
- `setActiveStrategy`：切换策略
- `dataset`：完整静态 `DATASET` 对象
- `strategyMeta`：`STRATEGY_META`
- `currentTime`：`new Date()`，每秒更新（保留用于时钟）

---

## 5. 颜色系统 & 设计规范

完全对齐 `power_dashboard.html` CSS 变量：

| CSS 变量 | Tailwind key | 值 | 用途 |
|---|---|---|---|
| `--bg0` | `bg0` | `#070c14` | 全局背景 |
| `--bg1` | `bg1` | `#0d1422` | 面板背景 |
| `--bg2` | `bg2` | `#111b2e` | 次级面板 |
| `--bg3` | `bg3` | `#172240` | 进度条底色 |
| `--border` | `border-cyber` | `#1e3256` | 所有边框 |
| `--glow` | `glow` | `#00d4ff` | 高亮/发光色 |
| `--text0` | `text-primary` | `#e8f4ff` | 主文本 |
| `--text1` | `text-secondary` | `#8ba9cc` | 次要文本 |
| `--text2` | `text-muted` | `#3d6080` | 三级/标签文本 |

**字体**（Google Fonts，HTML `<head>` 已配置）：
- `Rajdhani`：标题、数字、按钮
- `Noto Sans SC`：正文
- `Share Tech Mono`：坐标轴标签、Tooltip、序号

---

## 6. CSS 系统（`src/index.css`）

所有样式在 `@layer components` 中定义，与 `power_dashboard.html` 完全对应：

| CSS 类 | 对应参考 HTML | 用途 |
|---|---|---|
| `.scanlines` | `body::before` | 全局扫描线背景纹理 |
| `.panel` | `.panel` | 面板容器（`bg:#0d1422`，顶部渐变光线，`border:#1e3256`）|
| `.panel-title-bar` | `.panel-title` | 面板标题条（Rajdhani，大写，letter-spacing:2px）|
| `.stat-grid` / `.stat-cell` / `.stat-label` / `.stat-value` / `.stat-unit` | `.stat-*` | 2×2 统计卡片网格 |
| `.rank-list` / `.rank-item` / `.rank-num` / `.rank-dot` / `.rank-name` / `.rank-bar-wrap` / `.rank-bar` / `.rank-val` | `.rank-*` | 方案排行列表 |
| `.diff-panel-body` / `.diff-item` / `.diff-name` / `.diff-num` / `.diff-pos` / `.diff-neg` | `.diff-*` | 差值面板（pos=绿，neg=红）|
| `.brush-result` / `.brush-hint` | `.brush-*` | 区间统计占位区 |
| `.hud-header` | `header` | 顶栏背景渐变 |
| `.hud-nav-link` / `.hud-nav-link.active` | `.vtab` / `.vtab.active` | 导航链接（active 时 `border-bottom: 2px solid #00d4ff`）|
| `.hud-chip` / `.hud-chip.live` | `.tag` / `.tag.live` | 顶栏右侧标签芯片 |
| `.strategy-btn` | — | 策略切换按钮 |
| `.logo-pulse` | `.logo-pulse` | 顶栏左侧脉冲圆点 |

---

## 7. 关键组件规范

### 7.1 `useEChart` Hook（`src/components/charts/useEChart.ts`）

```typescript
// 已注册的 ECharts 组件（全部必须，勿删）：
// BarChart, LineChart, RadarChart, ScatterChart
// GridComponent, TooltipComponent, LegendComponent, TitleComponent
// RadarComponent, MarkLineComponent, DataZoomComponent
// ToolboxComponent, BrushComponent   ← 后期补加，Overview 的 Brush 功能依赖
// CanvasRenderer

// BASE_THEME（合并到所有图表 setOption 中）：
const BASE_THEME = {
  backgroundColor: 'transparent',
  textStyle: { color: '#8BA9CC', fontFamily: 'Rajdhani, Noto Sans SC, sans-serif' },
  animation: false,                                    // 禁用初始加载动画（静态直接显示完整图）
  stateAnimation: { duration: 300, easing: 'cubicOut' }, // 保留 hover 过渡动画
}
```

### 7.2 `PowerBalanceChart`（`src/components/charts/PowerBalanceChart.tsx`）

```typescript
// Props：
interface PowerBalanceChartProps {
  onHourHover?: (hourIdx: number, values: { key: StrategyKey; val: number }[]) => void
}
// ✅ 无 strategies / playbackHour / topColor 等旧 props
```

- 同时显示全部 6 种策略的 `P_CA` 数据
- UCI：蓝色虚线 + 圆形标记点，无面积填充
- 其余 5 策略：实线 + 渐变半透明面积填充（`hexToRgba(color, 0.18)` → `0`）
- **Hover Emphasis**：`emphasis.focus:'series'` + `blurScope:'coordinateSystem'`，悬停时该线加粗（width:3），其余变暗
- `onHourHover` 在 Tooltip `formatter` 内调用，用于驱动 Overview 右侧三个面板实时更新

### 7.3 `PanelBox`（`src/components/ui/PanelBox.tsx`）

```typescript
// Props：
interface PanelBoxProps {
  title?: string
  children: ReactNode
  className?: string
  topColor?: string   // 接受但不渲染，保留仅为不破坏旧页面调用
  footer?: ReactNode  // 底部内容，带上边框分割线
}
// 渲染：<div className={`panel flex flex-col ${className}`}>
```

### 7.4 页面布局规范

**Energy / Equipment / Production / HSE**（固定三行网格）：

```tsx
<div className="h-full grid grid-cols-12 gap-3" style={{ gridTemplateRows: '72px 1fr 1fr' }}>
  {/* 第1行 72px：KPI 卡片（col-span-3 × 4）*/}
  {/* 第2行 1fr：主图表（col-span-8）+ 辅助面板（col-span-4）*/}
  {/* 第3行 1fr：对比图表（col-span-6 × 2）*/}
</div>
```

**Overview**（2行，弹性高度）：

```tsx
<div className="h-full" style={{ display:'grid', gridTemplateRows:'1fr auto', gap:12, minHeight:0 }}>
  {/* 第1行 1fr：内部再 grid "1fr 280px"，左侧主图 + 右侧3面板 */}
  {/* 第2行 auto（minHeight:80）：区间统计占位 */}
</div>
```

**MainLayout**：
- `<div className="scanlines min-h-screen w-full flex flex-col overflow-hidden">`
- `<header>` → shrink-0，固定高度
- 导航 tab 栏 → shrink-0
- `<main className="flex-1 min-h-0 overflow-hidden p-5">` → `<Outlet />`（Outlet 的 h-full 可铺满）

---

## 8. 各页面说明

### Overview（总览）`/`
| 区域 | 内容 |
|---|---|
| 左侧（1fr） | `PowerBalanceChart`（`onHourHover` 联动右侧面板）|
| 右侧（280px） | ① 实时统计：max/min/avg/range ② 方案排行：带进度条 ③ 差值面板：与UCI对比 |
| 底部（auto） | 区间统计占位（Brush 选区结果表格，**尚未实现**，仅有 hint 文字）|

### Energy（能源）`/energy`
- KPI：光伏总出力 / 电网购电量 / 燃气轮机发电 / 氯碱耗电
- 图表：PowerBalanceChart（col-8）+ CarbonTrendChart（col-4）
- 对比：WaterfallChart综合目标（col-6）+ WaterfallChart运营成本（col-6）

### Production（生产）`/production`
- KPI：氢气总产量 / 氯碱制氢 / PEM制氢 / PEM功耗
- 图表：HydrogenChart（col-8）+ CarbonTrendChart（col-4）
- 对比：WaterfallChart综合（col-6）+ WaterfallChart碳排（col-6）

### Equipment（装备）`/equipment`
- KPI：4个设备状态卡（氯碱/PEM/光伏/燃气轮机）
- 图表：PowerBalanceChart关键出力（col-8）+ 峰值统计 DigitalNumber（col-4）
- 底部：2个设备卡（电网/储能）+ PowerBalanceChart实时监控（col-6）

### HSE `/hse`
- KPI：日碳排放 / 碳配额剩余 / 配额使用率 / 碳因子峰谷
- 图表：CarbonTrendChart（col-8）+ 安全状态列表+进度条（col-4）
- 底部：WaterfallChart碳排（col-6）+ SystemLog（col-6）

---

## 9. 历史决策记录（极其重要）

### 9.1 已解决的重大 Bug

| 问题 | 根因 | 修复 |
|---|---|---|
| 页面白屏崩溃 | 数据访问写成 `dataset[activeStrategy]` | 改为 `dataset.P_CA[activeStrategy]` |
| Energy/Equipment 控制台报 prop 错误 | PowerBalanceChart 重写后移除了 `strategies`/`playbackHour` props | 移除调用方的这些 props |
| Brush/Toolbox 图标不响应 | 未注册 `BrushComponent`/`ToolboxComponent` | `useEChart.ts` 的 `echarts.use()` 中补充注册 |
| 图表无法随容器 resize | 无监听 | `useEChart` 中用 `ResizeObserver` |

### 9.2 已完成的所有改动（按时间顺序）

1. **初始版构建**：React 18 + TS + Vite + Tailwind v3，5页路由，完整真实数据
2. **颜色体系重写**：完全对齐 `power_dashboard.html`，从"赛博朋克强蓝"改为"深色微蓝"
3. **CSS 重写**：移除旧类（`.panel-cyber`、`.neon-text`），新增全套参考对应类
4. **MainLayout 简化**：移除 EC Logo/时钟，改为 `logo-pulse` + 标题 + 3个 `hud-chip`
5. **PowerBalanceChart 完全重写**：单策略多指标 → 全策略单指标(P_CA)，移除所有 playback 逻辑
6. **Overview 重写**：加入右侧三个联动面板，底部区间统计占位
7. **滚动播放功能完全移除**：`isPlaying`/`playHour`/`timerRef`/footer 播放控件全部清除
8. **图表初始动画禁用**：`BASE_THEME` 中 `animation: false`（静态完整显示，无逐帧绘制）
9. **Hover Emphasis 效果**：`emphasis.focus:'series'` + `blurScope:'coordinateSystem'`，悬停高亮，其余变暗
10. **保留 hover 过渡**：`stateAnimation: { duration: 300 }` 保留 hover 状态平滑切换
11. **布局高度固定化**：所有页面从 `grid-rows-[auto_1fr_1fr]` 改为 `style={{ gridTemplateRows: '72px 1fr 1fr' }}`，组件高度不随内容撑开

### 9.3 严禁操作（"不要做"清单）

- ❌ 不要将 `animation: false` 和 `stateAnimation` 一并删除，前者禁初始动画，后者保留 hover 交互
- ❌ 不要给 `PowerBalanceChart` 传 `strategies`/`playbackHour`/`topColor` 等已删除的 props
- ❌ 不要从 `useEChart.ts` 的 `echarts.use()` 中移除 `BrushComponent`/`ToolboxComponent`
- ❌ 不要用 `dataset[activeStrategy]` 访问数据，正确是 `dataset.P_CA[activeStrategy]`
- ❌ 不要修改 `tailwind.config.cjs` 的后缀（必须是 `.cjs`）
- ❌ 任何视觉/样式修改前，先对照 `power_dashboard.html` 对应实现，以其为准

---

## 10. 当前功能状态

| 功能 | 状态 | 备注 |
|---|---|---|
| 5 个页面基本结构 | ✅ 完成 | |
| 颜色体系与参考一致 | ✅ 完成 | |
| 图表静态显示（无初始动画） | ✅ 完成 | |
| 图表 Hover 高亮/变暗 emphasis 效果 | ✅ 完成 | |
| Overview 右侧 3 面板 Tooltip 联动 | ✅ 完成 | |
| 所有页面固定高度铺满屏幕 | ✅ 完成 | |
| Brush 区间选择 UI（工具箱图标） | ✅ 有入口 | |
| Brush 区间统计结果表格 | ⏳ 未实现 | 仅有 hint 文字占位 |
| 3D 瀑布图（参考 HTML 第2个 tab） | ⏳ 未实现 | Three.js，参考 HTML §3 节 |
| 竞速排行动画（参考 HTML 第3个 tab） | ⏳ 未实现 | 参考 HTML §4 节 |
| AI Agent 侧边栏 | ✅ 完成 | Ask 模式问答 + Agent 模式执行 navigate/switchStrategy |

---

## 11. 启动步骤

```powershell
# 1. 进入项目目录
cd "e:\科研绘图\EcoProject"

# 2. 开发模式（必须显式指定 3006）
npm run dev -- --port 3006

# 3. Agent 后端（另开终端，需配置 API Key）
cd server
cp .env.example .env   # 编辑 .env 填入 OPENAI_API_KEY 或 DASHSCOPE_API_KEY
npm install
npm run dev

# 4. 构建验证
npm run build
```

访问：`http://localhost:3006`

**Agent 说明**：侧边栏支持 Ask 模式（基于当前数据问答）和 Agent 模式（执行页面跳转、策略切换）。Vite 已配置 `/api` 代理到 `localhost:3007`，开发时需同时启动后端。

---

## 12. 参考文件

| 文件 | 用途 |
|---|---|
| `e:\科研绘图\power_dashboard.html` | **UI 设计最终参照**，所有视觉效果均以此为准 |
| `e:\科研绘图\EcoProject\src\data\realData.ts` | 所有真实数据的唯一来源 |

> **核心原则**：视觉上的一切以 `power_dashboard.html` 为最终标准，不要自行发挥。功能扩展（如 Brush 统计、3D 视图）也应对照参考 HTML 的对应实现逻辑。

