/**
 * QuizSessionPage — answering interface.
 * Shows questions one at a time with navigation.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router'
import { toast } from 'sonner'
import {
    ArrowLeft, ArrowRight, ChevronLeft, CheckCircle2,
    Clock, Send, Loader2, AlertCircle
} from 'lucide-react'
import { quizApi, type QuizSession } from '@/lib/api'
import { MathText } from '@/components/shared/MathText'

export default function QuizSessionPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const location = useLocation()
    const fromCircle = (location.state as { fromCircle?: number } | null)?.fromCircle

    const [session, setSession] = useState<QuizSession | null>(null)
    const [loading, setLoading] = useState(true)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [answers, setAnswers] = useState<Record<number, string>>({})
    const [submitting, setSubmitting] = useState(false)
    const [elapsed, setElapsed] = useState(0)
    const [notFound, setNotFound] = useState(false)
    const gradingPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Clean up grading poll interval on unmount
    useEffect(() => () => {
        if (gradingPollRef.current) clearInterval(gradingPollRef.current)
    }, [])

    // Load quiz session (with auto-poll when questions aren't ready yet)
    useEffect(() => {
        if (!id) return
        let cancelled = false
        let pollTimer: ReturnType<typeof setTimeout> | null = null

        const load = () => {
            quizApi.get(id)
                .then(s => {
                    if (cancelled) return
                    setSession(s)
                    // If already graded, redirect to results (preserve fromCircle state)
                    if (s.status === 'graded') {
                        navigate(`/quiz/${id}/result`, { replace: true, state: { fromCircle } })
                        return
                    }
                    // If questions aren't ready yet, poll every 2s
                    const hasQuestions = s.questions && s.questions.length > 0
                    if (!hasQuestions && (s.status === 'generating' || s.status === 'ready')) {
                        pollTimer = setTimeout(load, 2000)
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        setNotFound(true)
                        toast.error('加载测验失败')
                    }
                })
                .finally(() => {
                    if (!cancelled) setLoading(false)
                })
        }

        load()

        return () => {
            cancelled = true
            if (pollTimer) clearTimeout(pollTimer)
        }
    }, [id, navigate])

    // Timer
    useEffect(() => {
        if (!session || session.status !== 'ready' && session.status !== 'in_progress') return
        const timer = setInterval(() => setElapsed(e => e + 1), 1000)
        return () => clearInterval(timer)
    }, [session])

    const questions = session?.questions || []
    const current = questions[currentIndex]
    const totalQuestions = questions.length

    const setAnswer = useCallback((questionId: number, answer: string) => {
        setAnswers(prev => ({ ...prev, [questionId]: answer }))
    }, [])

    const answeredCount = questions.filter(q => answers[q.id]).length

    const handleSubmitAll = useCallback(async () => {
        if (!id) return

        const unanswered = totalQuestions - answeredCount
        if (unanswered > 0) {
            const confirmed = confirm(`还有 ${unanswered} 道题未作答，确定提交吗？`)
            if (!confirmed) return
        }

        setSubmitting(true)
        try {
            // Submit all answers
            const responses = questions
                .filter(q => answers[q.id])
                .map(q => ({
                    question_id: q.id,
                    user_answer: answers[q.id],
                    time_spent: Math.round(elapsed / totalQuestions),
                }))

            if (responses.length > 0) {
                await quizApi.submitResponses(id, responses)
            }

            // Submit quiz for grading
            await quizApi.submit(id)
            toast.success('已提交！AI 正在批改...')

            // Poll for grading completion
            gradingPollRef.current = setInterval(async () => {
                try {
                    const updated = await quizApi.get(id)
                    if (updated.status === 'graded') {
                        if (gradingPollRef.current) clearInterval(gradingPollRef.current)
                        navigate(`/quiz/${id}/result`, { state: { fromCircle } })
                    }
                } catch { /* keep polling */ }
            }, 2000)

            // Timeout after 60s
            setTimeout(() => {
                if (gradingPollRef.current) clearInterval(gradingPollRef.current)
                navigate(`/quiz/${id}/result`, { state: { fromCircle } })
            }, 60000)

        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '提交失败')
            setSubmitting(false)
        }
    }, [id, answers, questions, totalQuestions, answeredCount, elapsed, navigate, fromCircle])

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="size-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!session || !current) {
        // Truly not found (API returned 404)
        if (notFound) {
            return (
                <div className="flex h-full flex-col items-center justify-center gap-4">
                    <AlertCircle className="size-12 text-muted-foreground" />
                    <p className="text-muted-foreground">未找到测验</p>
                    <button onClick={() => navigate('/quiz')} className="text-sm text-primary hover:underline">
                        返回测验列表
                    </button>
                </div>
            )
        }

        // Still generating or waiting for questions to load
        const isWaiting = !session || session.status === 'generating' || session.status === 'ready'
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4">
                {isWaiting ? (
                    <Loader2 className="size-10 animate-spin text-primary" />
                ) : (
                    <AlertCircle className="size-12 text-muted-foreground" />
                )}
                <p className="text-muted-foreground">
                    {session?.status === 'generating'
                        ? '题目正在生成中，请稍候...'
                        : session?.status === 'ready'
                            ? '正在加载题目...'
                            : session?.status === 'error'
                                ? '出题失败，请返回重试'
                                : '正在加载测验...'}
                </p>
                {session?.status === 'error' && (
                    <button onClick={() => navigate('/quiz')} className="text-sm text-primary hover:underline">
                        返回测验列表
                    </button>
                )}
            </div>
        )
    }

    if (submitting) {
        return (
            <div className="flex h-full items-center justify-center animate-fade-in">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="size-10 animate-spin text-primary" />
                    <p className="text-foreground font-medium">AI 正在批改...</p>
                    <p className="text-sm text-muted-foreground">请稍候，批改完成后将自动跳转</p>
                </div>
            </div>
        )
    }

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60)
        const sec = s % 60
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    }

    return (
        <div className="flex h-full flex-col animate-fade-in">
            {/* Top bar */}
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
                <div className="flex items-center gap-3">
                    <button onClick={() => fromCircle ? navigate(`/circles/${fromCircle}?tab=challenges`) : navigate('/quiz')} className="flex size-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent">
                        <ChevronLeft className="size-4" />
                    </button>
                    <h2 className="text-foreground">{session.title || '自测测验'}</h2>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="size-4" />
                        {formatTime(elapsed)}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CheckCircle2 className="size-4" />
                        {answeredCount}/{totalQuestions}
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Question navigation sidebar */}
                <div className="hidden w-56 shrink-0 border-r border-border p-4 md:block">
                    <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">题目导航</p>
                    <div className="grid grid-cols-5 gap-2">
                        {questions.map((q, i) => (
                            <button
                                key={q.id}
                                onClick={() => setCurrentIndex(i)}
                                className={`flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-all ${i === currentIndex
                                    ? 'bg-primary text-white shadow-sm'
                                    : answers[q.id]
                                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                        : 'border border-border text-muted-foreground hover:bg-accent'
                                    }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Question area */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="mx-auto max-w-2xl">
                        {/* Question header */}
                        <div className="mb-6 flex items-center gap-3">
                            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                                {currentIndex + 1}
                            </span>
                            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                                {current.question_type === 'single_choice' ? '单选题' :
                                    current.question_type === 'multiple_choice' ? '多选题' :
                                        current.question_type === 'fill_blank' ? '填空题' :
                                            current.question_type === 'short_answer' ? '简答题' :
                                                current.question_type === 'true_false' ? '判断题' : current.question_type}
                            </span>
                            <span className="text-xs text-muted-foreground">{current.score} 分</span>
                        </div>

                        {/* Question content */}
                        <MathText className="text-foreground leading-relaxed text-[15px]">{current.content}</MathText>

                        {/* Options / Input */}
                        <div className="mt-6">
                            {current.question_type === 'true_false' && !current.options && (
                                <div className="flex gap-3">
                                    {[{ key: '对', label: '✓ 对' }, { key: '错', label: '✗ 错' }].map(({ key, label }) => (
                                        <button
                                            key={key}
                                            onClick={() => setAnswer(current.id, key)}
                                            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all ${answers[current.id] === key
                                                ? 'border-primary bg-primary/5 text-primary shadow-sm'
                                                : 'border-border text-muted-foreground hover:border-primary/30 hover:bg-accent/50'
                                                }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {(current.question_type === 'single_choice' || (current.question_type === 'true_false' && current.options)) && current.options && (
                                <div className="space-y-2">
                                    {Object.entries(current.options).map(([key, value]) => (
                                        <button
                                            key={key}
                                            onClick={() => setAnswer(current.id, key)}
                                            className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${answers[current.id] === key
                                                ? 'border-primary bg-primary/5 shadow-sm'
                                                : 'border-border hover:border-primary/30 hover:bg-accent/50'
                                                }`}
                                        >
                                            <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-medium ${answers[current.id] === key
                                                ? 'bg-primary text-white'
                                                : 'bg-muted text-muted-foreground'
                                                }`}>
                                                {key}
                                            </span>
                                            <MathText inline className="text-sm text-foreground">{value as string}</MathText>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {current.question_type === 'multiple_choice' && current.options && (
                                <div className="space-y-2">
                                    {Object.entries(current.options).map(([key, value]) => {
                                        const selected = (answers[current.id] || '').split(',')
                                        const isSelected = selected.includes(key)
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => {
                                                    const cur = (answers[current.id] || '').split(',').filter(Boolean)
                                                    const next = isSelected ? cur.filter(k => k !== key) : [...cur, key]
                                                    setAnswer(current.id, next.sort().join(','))
                                                }}
                                                className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${isSelected
                                                    ? 'border-primary bg-primary/5 shadow-sm'
                                                    : 'border-border hover:border-primary/30 hover:bg-accent/50'
                                                    }`}
                                            >
                                                <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-medium ${isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                                                    }`}>
                                                    {key}
                                                </span>
                                                <MathText inline className="text-sm text-foreground">{value as string}</MathText>
                                            </button>
                                        )
                                    })}
                                    <p className="text-xs text-muted-foreground mt-2">可多选</p>
                                </div>
                            )}

                            {(current.question_type === 'fill_blank' || current.question_type === 'short_answer') && (
                                <textarea
                                    value={answers[current.id] || ''}
                                    onChange={e => setAnswer(current.id, e.target.value)}
                                    placeholder={current.question_type === 'fill_blank' ? '请输入答案...' : '请输入你的回答...'}
                                    rows={current.question_type === 'short_answer' ? 6 : 2}
                                    className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none"
                                />
                            )}
                        </div>

                        {/* Navigation buttons */}
                        <div className="mt-8 flex items-center justify-between">
                            <button
                                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                                disabled={currentIndex === 0}
                                className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-30"
                            >
                                <ArrowLeft className="size-4" />
                                上一题
                            </button>

                            {currentIndex < totalQuestions - 1 ? (
                                <button
                                    onClick={() => setCurrentIndex(currentIndex + 1)}
                                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary-hover"
                                >
                                    下一题
                                    <ArrowRight className="size-4" />
                                </button>
                            ) : (
                                <button
                                    onClick={handleSubmitAll}
                                    className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl"
                                >
                                    <Send className="size-4" />
                                    交卷
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
