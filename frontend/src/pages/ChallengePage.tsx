/**
 * ChallengePage — view received and sent challenges.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Sword, Inbox, Send, Clock, CheckCircle, Loader, XCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { challengeApi, type QuizSessionListItem } from '@/lib/api'

type TabType = 'received' | 'sent'

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
    generating: { label: '生成中', icon: Loader, color: 'text-indigo-500' },
    ready: { label: '待答题', icon: AlertCircle, color: 'text-amber-500' },
    in_progress: { label: '答题中', icon: Clock, color: 'text-orange-500' },
    grading: { label: '批改中', icon: Loader, color: 'text-indigo-500' },
    graded: { label: '已完成', icon: CheckCircle, color: 'text-emerald-500' },
    error: { label: '出错', icon: XCircle, color: 'text-red-500' },
}

function ChallengeCard({
    session,
    role,
    onAction,
}: {
    session: QuizSessionListItem
    role: 'solver' | 'creator'
    onAction: (id: string, status: string) => void
}) {
    const status = STATUS_CONFIG[session.status] ?? {
        label: session.status,
        icon: Clock,
        color: 'text-muted-foreground',
    }
    const StatusIcon = status.icon

    return (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition hover:border-primary/30 hover:shadow-sm">
            <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                    <Sword className="size-5 text-primary" />
                </div>
                <div>
                    <p className="font-medium text-foreground">
                        {session.title || (role === 'solver' ? '收到的挑战' : '发出的挑战')}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(session.created_at).toLocaleString('zh-CN', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                        {session.accuracy !== null && (
                            <span className="ml-2 text-emerald-600">
                                正确率 {(session.accuracy * 100).toFixed(0)}%
                            </span>
                        )}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <span className={`flex items-center gap-1 text-sm ${status.color}`}>
                    <StatusIcon className="size-4" />
                    {status.label}
                </span>
                {role === 'solver' && (session.status === 'ready' || session.status === 'in_progress') && (
                    <button
                        onClick={() => onAction(session.id, session.status)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 hover:scale-105 active:scale-95"
                    >
                        {session.status === 'ready' ? '开始答题' : '继续答题'}
                    </button>
                )}
                {session.status === 'graded' && (
                    <button
                        onClick={() => onAction(session.id, session.status)}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                        查看结果
                    </button>
                )}
            </div>
        </div>
    )
}

function EmptyState({ tab }: { tab: TabType }) {
    const navigate = useNavigate()
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
            <Sword className="mb-4 size-12 text-muted-foreground/40" />
            <p className="text-base font-medium text-foreground">
                {tab === 'received' ? '暂无收到的挑战' : '还没有发出过挑战'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
                {tab === 'received'
                    ? '当其他用户向你发起挑战时，会在这里显示'
                    : '在出题中心选择"挑战他人"模式，向朋友发起挑战'}
            </p>
            {tab === 'sent' && (
                <button
                    onClick={() => navigate('/quiz/create-smart')}
                    className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 hover:scale-105 active:scale-95"
                >
                    去出题挑战
                </button>
            )}
        </div>
    )
}

export default function ChallengePage() {
    const [activeTab, setActiveTab] = useState<TabType>('received')
    const [received, setReceived] = useState<QuizSessionListItem[]>([])
    const [sent, setSent] = useState<QuizSessionListItem[]>([])
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setLoading(true)
        try {
            const [r, s] = await Promise.all([
                challengeApi.listReceived(),
                challengeApi.listSent(),
            ])
            setReceived(r)
            setSent(s)
        } catch {
            toast.error('加载挑战列表失败')
        } finally {
            setLoading(false)
        }
    }

    const handleAction = (id: string, status: string) => {
        if (status === 'graded') {
            navigate(`/quiz/${id}/result`)
        } else {
            navigate(`/quiz/${id}`)
        }
    }

    const tabs: { key: TabType; label: string; icon: typeof Inbox; count: number }[] = [
        { key: 'received', label: '收到的挑战', icon: Inbox, count: received.length },
        { key: 'sent', label: '发出的挑战', icon: Send, count: sent.length },
    ]

    const items = activeTab === 'received' ? received : sent

    return (
        <div className="container mx-auto space-y-6 p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-foreground">我的挑战</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        管理你收到和发出的知识挑战
                    </p>
                </div>
                <button
                    onClick={() => navigate('/quiz/create-smart')}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 hover:scale-105 active:scale-95"
                >
                    <Sword className="size-4" />
                    发起挑战
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1">
                {tabs.map((tab) => {
                    const Icon = tab.icon
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                                activeTab === tab.key
                                    ? 'bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Icon className="size-4" />
                            {tab.label}
                            {tab.count > 0 && (
                                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
            ) : items.length === 0 ? (
                <EmptyState tab={activeTab} />
            ) : (
                <div className="space-y-3">
                    {items.map((session) => (
                        <ChallengeCard
                            key={session.id}
                            session={session}
                            role={activeTab === 'received' ? 'solver' : 'creator'}
                            onAction={handleAction}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
