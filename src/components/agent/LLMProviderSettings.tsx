import { useCallback, useEffect, useState } from 'react'
import {
  fetchLLMProviders,
  createLLMProvider,
  updateLLMProvider,
  deleteLLMProvider,
  activateLLMProvider,
  type LLMProvider,
} from '@/lib/api'
import { X, Plus, Eye, EyeOff, Trash2, Check, ChevronDown, ChevronRight } from 'lucide-react'

interface LLMProviderSettingsProps {
  open: boolean
  onClose: () => void
}

const API_FORMATS = [
  { value: 'openai', label: 'OpenAI Compatible' },
  { value: 'anthropic', label: 'Anthropic Messages' },
  { value: 'azure', label: 'Azure OpenAI' },
]

const AUTH_FIELDS = [
  { value: 'Authorization', label: 'Authorization (默认)' },
  { value: 'x-api-key', label: 'x-api-key (Anthropic)' },
  { value: 'api-key', label: 'api-key (Azure)' },
]

const MAPPING_KEYS = ['reasoning_model', 'haiku_model', 'sonnet_model', 'opus_model'] as const

const MAPPING_META: Record<(typeof MAPPING_KEYS)[number], { label: string; placeholder: string }> = {
  reasoning_model: { label: 'Thinking', placeholder: 'claude-opus-4-6-thinking' },
  haiku_model: { label: 'Haiku', placeholder: 'claude-3-5-haiku-latest' },
  sonnet_model: { label: 'Sonnet', placeholder: 'claude-sonnet-4-5' },
  opus_model: { label: 'Opus', placeholder: 'claude-opus-4-6' },
}

const emptyForm = {
  name: '',
  base_url: '',
  api_key: '',
  model: '',
  api_format: 'openai',
  auth_header: 'Authorization',
  notes: '',
  model_mapping: null as Record<string, string> | null,
}

function normalizeModelMapping(mapping: Record<string, string> | null) {
  if (!mapping) return null
  const next = Object.fromEntries(
    Object.entries(mapping)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value),
  )
  return Object.keys(next).length > 0 ? next : null
}

function normalizeBaseUrl(baseUrl: string, apiFormat: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (trimmed === 'https://ruoli.dev' && apiFormat === 'openai') return 'https://ruoli.dev/v1'
  if (trimmed === 'https://ruoli.dev/v1' && apiFormat === 'anthropic') return 'https://ruoli.dev'
  return trimmed
}

export default function LLMProviderSettings({ open, onClose }: LLMProviderSettingsProps) {
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [showKey, setShowKey] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const [keyEdited, setKeyEdited] = useState(false)

  const loadProviders = useCallback(async () => {
    try {
      const list = await fetchLLMProviders()
      setProviders(list)
    } catch (error) {
      console.warn('[LLM providers]', error)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    loadProviders()
    setSelectedId(null)
    setIsNew(false)
    setForm({ ...emptyForm })
    setShowKey(false)
    setShowAdvanced(false)
    setKeyEdited(false)
  }, [open, loadProviders])

  const selected = providers.find((provider) => provider.id === selectedId)

  const applyPreset = (preset: 'ruoli_claude' | 'ruoli_openai') => {
    setForm((prev) => ({
      ...prev,
      base_url: preset === 'ruoli_claude' ? 'https://ruoli.dev' : 'https://ruoli.dev/v1',
      api_format: preset === 'ruoli_claude' ? 'anthropic' : 'openai',
      auth_header: 'Authorization',
    }))
  }

  const baseUrlHint = form.api_format === 'anthropic'
    ? 'RuoLi 文档中，Claude / CC Switch 推荐填写 https://ruoli.dev'
    : form.api_format === 'openai'
      ? 'RuoLi 文档中，Codex / OpenClaw / OpenAI Compatible 推荐填写 https://ruoli.dev/v1'
      : 'Azure OpenAI 请填写你自己的 Azure endpoint'

  const buildPayload = () => ({
    name: form.name.trim(),
    base_url: normalizeBaseUrl(form.base_url, form.api_format),
    model: form.model.trim() || 'gpt-4',
    api_format: form.api_format,
    auth_header: form.auth_header,
    notes: form.notes.trim(),
    model_mapping: normalizeModelMapping(form.model_mapping),
  })

  const selectProvider = (provider: LLMProvider) => {
    setSelectedId(provider.id)
    setIsNew(false)
    setKeyEdited(false)
    setShowKey(false)
    setForm({
      name: provider.name,
      base_url: provider.base_url,
      api_key: '',
      model: provider.model,
      api_format: provider.api_format,
      auth_header: provider.auth_header,
      notes: provider.notes || '',
      model_mapping: provider.model_mapping,
    })
  }

  const startNew = () => {
    setSelectedId(null)
    setIsNew(true)
    setKeyEdited(false)
    setShowKey(false)
    setForm({ ...emptyForm })
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.base_url.trim() || (isNew && !form.api_key.trim())) return

    setSaving(true)
    try {
      const payload = buildPayload()
      if (isNew) {
        const { id } = await createLLMProvider({
          ...payload,
          api_key: form.api_key.trim(),
        })
        await loadProviders()
        setSelectedId(id)
        setIsNew(false)
        setKeyEdited(false)
      } else if (selectedId != null) {
        const updatePayload: Record<string, unknown> = { ...payload }
        if (keyEdited && form.api_key.trim()) updatePayload.api_key = form.api_key.trim()
        await updateLLMProvider(selectedId, updatePayload)
        await loadProviders()
        setKeyEdited(false)
      }
    } catch (error) {
      console.error('[save provider]', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (selectedId == null) return
    try {
      await deleteLLMProvider(selectedId)
      setSelectedId(null)
      setIsNew(false)
      setForm({ ...emptyForm })
      await loadProviders()
    } catch (error) {
      console.error('[delete provider]', error)
    }
  }

  const handleActivate = async () => {
    if (selectedId == null) return
    try {
      await activateLLMProvider(selectedId)
      await loadProviders()
    } catch (error) {
      console.error('[activate provider]', error)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-[860px] max-h-[80vh] overflow-hidden rounded-lg border border-[#1e3256]"
        style={{ background: '#0a1220' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#1e3256] px-5 py-3" style={{ background: '#0d1628' }}>
          <div className="text-sm font-semibold text-[#e8f4ff]">LLM 供应商管理</div>
          <button type="button" onClick={onClose} className="rounded p-1 text-[#5a7a9a] transition-colors hover:text-[#e8f4ff]">
            <X size={16} />
          </button>
        </div>

        <div className="flex" style={{ height: 'calc(80vh - 52px)', minHeight: 420 }}>
          <div className="flex w-[220px] shrink-0 flex-col border-r border-[#1e3256]" style={{ background: '#080f1a' }}>
            <button
              type="button"
              onClick={startNew}
              className="mx-2 mt-3 flex shrink-0 items-center gap-2 rounded border border-dashed border-[#1e3256] px-3 py-2 text-xs text-[#3d6080] transition-colors hover:border-[#00d4ff]/50 hover:text-[#00d4ff]"
            >
              <Plus size={12} />
              添加供应商
            </button>
            <div className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectProvider(provider)}
                  onKeyDown={(event) => event.key === 'Enter' && selectProvider(provider)}
                  className={`group flex cursor-pointer items-center gap-2 rounded px-2 py-2 transition-colors ${
                    selectedId === provider.id ? 'bg-[#00d4ff]/15 text-[#00d4ff]' : 'text-[#8ba9cc] hover:bg-[#1e3256]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{provider.name}</div>
                    <div className="mt-0.5 truncate text-[10px] text-[#3d6080]">{provider.base_url}</div>
                  </div>
                  {provider.is_active === 1 && (
                    <span className="shrink-0 rounded bg-[#69f0ae]/15 px-1.5 py-0.5 text-[9px] font-medium text-[#69f0ae]">激活</span>
                  )}
                </div>
              ))}
              {providers.length === 0 && (
                <div className="py-6 text-center text-xs text-[#3d6080]">暂无供应商</div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {!isNew && selectedId == null ? (
              <div className="flex h-full items-center justify-center text-xs text-[#3d6080]">
                选择左侧供应商或点击“添加供应商”
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-[10px] tracking-wider text-[#5a7a9a]">供应商名称</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="例如：ruoli_claude / ruoli_codex"
                    className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 text-xs text-[#e8f4ff] outline-none transition-colors placeholder:text-[#2a4060] focus:border-[#00d4ff]/60"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] tracking-wider text-[#5a7a9a]">API Key</label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={keyEdited || isNew ? form.api_key : (selected?.api_key_masked ?? '')}
                      onChange={(event) => {
                        setKeyEdited(true)
                        setForm((prev) => ({ ...prev, api_key: event.target.value }))
                      }}
                      placeholder={isNew ? '输入 API Key' : '留空则不修改'}
                      className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 pr-9 font-mono text-xs text-[#e8f4ff] outline-none transition-colors placeholder:text-[#2a4060] focus:border-[#00d4ff]/60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#3d6080] transition-colors hover:text-[#8ba9cc]"
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] tracking-wider text-[#5a7a9a]">请求地址</label>
                  <input
                    type="text"
                    value={form.base_url}
                    onChange={(event) => setForm((prev) => ({ ...prev, base_url: event.target.value }))}
                    placeholder="https://api.openai.com/v1"
                    className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 font-mono text-xs text-[#e8f4ff] outline-none transition-colors placeholder:text-[#2a4060] focus:border-[#00d4ff]/60"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => applyPreset('ruoli_claude')}
                      className="rounded border border-[#00d4ff]/30 bg-[#00d4ff]/10 px-2.5 py-1 text-[10px] text-[#9fe8ff] transition-colors hover:bg-[#00d4ff]/20"
                    >
                      套用 RuoLi Claude / CC Switch
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('ruoli_openai')}
                      className="rounded border border-[#69f0ae]/30 bg-[#69f0ae]/10 px-2.5 py-1 text-[10px] text-[#9ff7c7] transition-colors hover:bg-[#69f0ae]/20"
                    >
                      套用 RuoLi Codex / OpenAI
                    </button>
                  </div>
                  <div className="mt-1 text-[10px] text-[#53718f]">{baseUrlHint}</div>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] tracking-wider text-[#5a7a9a]">主模型</label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
                    placeholder="claude-sonnet-4-5 / gpt-4o / qwen-plus"
                    className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 font-mono text-xs text-[#e8f4ff] outline-none transition-colors placeholder:text-[#2a4060] focus:border-[#00d4ff]/60"
                  />
                  <div className="mt-1 text-[10px] text-[#53718f]">
                    主模型用于默认对话；高级设置里的 Thinking / Haiku / Sonnet / Opus 会按 RuoLi CC Switch 的模型映射规则参与选模。
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] tracking-wider text-[#5a7a9a]">备注</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="例如：比赛演示 / 官方质量 / 低成本线路"
                    className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 text-xs text-[#e8f4ff] outline-none transition-colors placeholder:text-[#2a4060] focus:border-[#00d4ff]/60"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="flex items-center gap-1 text-[11px] text-[#5a7a9a] transition-colors hover:text-[#8ba9cc]"
                >
                  {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  高级选项
                </button>

                {showAdvanced && (
                  <div className="space-y-4 rounded border border-[#1e3256] p-4" style={{ background: '#080f1a' }}>
                    <div>
                      <label className="mb-1 block text-[10px] tracking-wider text-[#5a7a9a]">API 格式</label>
                      <select
                        value={form.api_format}
                        onChange={(event) => setForm((prev) => ({ ...prev, api_format: event.target.value }))}
                        className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 text-xs text-[#e8f4ff] outline-none transition-colors focus:border-[#00d4ff]/60"
                      >
                        {API_FORMATS.map((apiFormat) => (
                          <option key={apiFormat.value} value={apiFormat.value}>{apiFormat.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-[10px] tracking-wider text-[#5a7a9a]">认证字段</label>
                      <select
                        value={form.auth_header}
                        onChange={(event) => setForm((prev) => ({ ...prev, auth_header: event.target.value }))}
                        className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 text-xs text-[#e8f4ff] outline-none transition-colors focus:border-[#00d4ff]/60"
                      >
                        {AUTH_FIELDS.map((field) => (
                          <option key={field.value} value={field.value}>{field.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[10px] tracking-wider text-[#5a7a9a]">模型映射</label>
                      <div className="space-y-2">
                        {MAPPING_KEYS.map((key) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="w-24 shrink-0 text-[10px] text-[#5a7a9a]">{MAPPING_META[key].label}</span>
                            <input
                              type="text"
                              value={form.model_mapping?.[key] ?? ''}
                              onChange={(event) => {
                                const next = { ...(form.model_mapping ?? {}), [key]: event.target.value }
                                setForm((prev) => ({ ...prev, model_mapping: next }))
                              }}
                              placeholder={MAPPING_META[key].placeholder}
                              className="flex-1 rounded border border-[#1e3256] bg-[#0d1422] px-2 py-1.5 font-mono text-[11px] text-[#e8f4ff] outline-none transition-colors placeholder:text-[#2a4060] focus:border-[#00d4ff]/60"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 text-[10px] leading-4 text-[#53718f]">
                        与 RuoLi CC Switch 保持一致：主模型负责默认对话，Thinking 用于深度推理，Haiku / Sonnet / Opus 作为别名映射与后备模型。
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 border-t border-[#1e3256] pt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !form.name.trim() || !form.base_url.trim() || (isNew && !form.api_key.trim())}
                    className="inline-flex items-center gap-1.5 rounded border border-[#00d4ff]/40 bg-[#00d4ff]/10 px-4 py-2 text-xs font-medium text-[#cfefff] transition-colors hover:bg-[#00d4ff]/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving ? '保存中...' : isNew ? '创建' : '保存修改'}
                  </button>

                  {!isNew && selectedId != null && (
                    <>
                      <button
                        type="button"
                        onClick={handleActivate}
                        disabled={selected?.is_active === 1}
                        className="inline-flex items-center gap-1.5 rounded border border-[#69f0ae]/40 bg-[#69f0ae]/10 px-4 py-2 text-xs font-medium text-[#69f0ae] transition-colors hover:bg-[#69f0ae]/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Check size={12} />
                        {selected?.is_active === 1 ? '已激活' : '设为激活'}
                      </button>
                      <div className="flex-1" />
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="inline-flex items-center gap-1.5 rounded border border-[#ff7043]/40 bg-[#ff7043]/10 px-3 py-2 text-xs text-[#ffb199] transition-colors hover:bg-[#ff7043]/20"
                      >
                        <Trash2 size={12} />
                        删除
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
