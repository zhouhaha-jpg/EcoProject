/**
 * Ask / Agent 模式切换
 */

import type { AgentMode } from '@/hooks/useAgentChat'
import { MessageCircle, Bot } from 'lucide-react'

interface AgentModeSwitchProps {
  mode: AgentMode
  onChange: (mode: AgentMode) => void
  disabled?: boolean
}

export default function AgentModeSwitch({
  mode,
  onChange,
  disabled,
}: AgentModeSwitchProps) {
  return (
    <div
      className="flex rounded border border-[#1e3256] bg-[#111b2e] p-0.5"
      role="tablist"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'ask'}
        disabled={disabled}
        onClick={() => onChange('ask')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all ${
          mode === 'ask'
            ? 'bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/40 rounded'
            : 'text-[#8ba9cc] hover:text-[#e8f4ff] border border-transparent'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}
      >
        <MessageCircle size={12} />
        Ask
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'agent'}
        disabled={disabled}
        onClick={() => onChange('agent')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all ${
          mode === 'agent'
            ? 'bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/40 rounded'
            : 'text-[#8ba9cc] hover:text-[#e8f4ff] border border-transparent'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}
      >
        <Bot size={12} />
        Agent
      </button>
    </div>
  )
}
