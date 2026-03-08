import type { ServerLogEntry, ServerLogLevel } from '@/types'

interface SystemLogProps {
  logs?: ServerLogEntry[]
  maxItems?: number
  compact?: boolean
}

type LevelStyle = {
  dot: string
  tag: string
  line: string
}

const levelStyles: Record<ServerLogLevel, LevelStyle> = {
  info: {
    dot: 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)]',
    tag: 'text-cyan-300 border-cyan-400/40 bg-cyan-400/10',
    line: 'border-cyan-400/20',
  },
  warn: {
    dot: 'bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.9)]',
    tag: 'text-amber-200 border-amber-300/40 bg-amber-300/10',
    line: 'border-amber-300/20',
  },
  ok: {
    dot: 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]',
    tag: 'text-emerald-200 border-emerald-300/40 bg-emerald-300/10',
    line: 'border-emerald-300/20',
  },
  err: {
    dot: 'bg-fuchsia-400 shadow-[0_0_12px_rgba(232,121,249,0.95)]',
    tag: 'text-fuchsia-200 border-fuchsia-400/40 bg-fuchsia-400/10',
    line: 'border-fuchsia-400/20',
  },
}

const fallbackLogs: ServerLogEntry[] = [
  {
    id: 'fallback-1',
    time: '--',
    level: 'info',
    status: 'info',
    scope: 'system',
    message: '等待后端日志流接入',
    detail: '打开右上角日志面板后，新的后端动作会实时显示在这里',
  },
]

function getStatusLabel(status: string) {
  switch (status) {
    case 'start':
      return 'START'
    case 'progress':
      return 'RUN'
    case 'done':
      return 'DONE'
    case 'error':
      return 'ERR'
    default:
      return 'INFO'
  }
}

export default function SystemLog({ logs = fallbackLogs, maxItems = 40, compact = false }: SystemLogProps) {
  const visibleLogs = logs.slice(0, maxItems)
  const latest = visibleLogs[0]

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && latest ? (
        <div className="mb-3 rounded-sm border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(0,212,255,0.12),rgba(7,12,20,0.92))] px-3 py-2 shadow-[0_0_24px_rgba(0,212,255,0.12)]">
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300/85">
            <span>Engine Feed</span>
            <span>{latest.time}</span>
          </div>
          <div className="mt-2 text-sm text-slate-100">{latest.message}</div>
          {latest.detail ? <div className="mt-1 text-xs text-slate-400">{latest.detail}</div> : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <div className="space-y-2 font-mono text-xs">
          {visibleLogs.map((log) => {
            const style = levelStyles[log.level] || levelStyles.info
            return (
              <div
                key={log.id}
                className={`rounded-sm border bg-[rgba(10,18,32,0.9)] px-3 py-3 shadow-[0_0_18px_rgba(0,212,255,0.06)] ${style.line}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="text-slate-500">{log.time}</span>
                      <span className={`rounded-sm border px-1.5 py-0.5 tracking-[0.12em] ${style.tag}`}>
                        {getStatusLabel(log.status)}
                      </span>
                      <span className="uppercase tracking-[0.08em] text-slate-400">{log.scope}</span>
                    </div>

                    <div className="mt-2 break-words text-[14px] leading-6 text-slate-100">
                      {log.message}
                    </div>

                    {log.detail ? (
                      <div className="mt-2 break-words text-[12px] leading-6 text-slate-400">
                        {log.detail}
                      </div>
                    ) : null}

                    {(log.targetDate || log.range || log.algorithm) ? (
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                        {log.targetDate ? (
                          <span className="rounded-sm border border-cyan-400/15 bg-cyan-400/5 px-2 py-1">
                            {log.targetDate}
                          </span>
                        ) : null}
                        {log.range ? (
                          <span className="rounded-sm border border-cyan-400/15 bg-cyan-400/5 px-2 py-1">
                            {log.range}
                          </span>
                        ) : null}
                        {log.algorithm ? (
                          <span className="rounded-sm border border-cyan-400/15 bg-cyan-400/5 px-2 py-1">
                            {log.algorithm}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}

          {!visibleLogs.length ? (
            <div className="rounded-sm border border-cyan-400/20 bg-cyan-400/5 px-3 py-6 text-center font-mono text-xs tracking-[0.12em] text-slate-500">
              NO BACKEND LOGS
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
