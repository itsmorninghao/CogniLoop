/**
 * Profile page — ability radar, question type stats, domain profiles, learning trajectory, share UI.
 */

import { useEffect, useState } from 'react'
import { TrendingUp, Flame, Award, Target, RefreshCcw, BarChart3, Activity, Link2, Copy, Trash2, BookOpen, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { profileApi, userApi, type UserProfile, type ProfileShare, type UserPublicInfo } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { TrajectoryBar } from '@/components/shared/TrajectoryBar'
import { RadarChart } from '@/components/profile/RadarChart'
import { EditProfileModal } from '@/components/profile/EditProfileModal'

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

const QT_LABELS: Record<string, string> = {
    single_choice: '单选题',
    multiple_choice: '多选题',
    fill_blank: '填空题',
    short_answer: '简答题',
    true_false: '判断题',
}

const DIFFICULTY_LABELS: Record<string, string> = {
    easy: '简单',
    medium: '中等',
    hard: '困难',
}

export default function ProfilePage() {
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [share, setShare] = useState<ProfileShare | null | undefined>(undefined)
    const [userInfo, setUserInfo] = useState<UserPublicInfo | null>(null)
    const [editOpen, setEditOpen] = useState(false)
    const { setUser } = useAuthStore()

    useEffect(() => {
        loadProfile()
        loadShare()
        userApi.me().then(setUserInfo).catch(() => {})
    }, [])

    const loadProfile = async () => {
        try {
            setLoading(true)
            const p = await profileApi.getMyProfile()
            setProfile(p)
        } catch {
            setProfile(null)
        } finally {
            setLoading(false)
        }
    }

    const loadShare = async () => {
        try {
            const s = await profileApi.getMyShare()
            setShare(s)
        } catch {
            setShare(null)
        }
    }

    const handleRecalculate = async () => {
        try {
            const p = await profileApi.recalculate()
            setProfile(p)
            toast.success('画像已重新计算')
        } catch {
            toast.error('重新计算失败')
        }
    }

    const handleShare = async () => {
        try {
            const s = await profileApi.share('link')
            setShare(s)
            toast.success('分享链接已生成')
        } catch {
            toast.error('生成分享链接失败')
        }
    }

    const handleRevokeShare = async () => {
        try {
            await profileApi.revokeShare()
            setShare(null)
            toast.success('分享链接已撤销')
        } catch {
            toast.error('撤销失败')
        }
    }

    const handleCopyLink = () => {
        if (!profile) return
        const url = `${window.location.origin}/profile/${profile.user_id}`
        navigator.clipboard.writeText(url).then(() => toast.success('链接已复制'))
    }

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        )
    }

    const qt = profile?.question_type_profiles ?? {}
    const domainProfiles = profile?.domain_profiles ?? {}
    const trajectory = profile?.learning_trajectory ?? []
    const totalAnswered = profile?.total_questions_answered ?? 0
    const accuracy = profile?.overall_accuracy ?? 0
    const level = profile?.overall_level ?? 'beginner'

    // SVG radar data
    const qtKeys = Object.keys(qt)
    const radarHasData = qtKeys.length >= 3

    // Domain profiles sorted by question count descending
    const domainEntries = Object.entries(domainProfiles).sort((a, b) => b[1].question_count - a[1].question_count)

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
                        setUserInfo(prev => prev ? { ...prev, avatar_url: avatarUrl } : prev)
                        setUser({ avatar_url: avatarUrl })
                    }}
                    onSaved={(updated) => {
                        setUserInfo(updated)
                        setUser({ full_name: updated.full_name, bio: updated.bio, avatar_url: updated.avatar_url })
                        setEditOpen(false)
                    }}
                />
            )}

            {/* Stats row */}
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
                            <Flame className="size-5 text-white" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-foreground">{Object.keys(qt).length}</p>
                            <p className="text-sm text-muted-foreground">已练题型</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Two-column layout */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Radar chart */}
                <div className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border p-6">
                        <h3 className="text-foreground font-semibold">题型能力雷达</h3>
                        <p className="mt-1 text-sm text-muted-foreground">各题型正确率分布</p>
                    </div>
                    <div className="flex items-center justify-center p-6">
                        {radarHasData ? (
                            <RadarChart data={qt} />
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30">
                                    <TrendingUp className="size-8 text-primary" />
                                </div>
                                <p className="text-sm font-medium text-foreground">暂无数据</p>
                                <p className="mt-1 max-w-sm text-sm text-muted-foreground">完成至少 3 种题型的测验后，雷达图将展示在这里</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Question type breakdown */}
                <div className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border p-6">
                        <h3 className="text-foreground font-semibold">题型详情</h3>
                        <p className="mt-1 text-sm text-muted-foreground">各题型作答统计</p>
                    </div>
                    <div className="p-6 space-y-4">
                        {qtKeys.length === 0 ? (
                            <p className="text-center text-sm text-muted-foreground py-8">暂无数据</p>
                        ) : (
                            qtKeys.map((key) => {
                                const item = qt[key]
                                const acc = item.accuracy * 100
                                return (
                                    <div key={key} className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="font-medium text-foreground">{QT_LABELS[key] || key}</span>
                                            <span className="text-muted-foreground">{item.count} 题 · {acc.toFixed(0)}%</span>
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

            {/* Domain profiles */}
            {domainEntries.length > 0 && (
                <div className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border p-6">
                        <div className="flex items-center gap-2">
                            <BookOpen className="size-5 text-primary" />
                            <h3 className="text-foreground font-semibold">科目能力分布</h3>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">按科目 / 主题分组的学习统计</p>
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
                    {share === undefined ? (
                        <div className="flex h-10 items-center">
                            <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                    ) : share ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                                <span className="flex-1 truncate text-muted-foreground font-mono">
                                    {window.location.origin}/profile/{profile?.user_id}
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
