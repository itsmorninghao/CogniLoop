/**
 * UserProfileViewPage — view another user's public learning profile.
 */

import { useParams, useNavigate } from 'react-router'
import { Award, Target, BarChart3, Brain, Activity, BookOpen, ArrowLeft, Sparkles } from 'lucide-react'
import { ApiError, profileApi, type UserProfile } from '@/lib/api'
import { useAsync } from '@/hooks/useAsync'

const LEVEL_LABELS: Record<string, string> = {
    beginner: '入门',
    intermediate: '进阶',
    advanced: '精通',
}

const LEVEL_COLORS: Record<string, string> = {
    beginner: 'from-blue-400 to-cyan-400',
    intermediate: 'from-violet-500 to-purple-500',
    advanced: 'from-amber-500 to-orange-500',
}

const DIFFICULTY_LABELS: Record<string, string> = {
    easy: '简单',
    medium: '中等',
    hard: '困难',
}

export default function UserProfileViewPage() {
    const { userId } = useParams<{ userId: string }>()
    const navigate = useNavigate()
    const { data: profile, loading } = useAsync<UserProfile | null>(
        () => profileApi.getUserProfile(Number(userId)).catch(err => {
            if (err instanceof ApiError && err.status === 403) return null
            throw err
        }),
        [userId]
    )

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        )
    }

    if (!loading && !profile) {
        return (
            <div className="container mx-auto max-w-lg p-6 animate-fade-in">
                <button onClick={() => navigate(-1)} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
                    <ArrowLeft className="size-4" />
                    返回
                </button>
                <div className="rounded-xl border border-border bg-card p-12 text-center">
                    <div className="mb-4 flex size-16 mx-auto items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/50">
                        <Award className="size-8 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground">该用户暂未公开学习画像</p>
                    <p className="mt-2 text-sm text-muted-foreground">用户 #{userId} 尚未开启画像分享</p>
                </div>
            </div>
        )
    }

    if (!profile) return null

    const domainProfiles = profile.domain_profiles ?? {}
    const trajectory = profile.learning_trajectory ?? []
    const totalAnswered = profile.total_questions_answered ?? 0
    const accuracy = profile.overall_accuracy ?? 0
    const level = profile.overall_level ?? 'beginner'
    const kpProfiles = profile.knowledge_point_profiles ?? {}
    const insightSummary = profile.insight_summary ?? ''
    const domainEntries = Object.entries(domainProfiles).sort((a, b) => b[1].question_count - a[1].question_count)
    const kpCoverageCount = Object.keys(kpProfiles).length

    // Knowledge points sorted by accuracy ascending (weakest first), show only accuracy numbers (no weakness details)
    const kpEntries = Object.entries(kpProfiles)
        .filter(([, stats]) => stats.attempts >= 1)
        .sort((a, b) => a[1].accuracy - b[1].accuracy)
        .slice(0, 8)

    return (
        <div className="container mx-auto space-y-6 p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="flex size-9 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent">
                    <ArrowLeft className="size-4" />
                </button>
                <div>
                    <h1 className="text-foreground">用户 #{userId} 的学习画像</h1>
                    <p className="mt-1 text-sm text-muted-foreground">公开学习数据，仅供参考</p>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex items-center gap-3">
                        <div className={`flex size-10 items-center justify-center rounded-lg bg-gradient-to-br ${LEVEL_COLORS[level]}`}>
                            <Award className="size-5 text-white" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-foreground">{LEVEL_LABELS[level]}</p>
                            <p className="text-sm text-muted-foreground">总体水平</p>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-500">
                            <Target className="size-5 text-white" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-foreground">{totalAnswered}</p>
                            <p className="text-sm text-muted-foreground">已做题目</p>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
                            <BarChart3 className="size-5 text-white" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-foreground">
                                {totalAnswered > 0 ? `${(accuracy * 100).toFixed(0)}%` : '—'}
                            </p>
                            <p className="text-sm text-muted-foreground">总体正确率</p>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
                            <Brain className="size-5 text-white" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-foreground">{kpCoverageCount}</p>
                            <p className="text-sm text-muted-foreground">知识点覆盖</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI insight summary */}
            {insightSummary && (
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="size-4 text-primary" />
                        <span className="text-sm font-semibold text-foreground">AI 学习洞察</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{insightSummary}</p>
                </div>
            )}

            {/* Knowledge point accuracy (no weakness details in public view) */}
            {kpEntries.length > 0 && (
                <div className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border p-6">
                        <h3 className="text-foreground font-semibold">知识点掌握情况</h3>
                        <p className="mt-1 text-sm text-muted-foreground">正确率排名（从低到高）</p>
                    </div>
                    <div className="p-6 space-y-3">
                        {kpEntries.map(([name, stats]) => {
                            const acc = stats.accuracy * 100
                            return (
                                <div key={name} className="space-y-1.5">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium text-foreground">{name}</span>
                                        <span className="text-muted-foreground text-xs">{stats.attempts} 题 · {acc.toFixed(0)}%</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${acc >= 80 ? 'bg-emerald-500' : acc >= 60 ? 'bg-amber-500' : 'bg-red-400'}`}
                                            style={{ width: `${Math.max(acc, 3)}%` }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Domain profiles */}
            {domainEntries.length > 0 && (
                <div className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border p-6">
                        <div className="flex items-center gap-2">
                            <BookOpen className="size-5 text-primary" />
                            <h3 className="text-foreground font-semibold">科目能力分布</h3>
                        </div>
                    </div>
                    <div className="p-6 space-y-4">
                        {domainEntries.map(([subject, dp]) => {
                            const acc = dp.accuracy * 100
                            return (
                                <div key={subject} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-foreground">{subject}</span>
                                            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
                                                偏好：{DIFFICULTY_LABELS[dp.preferred_difficulty] ?? dp.preferred_difficulty}
                                            </span>
                                        </div>
                                        <span className="text-muted-foreground">{dp.question_count} 题 · {acc.toFixed(0)}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${acc >= 80 ? 'bg-emerald-500' : acc >= 60 ? 'bg-amber-500' : 'bg-red-400'}`}
                                            style={{ width: `${Math.max(acc, 3)}%` }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Learning trajectory */}
            <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-6">
                    <div className="flex items-center gap-2">
                        <Activity className="size-5 text-primary" />
                        <h3 className="text-foreground font-semibold">学习轨迹</h3>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">最近 30 次测验的正确率趋势</p>
                </div>
                {trajectory.length > 0 ? (
                    <div className="p-6">
                        <div className="flex items-end gap-1 h-32">
                            {trajectory.map((t, i) => (
                                <div
                                    key={i}
                                    className="group relative flex-1 rounded-t transition-all"
                                    style={{
                                        height: `${Math.max(t.accuracy * 100, 5)}%`,
                                        backgroundColor: t.accuracy >= 0.8 ? '#10b981' : t.accuracy >= 0.6 ? '#f59e0b' : '#ef4444',
                                        opacity: 0.7 + (i / trajectory.length) * 0.3,
                                    }}
                                >
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                                        {t.date} · {(t.accuracy * 100).toFixed(0)}%
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                            <span>{trajectory[0]?.date}</span>
                            <span>{trajectory[trajectory.length - 1]?.date}</span>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <p className="text-sm text-muted-foreground">暂无学习记录</p>
                    </div>
                )}
            </div>

            {/* Create quiz for this user CTA */}
            <div className="sticky bottom-6 flex justify-center">
                <button
                    onClick={() => navigate(`/quiz/create-smart?target=${userId}`)}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-500/30 transition-all hover:shadow-xl hover:-translate-y-0.5"
                >
                    <Sparkles className="size-4" />
                    为 TA 出题
                </button>
            </div>
        </div>
    )
}
