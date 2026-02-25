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
      style={{ '--panel-top-color': topColor } as React.CSSProperties}
    >
      {title && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border-cyber">
          <span className="w-1.5 h-4 rounded-sm" style={{ backgroundColor: topColor }} />
          <span className="font-display text-xs tracking-widest uppercase text-text-primary">{title}</span>
          <span className="ml-auto w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: topColor }} />
        </div>
      )}
      <div className="flex-1 min-h-0 p-4">{children}</div>
      {footer && (
        <div className="px-4 py-2 border-t border-border-cyber text-xs text-text-muted">{footer}</div>
      )}
    </div>
  )
}
