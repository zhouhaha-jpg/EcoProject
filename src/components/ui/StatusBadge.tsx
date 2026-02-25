type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'idle'

const variantMap: Record<BadgeVariant, { dot: string; text: string; bg: string }> = {
  success: { dot: 'bg-matrix-green', text: 'text-matrix-green', bg: 'bg-matrix-green/10' },
  warning: { dot: 'bg-neon-yellow', text: 'text-neon-yellow', bg: 'bg-neon-yellow/10' },
  error:   { dot: 'bg-neon-pink', text: 'text-neon-pink', bg: 'bg-neon-pink/10' },
  info:    { dot: 'bg-neon-cyan', text: 'text-neon-cyan', bg: 'bg-neon-cyan/10' },
  idle:    { dot: 'bg-text-muted', text: 'text-text-muted', bg: 'bg-white/5' },
}

interface StatusBadgeProps {
  variant?: BadgeVariant
  label: string
}

export default function StatusBadge({ variant = 'info', label }: StatusBadgeProps) {
  const c = variantMap[variant]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-pulse`} />
      {label}
    </span>
  )
}
