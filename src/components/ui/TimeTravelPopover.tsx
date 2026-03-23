import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Loader2, RotateCcw, X } from 'lucide-react'
import { useStrategy } from '@/context/StrategyContext'

const API_BASE = ''

export default function TimeTravelPopover() {
  const { datasetMeta, loadDisplayDataset, loadLatestDataset } = useStrategy()
  const [open, setOpen] = useState(false)
  const [dates, setDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [loadingDates, setLoadingDates] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelectedDate(datasetMeta.viewDate || '')
  }, [datasetMeta.viewDate])

  useEffect(() => {
    if (!open) return
    setLoadingDates(true)
    setMessage('')
    fetch(`${API_BASE}/api/realtime/dates`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(await res.text() || `HTTP ${res.status}`)
        }
        const text = await res.text()
        return text ? JSON.parse(text) : []
      })
      .then((data) => {
        const nextDates = Array.isArray(data) ? data : []
        setDates(nextDates)
        if (!selectedDate && nextDates.length > 0) {
          setSelectedDate(nextDates[0])
        }
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setLoadingDates(false))
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleApply = async () => {
    if (!selectedDate) return
    setSubmitting(true)
    setMessage('')
    try {
      await loadDisplayDataset(selectedDate)
      setOpen(false)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleBackToLatest = async () => {
    setSubmitting(true)
    setMessage('')
    try {
      await loadLatestDataset()
      setOpen(false)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="p-1.5 rounded transition-colors text-[#3d6080] hover:text-[#00d4ff] hover:bg-[#00d4ff]/10"
        title="时光回溯"
      >
        <CalendarDays size={14} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-8 z-50 rounded-lg p-4 w-72 shadow-lg"
          style={{
            background: '#111b2a',
            border: '1px solid #1e3256',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: '#8ba9cc' }}>
              <CalendarDays size={13} className="text-[#00d4ff]" />
              时光回溯
            </div>
            <button onClick={() => setOpen(false)} className="text-[#3d6080] hover:text-[#8ba9cc]">
              <X size={13} />
            </button>
          </div>

          <div className="space-y-3">
            <div className="rounded px-3 py-2 text-[11px]" style={{ background: '#0a1420', border: '1px solid #1e3256', color: '#8ba9cc' }}>
              <div>当前展示日期: <span style={{ color: '#e8f4ff' }}>{datasetMeta.viewDate || '本地默认'}</span></div>
              <div style={{ marginTop: 4 }}>快照时间: <span style={{ color: '#e8f4ff' }}>{datasetMeta.snapshotAt || '--'}</span></div>
            </div>

            <div>
              <label className="block text-[10px] mb-1" style={{ color: '#5a7a9a' }}>选择展示日期</label>
              <select
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="w-full rounded px-2 py-2 text-xs outline-none"
                style={{ background: '#0a1420', border: '1px solid #1e3256', color: '#e8f4ff' }}
                disabled={loadingDates || submitting}
              >
                {dates.length === 0 && <option value="">暂无可回溯日期</option>}
                {dates.map((date) => (
                  <option key={date} value={date}>{date}</option>
                ))}
              </select>
            </div>

            {message && (
              <div className="text-[10px]" style={{ color: '#ff8a65' }}>{message}</div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleApply}
                disabled={!selectedDate || submitting || loadingDates}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded font-medium transition-colors disabled:opacity-50"
                style={{
                  background: 'rgba(0, 212, 255, 0.12)',
                  border: '1px solid #00d4ff',
                  color: '#00d4ff',
                }}
              >
                {submitting ? <Loader2 size={12} className="animate-spin" /> : <CalendarDays size={12} />}
                应用日期
              </button>
              <button
                type="button"
                onClick={handleBackToLatest}
                disabled={submitting}
                className="flex items-center justify-center gap-1.5 px-3 text-xs py-2 rounded transition-colors disabled:opacity-50"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid #334',
                  color: '#8ba9cc',
                }}
              >
                <RotateCcw size={12} />
                最新
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
