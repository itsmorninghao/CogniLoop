import { useEffect, useState } from 'react'
import { adminApi, type BroadcastHistoryItem } from '@/lib/api'
import { toast } from 'sonner'
import { Send, Trash2, Megaphone, History } from 'lucide-react'

export function AdminBroadcastTab() {
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [sending, setSending] = useState(false)
    const [history, setHistory] = useState<BroadcastHistoryItem[]>([])
    const [loadingHistory, setLoadingHistory] = useState(true)

    const loadHistory = async () => {
        try {
            const data = await adminApi.listBroadcasts()
            setHistory(data)
        } catch {
            toast.error('加载历史失败')
        } finally {
            setLoadingHistory(false)
        }
    }

    useEffect(() => { loadHistory() }, [])

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim()) return toast.error('标题不能为空')
        try {
            setSending(true)
            const res = await adminApi.broadcast(title, content || undefined)
            toast.success(`已送达 ${res.sent_count} 名用户`)
            setTitle('')
            setContent('')
            loadHistory()
        } catch {
            toast.error('发布失败')
        } finally {
            setSending(false)
        }
    }

    const handleDelete = async (id: number) => {
        if (!window.confirm('确定撤回这条通知？用户端也会同步消失。')) return
        try {
            await adminApi.deleteBroadcast(id)
            toast.success('已撤回')
            loadHistory()
        } catch {
            toast.error('撤回失败')
        }
    }

    const inputClass = "w-full bg-transparent border-0 border-b border-border px-0 py-2 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"

    return (
        <div className="animate-fade-in p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
                    <Megaphone className="size-5 text-white" />
                </div>
                <div>
                    <h2 className="text-base font-medium text-foreground">全站广播</h2>
                    <p className="text-xs text-muted-foreground">向所有用户推送系统通告</p>
                </div>
            </div>

            {/* Compose Card */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-6 py-3.5 border-b border-border">
                    <h3 className="text-sm font-medium text-foreground">编写通告</h3>
                </div>
                <form onSubmit={handleSend}>
                    <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
                        <div className="px-6 py-5 space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">
                                通告标题 <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="例如：系统维护通知、功能更新..."
                                className={inputClass}
                                maxLength={100}
                                required
                            />
                        </div>
                        <div className="px-6 py-5 space-y-1">
                            <label className="text-xs font-medium text-muted-foreground flex justify-between">
                                <span>正文详情 <span className="text-muted-foreground/50">(可选)</span></span>
                                <span>{content.length}/500</span>
                            </label>
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                placeholder="补充细节：维护时间、功能变更说明..."
                                className={`${inputClass} min-h-[80px] resize-none custom-scrollbar leading-relaxed`}
                                maxLength={500}
                            />
                        </div>
                    </div>
                    <div className="px-6 py-4 border-t border-border bg-muted/20">
                        <button
                            type="submit"
                            disabled={sending || !title.trim()}
                            className="flex items-center gap-2 bg-foreground text-background px-5 py-2 rounded-md text-sm font-medium transition-colors hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {sending ? '正在推送...' : '发布通告'}
                            {!sending && <Send className="size-3.5" />}
                        </button>
                    </div>
                </form>
            </div>

            {/* History Card */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-6 py-3.5 border-b border-border flex items-center gap-2">
                    <History className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium text-foreground">历史记录</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-muted/30 text-muted-foreground border-b border-border">
                            <tr>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">标题</th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider hidden sm:table-cell">内容</th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">到达人数</th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">发布时间</th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loadingHistory && history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">
                                        <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                                    </td>
                                </tr>
                            ) : history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground text-xs">暂无历史通告</td>
                                </tr>
                            ) : (
                                history.map(item => (
                                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-6 py-3.5 font-medium text-foreground max-w-[200px] truncate">{item.title}</td>
                                        <td className="px-6 py-3.5 text-muted-foreground text-xs max-w-[260px] truncate hidden sm:table-cell">{item.content || '-'}</td>
                                        <td className="px-6 py-3.5">
                                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{item.recipient_count} 人</span>
                                        </td>
                                        <td className="px-6 py-3.5 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</td>
                                        <td className="px-6 py-3.5 text-right">
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="text-rose-500 hover:text-rose-700 transition-colors text-xs font-medium inline-flex items-center gap-1"
                                            >
                                                <Trash2 className="size-3.5" /> 撤回
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
