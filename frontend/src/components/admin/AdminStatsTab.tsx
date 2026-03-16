import { useEffect, useState } from 'react'
import { Users, Database, BookOpen, Target, TrendingUp, Zap } from 'lucide-react'
import { adminApi, type PlatformStats } from '@/lib/api'
import { toast } from 'sonner'

export function AdminStatsTab() {
    const [stats, setStats] = useState<PlatformStats | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadStats = async () => {
            try {
                const data = await adminApi.stats()
                setStats(data)
            } catch {
                toast.error('加载统计数据失败')
            } finally {
                setLoading(false)
            }
        }
        loadStats()
    }, [])

    if (loading || !stats) {
        return (
            <div className="p-6 space-y-6 animate-pulse">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-32 rounded-xl bg-muted/50" />
                    ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="h-36 rounded-xl bg-muted/50" />
                    <div className="h-36 rounded-xl bg-muted/50" />
                </div>
            </div>
        )
    }

    const completionRate = stats.total_quiz_sessions > 0
        ? Math.round((stats.completed_sessions / stats.total_quiz_sessions) * 100)
        : 0

    const activeRate = stats.total_users > 0
        ? Math.round((stats.active_users / stats.total_users) * 100)
        : 0

    const metrics = [
        {
            title: '注册用户',
            value: stats.total_users,
            icon: Users,
            gradient: 'from-indigo-500 to-purple-600',
            shadow: 'shadow-indigo-500/25',
        },
        {
            title: '知识库',
            value: stats.total_knowledge_bases,
            icon: Database,
            gradient: 'from-emerald-500 to-green-600',
            shadow: 'shadow-emerald-500/25',
        },
        {
            title: '测验场次',
            value: stats.total_quiz_sessions,
            icon: BookOpen,
            gradient: 'from-indigo-500 to-violet-600',
            shadow: 'shadow-indigo-500/25',
        },
        {
            title: 'AI 生成题目',
            value: stats.total_questions_generated,
            icon: Target,
            gradient: 'from-purple-500 to-pink-600',
            shadow: 'shadow-purple-500/25',
        },
    ]

    return (
        <div className="animate-fade-in p-6 space-y-6">
            {/* Stat Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {metrics.map(m => {
                    const Icon = m.icon
                    return (
                        <div
                            key={m.title}
                            className="rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                        >
                            <div className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${m.gradient} shadow-lg ${m.shadow} mb-4`}>
                                <Icon className="size-5 text-white" />
                            </div>
                            <p className="text-3xl font-medium tracking-tight text-foreground">
                                {m.value.toLocaleString()}
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">{m.title}</p>
                        </div>
                    )
                })}
            </div>

            {/* Secondary Cards */}
            <div className="grid gap-4 lg:grid-cols-2">
                {/* Completion Rate */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/25">
                            <TrendingUp className="size-4 text-white" />
                        </div>
                        <p className="text-sm font-medium text-foreground">测验完成率</p>
                    </div>
                    <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-4xl font-medium tracking-tight text-foreground">{completionRate}%</span>
                        <span className="text-sm text-muted-foreground">完成</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                            className="bg-gradient-to-r from-emerald-500 to-green-400 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${completionRate}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-2.5 text-xs text-muted-foreground">
                        <span>已完成 {stats.completed_sessions.toLocaleString()} 场</span>
                        <span>共 {stats.total_quiz_sessions.toLocaleString()} 场</span>
                    </div>
                </div>

                {/* Active Users */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
                            <Zap className="size-4 text-white" />
                        </div>
                        <p className="text-sm font-medium text-foreground">近期活跃用户</p>
                    </div>
                    <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-4xl font-medium tracking-tight text-foreground">{stats.active_users.toLocaleString()}</span>
                        <span className="text-sm text-muted-foreground">人</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                            className="bg-gradient-to-r from-amber-500 to-orange-400 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${activeRate}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-2.5 text-xs text-muted-foreground">
                        <span>活跃 {stats.active_users.toLocaleString()} 人</span>
                        <span>占总用户 {activeRate}%</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
