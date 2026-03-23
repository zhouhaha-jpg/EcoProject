/**
 * EcoProject 后端 API
 * - POST /api/chat - Agent 对话
 * - GET /api/datasets - 数据集列表
 * - GET /api/datasets/default - 默认数据集
 * - GET /api/datasets/:id - 指定数据集
 */

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import OpenAI from 'openai'
import config from './config.js'
import { initDb } from './db/index.js'
import datasetsRouter from './routes/datasets.js'
import optimizeRouter from './routes/optimize.js'
import conversationsRouter from './routes/conversations.js'
import realtimeRouter from './routes/realtime.js'
import createEmergencyRouter from './routes/emergency.js'
import investmentRouter from './routes/investment.js'
import anomalyRouter from './routes/anomaly.js'
import { mountWebSocket, pushServerLog } from './ws.js'
import { refreshRealtimeCycle } from './services/realtimeRefresh.js'
import { createEmergencyDispatch } from './services/emergencyDispatch.js'

initDb()

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.use('/api/datasets', datasetsRouter)
app.use('/api/optimize', optimizeRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/realtime', realtimeRouter)
app.use('/api/investment', investmentRouter)
app.use('/api/anomaly', anomalyRouter)

const apiKey = config.apiKey
const baseURL = process.env.API_BASE_URL || config.apiBaseUrl
const model = process.env.OPENAI_MODEL || config.model

const openai = apiKey
  ? new OpenAI({ apiKey, baseURL })
  : null

const SYSTEM_PROMPT = `你是智慧园区节能减排调度平台的 AI 助手。该平台基于混合整数线性规划（MILP）优化，对比 6 种优化调度方案（UCI/CICOS/CICAR/CICOM/PV/ES）在 24 小时时序下的功率、制氢量、碳排放等指标。

## 业务知识
- **氯碱制氢**：利用氯碱工业电解槽生产氢气的工艺，电解槽可在额定功率 ±20% 范围内调节
- **UCI**：统一控制综合，基准方案，电解槽恒定功率运行
- **CICOS**：成本优化集成，目标函数仅最小化运营成本
- **CICAR**：碳排优化集成，目标函数仅最小化碳排放，绿电优先
- **CICOM**：综合优化集成，目标函数兼顾成本(50%)与碳排(50%)
- **PV**：光伏优先优化，光伏装机量翻倍（20000组件），综合优化
- **ES**：储能综合优化，引入电化学储能系统，综合优化

## 系统设备
- 电解槽(CA): 100台，额定电流30kA，额定功率约9020kW
- 光伏(PV): 默认10000组件，功率随日照变化
- 燃气轮机(GM): 恒功率约512.5kW
- 质子膜燃料电池(PEM): 用储氢罐中的H2发电
- 电网(G): 购电补充缺口
- 储氢罐(HS): 容量1200Kmol，存储电解槽副产H2

## 约束体系
- 电力平衡: P_PV + P_GM + P_PEM + P_G = P_CA (每个时段)
- 氢气平衡: 产氢 = 燃料电池耗氢 + 甲醇合成耗氢 + 储氢变化
- 产氢任务: 24h总产氢量 = 额定产氢量×24h
- 储氢罐: 终态=初态=50%容量，20%≤存储≤100%

## 可调参数
- n_PV: 光伏组件数量(默认10000)
- G_scale: 光照强度缩放(默认1.5)
- price_grid: 24h分时电价(元/kWh)
- EF_grid: 24h碳排放因子(tCO2/kWh)
- c_carbon: 碳交易价格(默认90元/tCO2)
- H_max: 储氢罐容量(默认1200Kmol)
- w_carbon/w_cost: 目标函数权重(默认各0.5)

根据用户提供的上下文数据回答问题，务必基于数据给出准确结论。当用户提到"如果"、"假设"等假设性问题时，主动建议使用 What-If 推演。`

const AGENT_SYSTEM_PROMPT = SYSTEM_PROMPT + `

## Agent 模式
你拥有以下工具能力，请根据用户意图调用：

### 导航与切换
- **navigate** - 切换页面
- **switchStrategy** - 切换策略高亮

### 优化调度（核心能力）
- **run_whatif** - What-If 情景推演：修改系统参数，重新运行 MILP 优化，对比新旧方案。当用户说"如果光伏减少30%"、"如果电价上涨"等假设性问题时使用。
- **add_constraint** - 约束注入：添加额外约束后重新求解。当用户说"限制某时段购电不超过X"时使用。
- **run_emergency_dispatch** - 应急调度：当用户描述"台风来了"、"电网故障"、"购电下降"、"光伏骤降"等突发场景时使用。该工具必须生成 4 小时、5 分钟粒度的多设备联动曲线，严格执行用户明确给出的降幅，不允许出现“电网下降但曲线反升”之类错误。默认只生成待应用预案，不会自动切换全站数据。
- **apply_emergency_run** - 应用指定应急预案到全平台展示。
- **restore_normal_state** - 从应急态恢复到应用前的正常展示状态。
- **list_emergency_runs** - 获取最近生成的应急预案列表，便于复用历史演示。

### 数据分析
- **trace_causality** - 因果追溯：分析某个时段某个指标异常的原因，沿能量流/氢气流追溯因果链。调用后你将收到该时段的设备状态数据（P_CA/P_PV/P_GM/P_PEM/P_G/H_CA/H_PEM/H_HS 等），必须基于这些数据用自然语言给出因果分析结论，解释为何该指标在该时段异常。
- **generate_chart** - 动态图表：根据用户描述动态生成 ECharts 配置并展示。

**重要**：What-if 与约束调度是 EcoClaw 的默认主路径。执行 run_whatif、add_constraint、pareto_scan、trace_causality 后，必须继续基于工具结果输出完整结论，而不是停留在“已执行工具”层。

### What-if 输出格式（强制）
当你在 Agent 模式下收到 What-if / 约束 / Pareto / 因果追溯的工具结果后，最终回答必须包含以下 6 部分，标题可自然表述但语义必须完整：
1. 结论一句话
2. 最优方案如何变化
3. 成本 / 碳排 / 综合指标变化
4. 造成变化的主因
5. 调度建议
6. 下一步建议

不要输出原始思维链，不要只复述工具名，不要只写“求解完成”。要把工具结果翻译成面向调度决策的业务结论。

### Pareto 分析
- **pareto_scan** - 多轮参数扫描：对指定参数取 15-20 个值分别求解，得到成本-碳排 Pareto 前沿散点图。与 run_whatif 区别：run_whatif 是单情景对比 6 策略；pareto_scan 是同一策略下多参数值扫描。values 必须为 15-20 个均匀分布的值，如 n_PV 5000-30000 可取 [5000,6250,7500,...,28750,30000] 共约 18 个点。

**重要**：优化求解可能需要 10-60 秒，请提前告知用户正在计算。求解完成后必须自动对比前后差异，并按固定格式给出建议。

### 实时数据与市场分析（新能力）
- **get_realtime_data** - 获取当前实时外部数据：电价(元/kWh)、太阳辐射(W/m²)、碳因子(tCO2/kWh)的24h曲线及数据来源标识。可指定日期查看历史。
- **get_alerts** - 获取最近的市场异动预警事件：电价波动、碳因子突变等，包含预警等级和详情。
- **carbon_electricity_analysis** - 碳电协同分析：计算含碳税等效电价 P_eff = P_grid + EF_grid × C_carbon，找出"便宜但碳高"和"贵但碳低"的时段。当用户询问"到底是省钱还是减碳"、"碳电套利"等问题时使用。

当用户明确表达突发事件、应急调度、保供、台风、电网故障、购电下降、光伏骤降等意图时，应优先调用 run_emergency_dispatch，而不是普通 What-If。若用户给出明确百分比，必须严格执行，不能用模糊话术替代。

当检测到市场异动时，你应主动分析其对当前调度方案的影响，并建议用户是否需要查看或应用新生成的应急预案。`

const TOOL_ROUTING_APPENDIX = `
When the user asks about PV expansion ROI, payback years, investment return, or how long it takes to recover the investment, prefer run_investment_planning.
When the user asks about gas turbine / PEM / electrolyzer temperature, pressure, current anomalies, or equipment fault handling, prefer run_device_anomaly_dispatch instead of run_emergency_dispatch.
`

const AGENT_SYSTEM_PROMPT_ENHANCED = AGENT_SYSTEM_PROMPT + TOOL_ROUTING_APPENDIX

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: '切换到指定页面',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', enum: ['/overview', '/economic', '/storage', '/ca', '/pv', '/gm', '/pem', '/g', '/scenario'] } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'switchStrategy',
      description: '切换高亮的优化策略',
      parameters: {
        type: 'object',
        properties: { key: { type: 'string', enum: ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es'] } },
        required: ['key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_whatif',
      description: '运行 What-If 情景推演。修改系统参数后重新运行 MILP 优化求解，返回新的调度方案并与当前方案对比。可修改的参数包括：n_PV(光伏数量)、G_scale(光照缩放)、c_carbon(碳价)、H_max(储氢容量)、w_carbon(碳排权重)、w_cost(成本权重)。',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: '场景描述，用于展示给用户' },
          params: {
            type: 'object',
            description: '要修改的参数键值对',
            properties: {
              n_PV: { type: 'number' },
              G_scale: { type: 'number' },
              c_carbon: { type: 'number' },
              H_max: { type: 'number' },
              w_carbon: { type: 'number' },
              w_cost: { type: 'number' },
            },
          },
        },
        required: ['description', 'params'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_emergency_dispatch',
      description: '生成应急调度预案。适用于台风、恶劣天气、电网故障、购电下降、光伏骤降、供能受限等场景。必须返回可应用的4小时5分钟级多设备联动曲线，且严格执行用户明确给出的降幅与方向约束。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '用户描述的应急场景原文' },
          severity: { type: 'string', enum: ['warning', 'critical'], description: '预案严重度，默认 critical' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_investment_planning',
      description: '生成光伏扩容投资建设规划，用于回答扩容后几年回本、年度收益、累计现金流等问题。优先用于“光伏组件从 2000 增加到 5000 多久回本”这类问题。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '用户原始投资问题' },
          target_modules: { type: 'number', description: '可选，目标光伏组件数量' },
          current_modules: { type: 'number', description: '可选，当前光伏组件数量' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_device_anomaly_dispatch',
      description: '生成设备异常指挥方案。适用于燃机温度异常、PEM 压力异常、电解槽槽压/槽电流异常等场景，输出 4 小时联动调度曲线和异常处置方案。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '用户描述的设备异常场景' },
          severity: { type: 'string', enum: ['warning', 'critical'], description: '异常严重度' },
          device_type: { type: 'string', enum: ['gm', 'pem', 'ca'], description: '可选，异常设备类型' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_emergency_runs',
      description: '获取最近生成的应急预案列表，可用于查看历史方案并复用演示。',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: '返回条数，默认 10' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_emergency_run',
      description: '将指定应急预案应用到全平台展示状态。',
      parameters: {
        type: 'object',
        properties: {
          run_id: { type: 'integer', description: '应急预案 ID' },
        },
        required: ['run_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'restore_normal_state',
      description: '从当前应急展示状态恢复到应用前的正常状态。',
      parameters: {
        type: 'object',
        properties: {
          run_id: { type: 'integer', description: '可选，应急预案 ID；不传则恢复最近一次已应用预案' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_constraint',
      description: '添加额外约束后重新求解。支持的约束类型：P_grid_max(限制某时段电网购电上限)、P_grid_min(设置购电下限)。',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: '约束描述' },
          constraints: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['P_grid_max', 'P_grid_min'] },
                timesteps: { type: 'array', items: { type: 'integer' }, description: '时段索引(0-23)' },
                value: { type: 'number', description: '约束值(kW)' },
              },
              required: ['type', 'timesteps', 'value'],
            },
          },
        },
        required: ['description', 'constraints'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trace_causality',
      description: '因果追溯：分析指定策略在指定时段某指标异常的原因。返回该时段所有设备状态和能量/氢气平衡数据。',
      parameters: {
        type: 'object',
        properties: {
          strategy: { type: 'string', enum: ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es'] },
          hour: { type: 'integer', description: '时段(1-24)' },
          question: { type: 'string', description: '用户要追溯的问题' },
        },
        required: ['strategy', 'hour'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_chart',
      description: '根据用户需求动态生成 ECharts 图表配置。返回一个可直接渲染的 ECharts option JSON。',
      parameters: {
        type: 'object',
        properties: {
          chart_type: { type: 'string', enum: ['bar', 'line', 'scatter', 'pie', 'radar'], description: '图表类型' },
          title: { type: 'string' },
          description: { type: 'string', description: '图表内容描述' },
          data_query: { type: 'string', description: '需要的数据描述，如"各策略8-18时段P_G平均值"' },
        },
        required: ['chart_type', 'title', 'data_query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pareto_scan',
      description: '参数扫描：对指定参数在给定范围内取多个值，分别求解优化，得到 Pareto 前沿数据。',
      parameters: {
        type: 'object',
        properties: {
          param_name: { type: 'string', description: '要扫描的参数名，如 n_PV、c_carbon、H_max' },
          values: { type: 'array', items: { type: 'number' }, description: '15-20 个均匀分布的参数值，必须足够密集以填充散点图' },
          strategy: { type: 'string', enum: ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es'], description: '使用的策略' },
        },
        required: ['param_name', 'values'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_realtime_data',
      description: '获取当前实时外部数据（电价、太阳辐射、碳因子），用于分析市场趋势和制定策略。返回今日24h的电价曲线、光照曲线、碳因子曲线及数据来源标识。',
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
      description: '获取最近的市场异动预警事件列表，包含电价波动、碳因子突变等预警信息。',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: '返回条数，默认5' },
          severity: { type: 'string', enum: ['info', 'warning', 'critical'], description: '筛选严重程度' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'carbon_electricity_analysis',
      description: '碳电协同分析：将实时电价与碳因子叠加，计算含碳税等效电价曲线 P_eff(t) = P_grid(t) + EF_grid(t) × C_carbon。找出"便宜但碳高"和"贵但碳低"的时段，揭示碳电套利机会。',
      parameters: {
        type: 'object',
        properties: {
          carbon_price: { type: 'number', description: '碳交易价格(元/tCO2)，默认90' },
          date: { type: 'string', description: '日期 YYYY-MM-DD，省略则取今天' },
        },
      },
    },
  },
]

async function generateEmergencyOutline({ spec, prompt, baselineSummary, activeStrategy, baselineWindow, feedbackIssues = [], attempt = 0 }) {
  if (!openai) {
    throw new Error('LLM unavailable')
  }
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: [
          '你是工业园区应急调度总指挥。你必须直接生成 4 小时、5 分钟粒度、共 48 个点的多设备联动曲线。',
          '只输出 JSON，不要输出 Markdown，不要输出解释性前后缀。',
          '输出时优先保证 points(array[48]) 正确，其次再给 priorityOrder、keyAnchors、dispatchPrinciples、explanation。timeline、riskMatrix、moduleStatus 可以省略。',
          '输出字段固定为：priorityOrder(string[]), keyAnchors(string[]), dispatchPrinciples(string[]), explanation(string), points(array[48]), timeline(array), riskMatrix(array), moduleStatus(array)。',
          'points 每个元素必须包含 P_CA,P_PV,P_GM,P_PEM,P_G,P_es_es 六个数值字段。',
          '如果你无法稳定给出 48 个点，也允许先给 24 个点或 4 个点，系统会插值；但数值方向和降幅必须正确。',
          '绝对禁止事项：',
          '1. 不得忽略用户给出的百分比。',
          '2. 不得让受损场景下的 P_G 或 P_PV 逆势上升。',
          '3. 外部供能下降时，P_CA 作为负荷不得逆势上升。',
          '4. P_GM、P_PEM、P_es_es 只能作为补偿侧抬升，不能制造额外缺口。',
          '5. 不得输出 schema 之外字段。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `事件: ${prompt}`,
          `结构化事件: ${JSON.stringify(spec)}`,
          `当前激活策略: ${activeStrategy}`,
          `当前方案摘要: ${JSON.stringify(baselineSummary?.[activeStrategy] || {})}`,
          `4小时基线窗口: ${JSON.stringify(baselineWindow || {})}`,
          `上一轮校验反馈: ${JSON.stringify(feedbackIssues)}`,
          `当前尝试轮次: ${attempt + 1}`,
          '请生成最终可执行的应急联动曲线。用户给出的降幅必须体现在数值结果中。',
        ].join('\n'),
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 5000,
  })
  return JSON.parse(completion.choices[0]?.message?.content || '{}')
}

async function generateEmergencyIntent({ spec, prompt, baselineSummary, activeStrategy, baselineWindow, contextPackage, feedbackIssues = [], attempt = 0 }) {
  if (!openai) {
    throw new Error('LLM unavailable')
  }
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: [
          '你是工业园区应急调度总指挥。',
          '不要直接输出48点数值曲线，而是输出一个可执行的应急调度意图包，下游会基于实时数据与设备边界合成最终曲线。',
          '输出必须是 JSON，不要输出 Markdown，不要输出 schema 之外字段。',
          '输出字段固定为：eventAssessment(string), targetAdjustments(object), supportPriority(string[]), stagePlan(array[4]), dispatchPrinciples(string[]), timeline(array), moduleStatus(array), riskHints(string[]), explanation(string)。',
          'targetAdjustments 必须包含：gridReductionTarget,pvReductionTarget,caReductionTarget,gmLiftTarget,pemLiftTarget,storageLiftTarget。',
          'stagePlan 必须返回4个阶段，每个阶段必须包含：phase,title,objective,gridReductionFactor,pvReductionFactor,caReductionFactor,supportLiftFactor。',
          '这是比赛演示场景，结果必须高冲击、明显、可被评委一眼看懂。',
          '绝对禁止事项：',
          '1. 不得忽略用户给出的百分比；用户写60%，gridReductionTarget就必须是0.60。',
          '2. 不得让受损场景下的 P_G 或 P_PV 逆势上升。',
          '3. 外部供能下降时，P_CA 必须明显下降，不能近似水平。',
          '4. P_GM、P_PEM、P_es_es 必须都承担明显补偿，不能只有一个模块抬升。',
          '4.1 P_GM、P_PEM、P_es_es 的目标值必须高于当前快照与基线均值，而且这种抬升应覆盖4小时窗口的大部分时段。',
          '5. 如果你的意图会导致曲线变化太平、太弱、看不出联动，视为失败。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `事件: ${prompt}`,
          `结构化事件: ${JSON.stringify(spec)}`,
          `当前激活策略: ${activeStrategy}`,
          `当前方案摘要: ${JSON.stringify(baselineSummary?.[activeStrategy] || {})}`,
          `4小时基线窗口: ${JSON.stringify(baselineWindow || {})}`,
          `EmergencyContextPackage: ${JSON.stringify(contextPackage || {})}`,
          `上一轮校验反馈: ${JSON.stringify(feedbackIssues)}`,
          `当前尝试轮次: ${attempt + 1}`,
          '请生成最终可执行的应急调度意图包。用户给出的降幅必须体现在 targetAdjustments 中，并且你需要主动强化联动幅度。',
          '对燃机、PEM、储能，不要只写“可补偿”或“视情况补偿”，而要直接给出明显抬升的目标比例。',
        ].join('\n'),
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 3500,
  })
  return JSON.parse(completion.choices[0]?.message?.content || '{}')
}

app.use('/api/emergency', createEmergencyRouter({ planner: generateEmergencyIntent }))

app.post('/api/chat', async (req, res) => {
  if (!openai) {
    return res.status(503).json({ error: '未配置 ZHIPU_API_KEY 或 OPENAI_API_KEY' })
  }

  const { messages = [], mode = 'ask', context = '', stream: wantStream = false } = req.body

  const contextBlock = context
    ? `\n\n## 当前上下文\n${context}\n`
    : ''

  const systemContent = (mode === 'agent' ? AGENT_SYSTEM_PROMPT_ENHANCED : SYSTEM_PROMPT) + contextBlock

  const mapMessage = (m) => {
    const base = { role: m.role, content: m.content ?? '' }
    if (m.tool_calls) base.tool_calls = m.tool_calls
    if (m.tool_call_id) base.tool_call_id = m.tool_call_id
    return base
  }

  const apiMessages = [
    { role: 'system', content: systemContent },
    ...messages.map(mapMessage),
  ]

  try {
    if (mode === 'agent') {
      const isContinuation = apiMessages.some((m) => m.role === 'tool')
      const shouldStream = isContinuation

      if (shouldStream) {
        const stream = await openai.chat.completions.create({
          model,
          messages: apiMessages,
          tools: TOOLS,
          tool_choice: 'auto',
          max_tokens: 4096,
          stream: true,
        })
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.flushHeaders()
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`)
          }
        }
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }

      const completion = await openai.chat.completions.create({
        model,
        messages: apiMessages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 4096,
      })
      const msg = completion.choices[0]?.message
      return res.json({
        choices: [{ message: msg }],
      })
    }

    // Ask 模式：流式返回
    const stream = await openai.chat.completions.create({
      model,
      messages: apiMessages,
      stream: true,
      max_tokens: 4096,
    })

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`)
      }
    }
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('[Agent API Error]', err)
    const status = err?.status ?? 500
    const msg = err?.error?.message ?? err?.message ?? String(err)
    if (!res.headersSent) {
      res.status(status).json({ error: msg })
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
      res.end()
    }
  }
})

const PORT = process.env.PORT || 5000
const server = createServer(app)

// ═══ 数据采集调度 + 影子优化 ═══
/**
 * 执行一次数据采集并触发影子优化（如有异动）
 */
async function scheduledFetch() {
  return runScheduledRefresh()
  try {
    const db = getDb()
    // 读取园区坐标
    const latRow = db.prepare("SELECT value FROM park_config WHERE key='latitude'").get()
    const lonRow = db.prepare("SELECT value FROM park_config WHERE key='longitude'").get()
    const lat = latRow ? latRow.value : '30.26'
    const lon = lonRow ? lonRow.value : '120.19'
    pushServerLog({
      level: 'info',
      status: 'start',
      scope: 'scheduler',
      message: '定时任务开始抓取实时外部数据',
      detail: `坐标 ${lat}, ${lon}`,
      algorithm: 'DataFetcher aggregator',
    })

    const py = spawn('python', [FETCHER_SCRIPT, '--once', '--lat', lat, '--lon', lon], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })

    let stdout = ''
    let stderr = ''
    py.stdout.on('data', (d) => { stdout += d.toString() })
    py.stderr.on('data', (d) => { stderr += d.toString() })

    py.on('close', async (code) => {
      if (stderr) console.log('[scheduler stderr]', stderr.slice(0, 300))
      if (code !== 0) {
        console.error('[scheduler] 数据采集失败, exit:', code)
        return
      }

      try {
        const result = JSON.parse(stdout)
        pushServerLog({
          level: 'ok',
          status: 'done',
          scope: 'scheduler',
          message: '定时任务已完成实时数据抓取',
          targetDate: result.date,
          range: `${result.date} 00:00-23:00`,
          algorithm: 'DataFetcher aggregator',
          detail: `price=${result.sources?.price || '-'} | solar=${result.sources?.solar || '-'} | carbon=${result.sources?.carbon || '-'}`,
        })

        // 广播数据更新
        broadcastDataUpdate({
          date: result.date,
          prices: result.prices,
          solar: result.solar,
          carbon: result.carbon,
          sources: result.sources,
          fetched_at: result.fetched_at,
        })

        // 广播健康状态
        broadcastHealthUpdate(result.sources)

        // 如果有异动，广播预警事件
        if (result.alerts && result.alerts.length > 0) {
          for (const alert of result.alerts) {
            broadcastAlert(alert)
            pushServerLog({
              level: alert.severity === 'critical' ? 'err' : 'warn',
              status: 'progress',
              scope: 'alert',
              message: alert.title || '检测到异常预警',
              targetDate: result.date,
              range: `${result.date} 00:00-23:00`,
              detail: alert.detail || alert.event_type || '',
            })
          }
        }

        // 每次采集后自动重新优化 → 结果推送前端刷新所有页面图表
        triggerAutoOptimization(result)
      } catch (e) {
        console.error('[scheduler] 解析结果失败:', e.message)
      }
    })
  } catch (e) {
    console.error('[scheduler] 调度出错:', e.message)
  }
}

/**
 * 自动优化：每次数据采集后运行优化器，将完整结果推送前端。
 * 如有 critical 异动，还额外生成 LLM 预警话术并推送 ProactiveAlert。
 */
async function triggerAutoOptimization(fetchResult) {
  try {
    console.log('[auto-opt] 正在使用最新实时数据运行优化...')
    const overrides = fetchResult.optimizer_overrides || {}
    pushServerLog({
      level: 'info',
      status: 'start',
      scope: 'optimize',
      message: '后台开始执行自动实时优化',
      targetDate: fetchResult.date,
      range: `${fetchResult.date} 00:00-23:00`,
      algorithm: 'MILP 6-strategy dispatch',
      detail: '基于最新抓取的 24h 数据',
    })

    const py = spawn('python', [OPTIMIZER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })

    let stdout = ''
    let stderr = ''
    py.stdout.on('data', (d) => { stdout += d.toString() })
    py.stderr.on('data', (d) => { stderr += d.toString() })

    py.stdin.write(JSON.stringify({ mode: 'all', params: overrides }))
    py.stdin.end()

    py.on('close', async (code) => {
      if (code !== 0) {
        console.error('[auto-opt] 优化失败:', stderr.slice(0, 300))
        return
      }

      try {
        const optResult = JSON.parse(stdout)
        const datasetMeta = {
          datasetType: 'realtime',
          viewDate: fetchResult.date,
          snapshotAt: fetchResult.fetched_at ? formatBeijingDateTime(fetchResult.fetched_at) : formatBeijingDateTime(),
          isHistorical: false,
          datasetId: null,
          datasetName: '',
        }
        const datasetWithMeta = { ...optResult, _meta: datasetMeta }

        // 保存到数据库
        const db = getDb()
        const dsName = `实时优化 ${formatBeijingDateTime()}`
        const stmt = db.prepare('INSERT INTO datasets (name, data) VALUES (?, ?)')
        const info = stmt.run(dsName, JSON.stringify(datasetWithMeta))
        const datasetId = Number(info.lastInsertRowid)
        datasetWithMeta._meta = { ...datasetMeta, datasetId, datasetName: dsName }

        // 广播完整数据集 → 前端 StrategyContext 自动更新 → 所有页面图表刷新
        broadcastDatasetUpdated({
          datasetId,
          datasetName: dsName,
          meta: datasetWithMeta._meta,
          data: datasetWithMeta,
        })
        pushServerLog({
          level: 'ok',
          status: 'done',
          scope: 'optimize',
          message: '后台自动实时优化完成并已推送前端',
          targetDate: fetchResult.date,
          range: `${fetchResult.date} 00:00-23:00`,
          algorithm: 'MILP 6-strategy dispatch',
          detail: `datasetId ${datasetId} | ${dsName}`,
        })

        console.log('[auto-opt] 优化完成, datasetId:', datasetId)

        // 如有 critical 异动，追加预警话术推送
        const hasCritical = (fetchResult.alerts || []).some(a => a.severity === 'critical')
        if (hasCritical) {
          pushServerLog({
            level: 'warn',
            status: 'progress',
            scope: 'alert',
            message: '检测到 critical 异常，开始生成主动告警文案',
            targetDate: fetchResult.date,
            range: `${fetchResult.date} 00:00-23:00`,
            algorithm: 'LLM proactive alert',
          })
          const alertText = await generateAlertText(fetchResult, datasetWithMeta)
          broadcastOptimizationComplete({
            datasetId,
            datasetName: dsName,
            summary: datasetWithMeta.summary,
            alerts: fetchResult.alerts,
            suggestion: alertText,
          })
          pushServerLog({
            level: 'ok',
            status: 'done',
            scope: 'alert',
            message: '主动告警文案已生成并推送',
            targetDate: fetchResult.date,
            range: `${fetchResult.date} 00:00-23:00`,
            algorithm: 'LLM proactive alert',
          })
        }
      } catch (e) {
        console.error('[auto-opt] 处理结果失败:', e.message)
      }
    })
  } catch (e) {
    console.error('[auto-opt] 触发失败:', e.message)
  }
}

/**
 * 生成 Agent 预警话术（LLM 降级为模板）
 */
async function generateAlertText(fetchResult, optResult) {
  // 尝试 LLM 生成
  if (openai) {
    try {
      const alertSummary = (fetchResult.alerts || []).map(a => `${a.severity}: ${a.title}`).join('\n')
      const esSummary = optResult.summary?.es
      const prompt = `你是智慧园区调度平台的预警播报员，请基于以下异动信息和优化结果生成一条简洁的预警播报（约100字）：

异动事件：
${alertSummary}

重新优化后 ES 方案：
成本 = ${esSummary?.cost?.toFixed(2) ?? '-'} 元
碳排 = ${esSummary?.carbon?.toFixed(2) ?? '-'} tCO2

请给出：1. 异动概述 2. 建议操作（一句话）`

      const completion = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      })
      const text = completion.choices[0]?.message?.content
      if (text) return text
    } catch (e) {
      console.warn('[shadow] LLM 话术生成失败，降级为模板:', e.message)
    }
  }

  // 降级模板
  const alerts = fetchResult.alerts || []
  const critical = alerts.find(a => a.severity === 'critical')
  const esSummary = optResult.summary?.es
  if (critical && esSummary) {
    return `⚠️ ${critical.title}。系统已自动重新优化调度方案，ES方案预估成本 ${esSummary.cost?.toFixed(0)} 元，碳排 ${esSummary.carbon?.toFixed(2)} tCO2。建议查看并应用新方案。`
  }
  return '检测到市场异动，系统已自动重新优化，建议查看最新调度方案。'
}

// 启动时立即执行一次数据采集
async function runScheduledRefresh() {
  try {
    pushServerLog({
      level: 'info',
      status: 'start',
      scope: 'scheduler',
      message: '定时任务开始刷新今日 24h 快照',
      targetDate: new Date().toISOString().slice(0, 10),
      algorithm: 'Realtime refresh cycle',
    })

    const { fetchResult, dataset } = await refreshRealtimeCycle({
      generateAlertText,
    })

    const hasCriticalAlert = (fetchResult.alerts || []).some((alert) => alert.severity === 'critical')
    if (hasCriticalAlert) {
      await createEmergencyDispatch({
        source: 'auto',
        prompt: `${(fetchResult.alerts || []).map((alert) => alert.title).join('；')}。请生成应急保供预案。`,
        eventSpec: {
          title: '自动检测异常应急预案',
          severity: 'critical',
        },
        baselineDataset: dataset.data,
        baselineMeta: dataset.meta,
        activeStrategy: 'es',
      }, {
        planner: generateEmergencyIntent,
      })
    }

    pushServerLog({
      level: 'ok',
      status: 'done',
      scope: 'scheduler',
      message: '定时任务已完成今日快照刷新',
      targetDate: fetchResult.date,
      range: `${fetchResult.date} 00:00-23:00`,
      algorithm: 'Realtime refresh cycle',
      detail: `${dataset.datasetName} | ${fetchResult.contains_forecast ? `forecast ${String(fetchResult.forecast_from_hour).padStart(2, '0')}:00-23:00` : 'no forecast hours'}`,
    })
  } catch (error) {
    console.error('[scheduler] refresh failed:', error.message)
    pushServerLog({
      level: 'err',
      status: 'error',
      scope: 'scheduler',
      message: '定时任务刷新失败',
      algorithm: 'Realtime refresh cycle',
      detail: error.message,
    })
  }
}

setTimeout(() => {
  pushServerLog({
    level: 'info',
    status: 'progress',
    scope: 'scheduler',
    message: '初始化抓取将在 3 秒后启动',
    algorithm: 'DataFetcher aggregator',
  })
  runScheduledRefresh()
}, 3000)

// 每小时执行一次
setInterval(() => runScheduledRefresh(), 60 * 60 * 1000)

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`[server] Port ${PORT} is already in use. Stop the existing process or start with a different PORT.`)
    console.error('[server] PowerShell example: $env:PORT=5001; npm run dev')
    return
  }
  console.error('[server] startup error:', error)
})

server.listen(PORT, () => {
  mountWebSocket(server)
  console.log(`Agent API: http://localhost:${PORT}`)
  console.log(`WebSocket: ws://localhost:${PORT}/ws`)
  if (!apiKey) console.warn('警告: 未配置 API Key，/api/chat 将返回 503')
  else console.log(`模型: ${model} | API: ${baseURL}`)
})
