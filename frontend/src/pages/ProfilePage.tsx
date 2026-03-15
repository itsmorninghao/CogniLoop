/**
 * Profile page — AI insights, knowledge points, domain profiles, learning trajectory, share UI.
 */

import { useState } from 'react'
import { TrendingUp, Award, Target, RefreshCcw, BarChart3, Activity, Link2, Copy, Trash2, BookOpen, Pencil, Brain, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { profileApi, userApi, type UserProfile, type ProfileShare } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { TrajectoryBar } from '@/components/shared/TrajectoryBar'
import { EditProfileModal } from '@/components/profile/EditProfileModal'
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

function KnowledgePointCard({ name, stats, weaknessReason }: {
    name: string
    stats: { attempts: number; correct: number; accuracy: number }
    weaknessReason?: string
}) {
    const [expanded, setExpanded] = useState(false)
    const acc = stats.accuracy * 100
    const hasReason = !!weaknessReason

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">{name}</span>
                    {hasReason && (
                        <button
                            onClick={() => setExpanded(v => !v)}
                            className="flex items-center gap-0.5 rounded text-xs text-muted-foreground hover:text-primary transition"
                        >
                            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                            AI 分析
                        </button>
                    )}
                </div>
                <span className={`text-xs font-medium ${acc >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                    {stats.attempts} 题 · {acc.toFixed(0)}%
                </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${acc >= 60 ? 'bg-amber-500' : 'bg-red-400'}`}
                    style={{ width: `${Math.max(acc, 3)}%` }}
                />
            </div>
            {expanded && weaknessReason && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2 leading-relaxed">
                    {weaknessReason}
                </p>
            )}
        </div>
    )
}

export default function ProfilePage() {
    const { data: profile, loading } = useAsync(() => profileApi.getMyProfile(), [])
    const { data: share } = useAsync(() => profileApi.getMyShare().catch(() => null), [])
    const { data: userInfo } = useAsync(() => userApi.me(), [])
    const [profileLocal, setProfileLocal] = useState<UserProfile | null>(null)
    const effectiveProfile = profileLocal ?? profile
    const [shareLocal, setShareLocal] = useState<ProfileShare | null | undefined>(undefined)
    const effectiveShare = shareLocal !== undefined ? shareLocal : share
    const [editOpen, setEditOpen] = useState(false)
    const { setUser } = useAuthStore()

    const handleRecalculate = async () => {
        try {
            const p = await profileApi.recalculate()
            setProfileLocal(p)
            toast.success('画像已重新计算')
        } catch {
            toast.error('重新计算失败')
        }
    }

    const handleShare = async () => {
        try {
            const s = await profileApi.share('link')
            setShareLocal(s)
            toast.success('分享链接已生成')
        } catch {
            toast.error('生成分享链接失败')
        }
    }

    const handleRevokeShare = async () => {
        try {
            await profileApi.revokeShare()
            setShareLocal(null)
            toast.success('分享链接已撤销')
        } catch {
            toast.error('撤销失败')
        }
    }

    const handleCopyLink = () => {
        if (!effectiveProfile) return
        const url = `${window.location.origin}/profile/${effectiveProfile.user_id}`
        navigator.clipboard.writeText(url).then(() => toast.success('链接已复制'))
    }

    if (loading && !effectiveProfile) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        )
    }

    const domainProfiles = effectiveProfile?.domain_profiles ?? {}
    const trajectory = effectiveProfile?.learning_trajectory ?? []
    const totalAnswered = effectiveProfile?.total_questions_answered ?? 0
    const accuracy = effectiveProfile?.overall_accuracy ?? 0
    const level = effectiveProfile?.overall_level ?? 'beginner'
    const kpProfiles = effectiveProfile?.knowledge_point_profiles ?? {}
    const weaknessAnalysis = effectiveProfile?.weakness_analysis ?? {}
    const insightSummary = effectiveProfile?.insight_summary ?? ''

    // Domain profiles sorted by question count descending
    const domainEntries = Object.entries(domainProfiles).sort((a, b) => b[1].question_count - a[1].question_count)

    // Knowledge points sorted by accuracy ascending (weakest first)
    const kpEntries = Object.entries(kpProfiles)
        .filter(([, stats]) => stats.attempts >= 1)
        .sort((a, b) => a[1].accuracy - b[1].accuracy)

    const weakKpEntries = kpEntries.filter(([, s]) => s.accuracy < 0.75)
    const kpCoverageCount = kpEntries.length

    return (
        <div className="container mx-auto space-y-6 p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-foreground">学习画像</h1>
                    <p className="mt-1 text-sm text-muted-foreground">查看你的知识掌握情况和学习轨迹</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setEditOpen(true)}
                        className="flex items-center gap-2 rounded-lg bg-card px-4 py-2 text-sm font-medium text-foreground border border-border hover:bg-muted transition"
                    >
                        <Pencil className="size-4" />
                        编辑资料
                    </button>
                    <button
                        onClick={handleRecalculate}
                        className="flex items-center gap-2 rounded-lg bg-card px-4 py-2 text-sm font-medium text-foreground border border-border hover:bg-muted transition"
                    >
                        <RefreshCcw className="size-4" />
                        重新计算
                    </button>
                </div>
            </div>

            {/* Edit Modal */}
            {editOpen && userInfo && (
                <EditProfileModal
                    userInfo={userInfo}
                    onClose={() => setEditOpen(false)}
                    onAvatarUploaded={(avatarUrl) => {
                        setUser({ avatar_url: avatarUrl })
                    }}
                    onSaved={(updated) => {
                        setUser({ full_name: updated.full_name, bio: updated.bio, avatar_url: updated.avatar_url })
                        setEditOpen(false)
                    }}
                />
            )}

            {/* ① 顶部统计行（4格） */}
            <div className="grid gap-4 md:grid-cols-4 stagger-children">
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

            {/* ② AI 学习洞察（全宽，最显眼） */}
            <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-6">
                    <div className="flex items-center gap-2">
                        <Sparkles className="size-5 text-primary" />
                        <h3 className="text-foreground font-semibold">AI 学习洞察</h3>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">基于你的答题记录生成的深度分析</p>
                </div>
                <div className="p-6">
                    {insightSummary ? (
                        <p className="text-sm text-foreground leading-relaxed">{insightSummary}</p>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30">
                                <TrendingUp className="size-7 text-primary" />
                            </div>
                            <p className="text-sm font-medium text-foreground">暂无 AI 洞察</p>
                            <p className="mt-1 max-w-sm text-sm text-muted-foreground">完成更多练习后，AI 将为你生成个性化学习洞察</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ③ 两列布局：薄弱知识点 + 科目能力分布 */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* 薄弱知识点 */}
                <div className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border p-6">
                        <h3 className="text-foreground font-semibold">薄弱知识点</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            正确率低于 75% 的知识点，点击「AI 分析」查看原因
                        </p>
                    </div>
                    <div className="p-6 space-y-4">
                        {weakKpEntries.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <p className="text-sm font-medium text-foreground">暂无薄弱知识点</p>
                                <p className="mt-1 text-sm text-muted-foreground">继续做题后将显示薄弱知识点</p>
                            </div>
                        ) : (
                            weakKpEntries.slice(0, 10).map(([name, stats]) => (
                                <KnowledgePointCard
                                    key={name}
                                    name={name}
                                    stats={stats}
                                    weaknessReason={weaknessAnalysis[name]}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* 科目能力分布 */}
                <div className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border p-6">
                        <div className="flex items-center gap-2">
                            <BookOpen className="size-5 text-primary" />
                            <h3 className="text-foreground font-semibold">科目能力分布</h3>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">按科目 / 主题分组的学习统计</p>
                    </div>
                    <div className="p-6 space-y-4">
                        {domainEntries.length === 0 ? (
                            <p className="text-center text-sm text-muted-foreground py-8">暂无数据</p>
                        ) : (
                            domainEntries.map(([subject, dp]) => {
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
                                            <div className="flex items-center gap-3 text-muted-foreground">
                                                {dp.avg_time_per_question > 0 && (
                                                    <span>{Math.round(dp.avg_time_per_question)}秒/题</span>
                                                )}
                                                <span>{dp.question_count} 题 · {acc.toFixed(0)}%</span>
                                            </div>
                                        </div>
                                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${acc >= 80 ? 'bg-emerald-500' : acc >= 60 ? 'bg-amber-500' : 'bg-red-400'}`}
                                                style={{ width: `${Math.max(acc, 3)}%` }}
                                            />
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* ④ 学习轨迹（全宽） */}
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
                        <TrajectoryBar trajectory={trajectory} opacityRange={[0.7, 1.0]} />
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

            {/* Profile share */}
            <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-6">
                    <div className="flex items-center gap-2">
                        <Link2 className="size-5 text-primary" />
                        <h3 className="text-foreground font-semibold">画像分享</h3>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">生成分享链接，让他人查看你的学习画像并为你出题</p>
                </div>
                <div className="p-6">
                    {effectiveShare === undefined ? (
                        <div className="flex h-10 items-center">
                            <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                    ) : effectiveShare ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                                <span className="flex-1 truncate text-muted-foreground font-mono">
                                    {window.location.origin}/profile/{effectiveProfile?.user_id}
                                </span>
                                <button onClick={handleCopyLink} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition shrink-0">
                                    <Copy className="size-3" />
                                    复制
                                </button>
                            </div>
                            <button onClick={handleRevokeShare} className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition">
                                <Trash2 className="size-4" />
                                撤销分享链接
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={handleShare}
                            className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition"
                        >
                            <Link2 className="size-4" />
                            生成分享链接
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
