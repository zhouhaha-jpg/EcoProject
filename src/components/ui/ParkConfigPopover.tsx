import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, Save, Settings, X } from 'lucide-react'

interface ParkConfig {
  lat: string
  lon: string
  park_name: string
}

const API_BASE = ''

export default function ParkConfigPopover() {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<ParkConfig>({ lat: '30.26', lon: '120.19', park_name: '杭州示范园区' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    fetch(`${API_BASE}/api/realtime/config`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text() || `HTTP ${response.status}`)
        }
        return response.json()
      })
      .then((data) => {
        if (data?.lat != null && data?.lon != null) {
          setConfig({
            lat: String(data.lat),
            lon: String(data.lon),
            park_name: data.park_name || '',
          })
        }
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : String(error))
      })
  }, [open])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const handleSave = async () => {
    const lat = parseFloat(config.lat)
    const lon = parseFloat(config.lon)
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setMessage('坐标无效')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      const response = await fetch(`${API_BASE}/api/realtime/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!response.ok) {
        throw new Error(await response.text() || `HTTP ${response.status}`)
      }
      setMessage('策略已保存')
      window.setTimeout(() => setOpen(false), 800)
    } catch (error) {
      setMessage(`保存失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(false)
    }
  }

  const panel = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={panelRef}
          className="rounded-lg p-4 shadow-lg"
          style={{
            position: 'fixed',
            zIndex: 99998,
            top: (buttonRef.current?.getBoundingClientRect().bottom ?? 56) + 12,
            right: Math.max(16, window.innerWidth - (buttonRef.current?.getBoundingClientRect().right ?? window.innerWidth)),
            width: 320,
            background: '#111b2a',
            border: '1px solid #1e3256',
            boxShadow: '0 18px 56px rgba(0,0,0,0.72), 0 0 28px rgba(0,212,255,0.12)',
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#8ba9cc' }}>
              <MapPin size={13} className="text-[#00d4ff]" />
              地理位置设置
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-[#3d6080] hover:text-[#8ba9cc]">
              <X size={13} />
            </button>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="mb-1 block text-[10px]" style={{ color: '#5a7a9a' }}>园区名称</label>
              <input
                type="text"
                value={config.park_name}
                onChange={(event) => setConfig((current) => ({ ...current, park_name: event.target.value }))}
                className="w-full rounded px-2 py-1.5 text-xs outline-none"
                style={{ background: '#0a1420', border: '1px solid #1e3256', color: '#e8f4ff' }}
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-[10px]" style={{ color: '#5a7a9a' }}>纬度</label>
                <input
                  type="text"
                  value={config.lat}
                  onChange={(event) => setConfig((current) => ({ ...current, lat: event.target.value }))}
                  className="w-full rounded px-2 py-1.5 text-xs outline-none"
                  style={{ background: '#0a1420', border: '1px solid #1e3256', color: '#e8f4ff' }}
                  placeholder="30.26"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[10px]" style={{ color: '#5a7a9a' }}>经度</label>
                <input
                  type="text"
                  value={config.lon}
                  onChange={(event) => setConfig((current) => ({ ...current, lon: event.target.value }))}
                  className="w-full rounded px-2 py-1.5 text-xs outline-none"
                  style={{ background: '#0a1420', border: '1px solid #1e3256', color: '#e8f4ff' }}
                  placeholder="120.19"
                />
              </div>
            </div>

            {message && (
              <p className="text-[10px]" style={{ color: message.includes('失败') || message.includes('无效') ? '#ff6b6b' : '#00ff88' }}>
                {message}
              </p>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex w-full items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              style={{
                background: 'rgba(0, 212, 255, 0.12)',
                border: '1px solid #00d4ff',
                color: '#00d4ff',
              }}
            >
              <Save size={12} />
              {saving ? '保存中...' : '保存坐标'}
            </button>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded p-1.5 text-[#3d6080] transition-colors hover:bg-[#00d4ff]/10 hover:text-[#00d4ff]"
        title="地理位置设置"
      >
        <Settings size={14} />
      </button>
      {panel}
    </div>
  )
}
