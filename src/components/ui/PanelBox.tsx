import type { ReactNode } from 'react'

interface PanelBoxProps {
  title?: string
  children: ReactNode
  className?: string
  topColor?: string
  footer?: ReactNode
}

export default function PanelBox({ title, children, className = '', footer }: PanelBoxProps) {
  return (
    <div className={`panel min-h-0 flex flex-col ${className}`}>
      {title && <div className="panel-title-bar">{title}</div>}
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      {footer && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid #1e3256', fontSize: 11, color: '#3d6080' }}>
          {footer}
        </div>
      )}
    </div>
  )
}
