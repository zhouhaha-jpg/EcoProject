/**
 * LLM API 适配器
 * 根据 api_format 自动切换 OpenAI SDK / Anthropic HTTP 调用
 *
 * 统一流式 chunk 格式:
 *   { type: 'thinking', text }        - 思考过程
 *   { type: 'content',  text }        - 正文内容
 *   { type: 'tool_call_delta', index, tool_call: { id, name, arguments_delta } }
 *   { type: 'message_done', stop_reason }
 */

let _openai = null
let _apiKey = ''
let _baseURL = ''
let _model = ''
let _apiFormat = 'openai'
let _authHeader = 'Authorization'
let _modelMapping = null

/**
 * @param {{ openai: object|null, apiKey: string, baseURL: string, model: string, apiFormat?: string, authHeader?: string, modelMapping?: Record<string, string>|null }} opts
 */
export function configure({ openai, apiKey, baseURL, model, apiFormat, authHeader, modelMapping }) {
  _openai = openai
  _apiKey = apiKey || ''
  _baseURL = baseURL || ''
  _model = model || 'gpt-4'
  _apiFormat = (apiFormat || 'openai').toLowerCase()
  _authHeader = authHeader || 'Authorization'
  _modelMapping = _normalizeModelMapping(modelMapping)
}

export function getModel() { return _model }
export function getModelMapping() { return _modelMapping }

export function isAvailable() {
  if (_apiFormat === 'anthropic') return !!_apiKey && !!_baseURL
  return !!_openai
}

export function getApiFormat() { return _apiFormat }

export function resolveModel(target = 'default', explicitModel = '') {
  const requested = (explicitModel || '').trim()
  const alias = _normalizeModelAlias(requested || target)

  if (!requested) {
    if (alias === 'reasoning_model') return _modelMapping?.reasoning_model || _resolvePrimaryModel()
    if (alias === 'haiku_model') return _modelMapping?.haiku_model || _modelMapping?.sonnet_model || _resolvePrimaryModel()
    if (alias === 'sonnet_model') return _modelMapping?.sonnet_model || _resolvePrimaryModel()
    if (alias === 'opus_model') return _modelMapping?.opus_model || _modelMapping?.reasoning_model || _resolvePrimaryModel()
    return _resolvePrimaryModel()
  }

  if (alias === 'default') return _resolvePrimaryModel()
  if (alias === 'reasoning_model') return _modelMapping?.reasoning_model || _resolvePrimaryModel()
  if (alias === 'haiku_model') return _modelMapping?.haiku_model || _modelMapping?.sonnet_model || _resolvePrimaryModel()
  if (alias === 'sonnet_model') return _modelMapping?.sonnet_model || _resolvePrimaryModel()
  if (alias === 'opus_model') return _modelMapping?.opus_model || _modelMapping?.reasoning_model || _resolvePrimaryModel()

  return requested
}

/**
 * 非流式调用，返回 OpenAI 兼容响应
 */
export async function complete(params) {
  if (_apiFormat === 'anthropic') return _anthropicComplete(params)
  return _openai.chat.completions.create(params)
}

/**
 * 流式调用，返回可 for-await-of 的统一 chunk 迭代器
 */
export async function createStream(params) {
  if (_apiFormat === 'anthropic') return _anthropicStream(params)
  return _openaiStream(params)
}

function _normalizeModelMapping(mapping) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return null
  const next = {}
  for (const [key, value] of Object.entries(mapping)) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) next[key] = trimmed
  }
  return Object.keys(next).length > 0 ? next : null
}

function _normalizeModelAlias(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'default'
  if (['default', 'main', 'primary', 'primary_model', 'main_model', 'model'].includes(normalized)) return 'default'
  if (['thinking', 'reasoning', 'reasoning_model', 'thinking_model'].includes(normalized)) return 'reasoning_model'
  if (['haiku', 'haiku_model'].includes(normalized)) return 'haiku_model'
  if (['sonnet', 'sonnet_model'].includes(normalized)) return 'sonnet_model'
  if (['opus', 'opus_model'].includes(normalized)) return 'opus_model'
  return null
}

function _resolvePrimaryModel() {
  const alias = _normalizeModelAlias(_model)
  if (alias === 'reasoning_model') return _modelMapping?.reasoning_model || _model
  if (alias === 'haiku_model') return _modelMapping?.haiku_model || _modelMapping?.sonnet_model || _model
  if (alias === 'sonnet_model') return _modelMapping?.sonnet_model || _model
  if (alias === 'opus_model') return _modelMapping?.opus_model || _modelMapping?.reasoning_model || _model
  return _model
}

// ── OpenAI 流式包装 ─────────────────────────────────────────

async function* _openaiStream(params) {
  const raw = await _openai.chat.completions.create({ ...params, stream: true })
  for await (const chunk of raw) {
    const delta = chunk.choices?.[0]?.delta
    if (!delta) continue

    if (delta.reasoning_content) {
      yield { type: 'thinking', text: delta.reasoning_content }
    }
    if (delta.content) {
      yield { type: 'content', text: delta.content }
    }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        yield {
          type: 'tool_call_delta',
          index: tc.index ?? 0,
          tool_call: {
            id: tc.id || undefined,
            name: tc.function?.name || undefined,
            arguments_delta: tc.function?.arguments || '',
          },
        }
      }
    }

    const finish = chunk.choices?.[0]?.finish_reason
    if (finish) {
      yield { type: 'message_done', stop_reason: finish }
    }
  }
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

function _shouldEnableThinking(params) {
  if (params.response_format?.type === 'json_object') return false
  const m = (params.model || _model).toLowerCase()
  return m.includes('claude')
}

function _buildAnthropicBody(params, { stream = false } = {}) {
  const { system, messages } = _convertMessages(params.messages || [])

  const body = {
    model: params.model || _model,
    max_tokens: params.max_tokens || 16000,
    messages,
  }
  if (stream) body.stream = true
  if (system) body.system = system
  if (params.temperature != null) body.temperature = params.temperature

  if (params.tools?.length) {
    body.tools = params.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: t.function.parameters,
    }))
  }

  if (_shouldEnableThinking(params)) {
    body.thinking = { type: 'enabled', budget_tokens: 8000 }
    delete body.temperature
  }

  if (params.response_format?.type === 'json_object') {
    body.system = (body.system || '') + '\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown code fences.'
  }

  return body
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
  const body = _buildAnthropicBody(params)

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

// ── Anthropic 流式调用 (统一 chunk 格式) ─────────────────────

async function* _anthropicStream(params) {
  const body = _buildAnthropicBody(params, { stream: true })

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

  const toolBlocks = {}

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

          if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
            const idx = ev.index ?? 0
            toolBlocks[idx] = { id: ev.content_block.id, name: ev.content_block.name, args: '' }
            yield {
              type: 'tool_call_delta',
              index: idx,
              tool_call: { id: ev.content_block.id, name: ev.content_block.name, arguments_delta: '' },
            }
          }

          if (ev.type === 'content_block_delta') {
            if (ev.delta?.type === 'thinking_delta') {
              yield { type: 'thinking', text: ev.delta.thinking }
            } else if (ev.delta?.type === 'text_delta') {
              yield { type: 'content', text: ev.delta.text }
            } else if (ev.delta?.type === 'input_json_delta') {
              const idx = ev.index ?? 0
              if (toolBlocks[idx]) toolBlocks[idx].args += ev.delta.partial_json
              yield {
                type: 'tool_call_delta',
                index: idx,
                tool_call: { arguments_delta: ev.delta.partial_json },
              }
            }
          }

          if (ev.type === 'message_delta') {
            yield { type: 'message_done', stop_reason: ev.delta?.stop_reason || 'end_turn' }
          }
        } catch { /* skip unparseable SSE lines */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
