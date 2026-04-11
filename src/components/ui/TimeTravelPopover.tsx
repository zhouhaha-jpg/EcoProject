import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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
  }, [open, selectedDate])

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
            width: 288,
            background: '#111b2a',
            border: '1px solid #1e3256',
            boxShadow: '0 18px 56px rgba(0,0,0,0.72), 0 0 28px rgba(0,212,255,0.12)',
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: '#8ba9cc' }}>
              <CalendarDays size={13} className="text-[#00d4ff]" />
              时光回溯
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-[#3d6080] hover:text-[#8ba9cc]">
              <X size={13} />
            </button>
          </div>

          <div className="space-y-3">
            <div className="rounded px-3 py-2 text-[11px]" style={{ background: '#0a1420', border: '1px solid #1e3256', color: '#8ba9cc' }}>
              <div>当前展示日期: <span style={{ color: '#e8f4ff' }}>{datasetMeta.viewDate || '本地默认'}</span></div>
              <div style={{ marginTop: 4 }}>快照时间: <span style={{ color: '#e8f4ff' }}>{datasetMeta.snapshotAt || '--'}</span></div>
            </div>

            <div>
              <label className="mb-1 block text-[10px]" style={{ color: '#5a7a9a' }}>选择展示日期</label>
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
                className="flex flex-1 items-center justify-center gap-1.5 rounded py-2 text-xs font-medium transition-colors disabled:opacity-50"
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
                className="flex items-center justify-center gap-1.5 rounded px-3 py-2 text-xs transition-colors disabled:opacity-50"
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
        title="时光回溯"
      >
        <CalendarDays size={14} />
      </button>
      {panel}
    </div>
  )
}
