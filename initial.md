# 氯碱智慧生态系统 — 项目技术文档与重构指南

> **定位：** 本文档面向即将接手重构的 AI Agent / 开发者。阅读后应能全面理解当前项目的技术选型、架构设计、代码组织方式以及存在的主要问题，并据此制定完整的重构方案。

---

## 一、项目概述

**项目名称：** chlor-alkali-smart-eco-system（智慧氯碱化工节能减排系统）

**核心功能：** 面向 1920×1080 大屏的工业数字孪生可视化系统，包含：
- 多策略（低碳 / 经济 / 综合最优）下的运行态势总览
- 电力能源平衡、碳排放趋势实时监控
- 电解槽设备健康诊断
- 物料与生产工艺流程可视化（Sankey 图、工艺动画）
- HSE 安全环保（气体泄漏、污水指标）
- AI 智能调度助手（接入 Gemini / DeepSeek / OpenAI）


---

## 二、技术选型

### 2.1 核心框架

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.3 | UI 框架 |
| TypeScript | 5.4 | 类型安全 |
| Vite | 5.2 | 构建工具 + 开发服务器 |
| React Router DOM | 7.13 | 客户端路由 |

### 2.2 样式

| 技术 | 版本 | 备注 |
|------|------|------|
| Tailwind CSS | **4.1.18** | ⚠️ v4 但使用 v3 风格的 `tailwind.config.cjs` |
| PostCSS | 8.5 | 通过 `@tailwindcss/postcss` 插件集成 |

### 2.3 可视化

| 技术 | 版本 | 用途 |
|------|------|------|
| ECharts | 6.0 | 主力图表库（雷达图、堆叠面积图、折线图、Sankey）|
| Recharts | 2.12 | 辅助图表（根 `App.tsx` 旧版使用）|
| Three.js | 0.164 | 3D 场景渲染 |
| @react-three/fiber | 8.16 | React Three.js 绑定 |
| @react-three/drei | 9.105 | Three.js 辅助工具 |

### 2.4 状态管理

| 技术 | 版本 | 备注 |
|------|------|------|
| zustand | 5.0 | 已安装但 **未使用**，实际用 React Context |
| React Context | — | `StrategyContext` 管理策略切换 |

### 2.5 其他依赖

| 技术 | 用途 |
|------|------|
| lucide-react | 图标库 |
| @fontsource/orbitron | 赛博朋克展示字体 |
| @fontsource/rajdhani | 辅助正文字体 |
| @google/genai | Gemini AI SDK |
| react-use-measure | 容器尺寸测量 |
| suspend-react | React Suspense 辅助 |

---

## 三、项目架构

### 3.1 目录结构

```
chlor-alkali-smart-eco-system/
├── index.html                  # HTML 入口，引入 Google Fonts (Inter)
├── index.tsx                   # React 入口（ErrorBoundary + BrowserRouter + StrategyProvider）
├── App.tsx                     # ⚠️ 旧版 App（"智慧园区"主题，独立UI，未被新路由使用）
├── constants.ts                # ⚠️ 旧版常量（carbonData / energyData / alerts / SYSTEM_INSTRUCTION）
├── types.ts                    # ⚠️ 旧版类型（ChartDataPoint / AlertItem / SimulationMode）
├── metadata.json               # 项目元数据
├── components/                 # ⚠️ 旧版组件目录（与 src/components 并存）
│   ├── Card.tsx                #   Card + MiniStat（命名导出）
│   ├── Charts.tsx              #   CarbonTrendChart / ProductionBarChart / EnergyPriceChart（Recharts）
│   ├── GeminiAdvisor.tsx       #   AI 助手 UI 组件
│   ├── GlassCard.tsx           #   GlassCard + MetricItem（毛玻璃卡片）
│   ├── ProcessFlowDiagram.tsx  #   工艺流程图（SVG 手绘）
│   └── Scene3D.tsx             #   Three.js 3D 工厂场景
├── services/
│   └── geminiService.ts        # AI API 调用（Gemini → DeepSeek → OpenAI 级联）
├── src/
│   ├── App.tsx                 # ✅ 当前主 App（路由入口）
│   ├── index.css               # 全局样式 + 字体导入 + 扫描线/发光动画
│   ├── api/
│   │   ├── mock.ts             # 数据生成函数（HSE/设备/桑基/产量等）
│   │   ├── mockData.ts         # ⚠️ 旧版策略数据（与 strategyData.ts 结构不同、已废弃）
│   │   └── strategyData.ts     # ✅ 当前使用的策略数据（StrategyMode / STRATEGY_DATA / STRATEGY_CONFIG）
│   ├── context/
│   │   └── StrategyContext.tsx  # 策略上下文（mode / data / config / setMode）
│   ├── layout/
│   │   └── MainLayout.tsx      # 主布局（Header + ScaleContainer + Footer 导航）
│   ├── pages/
│   │   ├── Overview.tsx        # 首页概览（KPI + 雷达 + 能源平衡 + 电流曲线）
│   │   ├── Production.tsx      # 物料与生产（工艺流程 Canvas + Sankey）
│   │   ├── Energy.tsx          # 智慧能源（电力平衡 + 碳趋势 + 占位符）
│   │   ├── HSE.tsx             # 安全环保（气体泄漏 + 污水指标）
│   │   └── Equipment.tsx       # 设备健康（电流曲线 + 设备状态卡 + 储氢液位）
│   ├── components/
│   │   ├── PanelBox.tsx        # 通用面板容器（赛博朋克边框 + 标题栏）
│   │   ├── StatusBadge.tsx     # 状态徽章（success/warning/error）
│   │   ├── StatusTag.tsx       # 状态标签
│   │   ├── StrategySwitcher.tsx# 策略切换器（低碳/综合最优/成本最小）
│   │   ├── DigitalNumber.tsx   # 数字显示组件
│   │   ├── SystemLog.tsx       # 系统日志终端
│   │   ├── charts/             # ECharts 图表组件（10个）
│   │   │   ├── StrategyRadar.tsx    # 策略雷达图
│   │   │   ├── PowerBalance.tsx     # 电力平衡堆叠面积图
│   │   │   ├── CurrentCurve.tsx     # 电解槽电流曲线
│   │   │   ├── CarbonTrend.tsx      # 碳排放趋势
│   │   │   ├── AreaCO2.tsx          # CO2 区域图
│   │   │   ├── BarInventory.tsx     # 库存柱状图
│   │   │   ├── GaugeDual.tsx        # 双仪表盘
│   │   │   ├── Pie3DPower.tsx       # 3D 饼图
│   │   │   ├── SankeyMaterial.tsx    # Sankey 物料流
│   │   │   └── TrendLines.tsx       # 趋势折线图
│   │   └── twin/               # 数字孪生组件
│   │       ├── PlantModel.tsx       # 工厂 3D 模型
│   │       └── ProcessFlowCanvas.tsx# 工艺流程 Canvas
│   └── styles/                 # ⚠️ 空目录
├── tailwind.config.cjs         # Tailwind 主题配置
├── vite.config.ts              # Vite 配置
├── tsconfig.json               # TypeScript 配置
├── postcss.config.cjs          # PostCSS 配置
├── .env.local                  # API 密钥
└── package.json                # 依赖清单
```

### 3.2 路由结构

```
/ (MainLayout wraps all routes)
├── /              → Overview.tsx     (首页概览)
├── /production    → Production.tsx   (物料与生产)
├── /energy        → Energy.tsx       (智慧能源)
├── /hse           → HSE.tsx          (HSE安全环保)
└── /equipment     → Equipment.tsx    (设备健康)
```

### 3.3 数据流

```
┌────────────────────┐
│  StrategyProvider   │   ← 包裹整个应用
│  (React Context)    │
├────────────────────┤
│  mode: StrategyMode │   ← 'lowCost' | 'lowCarbon' | 'optimal'
│  data: STRATEGY_DATA│   ← 来自 strategyData.ts
│  config: STRATEGY_CONFIG │
│  setMode: (m) => {} │
└────────┬───────────┘
         │ useStrategy() hook
         ├──► Overview.tsx   → 获取 data.kpi / data.radar
         ├──► StrategyRadar  → data.radar.economic/environmental/...
         ├──► PowerBalance   → data.powerBalance.grid/pv/turbine/pemfc
         ├──► CurrentCurve   → data.electrolyzerCurrent
         ├──► CarbonTrend    → data.carbonTrend
         └──► Equipment.tsx  → data.hydrogenLevel

独立数据源（不走 Context）：
  mock.ts → getEquipmentData()  → Equipment.tsx (设备健康状态卡)
  mock.ts → getHSEData()        → HSE.tsx (气体泄漏/污水)
  mock.ts → getSankeyData()     → Production.tsx (Sankey 图)
```

### 3.4 分辨率适配策略

当前使用 `ScaleContainer` 组件进行硬编码缩放：

```typescript
// MainLayout.tsx 中的 ScaleContainer
// 设计分辨率: 1920 × 952 (1080 - header 64px - footer 64px)
// 缩放方式: Math.min(viewportWidth/1920, viewportHeight/1080)
// 通过 CSS transform: scale(ratio) 实现
```

---

## 四、设计系统

### 4.1 颜色体系

```
cyber-black:  #050B14 (Deep Void / 主背景)
cyber-blue:   #091833 (Deep Sea / 面板背景)
neon-cyan:    #00F3FF (Primary / 主色调)
neon-pink:    #FF0099 (Secondary / 警告)
neon-yellow:  #F3E600 (Accent / 强调)
matrix-green: #00FF41 (Matrix / 低碳模式)
```

### 4.2 字体

```
display: Orbitron        (标题、数字 — 赛博朋克几何字体)
body:    Rajdhani        (正文、标签)
```

> ⚠️ `index.html` 中还通过 Google CDN 加载了 `Inter` 字体，但实际未使用。

### 4.3 核心 UI 组件

- **PanelBox** — 所有面板的统一容器（赛博朋克切角边框 + 霓虹发光标题栏 + 网格背景）
- **StatusBadge** — 圆形状态指示器（success/warning/error + 呼吸动画）
- **StatusTag** — 文字状态标签
- **DigitalNumber** — 带发光效果的数字显示
- **SystemLog** — 模拟终端日志滚动
- **StrategySwitcher** — 策略模式切换按钮组

### 4.4 视觉效果

```css
/* CRT 扫描线 (body::before) */
background: linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.25) 50%);
animation: scanline-move 10s linear infinite;

/* 赛博朋克切角 (clip-cyber) */
clip-path: polygon(20px 0, 100% 0, 100% calc(100%-20px), calc(100%-20px) 100%, 0 100%, 0 20px);

/* 霓虹发光 */
text-shadow: 0 0 10px currentColor;
box-shadow: 0 0 10px #00F3FF, 0 0 20px #00F3FF;

/* 入场动画 */
animation: fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
```

---

## 五、当前存在的问题与重构建议

### 5.1 🔴 架构问题 — 必须优先解决

#### 问题 1：双版本 App 并存

**现状：** 项目同时包含两个 `App.tsx`：
- **根目录 `App.tsx`**（244 行）— "智慧园区运营服务中心"版本，包含完整的 3D Scene、GIS 地图切换、GeminiAdvisor、GlassCard 面板等。这是项目的最初版本，拥有更丰富的 UI（12 列栅格布局、浮动 HUD、3D 工厂模型、AI 智能调度助手），但**当前未被任何路由引用**。
- **`src/App.tsx`**（24 行）— "氯碱节能减排"版本，包含 5 个页面的路由，是当前实际运行的版本。

**建议：**
- 明确选择一个方向并移除另一个
- 如果保留新版（`src/App.tsx`），将根 `App.tsx` 中的有价值功能（3D 场景、AI 助手、GIS 视图）迁移为可复用模块
- 同时清理根 `components/`、`constants.ts`、`types.ts` 这些旧版文件

#### 问题 2：重复且分裂的组件目录

**现状：**
```
根 components/       → 6 个文件（GlassCard / Charts / Scene3D / ProcessFlowDiagram / GeminiAdvisor / Card）
src/components/      → 6 个文件 + charts/ (10个) + twin/ (2个)
```

两套组件之间存在功能重叠（如 `ProcessFlowDiagram.tsx` 和 `src/components/twin/ProcessFlowCanvas.tsx` 都是流程图）。

**建议：**
- 统一到 `src/components/` 下
- 按功能域分模块：`src/components/ui/`、`src/components/charts/`、`src/components/3d/`、`src/components/ai/`

#### 问题 3：三份 Mock 数据文件，结构互不兼容

**现状：**
| 文件 | 状态 | 访问路径差异 |
|------|------|-------------|
| `src/api/strategyData.ts` | ✅ **当前使用** | `data.powerBalance.grid` / `data.electrolyzerCurrent` |
| `src/api/mockData.ts` | ❌ **已废弃** | `data.charts.gridPower` / `data.charts.electrolyzerCurrent` |
| `src/api/mock.ts` | ⚠️ **部分使用** | 独立函数导出：`getEquipmentData()` / `getHSEData()` 等 |

`StrategySwitcher.tsx` 仍然 import `mockData.ts` 中的 `StrategyType` 类型（虽然实际类型相同）。

**建议：**
- 删除 `mockData.ts`，统一使用 `strategyData.ts` 作为策略数据源
- 将 `mock.ts` 中的独立数据函数（HSE / 设备 / Sankey）也纳入策略数据体系，或者拆分为独立的领域数据模块
- 建立统一的 `types/` 目录管理所有接口类型
- 根目录 `constants.ts` 和 `types.ts` 的内容应迁移到 `src/` 下或删除

#### 问题 4：StrategyContext 向后兼容冗余

**现状：** `StrategyContext` 同时暴露 `mode`/`setMode` 和 `strategy`/`setStrategy`（后者仅为向后兼容的别名）。

**建议：** 重构后统一为单一 API（`mode`/`setMode`），删除冗余别名。

---

### 5.2 🟡 代码质量问题 — 重构时应一并解决

#### 问题 5：ECharts 使用模式不够 React 化

**现状：** 所有 ECharts 图表组件都采用 `useRef` + `useEffect` + 手动 `init/dispose` 模式，存在：
- 大量重复的 resize 监听 / dispose 清理逻辑
- 没有使用 `echarts-for-react` 这类封装库
- 每个组件都是 100+ 行的模板代码

**建议：**
- 创建一个 `useEChart(ref, option, deps)` 自定义 Hook 封装生命周期管理
- 或直接使用 `echarts-for-react` 库
- 将通用的赛博朋克主题（颜色、字体、轴线样式）抽取为 ECharts 全局主题

#### 问题 6：静态写死的 Mock 数据

**现状：** `strategyData.ts` 中所有数据（24 小时趋势、KPI 值）都是硬编码的数字数组，而 `mock.ts` 中虽然有随机生成函数，但自身结构也有问题（每次渲染重新生成随机数据，无持久化）。

**建议：**
- 设计统一的数据工厂模式：`createMockData(strategy, seed?)` 支持可重现的伪随机
- 建立清晰的数据接口类型，用 TypeScript 接口驱动数据生成
- 预留真实 API 接入层（WebSocket / REST），Mock 数据仅作为开发阶段 fallback
- 考虑引入 MSW (Mock Service Worker) 作为 API Mock 方案

#### 问题 7：zustand 已安装但未使用

**现状：** `package.json` 中依赖了 `zustand@5.0.10`，但项目实际使用 React Context 管理状态。

**建议：**
- 如果状态管理需求简单（当前仅策略切换），保持 Context 并移除 zustand 依赖
- 如果未来需扩展（多数据源、缓存、计算值），考虑替换为 zustand 或 jotai

#### 问题 8：ScaleContainer 硬编码分辨率

**现状：** `MainLayout.tsx` 中的 `ScaleContainer` 硬编码了 `1920×952` 作为设计分辨率，通过 CSS `transform: scale()` 实现缩放。这种方式存在：
- 文字在非标准分辨率下可能模糊
- 无法支持移动端适配
- 缩放计算逻辑混乱（同时使用 `sw` 和 `window.innerHeight / baseH`，注释与代码不一致）

**建议：**
- 采用 CSS `vw` / `vh` + `clamp()` 实现更优雅的响应式适配
- 或使用 `autofit.js` 等大屏自适应方案
- 如需固定比例缩放，封装为通用的 `<BigScreenLayout designWidth={1920} designHeight={1080}>` 组件

#### 问题 9：PanelBox 标题样式残留 `uppercase`

**现状：** `PanelBox.tsx` 的标题仍带有 `uppercase` CSS 类（第 23 行），但标题已全部改为中文。`uppercase` 对中文无效但属于不合理的样式残留。

**建议：** 从 PanelBox 中移除 `uppercase` 类，上层组件根据语言环境决定文本变换方式。

---

### 5.3 🟢 优化建议 — 提升项目品质

#### 建议 1：页面完成度不一

**现状：** 5 个页面中，部分页面仍有大量占位符或功能缺失：
- `Energy.tsx` — "蒸汽管网监控" 和 "余热回收效率" 两个面板仅有占位符文本
- `Production.tsx` — 功能较完整（Sankey + ProcessFlowCanvas）
- `HSE.tsx` — 仅展示静态数据列表，无图表可视化
- `Equipment.tsx` — 核心功能可用但设备健康圈形进度条样式待优化

**建议：** 所有页面应达到一致的完成度水平。占位符应替换为实际功能组件。

#### 建议 2：引入 AI 助手到新版本

**现状：** 旧版根 `App.tsx` 中集成了 `GeminiAdvisor` AI 智能调度助手，`services/geminiService.ts` 实现了完整的多 API 级联（Gemini → DeepSeek → OpenAI）。但新版 5 页路由系统中完全未使用这些功能。

**建议：**
- 将 AI 助手迁移到新版本，作为全局悬浮面板或专属页面
- `geminiService.ts` 的级联逻辑可以简化：使用策略模式替代深度嵌套的 try-catch

#### 建议 3：3D 数字孪生集成

**现状：** 根 `components/Scene3D.tsx`（10623 字节）实现了完整的 Three.js 3D 工厂场景（含 GIS/3D 视图切换）。`src/components/twin/PlantModel.tsx` 和 `ProcessFlowCanvas.tsx` 也提供了孪生相关功能，但集成不完整。

**建议：**
- 设计专门的数字孪生页面或集成到 Overview
- 充分利用已有的 Three.js 和 @react-three/fiber 生态
- 数据应与策略切换联动（不同模式下 3D 场景呈现不同运行状态）

#### 建议 4：实时时间和数据刷新

**现状：** Header 中显示的时间是写死的 `2026-10-24 14:30:00`，不会动态更新。Mock 数据也是静态的。

**建议：**
- 时间显示应使用实时时钟
- 图表数据应支持定时刷新（setInterval 或 WebSocket 模拟）
- 添加数据更新动画以增强实时感

#### 建议 5：国际化体系

**现状：** 文本分散在各组件的 JSX 中，混杂中英文。虽然主要 UI 元素已中文化，但一些图表坐标轴标签（如 ECharts 的 AxisName）和系统日志（SystemLog）仍然是英文。

**建议：**
- 引入 `react-i18next` 建立统一的国际化体系
- 或至少创建一个集中的 `locale.ts` 文件管理所有文本常量

#### 建议 6：字体体系优化

**现状：**
- `@fontsource/orbitron` 和 `@fontsource/rajdhani` 通过 npm 包引入
- `index.html` 中通过 Google CDN 还引入了 `Inter` 字体（冗余且未使用）
- Orbitron 不支持中文字符，中文依赖系统 fallback 字体

**建议：**
- 删除 `index.html` 中的 Google Fonts CDN 链接
- 增加中文显示字体的引入（如 `Noto Sans SC` 或 `ZCOOL QingKe HuangYou`，后者更有赛博朋克感）
- 在 Tailwind 中配置完整的中英双语字体栈：`fontFamily: { display: ['Orbitron', 'ZCOOL QingKe HuangYou', 'sans-serif'] }`

---

### 5.4 ⚙️ 工程化改进

#### 改进 1：Tailwind CSS v4 配置

**现状：** 项目安装的是 Tailwind **v4.1.18**，但配置文件 `tailwind.config.cjs` 使用的是 v3 风格的 JS 配置。`src/index.css` 中使用了 v4 的 `@config` 指令桥接。

**建议：**
- 要么降级到 Tailwind v3（更稳定，社区生态更好）
- 要么全面迁移到 v4 的 CSS-first 配置方式（用 `@theme` 替代 JS config）

#### 改进 2：路径别名

**现状：** `tsconfig.json` 和 `vite.config.ts` 配置了 `@/*` 别名指向项目根目录 `./`。但代码中几乎全部使用相对路径 `../../../`。

**建议：** 统一使用 `@/src/components/...` 格式的绝对路径导入。如果将所有代码统一到 `src/` 下，别名应改为 `@` → `./src`。

#### 改进 3：环境变量

**现状：** `vite.config.ts` 中通过 `define` 注入 `process.env.API_KEY` / `process.env.GEMINI_API_KEY` 等。Vite 原生推荐使用 `import.meta.env.VITE_*` 方式。

**建议：** 迁移为 Vite 原生环境变量方案，使用 `VITE_GEMINI_API_KEY` 前缀。

#### 改进 4：缺少代码质量工具

**现状：** 项目没有：
- ESLint 配置
- Prettier 配置
- 单元测试
- 任何 CI/CD 配置

**建议：**
- 添加 `eslint` + `@typescript-eslint` + `eslint-plugin-react-hooks`
- 添加 `prettier` + `.prettierrc`
- 考虑 `vitest` 做基本的组件测试
- 添加 `husky` + `lint-staged` 做 Git 提交检查

---

## 六、重构路线图建议

下面是建议的重构执行顺序，按优先级排列：

### Phase 1：清理与统一（基础性工作）

1. **删除废弃文件**
   - 删除根 `App.tsx`（保存其中有价值的功能代码供迁移参考）
   - 删除根 `components/` 目录（可回收的组件先迁移到 `src/components/`）
   - 删除根 `constants.ts`、`types.ts`
   - 删除 `src/api/mockData.ts`
   - 删除 `src/styles/` 空目录

2. **统一入口和别名**
   - 将 `index.tsx` 移入 `src/main.tsx`（Vite 标准）
   - 更新 `vite.config.ts` 别名为 `@` → `./src`
   - 更新 `index.html` 的 script 引用

3. **整理组件目录**
   ```
   src/components/
   ├── ui/          # PanelBox, StatusBadge, StatusTag, DigitalNumber, SystemLog
   ├── charts/      # 所有 ECharts 图表组件
   ├── 3d/          # Scene3D, PlantModel, ProcessFlowCanvas
   ├── ai/          # GeminiAdvisor
   └── layout/      # StrategySwitcher (或保留在 layout/ 下)
   ```

4. **统一导出方式**
   - 单组件文件：`export default`
   - 多组件文件：具名导出
   - 每个子目录添加 `index.ts` barrel 文件

### Phase 2：数据层重构

5. **统一数据类型**
   ```
   src/types/
   ├── strategy.ts    # StrategyMode, StrategyKPI, RadarData 等
   ├── equipment.ts   # EquipmentHealth, HSEData 等
   ├── production.ts  # SankeyData, ProductionRate 等
   └── index.ts       # 统一导出
   ```

6. **统一数据源**
   ```
   src/data/
   ├── strategyData.ts     # 策略相关数据
   ├── equipmentData.ts    # 设备相关数据
   ├── productionData.ts   # 生产相关数据
   ├── hseData.ts          # HSE 相关数据
   └── index.ts
   ```

7. **重构 StrategyContext**
   - 删除向后兼容的 `strategy`/`setStrategy` 别名
   - 考虑将设备/HSE 数据也纳入 Context 或创建独立 Context

### Phase 3：UI 与体验优化

8. **抽取 ECharts 通用 Hook**
   ```typescript
   // useEChart.ts
   function useEChart(options: EChartsOption, deps: any[]) {
     // 封装 init, setOption, resize, dispose
   }
   ```

9. **ECharts 全局主题**
   ```typescript
   // echarts-theme-cyber.ts
   echarts.registerTheme('cyber', {
     backgroundColor: 'transparent',
     textStyle: { color: '#00F3FF', fontFamily: 'Rajdhani' },
     // ...
   });
   ```

10. **完善页面内容**
    - Energy：实现蒸汽管网可视化和余热回收图表
    - HSE：增加 ECharts 可视化（趋势图、报警热力图）
    - Equipment：优化圆形进度条样式

11. **集成 AI 助手**
    - 将 GeminiAdvisor 迁移到新版中
    - 简化 `geminiService.ts` 的级联逻辑

12. **大屏适配优化**
    - 替换 ScaleContainer 为更健壮的方案
    - 实现实时时钟

### Phase 4：工程化完善

13. **代码质量工具**
    - 配置 ESLint + Prettier
    - 添加 Vitest 基础测试

14. **字体与样式**
    - 清理冗余的 Google Fonts CDN
    - 引入中文赛博朋克字体
    - 解决 Tailwind v4 配置问题

15. **性能优化**
    - React.lazy 路由级懒加载
    - ECharts 按需引入（减小打包体积）
    - Three.js 按需加载

---

## 七、关键文件速查表

下面列出每个文件的变更优先级以便重构时快速定位：

| 文件 | 状态 | 重构动作 |
|------|------|---------|
| `/App.tsx` | ❌ 废弃 | 提取有价值代码后**删除** |
| `/constants.ts` | ❌ 废弃 | 迁移 `SYSTEM_INSTRUCTION` 后**删除** |
| `/types.ts` | ❌ 废弃 | 合并到 `src/types/` 后**删除** |
| `/components/*` | ⚠️ 半废弃 | 有价值的迁移到 `src/components/`，其余**删除** |
| `/services/geminiService.ts` | ⚠️ 有价值 | 迁移到 `src/services/` 并简化 |
| `/index.tsx` | ⚠️ 需重构 | 移至 `src/main.tsx`，删除内联 ErrorBoundary |
| `/index.html` | ⚠️ 需清理 | 删除 Google Fonts CDN 引用 |
| `src/api/mockData.ts` | ❌ 废弃 | **删除** |
| `src/api/mock.ts` | ⚠️ 需重构 | 拆分为领域数据模块 |
| `src/api/strategyData.ts` | ✅ 使用中 | 重构为 `src/data/strategyData.ts` |
| `src/context/StrategyContext.tsx` | ✅ 使用中 | 删除向后兼容 API |
| `src/layout/MainLayout.tsx` | ✅ 使用中 | 优化 ScaleContainer + 实时时钟 |
| `src/components/PanelBox.tsx` | ✅ 使用中 | 移除 `uppercase` 类 |
| `src/components/charts/*.tsx` | ✅ 使用中 | 抽取 useEChart Hook |
| `src/pages/*.tsx` | ✅ 使用中 | 补全占位符、增强功能 |
| `tailwind.config.cjs` | ⚠️ 需决策 | 决定 v3 降级 or v4 全面迁移 |

---

## 八、启动项目

```bash
# 安装依赖
npm install

# 启动开发服务器（默认端口 3005）
npm run dev

# 构建生产包
npm run build

# 预览生产包
npm run preview
```

**API 密钥配置**（可选，用于 AI 助手功能）：
```bash
# 在项目根目录创建 .env.local
GEMINI_API_KEY=your_key     # 推荐
DEEPSEEK_API_KEY=your_key   # 备选
OPENAI_API_KEY=your_key     # 备选
```

---

> **最后提示：** 本项目的核心价值在于大屏 UI 设计和策略切换联动机制。重构的重点应放在代码结构整理和功能完善上，尽量保留和增强现有的视觉效果。
