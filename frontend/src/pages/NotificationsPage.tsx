/**
 * Notifications page — list + mark read + mark all read.
 */

import { useEffect, useState } from 'react'
import { Bell, CheckCheck, Info, Zap, Users, Bot, Megaphone } from 'lucide-react'
import { toast } from 'sonner'
import { notificationApi, type Notification } from '@/lib/api'
import { useAsync } from '@/hooks/useAsync'

const TYPE_ICONS: Record<string, typeof Bell> = {
    system: Megaphone,
    challenge_received: Zap,
    challenge_result: Zap,
    circle_quiz: Users,
    ai_suggestion: Bot,
    kb_acquired: Info,
}

const TYPE_COLORS: Record<string, string> = {
    system: 'from-indigo-500 to-purple-500',
    challenge_received: 'from-orange-500 to-red-500',
    challenge_result: 'from-emerald-500 to-green-500',
    circle_quiz: 'from-violet-500 to-purple-500',
    ai_suggestion: 'from-cyan-500 to-teal-500',
    kb_acquired: 'from-amber-500 to-yellow-500',
}

export default function NotificationsPage() {
    const [filter, setFilter] = useState<'all' | 'unread'>('all')
    const { data, loading } = useAsync(() => notificationApi.list(filter === 'unread'), [filter])
    const [notifications, setNotifications] = useState<Notification[]>([])

    useEffect(() => { if (data) setNotifications(data) }, [data])

    const handleMarkRead = async (id: number) => {
        try {
            await notificationApi.markRead(id)
            setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
            )
        } catch {
            toast.error('操作失败')
        }
    }

    const handleMarkAllRead = async () => {
        try {
            await notificationApi.markAllRead()
            setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
            toast.success('已全部标记为已读')
        } catch {
            toast.error('操作失败')
        }
    }

    const unreadCount = notifications.filter((n) => !n.is_read).length

    return (
        <div className="container mx-auto space-y-6 p-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-foreground">通知中心</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {unreadCount > 0 ? `${unreadCount} 条未读通知` : '暂无未读通知'}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex rounded-lg border border-border bg-card overflow-hidden">
                        <button
                            onClick={() => setFilter('all')}
                            className={`px-4 py-2 text-sm font-medium transition ${filter === 'all' ? 'bg-primary text-white' : 'text-foreground hover:bg-muted'}`}
                        >
                            全部
                        </button>
                        <button
                            onClick={() => setFilter('unread')}
                            className={`px-4 py-2 text-sm font-medium transition ${filter === 'unread' ? 'bg-primary text-white' : 'text-foreground hover:bg-muted'}`}
                        >
                            未读
                        </button>
                    </div>
                    {unreadCount > 0 && (
                        <button
                            onClick={handleMarkAllRead}
                            className="flex items-center gap-2 rounded-lg bg-card px-4 py-2 text-sm font-medium text-foreground border border-border hover:bg-muted transition"
                        >
                            <CheckCheck className="size-4" />
                            全部已读
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
            ) : notifications.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card py-20 text-center">
                    <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30">
                        <Bell className="size-8 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                        {filter === 'unread' ? '没有未读通知' : '暂无通知'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {notifications.map((n) => {
                        const Icon = TYPE_ICONS[n.type] || Bell
                        const colorClass = TYPE_COLORS[n.type] || 'from-gray-400 to-gray-500'
                        return (
                            <div
                                key={n.id}
                                onClick={() => !n.is_read && handleMarkRead(n.id)}
                                className={`flex items-start gap-4 rounded-xl border p-4 transition cursor-pointer ${n.is_read ? 'border-border bg-card opacity-60' : 'border-primary/20 bg-card hover:bg-muted'}`}
                            >
                                <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${colorClass}`}>
                                    <Icon className="size-5 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-sm font-medium text-foreground">{n.title}</h4>
                                        {!n.is_read && (
                                            <span className="size-2 rounded-full bg-primary shrink-0" />
                                        )}
                                    </div>
                                    {n.content && (
                                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{n.content}</p>
                                    )}
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        {new Date(n.created_at).toLocaleString('zh-CN')}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
