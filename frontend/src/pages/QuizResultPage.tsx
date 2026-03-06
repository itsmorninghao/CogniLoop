/**
 * QuizResultPage — grade display with per-question feedback.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router'
import { toast } from 'sonner'
import {
    ArrowLeft, CheckCircle2, XCircle, AlertCircle, Target, Loader2, Trophy, X,
} from 'lucide-react'
import { quizApi, circleApi, type QuizSession, type CircleSessionParticipantItem } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

export default function QuizResultPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const location = useLocation()
    const fromCircle = (location.state as { fromCircle?: number } | null)?.fromCircle
    const { user } = useAuthStore()

    const [session, setSession] = useState<QuizSession | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeQIndex, setActiveQIndex] = useState<number>(0)
    const [participants, setParticipants] = useState<CircleSessionParticipantItem[] | null>(null)
    const [showLeaderboard, setShowLeaderboard] = useState(false)

    useEffect(() => {
        if (!id) return
        const load = async () => {
            try {
                const s = await quizApi.get(id)
                setSession(s)
                if (s.status !== 'graded') {
                    // Poll until graded
                    const interval = setInterval(async () => {
                        const updated = await quizApi.get(id)
                        if (updated.status === 'graded') {
                            setSession(updated)
                            clearInterval(interval)
                            // Load participants if circle session
                            if (updated.circle_id) {
                                loadParticipants(updated.circle_id, id)
                            }
                        }
                    }, 2000)
                    setTimeout(() => clearInterval(interval), 60000)
                } else if (s.circle_id) {
                    loadParticipants(s.circle_id, id)
                }
            } catch {
                toast.error('加载结果失败')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [id])

    const loadParticipants = async (circleId: number, sessionId: string) => {
        try {
            const data = await circleApi.sessionParticipants(circleId, sessionId)
            setParticipants(data)
        } catch {
            // Non-critical: ignore if participants fail to load
        }
    }

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="size-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!session) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4">
                <AlertCircle className="size-12 text-muted-foreground" />
                <p className="text-muted-foreground">未找到测验结果</p>
            </div>
        )
    }

    if (session.status === 'grading') {
        return (
            <div className="flex h-full items-center justify-center animate-fade-in">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="size-10 animate-spin text-primary" />
                    <p className="text-foreground font-medium">AI 正在批改中...</p>
                    <p className="text-sm text-muted-foreground">请稍候</p>
                </div>
            </div>
        )
    }

    const questions = session.questions || []
    const responses = session.responses || []
    const responseMap = new Map(responses.map(r => [r.question_id, r]))

    const accuracy = session.accuracy ?? 0
    const totalScore = session.total_score ?? 0
    const maxScore = questions.reduce((sum, q) => sum + q.score, 0)
    const correctCount = responses.filter(r => r.is_correct).length

    const activeQ = questions[activeQIndex]
    const activeResp = activeQ ? responseMap.get(activeQ.id) : null
    const isActiveCorrect = activeResp?.is_correct

    const typeLabel = (type: string) => {
        switch (type) {
            case 'single_choice': return '单选'
            case 'multiple_choice': return '多选'
            case 'fill_blank': return '填空'
            case 'short_answer': return '简答'
            case 'true_false': return '判断'
            default: return type
        }
    }

    return (
        <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-background animate-fade-in">
            {/* Top Compact Header */}
            <header className="flex-none border-b border-border bg-card px-6 py-4 flex items-center justify-between shadow-sm z-10 w-full overflow-x-auto">
                <div className="flex flex-shrink-0 items-center gap-6">
                    <div className="flex items-center gap-3">
                        <button onClick={() => fromCircle ? navigate(`/circles/${fromCircle}?tab=challenges`) : navigate('/quiz')} className="flex size-8 items-center justify-center rounded-md border border-border bg-background transition-colors hover:bg-accent text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="size-4" />
                        </button>
                        <h1 className="text-lg font-bold text-foreground line-clamp-1 max-w-[200px] lg:max-w-[400px]">{session.title || '测验结果'}</h1>
                    </div>

                    <div className="h-6 w-px bg-border"></div>

                    <div className="flex items-center gap-6">
                        <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-muted-foreground">总分</span>
                            <span className="text-2xl font-bold tracking-tight text-foreground">{totalScore.toFixed(1)}</span>
                            <span className="text-xs text-muted-foreground font-medium">/ {maxScore}</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-muted-foreground">正确率</span>
                            <span className={`text-lg font-bold tracking-tight ${accuracy >= 0.8 ? 'text-emerald-600 dark:text-emerald-500' : accuracy >= 0.6 ? 'text-amber-600 dark:text-amber-500' : 'text-rose-600 dark:text-rose-500'}`}>
                                {(accuracy * 100).toFixed(0)}%
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-3 ml-6">
                    {session.circle_id && participants && participants.length > 0 && (
                        <button
                            onClick={() => setShowLeaderboard(true)}
                            className="flex items-center gap-1.5 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400 transition-colors hover:bg-amber-100 dark:hover:bg-amber-950/60"
                        >
                            <Trophy className="size-3.5" />
                            查看排名
                        </button>
                    )}
                    <button
                        onClick={() => fromCircle ? navigate(`/circles/${fromCircle}?tab=challenges`) : navigate('/quiz')}
                        className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                        {fromCircle ? '返回圈子' : '返回中心'}
                    </button>
                </div>
            </header>

            {/* Main Workspace Area */}
            <main className="flex-1 flex overflow-hidden w-full">

                {/* Left Sidebar: Navigation Grid (答题卡) */}
                <aside className="w-[300px] flex-none border-r border-border bg-muted/20 flex flex-col hidden md:flex">
                    <div className="p-4 border-b border-border/50 bg-card">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Target className="size-4 text-muted-foreground" />
                            答题卡
                        </h3>
                        <div className="mt-3 flex items-center gap-4 text-xs font-medium text-muted-foreground">
                            <span className="flex items-center gap-1.5"><div className="size-2.5 rounded-sm bg-emerald-500/80"></div> 正确 {correctCount}</span>
                            <span className="flex items-center gap-1.5"><div className="size-2.5 rounded-sm bg-rose-500/80"></div> 错误 {questions.length - correctCount}</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        <div className="grid grid-cols-5 gap-2">
                            {questions.map((q, i) => {
                                const resp = responseMap.get(q.id)
                                const isCorrect = resp?.is_correct
                                const isActive = i === activeQIndex

                                let bgColor = "bg-card border-border/60 text-foreground/80 hover:border-foreground/30 shadow-sm"
                                if (isCorrect === true) bgColor = "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
                                if (isCorrect === false) bgColor = "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-400"

                                let activeStyles = isActive ? "ring-2 ring-primary ring-offset-1 dark:ring-offset-background" : ""

                                return (
                                    <button
                                        key={q.id}
                                        onClick={() => setActiveQIndex(i)}
                                        className={`relative flex aspect-square items-center justify-center rounded-md border text-sm font-semibold transition-all ${bgColor} ${activeStyles}`}
                                    >
                                        {i + 1}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </aside>

                {/* Mobile version of navigation row */}
                <div className="flex-none w-full border-b border-border bg-muted/20 p-3 overflow-x-auto flex items-center gap-2 md:hidden">
                    {questions.map((q, i) => {
                        const resp = responseMap.get(q.id)
                        const isCorrect = resp?.is_correct
                        const isActive = i === activeQIndex

                        let bgColor = "bg-card border-border/60 text-foreground/80 shadow-sm"
                        if (isCorrect === true) bgColor = "bg-emerald-50 border-emerald-200 text-emerald-700"
                        if (isCorrect === false) bgColor = "bg-rose-50 border-rose-200 text-rose-700"
                        let activeStyles = isActive ? "ring-2 ring-primary" : ""

                        return (
                            <button
                                key={q.id}
                                onClick={() => setActiveQIndex(i)}
                                className={`shrink-0 flex size-9 items-center justify-center rounded-md border text-sm font-semibold ${bgColor} ${activeStyles}`}
                            >
                                {i + 1}
                            </button>
                        )
                    })}
                </div>

                {/* Right Main Area: Active Question Detail */}
                <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10 custom-scrollbar">
                    {activeQ ? (
                        <div className="max-w-4xl mx-auto space-y-8 pb-12 animate-fade-in" key={activeQ.id}>

                            {/* Question Content */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center justify-center rounded bg-muted/60 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                                        {typeLabel(activeQ.question_type)}
                                    </span>
                                    <h2 className="text-xl font-bold text-foreground">第 {activeQIndex + 1} 题</h2>
                                    <span className="text-sm font-medium text-muted-foreground ml-auto border border-border px-3 py-1 rounded-full bg-card">
                                        分值：{activeQ.score} 分
                                    </span>
                                </div>
                                <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
                                    <p className="text-base text-foreground leading-relaxed whitespace-pre-wrap">{activeQ.content}</p>
                                </div>
                            </div>

                            {/* Options Grid (if choices) */}
                            {activeQ.options && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">选项</h4>
                                    <div className="grid gap-3">
                                        {Object.entries(activeQ.options).map(([key, value]) => {
                                            const isUserAnswer = key === activeResp?.user_answer
                                            const isCorrectAnswer = key === activeQ.correct_answer

                                            let containerClass = "border-border/60 bg-card hover:bg-accent/10"
                                            let textClass = "text-foreground"

                                            if (isCorrectAnswer) {
                                                containerClass = "border-emerald-500/40 bg-emerald-50/50 shadow-sm dark:bg-emerald-950/20"
                                                textClass = "text-emerald-800 dark:text-emerald-300 font-medium"
                                            } else if (isUserAnswer && !isCorrectAnswer) {
                                                containerClass = "border-rose-500/40 bg-rose-50/50 shadow-sm dark:bg-rose-950/20"
                                                textClass = "text-rose-800 dark:text-rose-300 font-medium"
                                            }

                                            return (
                                                <div key={key} className={`flex items-start rounded-xl border p-4 transition-colors ${containerClass}`}>
                                                    <div className="flex shrink-0 size-7 bg-background rounded-md items-center justify-center font-bold text-sm border border-border mr-4 shadow-sm">
                                                        {key}
                                                    </div>
                                                    <div className={`flex-1 mt-0.5 leading-snug ${textClass}`}>
                                                        {value as string}
                                                    </div>
                                                    {isCorrectAnswer && <CheckCircle2 className="shrink-0 ml-4 size-5.5 text-emerald-600 dark:text-emerald-500" />}
                                                    {isUserAnswer && !isCorrectAnswer && <XCircle className="shrink-0 ml-4 size-5.5 text-rose-500 dark:text-rose-400" />}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Direct Answer Comparison (for non-choice) */}
                            {!activeQ.options && (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="size-2 rounded-full bg-muted-foreground/30" />
                                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">你的答案</p>
                                        </div>
                                        <p className={`text-base font-medium ${isActiveCorrect === false ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>
                                            {activeResp?.user_answer || '（未作答）'}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-5 shadow-sm">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="size-2 rounded-full bg-emerald-500/80" />
                                            <p className="text-xs font-bold text-emerald-700/80 dark:text-emerald-400/80 uppercase tracking-widest">参考答案</p>
                                        </div>
                                        <p className="text-base font-medium text-emerald-700 dark:text-emerald-400">
                                            {activeQ.correct_answer || '-'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Official Analysis */}
                            {activeQ.analysis && (
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1 flex items-center gap-1.5">
                                        <AlertCircle className="size-3.5" /> 考点解析
                                    </h4>
                                    <div className="rounded-xl border border-border/80 bg-muted/20 p-6">
                                        <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">{activeQ.analysis}</p>
                                    </div>
                                </div>
                            )}

                            {/* AI Tutor Feedback */}
                            {activeResp?.ai_feedback && (
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider pl-1 flex items-center gap-2">
                                        <span className="size-4 flex items-center justify-center text-[9px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 rounded border border-indigo-200 dark:border-indigo-800 font-extrabold pb-[1px]">AI</span>
                                        智能导师评语
                                    </h4>
                                    <div className="rounded-xl border border-indigo-500/15 bg-indigo-50/50 dark:bg-indigo-950/30 p-6 shadow-sm">
                                        <p className="text-foreground/95 leading-relaxed font-medium">{activeResp.ai_feedback}</p>
                                    </div>
                                </div>
                            )}

                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground">
                            请在左侧选择题目以查看详情
                        </div>
                    )}

                </div>
            </main>

            {/* Leaderboard Modal */}
            {showLeaderboard && participants && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={() => setShowLeaderboard(false)}
                >
                    <div
                        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                                <Trophy className="size-4 text-amber-500" />
                                本场圈子排名
                            </h2>
                            <button
                                onClick={() => setShowLeaderboard(false)}
                                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            >
                                <X className="size-4" />
                            </button>
                        </div>
                        <div className="overflow-auto max-h-[60vh]">
                            <CircleLeaderboard participants={participants} currentUserId={user?.id} hideTitle />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

/* ── Circle Leaderboard ── */

function CircleLeaderboard({
    participants,
    currentUserId,
    hideTitle,
}: {
    participants: CircleSessionParticipantItem[]
    currentUserId?: number
    hideTitle?: boolean
}) {
    return (
        <div className="space-y-3">
            {!hideTitle && (
                <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider pl-1 flex items-center gap-1.5">
                    <Trophy className="size-3.5" /> 本场圈子排名
                </h4>
            )}
            <div className="rounded-xl border border-amber-500/20 bg-amber-50/30 dark:bg-amber-950/20 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-amber-200/50 dark:border-amber-800/30">
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">排名</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">姓名</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">正确率</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">得分</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-200/30 dark:divide-amber-800/20">
                        {participants.map((p, idx) => {
                            const isMe = p.user_id === currentUserId
                            const completed = p.status === 'completed'
                            return (
                                <tr
                                    key={p.user_id}
                                    className={`transition-colors ${isMe ? 'bg-amber-100/60 dark:bg-amber-900/20' : 'hover:bg-amber-50/50 dark:hover:bg-amber-950/30'}`}
                                >
                                    <td className="px-4 py-3">
                                        <CircleRankBadge rank={idx + 1} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
                                                {p.full_name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className={`text-sm font-medium ${isMe ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'}`}>
                                                    {p.full_name}{isMe && <span className="ml-1 text-xs">(你)</span>}
                                                </p>
                                                <p className="text-xs text-muted-foreground">@{p.username}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {completed && p.accuracy != null ? (
                                            <span className={`font-mono font-semibold text-sm ${
                                                p.accuracy >= 0.8 ? 'text-emerald-600' : p.accuracy >= 0.6 ? 'text-amber-600' : 'text-rose-500'
                                            }`}>
                                                {(p.accuracy * 100).toFixed(0)}%
                                            </span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">批改中</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {completed && p.total_score != null ? (
                                            <span className="font-mono font-bold text-sm text-foreground">{p.total_score.toFixed(1)}</span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function CircleRankBadge({ rank }: { rank: number }) {
    if (rank === 1) return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">1</span>
    )
    if (rank === 2) return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">2</span>
    )
    if (rank === 3) return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">3</span>
    )
    return <span className="text-sm text-muted-foreground font-mono">{rank}</span>
}
