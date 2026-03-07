/**
 * 园区坐标配置弹窗
 * 用于前端设置/修改园区经纬度，影响 Open-Meteo 气象查询和碳因子建模
 */

import { useState, useEffect, useRef } from 'react'
import { Settings, Save, X, MapPin } from 'lucide-react'

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
  const [msg, setMsg] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    fetch(`${API_BASE}/api/realtime/config`)
      .then(r => r.json())
      .then(data => {
        if (data.lat) setConfig({ lat: data.lat, lon: data.lon, park_name: data.park_name || '' })
      })
      .catch(() => {})
  }, [open])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSave = async () => {
    const lat = parseFloat(config.lat)
    const lon = parseFloat(config.lon)
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setMsg('坐标无效')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch(`${API_BASE}/api/realtime/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) throw new Error(await res.text())
      setMsg('✓ 已保存')
      setTimeout(() => setOpen(false), 800)
    } catch (e) {
      setMsg(`保存失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="p-1.5 rounded transition-colors text-[#3d6080] hover:text-[#00d4ff] hover:bg-[#00d4ff]/10"
        title="园区坐标配置"
      >
        <Settings size={14} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-8 z-50 rounded-lg p-4 w-64 shadow-lg"
          style={{
            background: '#111b2a',
            border: '1px solid #1e3256',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#8ba9cc' }}>
              <MapPin size={13} className="text-[#00d4ff]" />
              园区坐标配置
            </div>
            <button onClick={() => setOpen(false)} className="text-[#3d6080] hover:text-[#8ba9cc]">
              <X size={13} />
            </button>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="block text-[10px] mb-1" style={{ color: '#5a7a9a' }}>园区名称</label>
              <input
                type="text"
                value={config.park_name}
                onChange={e => setConfig(c => ({ ...c, park_name: e.target.value }))}
                className="w-full rounded px-2 py-1.5 text-xs outline-none"
                style={{ background: '#0a1420', border: '1px solid #1e3256', color: '#e8f4ff' }}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] mb-1" style={{ color: '#5a7a9a' }}>纬度 (°N)</label>
                <input
                  type="text"
                  value={config.lat}
                  onChange={e => setConfig(c => ({ ...c, lat: e.target.value }))}
                  className="w-full rounded px-2 py-1.5 text-xs outline-none"
                  style={{ background: '#0a1420', border: '1px solid #1e3256', color: '#e8f4ff' }}
                  placeholder="30.26"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] mb-1" style={{ color: '#5a7a9a' }}>经度 (°E)</label>
                <input
                  type="text"
                  value={config.lon}
                  onChange={e => setConfig(c => ({ ...c, lon: e.target.value }))}
                  className="w-full rounded px-2 py-1.5 text-xs outline-none"
                  style={{ background: '#0a1420', border: '1px solid #1e3256', color: '#e8f4ff' }}
                  placeholder="120.19"
                />
              </div>
            </div>
            {msg && (
              <p className="text-[10px]" style={{ color: msg.startsWith('✓') ? '#00ff88' : '#ff6b6b' }}>{msg}</p>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded font-medium transition-colors disabled:opacity-50"
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
        </div>
      )}
    </div>
  )
}
