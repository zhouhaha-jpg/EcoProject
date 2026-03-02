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
import OpenAI from 'openai'
import config from './config.js'
import { initDb } from './db/index.js'
import datasetsRouter from './routes/datasets.js'

initDb()

const app = express()
app.use(cors())
app.use(express.json())

app.use('/api/datasets', datasetsRouter)

const apiKey = config.apiKey
const baseURL = process.env.API_BASE_URL || config.apiBaseUrl
const model = process.env.OPENAI_MODEL || config.model

const openai = apiKey
  ? new OpenAI({ apiKey, baseURL })
  : null

const SYSTEM_PROMPT = `你是氯碱制氢数字孪生平台的 AI 助手。该平台对比 6 种优化调度方案（UCI/CICOS/CICAR/CICOM/PV/ES）在 24 小时时序下的功率、制氢量、碳排放等指标。

## 业务知识
- **氯碱制氢**：利用氯碱工业电解槽生产氢气的工艺
- **UCI**：统一控制综合，基准方案，电解槽恒定功率运行
- **CICOS**：成本优化集成，最小化运营成本
- **CICAR**：碳排优化集成，最小化碳排放，绿电优先
- **CICOM**：综合优化集成，兼顾成本与碳排
- **PV**：光伏优先优化，扩大光伏装机
- **ES**：储能综合优化，引入电化学储能

## 数据字段
- cost: 运行成本（元）
- carbon: 碳排放（tCO2）
- combined: 综合目标函数（越小越好）
- P_CA: 电解槽功率（kW）
- P_PV: 光伏功率（kW）

根据用户提供的上下文数据回答问题，务必基于数据给出准确结论。`

const AGENT_SYSTEM_PROMPT = SYSTEM_PROMPT + `

## Agent 模式
你可以执行以下操作帮助用户：
1. **navigate** - 切换页面：path 可选值 "/" | "/energy" | "/production" | "/equipment" | "/hse"
2. **switchStrategy** - 切换策略：key 可选值 "uci" | "cicos" | "cicar" | "cicom" | "pv" | "es"

当用户要求切换页面或策略时，调用相应工具。可组合调用（如先 navigate 再 switchStrategy）。`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: '切换到指定页面。path: 路径，如 "/ca"（电解槽）、"/pv"（光伏）、"/gm"（燃气轮机）、"/pem"（质子膜燃料电池）、"/g"（电网）',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', enum: ['/ca', '/pv', '/gm', '/pem', '/g'] } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'switchStrategy',
      description: '切换到指定优化策略。key: uci|cicos|cicar|cicom|pv|es',
      parameters: {
        type: 'object',
        properties: { key: { type: 'string', enum: ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es'] } },
        required: ['key'],
      },
    },
  },
]

app.post('/api/chat', async (req, res) => {
  if (!openai) {
    return res.status(503).json({ error: '未配置 ZHIPU_API_KEY 或 OPENAI_API_KEY' })
  }

  const { messages = [], mode = 'ask', context = '' } = req.body

  const contextBlock = context
    ? `\n\n## 当前上下文\n${context}\n`
    : ''

  const systemContent = (mode === 'agent' ? AGENT_SYSTEM_PROMPT : SYSTEM_PROMPT) + contextBlock

  const apiMessages = [
    { role: 'system', content: systemContent },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  try {
    if (mode === 'agent') {
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
    } else {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
      res.end()
    }
  }
})

const PORT = process.env.PORT || 3007
app.listen(PORT, () => {
  console.log(`Agent API: http://localhost:${PORT}`)
  if (!apiKey) console.warn('警告: 未配置 API Key，/api/chat 将返回 503')
  else console.log(`模型: ${model} | API: ${baseURL}`)
})
