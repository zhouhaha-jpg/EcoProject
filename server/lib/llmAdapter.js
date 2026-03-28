/**
 * LLM API 适配器
 * 根据 api_format 自动切换 OpenAI SDK / Anthropic HTTP 调用
 * 所有方法接受 OpenAI 风格参数，返回 OpenAI 兼容响应
 */

let _openai = null
let _apiKey = ''
let _baseURL = ''
let _model = ''
let _apiFormat = 'openai'
let _authHeader = 'Authorization'

/**
 * @param {{ openai: object|null, apiKey: string, baseURL: string, model: string, apiFormat?: string, authHeader?: string }} opts
 */
export function configure({ openai, apiKey, baseURL, model, apiFormat, authHeader }) {
  _openai = openai
  _apiKey = apiKey || ''
  _baseURL = baseURL || ''
  _model = model || 'gpt-4'
  _apiFormat = (apiFormat || 'openai').toLowerCase()
  _authHeader = authHeader || 'Authorization'
}

export function getModel() { return _model }

export function isAvailable() {
  if (_apiFormat === 'anthropic') return !!_apiKey && !!_baseURL
  return !!_openai
}

export function getApiFormat() { return _apiFormat }

/**
 * 非流式调用，返回 OpenAI 兼容响应
 */
export async function complete(params) {
  if (_apiFormat === 'anthropic') return _anthropicComplete(params)
  return _openai.chat.completions.create(params)
}

/**
 * 流式调用，返回可 for-await-of 的异步迭代器
 * 每个 chunk 格式: { choices: [{ delta: { content: string } }] }
 */
export async function createStream(params) {
  if (_apiFormat === 'anthropic') return _anthropicStream(params)
  return _openai.chat.completions.create({ ...params, stream: true })
}

// ── OpenAI → Anthropic 请求转换 ──────────────────────────────

function _convertMessages(messages) {
  const systemParts = []
  const converted = []

  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content)
      continue
    }

    if (m.role === 'assistant' && m.tool_calls?.length) {
      const content = []
      if (m.content) content.push({ type: 'text', text: m.content })
      for (const tc of m.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: _safeParse(tc.function.arguments),
        })
      }
      converted.push({ role: 'assistant', content })
      continue
    }

    if (m.role === 'tool') {
      converted.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content || '' }],
      })
      continue
    }

    converted.push({ role: m.role, content: m.content || '' })
  }

  const merged = []
  for (const m of converted) {
    const prev = merged[merged.length - 1]
    if (prev && prev.role === m.role) {
      if (!Array.isArray(prev.content)) prev.content = [{ type: 'text', text: prev.content }]
      if (Array.isArray(m.content)) prev.content.push(...m.content)
      else prev.content.push({ type: 'text', text: m.content })
    } else {
      merged.push({ ...m })
    }
  }

  return { system: systemParts.join('\n\n'), messages: merged }
}

function _safeParse(str) {
  try { return JSON.parse(str || '{}') } catch { return {} }
}

function _buildHeaders() {
  const h = { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' }
  const lower = _authHeader.toLowerCase()
  if (lower === 'x-api-key' || lower === 'x_api_key') {
    h['x-api-key'] = _apiKey
  } else {
    h['Authorization'] = `Bearer ${_apiKey}`
  }
  return h
}

function _buildURL() {
  let url = _baseURL.replace(/\/+$/, '')
  try {
    const path = new URL(url).pathname
    if (!path.endsWith('/v1') && !path.includes('/v1/')) {
      url += '/v1'
    }
  } catch { /* non-standard URL, leave as-is */ }
  return url + '/messages'
}

// ── Anthropic → OpenAI 响应转换 ──────────────────────────────

function _toOpenAIResponse(data) {
  const textParts = []
  const toolCalls = []

  for (const block of (data.content || [])) {
    if (block.type === 'text') textParts.push(block.text)
    else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      })
    }
  }

  const message = { role: 'assistant', content: textParts.join('') || null }
  if (toolCalls.length > 0) message.tool_calls = toolCalls

  const finishReason = data.stop_reason === 'end_turn' ? 'stop'
    : data.stop_reason === 'tool_use' ? 'tool_calls'
    : 'stop'

  return {
    choices: [{ message, finish_reason: finishReason }],
    model: data.model,
    usage: data.usage ? {
      prompt_tokens: data.usage.input_tokens,
      completion_tokens: data.usage.output_tokens,
      total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
    } : undefined,
  }
}

// ── Anthropic 非流式调用 ─────────────────────────────────────

async function _anthropicComplete(params) {
  const { system, messages } = _convertMessages(params.messages || [])

  const body = {
    model: params.model || _model,
    max_tokens: params.max_tokens || 4096,
    messages,
  }
  if (system) body.system = system
  if (params.temperature != null) body.temperature = params.temperature

  if (params.tools?.length) {
    body.tools = params.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: t.function.parameters,
    }))
  }
  if (params.response_format?.type === 'json_object') {
    body.system = (body.system || '') + '\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown code fences.'
  }

  const res = await fetch(_buildURL(), {
    method: 'POST',
    headers: _buildHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    const err = new Error(`Anthropic API ${res.status}: ${text.slice(0, 500)}`)
    err.status = res.status
    throw err
  }

  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('json')) {
    const text = await res.text()
    throw new Error(`Anthropic API 返回非 JSON 响应 (content-type: ${ct}): ${text.slice(0, 300)}`)
  }

  return _toOpenAIResponse(await res.json())
}

// ── Anthropic 流式调用 ───────────────────────────────────────

async function* _anthropicStream(params) {
  const { system, messages } = _convertMessages(params.messages || [])

  const body = {
    model: params.model || _model,
    max_tokens: params.max_tokens || 4096,
    messages,
    stream: true,
  }
  if (system) body.system = system
  if (params.temperature != null) body.temperature = params.temperature

  if (params.tools?.length) {
    body.tools = params.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: t.function.parameters,
    }))
  }

  const res = await fetch(_buildURL(), {
    method: 'POST',
    headers: _buildHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 500)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const json = line.slice(6).trim()
        if (!json || json === '[DONE]') continue

        try {
          const ev = JSON.parse(json)
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            yield { choices: [{ delta: { content: ev.delta.text } }] }
          }
        } catch { /* skip unparseable SSE lines */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
