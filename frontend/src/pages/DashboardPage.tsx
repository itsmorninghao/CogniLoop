/**
 * Dashboard — real data: profile stats, recent quizzes, activity feed.
 */

import { Link } from 'react-router'
import {
    Sparkles, BookOpen, PenTool, Target, Users, TrendingUp,
    Flame, ArrowRight,
} from 'lucide-react'
import { profileApi, quizApi, kbApi, circleApi, type UserProfile, type QuizSessionListItem } from '@/lib/api'
import { TrajectoryBar } from '@/components/shared/TrajectoryBar'
import { QuizStatusBadge } from '@/components/shared/QuizStatusBadge'
import { useAsync } from '@/hooks/useAsync'

/* ── Dashboard Page ───────────────────────── */
export default function DashboardPage() {
    const { data: profile } = useAsync<UserProfile>(() => profileApi.getMyProfile(), [])
    const { data: recentQuizzes } = useAsync<QuizSessionListItem[]>(() => quizApi.list(5), [])
    const { data: kbs } = useAsync(() => kbApi.list(), [])
    const { data: circles } = useAsync(() => circleApi.list(), [])

    const kbCount = kbs?.length ?? 0
    const circleCount = circles?.length ?? 0
    const totalAnswered = profile?.total_questions_answered ?? 0
    const accuracy = profile?.overall_accuracy ?? 0
    const trajectory = profile?.learning_trajectory ?? []

    const getGreeting = () => {
        const h = new Date().getHours()
        if (h < 12) return '早上好'
        if (h < 18) return '下午好'
        return '晚上好'
    }

    return (
        <div className="container mx-auto space-y-6 p-6 animate-fade-in">
            {/* AI Greeting Banner */}
            <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-6 shadow-sm dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-pink-950/10">
                <div className="relative z-10 flex items-start gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
                        <Sparkles className="size-6 text-white" />
                    </div>
                    <div className="flex-1">
                        <h2 className="mb-2 text-foreground">{getGreeting()}</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            {totalAnswered > 0
                                ? `你已完成 ${totalAnswered} 道题目，正确率 ${(accuracy * 100).toFixed(0)}%。继续加油！`
                                : '欢迎来到 CogniLoop，你的 AI 驱动学习伙伴。创建知识库、生成智能测验，开启你的学习之旅。'}
                        </p>
                        {totalAnswered === 0 && (
                            <div className="mt-3 flex gap-2">
                                <Link to="/knowledge" className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition">
                                    创建知识库 →
                                </Link>
                                <Link to="/quiz/create-smart" className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition">
                                    开始出题 →
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
                <div className="absolute -right-16 -top-16 size-64 rounded-full bg-gradient-to-br from-indigo-400/20 to-purple-400/20 blur-3xl" />
                <div className="absolute -bottom-8 -left-8 size-40 rounded-full bg-gradient-to-br from-pink-400/15 to-purple-400/10 blur-2xl" />
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 stagger-children">
                <StatCard icon={BookOpen} label="知识库" value={String(kbCount)} gradient="from-blue-500 to-cyan-500" />
                <StatCard icon={PenTool} label="已做题目" value={String(totalAnswered)} gradient="from-purple-500 to-pink-500" />
                <StatCard icon={Target} label="总体正确率" value={totalAnswered > 0 ? `${(accuracy * 100).toFixed(0)}%` : '—'} gradient="from-emerald-500 to-green-500" />
                <StatCard icon={Users} label="学习圈" value={String(circleCount)} gradient="from-pink-500 to-rose-500" />
            </div>

            {/* Two-column */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Recent quizzes */}
                <div className="rounded-xl border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border p-6">
                        <div>
                            <h3 className="text-foreground font-semibold">近期测验</h3>
                            <p className="mt-1 text-sm text-muted-foreground">最近的学习记录</p>
                        </div>
                        <Link to="/quiz" className="flex items-center gap-1 text-sm text-primary hover:underline">
                            查看全部 <ArrowRight className="size-3" />
                        </Link>
                    </div>
                    <div className="p-4">
                        {!recentQuizzes || recentQuizzes.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30">
                                    <Flame className="size-6 text-primary" />
                                </div>
                                <p className="text-sm font-medium text-foreground">还没有测验记录</p>
                                <p className="mt-1 text-sm text-muted-foreground">创建测验开始你的学习之旅</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {recentQuizzes.map((q) => (
                                    <Link
                                        key={q.id}
                                        to={q.status === 'graded' ? `/quiz/${q.id}/result` : `/quiz/${q.id}`}
                                        className="flex items-center gap-3 rounded-lg border border-border p-3 transition hover:bg-muted"
                                    >
                                        <div className={`flex size-9 items-center justify-center rounded-lg ${q.status === 'graded' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                            : q.status === 'error' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                                : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                            }`}>
                                            <PenTool className="size-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{q.title || '未命名测验'}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(q.created_at).toLocaleDateString('zh-CN')}
                                                {q.accuracy != null && ` · 正确率 ${(q.accuracy * 100).toFixed(0)}%`}
                                            </p>
                                        </div>
                                        <QuizStatusBadge status={q.status} />
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Learning trajectory */}
                <div className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border p-6">
                        <h3 className="text-foreground font-semibold">学习趋势</h3>
                        <p className="mt-1 text-sm text-muted-foreground">最近测验正确率变化</p>
                    </div>
                    <div className="p-6">
                        {trajectory.length > 1 ? (
                            <div>
                                <TrajectoryBar trajectory={trajectory} />
                                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                                    <span>{trajectory[0]?.date}</span>
                                    <span>{trajectory[trajectory.length - 1]?.date}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30">
                                    <TrendingUp className="size-6 text-primary" />
                                </div>
                                <p className="text-sm font-medium text-foreground">数据不足</p>
                                <p className="mt-1 text-sm text-muted-foreground">完成多次测验后，趋势图将展示在这里</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ── Sub Components ───────────────────────── */

function StatCard({ icon: Icon, label, value, gradient }: { icon: React.ElementType; label: string; value: string; gradient: string }) {
    return (
        <div className="group rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
            <div className="flex items-center justify-between">
                <div className="flex-1">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
                </div>
                <div className={`flex size-12 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-lg transition-transform duration-200 group-hover:scale-110`}>
                    <Icon className="size-6 text-white" />
                </div>
            </div>
        </div>
    )
}
