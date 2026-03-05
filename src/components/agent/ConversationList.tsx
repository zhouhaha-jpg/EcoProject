/**
 * 历史对话列表：展示、选择、新建、删除
 */
import { useCallback } from 'react'
import type { ConversationItem } from '@/lib/api'
import { MessageSquarePlus, Trash2, MessageCircle } from 'lucide-react'

interface ConversationListProps {
  list: ConversationItem[]
  currentId: number | null
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number) => void
  loading?: boolean
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function ConversationList({
  list,
  currentId,
  onSelect,
  onNew,
  onDelete,
  loading,
}: ConversationListProps) {
  const handleDelete = useCallback(
    (e: React.MouseEvent, id: number) => {
      e.stopPropagation()
      onDelete(id)
    },
    [onDelete]
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      <button
        type="button"
        onClick={onNew}
        className="shrink-0 flex items-center gap-2 px-3 py-2 mx-2 mt-2 rounded border border-dashed border-[#1e3256] text-[#3d6080] hover:border-[#00d4ff]/50 hover:text-[#00d4ff] transition-colors text-xs"
      >
        <MessageSquarePlus size={14} />
        新对话
      </button>

      <div className="flex-1 overflow-y-auto mt-2 px-2 space-y-0.5 min-h-0">
        {loading && list.length === 0 ? (
          <div className="py-4 text-center text-[#3d6080] text-xs">加载中…</div>
        ) : list.length === 0 ? (
          <div className="py-4 text-center text-[#3d6080] text-xs">暂无历史对话</div>
        ) : (
          list.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(c.id)}
              className={`group flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-colors ${
                currentId === c.id ? 'bg-[#00d4ff]/15 text-[#00d4ff]' : 'text-[#8ba9cc] hover:bg-[#1e3256]'
              }`}
            >
              <MessageCircle size={12} className="shrink-0 opacity-70" />
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs font-medium">{c.title || '新对话'}</div>
                <div className="text-[10px] text-[#3d6080] mt-0.5">{formatTime(c.updated_at)}</div>
              </div>
              <button
                type="button"
                onClick={(e) => handleDelete(e, c.id)}
                className="shrink-0 p-1 rounded text-[#3d6080] opacity-0 group-hover:opacity-100 hover:text-[#ff7043] transition-all"
                title="删除"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
