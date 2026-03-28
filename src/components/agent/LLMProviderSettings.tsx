/**
 * LLM 供应商配置弹窗
 */
import { useState, useEffect, useCallback } from 'react'
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
    } catch (e) {
      console.warn('[LLM providers]', e)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadProviders()
      setSelectedId(null)
      setIsNew(false)
      setForm({ ...emptyForm })
      setShowKey(false)
      setKeyEdited(false)
    }
  }, [open, loadProviders])

  const selectProvider = (p: LLMProvider) => {
    setSelectedId(p.id)
    setIsNew(false)
    setKeyEdited(false)
    setShowKey(false)
    setForm({
      name: p.name,
      base_url: p.base_url,
      api_key: '',
      model: p.model,
      api_format: p.api_format,
      auth_header: p.auth_header,
      notes: p.notes || '',
      model_mapping: p.model_mapping,
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
    if (!form.name || !form.base_url || (isNew && !form.api_key)) return
    setSaving(true)
    try {
      if (isNew) {
        const { id } = await createLLMProvider({
          name: form.name,
          base_url: form.base_url,
          api_key: form.api_key,
          model: form.model || 'gpt-4',
          api_format: form.api_format,
          auth_header: form.auth_header,
          notes: form.notes,
          model_mapping: form.model_mapping,
        })
        await loadProviders()
        setSelectedId(id)
        setIsNew(false)
        setKeyEdited(false)
      } else if (selectedId != null) {
        const payload: Record<string, unknown> = {
          name: form.name,
          base_url: form.base_url,
          model: form.model,
          api_format: form.api_format,
          auth_header: form.auth_header,
          notes: form.notes,
          model_mapping: form.model_mapping,
        }
        if (keyEdited && form.api_key) {
          payload.api_key = form.api_key
        }
        await updateLLMProvider(selectedId, payload)
        await loadProviders()
        setKeyEdited(false)
      }
    } catch (e) {
      console.error('[save provider]', e)
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
    } catch (e) {
      console.error('[delete provider]', e)
    }
  }

  const handleActivate = async () => {
    if (selectedId == null) return
    try {
      await activateLLMProvider(selectedId)
      await loadProviders()
    } catch (e) {
      console.error('[activate provider]', e)
    }
  }

  const selected = providers.find((p) => p.id === selectedId)
  const mappingKeys = ['reasoning_model', 'haiku_model', 'sonnet_model', 'opus_model']

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-[860px] max-h-[80vh] rounded-lg border border-[#1e3256] overflow-hidden"
        style={{ background: '#0a1220' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e3256]" style={{ background: '#0d1628' }}>
          <div className="text-sm font-semibold text-[#e8f4ff]">LLM 供应商管理</div>
          <button type="button" onClick={onClose} className="p-1 rounded text-[#5a7a9a] hover:text-[#e8f4ff] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex" style={{ height: 'calc(80vh - 52px)', minHeight: 420 }}>
          {/* left panel: provider list */}
          <div className="w-[220px] shrink-0 border-r border-[#1e3256] flex flex-col" style={{ background: '#080f1a' }}>
            <button
              type="button"
              onClick={startNew}
              className="shrink-0 flex items-center gap-2 px-3 py-2 mx-2 mt-3 rounded border border-dashed border-[#1e3256] text-xs text-[#3d6080] hover:border-[#00d4ff]/50 hover:text-[#00d4ff] transition-colors"
            >
              <Plus size={12} />
              添加供应商
            </button>
            <div className="flex-1 overflow-y-auto mt-2 px-2 pb-2 space-y-0.5">
              {providers.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectProvider(p)}
                  onKeyDown={(e) => e.key === 'Enter' && selectProvider(p)}
                  className={`group flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-colors ${
                    selectedId === p.id ? 'bg-[#00d4ff]/15 text-[#00d4ff]' : 'text-[#8ba9cc] hover:bg-[#1e3256]'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs font-medium">{p.name}</div>
                    <div className="text-[10px] text-[#3d6080] mt-0.5 truncate">{p.base_url}</div>
                  </div>
                  {p.is_active === 1 && (
                    <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-[#69f0ae]/15 text-[#69f0ae] font-medium">激活</span>
                  )}
                </div>
              ))}
              {providers.length === 0 && (
                <div className="py-6 text-center text-[#3d6080] text-xs">暂无供应商</div>
              )}
            </div>
          </div>

          {/* right panel: form */}
          <div className="flex-1 overflow-y-auto p-5">
            {!isNew && selectedId == null ? (
              <div className="flex items-center justify-center h-full text-[#3d6080] text-xs">
                选择左侧供应商或点击「添加供应商」
              </div>
            ) : (
              <div className="space-y-4">
                {/* name */}
                <div>
                  <label className="block text-[10px] text-[#5a7a9a] mb-1 tracking-wider">供应商名称</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="例如：智谱清言、通义千问"
                    className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 text-xs text-[#e8f4ff] outline-none focus:border-[#00d4ff]/60 transition-colors placeholder:text-[#2a4060]"
                  />
                </div>

                {/* api_key */}
                <div>
                  <label className="block text-[10px] text-[#5a7a9a] mb-1 tracking-wider">API Key</label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={keyEdited || isNew ? form.api_key : (selected?.api_key_masked ?? '')}
                      onChange={(e) => { setKeyEdited(true); setForm((f) => ({ ...f, api_key: e.target.value })) }}
                      placeholder={isNew ? '输入 API Key' : '留空则不修改'}
                      className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 pr-9 text-xs text-[#e8f4ff] outline-none focus:border-[#00d4ff]/60 transition-colors placeholder:text-[#2a4060] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#3d6080] hover:text-[#8ba9cc] transition-colors"
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* base_url */}
                <div>
                  <label className="block text-[10px] text-[#5a7a9a] mb-1 tracking-wider">请求地址</label>
                  <input
                    type="text"
                    value={form.base_url}
                    onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
                    placeholder="https://api.openai.com/v1"
                    className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 text-xs text-[#e8f4ff] outline-none focus:border-[#00d4ff]/60 transition-colors placeholder:text-[#2a4060] font-mono"
                  />
                </div>

                {/* model */}
                <div>
                  <label className="block text-[10px] text-[#5a7a9a] mb-1 tracking-wider">主模型</label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    placeholder="gpt-4 / glm-4.7 / qwen-plus"
                    className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 text-xs text-[#e8f4ff] outline-none focus:border-[#00d4ff]/60 transition-colors placeholder:text-[#2a4060] font-mono"
                  />
                </div>

                {/* notes */}
                <div>
                  <label className="block text-[10px] text-[#5a7a9a] mb-1 tracking-wider">备注</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="例如：公司专用账号"
                    className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 text-xs text-[#e8f4ff] outline-none focus:border-[#00d4ff]/60 transition-colors placeholder:text-[#2a4060]"
                  />
                </div>

                {/* advanced toggle */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex items-center gap-1 text-[11px] text-[#5a7a9a] hover:text-[#8ba9cc] transition-colors"
                >
                  {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  高级选项
                </button>

                {showAdvanced && (
                  <div className="space-y-4 rounded border border-[#1e3256] p-4" style={{ background: '#080f1a' }}>
                    {/* api_format */}
                    <div>
                      <label className="block text-[10px] text-[#5a7a9a] mb-1 tracking-wider">API 格式</label>
                      <select
                        value={form.api_format}
                        onChange={(e) => setForm((f) => ({ ...f, api_format: e.target.value }))}
                        className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 text-xs text-[#e8f4ff] outline-none focus:border-[#00d4ff]/60 transition-colors"
                      >
                        {API_FORMATS.map((af) => (
                          <option key={af.value} value={af.value}>{af.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* auth_header */}
                    <div>
                      <label className="block text-[10px] text-[#5a7a9a] mb-1 tracking-wider">认证字段</label>
                      <select
                        value={form.auth_header}
                        onChange={(e) => setForm((f) => ({ ...f, auth_header: e.target.value }))}
                        className="w-full rounded border border-[#1e3256] bg-[#0d1422] px-3 py-2 text-xs text-[#e8f4ff] outline-none focus:border-[#00d4ff]/60 transition-colors"
                      >
                        {AUTH_FIELDS.map((af) => (
                          <option key={af.value} value={af.value}>{af.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* model_mapping */}
                    <div>
                      <label className="block text-[10px] text-[#5a7a9a] mb-1.5 tracking-wider">模型映射</label>
                      <div className="space-y-2">
                        {mappingKeys.map((mk) => (
                          <div key={mk} className="flex items-center gap-2">
                            <span className="w-24 shrink-0 text-[10px] text-[#5a7a9a]">
                              {mk === 'reasoning_model' ? '推理模型' : mk === 'haiku_model' ? '轻量模型' : mk === 'sonnet_model' ? '标准模型' : '旗舰模型'}
                            </span>
                            <input
                              type="text"
                              value={form.model_mapping?.[mk] ?? ''}
                              onChange={(e) => {
                                const prev = form.model_mapping ?? {}
                                setForm((f) => ({ ...f, model_mapping: { ...prev, [mk]: e.target.value } }))
                              }}
                              placeholder="可选"
                              className="flex-1 rounded border border-[#1e3256] bg-[#0d1422] px-2 py-1.5 text-[11px] text-[#e8f4ff] outline-none focus:border-[#00d4ff]/60 transition-colors placeholder:text-[#2a4060] font-mono"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-[#1e3256]">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !form.name || !form.base_url || (isNew && !form.api_key)}
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
