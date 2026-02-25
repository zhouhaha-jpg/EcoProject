import { useState, useEffect } from 'react'

type LogLevel = 'info' | 'warn' | 'ok' | 'err'

interface LogEntry {
  id: number
  time: string
  level: LogLevel
  msg: string
}

const levelColor: Record<LogLevel, string> = {
  info: 'text-neon-cyan',
  warn: 'text-neon-yellow',
  ok:   'text-matrix-green',
  err:  'text-neon-pink',
}

const levelTag: Record<LogLevel, string> = {
  info: '[INFO]',
  warn: '[WARN]',
  ok:   '[ OK ]',
  err:  '[ERR ]',
}

const MOCK_LOGS: Array<{ level: LogLevel; msg: string }> = [
  { level: 'ok',   msg: 'Chlor-alkali electrolyzer online — P=9020 kW' },
  { level: 'info', msg: 'PV forecast updated: peak at 12:00' },
  { level: 'ok',   msg: 'PEM stack H₂ production: 187 kg/h' },
  { level: 'info', msg: 'Grid carbon factor: 0.000512 tCO₂/kWh' },
  { level: 'warn', msg: 'Hydrogen storage > 85%: reducing PEM load' },
  { level: 'ok',   msg: 'Gas turbine idle — grid supply sufficient' },
  { level: 'info', msg: 'Strategy optimisation cycle completed' },
  { level: 'ok',   msg: 'Battery SOC: 72% — nominal' },
  { level: 'info', msg: 'Cost forecast: ¥183,210 for next 24 h' },
  { level: 'warn', msg: 'Carbon quota margin: 12% remaining today' },
]

let logId = 0
function makeLog(entry: { level: LogLevel; msg: string }): LogEntry {
  const now = new Date()
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
  return { id: logId++, time, level: entry.level, msg: entry.msg }
}

export default function SystemLog() {
  const [logs, setLogs] = useState<LogEntry[]>(() =>
    MOCK_LOGS.slice(0, 5).map(makeLog)
  )

  useEffect(() => {
    const interval = setInterval(() => {
      const next = MOCK_LOGS[Math.floor(Math.random() * MOCK_LOGS.length)]
      setLogs(prev => [makeLog(next), ...prev].slice(0, 20))
    }, 3500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="h-full max-h-full min-h-0 overflow-y-auto overflow-x-hidden pr-1 space-y-1 font-mono text-xs">
      {logs.map(log => (
        <div key={log.id} className="flex items-center gap-2 opacity-90 animate-fade-in-up min-w-0">
          <span className="text-text-muted shrink-0">{log.time}</span>
          <span className={`shrink-0 ${levelColor[log.level]}`}>{levelTag[log.level]}</span>
          <span className="text-text-secondary flex-1 min-w-0 truncate block">{log.msg}</span>
        </div>
      ))}
    </div>
  )
}
