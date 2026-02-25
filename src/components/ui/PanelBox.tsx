import type { ReactNode } from 'react'

interface PanelBoxProps {
  title?: string
  children: ReactNode
  className?: string
  topColor?: string
  footer?: ReactNode
}

export default function PanelBox({ title, children, className = '', topColor = '#00F3FF', footer }: PanelBoxProps) {
  return (
    <div
      className={`panel-cyber relative flex flex-col bg-cyber-panel border border-border-cyber overflow-hidden ${className}`}
      style={{
        '--panel-top-color': topColor,
        boxShadow: `inset 0 1px 0 ${topColor}22, 0 0 0 1px ${topColor}10`,
      } as React.CSSProperties}
    >
      {title && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border-cyber bg-cyber-panel/65">
          <span className="w-1.5 h-4 rounded-sm" style={{ backgroundColor: topColor, boxShadow: `0 0 8px ${topColor}66` }} />
          <span className="font-display text-[11px] tracking-[0.14em] uppercase text-text-primary">{title}</span>
          <span className="ml-auto w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: topColor, boxShadow: `0 0 8px ${topColor}88` }} />
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden p-4">{children}</div>
      {footer && (
        <div className="px-4 py-2 border-t border-border-cyber text-xs text-text-muted">{footer}</div>
      )}
    </div>
  )
}
