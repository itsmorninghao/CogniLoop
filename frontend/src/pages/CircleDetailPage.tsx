/**
 * Circle Detail Page — hero banner + tabs (动态/挑战/排行榜) + sidebar.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router'
import {
    Users, Copy, Crown, ArrowLeft, Zap, BarChart2, Trophy,
    Activity, X, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
    circleApi,
    type Circle,
    type CircleMember,
    type CircleStats,
    type CircleQuizSessionItem,
    type CircleSessionParticipantItem,
    type CircleProfile,
} from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { ActivityCard } from '@/components/circle/ActivityCard'
import { ChallengeCard } from '@/components/circle/ChallengeCard'
import { RankBadge } from '@/components/circle/RankBadge'
import { SessionLeaderboard } from '@/components/circle/SessionLeaderboard'

type Tab = 'activity' | 'challenges' | 'leaderboard' | 'profile'
type LucideIcon = React.ComponentType<{ className?: string }>

export default function CircleDetailPage() {
    const { id } = useParams<{ id: string }>()
    const circleId = Number(id)
    const navigate = useNavigate()
    const { user } = useAuthStore()

    const [circle, setCircle] = useState<Circle | null>(null)
    const [members, setMembers] = useState<CircleMember[]>([])
    const [stats, setStats] = useState<CircleStats | null>(null)
    const [sessions, setSessions] = useState<CircleQuizSessionItem[]>([])
    const [circleProfile, setCircleProfile] = useState<CircleProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [searchParams] = useSearchParams()
    const [activeTab, setActiveTab] = useState<Tab>(
        (searchParams.get('tab') as Tab) || 'activity'
    )
    const [rankingSessionId, setRankingSessionId] = useState<string | null>(null)
    const [rankingParticipants, setRankingParticipants] = useState<CircleSessionParticipantItem[] | null>(null)
    const [rankingLoading, setRankingLoading] = useState(false)

    useEffect(() => {
        if (!circleId) return
        loadAll()
    }, [circleId])

    const loadAll = async () => {
        try {
            setLoading(true)
            const [c, m, st, s, cp] = await Promise.all([
                circleApi.get(circleId),
                circleApi.members(circleId),
                circleApi.stats(circleId),
                circleApi.quizSessions(circleId),
                circleApi.profile(circleId),
            ])
            setCircle(c)
            setMembers(m)
            setStats(st)
            setSessions(s)
            setCircleProfile(cp)
        } catch {
            toast.error('加载失败')
            navigate('/circles')
        } finally {
            setLoading(false)
        }
    }

    const copyInviteCode = () => {
        if (!circle) return
        navigator.clipboard.writeText(circle.invite_code)
        toast.success('邀请码已复制')
    }

    const openRanking = async (sessionId: string) => {
        setRankingSessionId(sessionId)
        setRankingParticipants(null)
        setRankingLoading(true)
        try {
            const data = await circleApi.sessionParticipants(circleId, sessionId)
            setRankingParticipants(data)
        } catch {
            toast.error('加载排名失败')
        } finally {
            setRankingLoading(false)
        }
    }

    const closeRanking = () => {
        setRankingSessionId(null)
        setRankingParticipants(null)
    }

    if (loading) {
        return (
            <div className="container mx-auto space-y-6 p-6 animate-pulse">
                <div className="h-4 w-20 rounded bg-muted" />
                <div className="rounded-2xl border border-border bg-card p-6">
                    <div className="flex items-start gap-4">
                        <div className="size-14 rounded-2xl bg-muted shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-6 w-48 rounded bg-muted" />
                            <div className="h-4 w-72 rounded bg-muted" />
                            <div className="h-3 w-32 rounded bg-muted" />
                        </div>
                    </div>
                </div>
                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2 h-96 rounded-xl bg-muted/50" />
                    <div className="space-y-4">
                        <div className="h-56 rounded-xl bg-muted/50" />
                        <div className="h-40 rounded-xl bg-muted/50" />
                    </div>
                </div>
            </div>
        )
    }

    if (!circle) return null

    const isMember = members.some((m) => m.user_id === user?.id)
    // "挑战" tab: open sessions anyone can join
    const challengeSessions = sessions.filter((s) => s.status === 'ready')
    // "动态" tab: sessions that have at least one participant
    const activitySessions = sessions.filter((s) => s.participant_count > 0)

    const TABS = [
        { key: 'activity' as Tab, label: '动态', icon: Activity },
        { key: 'challenges' as Tab, label: '挑战', icon: Zap },
        { key: 'leaderboard' as Tab, label: '排行榜', icon: Trophy },
        { key: 'profile' as Tab, label: '集体画像', icon: BarChart2 },
    ]

    return (
        <div className="container mx-auto space-y-6 p-6 animate-fade-in">
            <button
                onClick={() => navigate('/circles')}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ArrowLeft className="size-4" /> 返回学习圈
            </button>

            <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex flex-col sm:flex-row items-start gap-4">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-xl font-bold text-violet-600 dark:text-violet-400">
                        {circle.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl font-semibold text-foreground">{circle.name}</h1>
                        {circle.description && (
                            <p className="mt-1 text-sm text-muted-foreground leading-relaxed line-clamp-2">{circle.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                <Users className="size-3.5" />
                                {circle.member_count}/{circle.max_members} 位成员
                            </span>
                            {sessions.length > 0 && (
                                <span className="flex items-center gap-1.5">
                                    <Activity className="size-3.5" />
                                    {sessions.length} 场练习
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                        {isMember && (
                            <button
                                onClick={() => navigate(`/quiz/create-smart?circle_id=${circle.id}`)}
                                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition"
                            >
                                <Zap className="size-4" /> 发起圈内练习
                            </button>
                        )}
                        <button
                            onClick={copyInviteCode}
                            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition"
                        >
                            <Copy className="size-4" />
                            复制邀请码
                            <code className="rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">{circle.invite_code}</code>
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Left: Tab Panel */}
                <div className="lg:col-span-2">
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        {/* Tab bar */}
                        <div className="flex border-b border-border">
                            {TABS.map(({ key, label, icon: Icon }) => (
                                <button
                                    key={key}
                                    onClick={() => setActiveTab(key)}
                                    className={`relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                                        activeTab === key
                                            ? 'text-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    <Icon className="size-4" /> {label}
                                    {activeTab === key && (
                                        <span className="absolute bottom-0 inset-x-1 h-0.5 rounded-full bg-foreground" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Activity */}
                        {activeTab === 'activity' && (
                            <div className="p-4 space-y-2">
                                {activitySessions.length === 0 ? (
                                    <EmptyTabState message="暂无做题动态" icon={Activity} />
                                ) : (
                                    activitySessions.map((s) => (
                                        <ActivityCard key={s.id} session={s} />
                                    ))
                                )}
                            </div>
                        )}

                        {/* Challenges */}
                        {activeTab === 'challenges' && (
                            <div className="p-4 space-y-2">
                                {challengeSessions.length === 0 ? (
                                    <EmptyTabState message="暂无待参加的挑战" icon={Zap} />
                                ) : (
                                    challengeSessions.map((s) => (
                                        <ChallengeCard key={s.id} session={s} circleId={circleId} onViewRanking={openRanking} />
                                    ))
                                )}
                            </div>
                        )}

                        {/* Leaderboard */}
                        {activeTab === 'leaderboard' && (
                            stats && stats.leaderboard.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/30 border-b border-border">
                                            <tr>
                                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">排名</th>
                                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">成员</th>
                                                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">做题数</th>
                                                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">正确率</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {stats.leaderboard.map((entry, idx) => (
                                                <tr key={entry.user_id} className="hover:bg-muted/30 transition-colors">
                                                    <td className="px-5 py-3.5">
                                                        <RankBadge rank={idx + 1} />
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-medium text-white shrink-0">
                                                                {entry.full_name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <p className="font-medium text-foreground">{entry.full_name}</p>
                                                                <p className="text-xs text-muted-foreground">@{entry.username}</p>
                                                            </div>
                                                            {entry.role === 'owner' && (
                                                                <Crown className="size-3.5 text-amber-500 shrink-0" />
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-right font-mono font-medium text-foreground">
                                                        {entry.total_questions}
                                                    </td>
                                                    <td className="px-5 py-3.5 text-right">
                                                        <span className={`font-mono font-semibold ${
                                                            entry.overall_accuracy >= 0.8
                                                                ? 'text-emerald-600'
                                                                : entry.overall_accuracy >= 0.6
                                                                    ? 'text-amber-600'
                                                                    : 'text-rose-500'
                                                        }`}>
                                                            {(entry.overall_accuracy * 100).toFixed(1)}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-4">
                                    <EmptyTabState message="成员还未完成任何练习" icon={Trophy} />
                                </div>
                            )
                        )}

                        {/* Circle Profile */}
                        {activeTab === 'profile' && (
                            circleProfile && circleProfile.total_questions > 0 ? (
                                <div className="p-5 space-y-6">
                                    {/* Overall stats */}
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="rounded-lg bg-muted/30 p-4 text-center">
                                            <p className="text-2xl font-bold text-foreground">
                                                {(circleProfile.overall_accuracy * 100).toFixed(1)}%
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">整体正确率</p>
                                        </div>
                                        <div className="rounded-lg bg-muted/30 p-4 text-center">
                                            <p className="text-2xl font-bold text-foreground">
                                                {circleProfile.total_questions}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">总做题数</p>
                                        </div>
                                        <div className="rounded-lg bg-muted/30 p-4 text-center">
                                            <p className="text-2xl font-bold text-foreground">
                                                {circleProfile.member_count}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">参与成员</p>
                                        </div>
                                    </div>

                                    {/* Knowledge point mastery (sorted by accuracy ascending = weakest first) */}
                                    {Object.keys(circleProfile.knowledge_point_profiles).length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-semibold text-foreground mb-3">知识点掌握度</h4>
                                            <div className="space-y-3">
                                                {Object.entries(circleProfile.knowledge_point_profiles)
                                                    .sort(([, a], [, b]) => a.avg_accuracy - b.avg_accuracy)
                                                    .slice(0, 15)
                                                    .map(([kp, stats]) => (
                                                        <div key={kp}>
                                                            <div className="flex items-center justify-between text-xs mb-1">
                                                                <span className="truncate font-medium text-foreground max-w-[60%]">{kp}</span>
                                                                <span className="flex items-center gap-2 shrink-0">
                                                                    <span className="text-muted-foreground">{stats.member_coverage} 人练习</span>
                                                                    <span className={`font-mono font-medium ${
                                                                        stats.avg_accuracy >= 0.8
                                                                            ? 'text-emerald-600'
                                                                            : stats.avg_accuracy >= 0.6
                                                                                ? 'text-amber-600'
                                                                                : 'text-rose-500'
                                                                    }`}>
                                                                        {(stats.avg_accuracy * 100).toFixed(0)}%
                                                                    </span>
                                                                </span>
                                                            </div>
                                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                                                <div
                                                                    className={`h-full rounded-full transition-all duration-700 ${
                                                                        stats.avg_accuracy >= 0.8
                                                                            ? 'bg-emerald-500'
                                                                            : stats.avg_accuracy >= 0.6
                                                                                ? 'bg-amber-500'
                                                                                : 'bg-rose-500'
                                                                    }`}
                                                                    style={{ width: `${Math.round(stats.avg_accuracy * 100)}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Domain accuracy bars */}
                                    {Object.keys(circleProfile.domain_profiles).length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-semibold text-foreground mb-3">学科正确率</h4>
                                            <div className="space-y-3">
                                                {Object.entries(circleProfile.domain_profiles)
                                                    .sort(([, a], [, b]) => b.avg_accuracy - a.avg_accuracy)
                                                    .map(([domain, stats]) => (
                                                        <div key={domain}>
                                                            <div className="flex items-center justify-between text-xs mb-1">
                                                                <span className="truncate font-medium text-foreground max-w-[60%]">{domain}</span>
                                                                <span className="flex items-center gap-2 shrink-0">
                                                                    <span className="text-muted-foreground">{stats.total_questions} 题</span>
                                                                    <span className={`font-mono font-medium ${
                                                                        stats.avg_accuracy >= 0.8
                                                                            ? 'text-emerald-600'
                                                                            : stats.avg_accuracy >= 0.6
                                                                                ? 'text-amber-600'
                                                                                : 'text-rose-500'
                                                                    }`}>
                                                                        {(stats.avg_accuracy * 100).toFixed(0)}%
                                                                    </span>
                                                                </span>
                                                            </div>
                                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                                                <div
                                                                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
                                                                    style={{ width: `${Math.round(stats.avg_accuracy * 100)}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-4">
                                    <EmptyTabState message="暂无集体画像数据，成员完成答题后自动生成" icon={BarChart2} />
                                </div>
                            )
                        )}
                    </div>
                </div>

                {/* Right: Sidebar */}
                <div className="space-y-4">
                    {/* Members card */}
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
                            <Users className="size-4 text-muted-foreground" />
                            <h3 className="text-sm font-semibold text-foreground">成员列表</h3>
                            <span className="ml-auto text-xs text-muted-foreground">
                                {circle.member_count}/{circle.max_members}
                            </span>
                        </div>
                        <div className="p-3 space-y-0.5 max-h-64 overflow-y-auto custom-scrollbar">
                            {members.map((m) => (
                                <div key={m.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/50 transition">
                                    <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-medium text-white shrink-0">
                                        {m.full_name.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{m.full_name}</p>
                                        <p className="text-xs text-muted-foreground">@{m.username}</p>
                                    </div>
                                    {m.role === 'owner' && (
                                        <Crown className="size-3.5 text-amber-500 shrink-0" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Domain stats card */}
                    {stats && stats.domain_stats.length > 0 && (
                        <div className="rounded-xl border border-border bg-card overflow-hidden">
                            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
                                <BarChart2 className="size-4 text-muted-foreground" />
                                <h3 className="text-sm font-semibold text-foreground">圈子能力分布</h3>
                            </div>
                            <div className="p-5 space-y-4">
                                {stats.domain_stats.slice(0, 6).map((d) => (
                                    <div key={d.domain}>
                                        <div className="mb-1.5 flex items-center justify-between text-xs">
                                            <span className="truncate font-medium text-foreground max-w-[70%]">{d.domain}</span>
                                            <span className={`font-mono font-medium shrink-0 ${
                                                d.avg_accuracy >= 0.8
                                                    ? 'text-emerald-600'
                                                    : d.avg_accuracy >= 0.6
                                                        ? 'text-amber-600'
                                                        : 'text-rose-500'
                                            }`}>
                                                {(d.avg_accuracy * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
                                                style={{ width: `${Math.round(d.avg_accuracy * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Ranking Modal */}
            {rankingSessionId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={closeRanking}
                >
                    <div
                        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                                <Trophy className="size-4 text-amber-500" />
                                本场排名
                            </h2>
                            <button
                                onClick={closeRanking}
                                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            >
                                <X className="size-4" />
                            </button>
                        </div>
                        <div className="overflow-auto max-h-[60vh]">
                            {rankingLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : rankingParticipants && rankingParticipants.length > 0 ? (
                                <SessionLeaderboard participants={rankingParticipants} currentUserId={user?.id} />
                            ) : (
                                <p className="py-10 text-center text-sm text-muted-foreground">暂无参与数据</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

/* ── Sub-components ── */

function EmptyTabState({ message, icon: Icon }: { message: string; icon: LucideIcon }) {
    return (
        <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30">
                <Icon className="size-5 text-indigo-400 dark:text-indigo-500" />
            </div>
            <p className="text-sm text-muted-foreground">{message}</p>
        </div>
    )
}
