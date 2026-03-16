/**
 * Quiz page — quiz center with mode selection + recent history.
 */

import { useNavigate } from 'react-router'

import {
    Sparkles, FileText, Zap, Clock, ArrowRight, BookOpen,
    Loader2, Target
} from 'lucide-react'
import { quizApi, type QuizSessionListItem } from '@/lib/api'
import { QuizStatusBadge } from '@/components/shared/QuizStatusBadge'
import { useAsync } from '@/hooks/useAsync'

export default function QuizPage() {
    const navigate = useNavigate()
    const { data: sessions, loading } = useAsync<QuizSessionListItem[]>(() => quizApi.list(10, 0), [])

    const handleSessionClick = (s: QuizSessionListItem) => {
        if (s.status === 'graded') {
            navigate(`/quiz/${s.id}/result`)
        } else if (s.status === 'ready' || s.status === 'in_progress') {
            navigate(`/quiz/${s.id}`)
        }
    }

    return (
        <div className="container mx-auto space-y-6 p-6 animate-fade-in">
            <div>
                <h1 className="text-foreground">出题中心</h1>
                <p className="mt-1 text-sm text-muted-foreground">选择出题模式，AI 将为你智能生成个性化测验</p>
            </div>

            {/* Mode selection cards */}
            <div className="grid gap-6 md:grid-cols-2 items-stretch">
                {/* AI Smart Quiz */}
                <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-8 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-primary/30">
                    <div className="relative z-10 flex h-full flex-col">
                        <div className="mb-4 flex size-14 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
                            <Sparkles className="size-7 text-white animate-pulse" />
                        </div>
                        <h3 className="text-xl font-medium text-foreground">智能出题</h3>
                        <p className="mt-2 flex-1 text-sm text-muted-foreground leading-relaxed">
                            AI 根据你的学习画像，从知识库中智能抽取内容并生成测验题目。题目难度会根据你的掌握程度自动调整。
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                                <Zap className="size-3" /> 自适应难度
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600">
                                <Clock className="size-3" /> 快速生成
                            </span>
                        </div>
                        <button
                            onClick={() => navigate('/quiz/create-smart')}
                            className="mt-5 inline-flex w-fit items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:-translate-y-0.5 hover:scale-105 active:scale-95"
                        >
                            开始出题
                            <ArrowRight className="size-4" />
                        </button>
                    </div>
                    <div className="absolute -right-12 -top-12 size-40 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 blur-2xl transition-all group-hover:scale-150" />
                </div>

                {/* Exam Paper Mode */}
                <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-8 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-primary/30">
                    <div className="relative z-10 flex h-full flex-col">
                        <div className="mb-4 flex size-14 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/25">
                            <FileText className="size-7 text-white" />
                        </div>
                        <h3 className="text-xl font-medium text-foreground">仿真组卷</h3>
                        <p className="mt-2 flex-1 text-sm text-muted-foreground leading-relaxed">
                            模拟真实考试场景，按照标准化卷面结构组卷。支持选择题、填空题、简答题等多种题型混合。
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-600">
                                <FileText className="size-3" /> 标准卷面
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600">
                                <Clock className="size-3" /> 深思熟虑
                            </span>
                        </div>
                        <button
                            onClick={() => navigate('/quiz/create-pro')}
                            className="mt-5 inline-flex w-fit items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-accent hover:-translate-y-0.5"
                        >
                            组建卷子
                            <ArrowRight className="size-4" />
                        </button>
                    </div>
                    <div className="absolute -right-12 -top-12 size-40 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 blur-2xl transition-all group-hover:scale-150" />
                </div>
            </div>

            {/* Recent quizzes */}
            <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-6">
                    <h3 className="text-foreground">最近的测验</h3>
                    <p className="mt-1 text-sm text-muted-foreground">你创建和参与过的测验记录</p>
                </div>
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="size-5 animate-spin text-primary" />
                    </div>
                ) : !sessions || sessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <p className="text-sm text-muted-foreground">暂无测验记录</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {(sessions ?? []).map(s => (
                            <button
                                key={s.id}
                                onClick={() => handleSessionClick(s)}
                                className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-accent/50"
                            >
                                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                                    <BookOpen className="size-5 text-primary" />
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <p className="truncate text-sm font-medium text-foreground">{s.title || '自测测验'}</p>
                                    <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString('zh-CN')}</p>
                                </div>
                                <QuizStatusBadge status={s.status} />
                                {s.status === 'graded' && s.accuracy !== null && (
                                    <div className="flex items-center gap-1 text-sm">
                                        <Target className="size-3.5" />
                                        <span className={`font-medium ${(s.accuracy ?? 0) >= 0.8 ? 'text-emerald-500' : (s.accuracy ?? 0) >= 0.6 ? 'text-amber-500' : 'text-red-500'}`}>
                                            {((s.accuracy ?? 0) * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
