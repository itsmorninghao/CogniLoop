/**
 * Plaza — browse public knowledge bases and quiz sessions.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Search, BookOpen, Database, Star, Tag, Download, Loader2, FileText, Users, ClipboardList } from 'lucide-react'
import { plazaApi, kbApi, quizPlazaApi, quizApi, examTemplateApi, type KnowledgeBase, type QuizPlazaItem, type PlazaTemplateItem } from '@/lib/api'
import { toast } from 'sonner'

type PlazaTab = 'knowledge' | 'quizzes' | 'templates'

export default function PlazaPage() {
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState<PlazaTab>('knowledge')

    // KB state
    const [kbs, setKbs] = useState<KnowledgeBase[]>([])
    const [kbLoading, setKbLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [acquiring, setAcquiring] = useState<number | null>(null)

    // Quiz state
    const [quizzes, setQuizzes] = useState<QuizPlazaItem[]>([])
    const [quizLoading, setQuizLoading] = useState(false)
    const [acquiringQuizId, setAcquiringQuizId] = useState<string | null>(null)

    // Template state
    const [plazaTemplates, setPlazaTemplates] = useState<PlazaTemplateItem[]>([])
    const [templateLoading, setTemplateLoading] = useState(false)
    const [acquiringTemplateId, setAcquiringTemplateId] = useState<number | null>(null)

    const handleAcquireKb = async (kb: KnowledgeBase) => {
        if (!kb.share_code) return
        setAcquiring(kb.id)
        try {
            await kbApi.acquire(kb.share_code)
            toast.success(`已获取「${kb.name}」，可在知识库页面查看`)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '获取失败')
        } finally {
            setAcquiring(null)
        }
    }

    const handleAcquireQuiz = async (quiz: QuizPlazaItem) => {
        if (!quiz.share_code) return
        setAcquiringQuizId(quiz.id)
        try {
            await quizApi.acquire(quiz.share_code)
            toast.success(`已获取「${quiz.title || '试卷'}」，可在「我的试卷」→ 已获取中查看`)
            // Refresh quiz list to update acquire_count
            const updated = await quizPlazaApi.list()
            setQuizzes(updated)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '获取失败'
            if (msg.includes('Already acquired')) {
                // Already acquired → navigate to view
                navigate(`/quiz/${quiz.id}/result`)
            } else {
                toast.error(msg)
            }
        } finally {
            setAcquiringQuizId(null)
        }
    }

    const handleAcquireTemplate = async (tmpl: PlazaTemplateItem) => {
        setAcquiringTemplateId(tmpl.id)
        try {
            const acquired = await examTemplateApi.acquire(tmpl.id)
            toast.success(`已获取「${tmpl.name}」，可在试卷模板页面查看`)
            navigate(`/exam-templates/${acquired.id}`)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '获取失败')
        } finally {
            setAcquiringTemplateId(null)
        }
    }

    useEffect(() => {
        loadKbs()
    }, [])

    useEffect(() => {
        if (activeTab === 'quizzes' && quizzes.length === 0) {
            loadQuizzes()
        }
        if (activeTab === 'templates' && plazaTemplates.length === 0) {
            loadTemplates()
        }
    }, [activeTab])

    const loadKbs = async () => {
        try {
            setKbLoading(true)
            const data = await plazaApi.list()
            setKbs(data)
        } catch { /* empty */ } finally { setKbLoading(false) }
    }

    const loadQuizzes = async () => {
        try {
            setQuizLoading(true)
            const data = await quizPlazaApi.list()
            setQuizzes(data)
        } catch { /* empty */ } finally { setQuizLoading(false) }
    }

    const loadTemplates = async () => {
        try {
            setTemplateLoading(true)
            const data = await examTemplateApi.listPlaza()
            setPlazaTemplates(data)
        } catch { /* empty */ } finally { setTemplateLoading(false) }
    }

    const filtered = search
        ? kbs.filter((k) => k.name.toLowerCase().includes(search.toLowerCase()) || (k.tags || []).some((t: string) => t.toLowerCase().includes(search.toLowerCase())))
        : kbs

    return (
        <div className="container mx-auto space-y-6 p-6 animate-fade-in">
            {/* Hero */}
            <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-50 p-8 dark:from-cyan-950/20 dark:via-blue-950/20 dark:to-indigo-950/20">
                <div className="relative z-10 max-w-xl">
                    <h1 className="text-foreground">知识广场</h1>
                    <p className="mt-2 text-muted-foreground leading-relaxed">
                        探索社区分享的优质知识库和试卷资源，获取他人精心整理的学习材料
                    </p>
                    {activeTab === 'knowledge' && (
                        <div className="mt-4 relative max-w-md">
                            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="search"
                                placeholder="搜索公开的知识库..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full rounded-lg border border-border bg-card/80 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground backdrop-blur-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                        </div>
                    )}
                </div>
                <div className="absolute -right-20 -top-20 size-72 rounded-full bg-gradient-to-br from-cyan-400/15 to-blue-400/15 blur-3xl" />
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1 w-fit">
                <button
                    onClick={() => setActiveTab('knowledge')}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${activeTab === 'knowledge' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <Database className="size-3.5" />
                    知识库
                    {kbs.length > 0 && <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{kbs.length}</span>}
                </button>
                <button
                    onClick={() => setActiveTab('quizzes')}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${activeTab === 'quizzes' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <FileText className="size-3.5" />
                    试卷
                    {quizzes.length > 0 && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{quizzes.length}</span>}
                </button>
                <button
                    onClick={() => setActiveTab('templates')}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${activeTab === 'templates' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <ClipboardList className="size-3.5" />
                    试卷模板
                    {plazaTemplates.length > 0 && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{plazaTemplates.length}</span>}
                </button>
            </div>

            {activeTab === 'knowledge' && (
                <>
                    {/* Stats row */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <StatCard icon={Database} label="公开知识库" value={kbs.length} color="from-blue-500 to-cyan-500" />
                        <StatCard icon={Star} label="试卷模板" value={plazaTemplates.length} color="from-amber-500 to-orange-500" />
                    </div>

                    {kbLoading ? (
                        <div className="flex h-40 items-center justify-center">
                            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
                            <Database className="mx-auto size-10 text-muted-foreground mb-3" />
                            <p className="text-sm font-medium text-foreground">
                                {search ? '未找到匹配的知识库' : '暂无公开知识库'}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {search ? '试试其他关键词' : '分享你的知识库到广场，让更多人受益'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 stagger-children">
                            {filtered.map((kb) => (
                                <div key={kb.id} className="group rounded-xl border border-border bg-card p-5 transition-all hover:shadow-lg hover:-translate-y-0.5">
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                                            <BookOpen className="size-5 text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-medium text-foreground truncate">{kb.name}</h4>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {kb.document_count} 文档 · 文档库
                                            </p>
                                        </div>
                                    </div>
                                    {kb.description && (
                                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{kb.description}</p>
                                    )}
                                    {(kb.tags || []).length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-3">
                                            {(kb.tags || []).slice(0, 3).map((tag: string) => (
                                                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                    <Tag className="size-2.5" />{tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                                        <span>{new Date(kb.created_at).toLocaleDateString('zh-CN')}</span>
                                        {kb.share_code && (
                                            <button
                                                onClick={() => handleAcquireKb(kb)}
                                                disabled={acquiring === kb.id}
                                                className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                                            >
                                                {acquiring === kb.id
                                                    ? <><Loader2 className="size-3 animate-spin" /> 获取中</>
                                                    : <><Download className="size-3" /> 获取</>
                                                }
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {activeTab === 'quizzes' && (
                <>
                    {/* Stats row */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <StatCard icon={FileText} label="公开试卷" value={quizzes.length} color="from-indigo-500 to-purple-500" />
                        <StatCard icon={Users} label="总获取次数" value={quizzes.reduce((s, q) => s + q.acquire_count, 0)} color="from-emerald-500 to-teal-500" />
                    </div>

                    {quizLoading ? (
                        <div className="flex h-40 items-center justify-center">
                            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                    ) : quizzes.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
                            <FileText className="mx-auto size-10 text-muted-foreground mb-3" />
                            <p className="text-sm font-medium text-foreground">暂无公开试卷</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                在「我的试卷」中将已批改的试卷发布到广场
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 stagger-children">
                            {quizzes.map((quiz) => (
                                <QuizPlazaCard
                                    key={quiz.id}
                                    quiz={quiz}
                                    acquiringId={acquiringQuizId}
                                    onAcquire={() => handleAcquireQuiz(quiz)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {activeTab === 'templates' && (
                <>
                    {/* Stats row */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <StatCard icon={ClipboardList} label="公开模板" value={plazaTemplates.length} color="from-indigo-500 to-purple-500" />
                        <StatCard icon={FileText} label="总题位数" value={plazaTemplates.reduce((s, t) => s + t.slot_count, 0)} color="from-amber-500 to-orange-500" />
                    </div>

                    {templateLoading ? (
                        <div className="flex h-40 items-center justify-center">
                            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                    ) : plazaTemplates.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
                            <ClipboardList className="mx-auto size-10 text-muted-foreground mb-3" />
                            <p className="text-sm font-medium text-foreground">暂无公开试卷模板</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                在「试卷模板」中将模板发布到广场，分享考试结构
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 stagger-children">
                            {plazaTemplates.map((tmpl) => (
                                <div key={tmpl.id} className="group rounded-xl border border-border bg-card p-5 transition-all hover:shadow-lg hover:-translate-y-0.5">
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 shrink-0">
                                            <ClipboardList className="size-5 text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-medium text-foreground truncate">{tmpl.name}</h4>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {tmpl.slot_count} 题位 · {tmpl.question_count} 道真题 · {tmpl.creator_full_name}
                                            </p>
                                        </div>
                                    </div>
                                    {tmpl.description && (
                                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{tmpl.description}</p>
                                    )}
                                    {tmpl.subject && (
                                        <div className="flex flex-wrap gap-1 mb-3">
                                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                <Tag className="size-2.5" />{tmpl.subject}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                                        <span>{new Date(tmpl.created_at).toLocaleDateString('zh-CN')}</span>
                                        <button
                                            onClick={() => handleAcquireTemplate(tmpl)}
                                            disabled={acquiringTemplateId === tmpl.id}
                                            className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                                        >
                                            {acquiringTemplateId === tmpl.id
                                                ? <><Loader2 className="size-3 animate-spin" /> 获取中</>
                                                : <><Download className="size-3" /> 获取</>
                                            }
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

function QuizPlazaCard({
    quiz,
    acquiringId,
    onAcquire,
}: {
    quiz: QuizPlazaItem
    acquiringId: string | null
    onAcquire: () => void
}) {
    return (
        <div className="group rounded-xl border border-border bg-card p-5 transition-all hover:shadow-lg hover:-translate-y-0.5">
            <div className="flex items-start gap-3 mb-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 shrink-0">
                    <FileText className="size-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground truncate">
                        {quiz.title || `试卷 ${quiz.id.slice(0, 8)}`}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {quiz.question_count} 题 · {quiz.creator_full_name}
                    </p>
                </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                <div className="flex items-center gap-2">
                    <Users className="size-3" />
                    <span>{quiz.acquire_count} 人获取</span>
                </div>
                <button
                    onClick={onAcquire}
                    disabled={acquiringId === quiz.id || !quiz.share_code}
                    className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                >
                    {acquiringId === quiz.id
                        ? <><Loader2 className="size-3 animate-spin" /> 获取中</>
                        : <><Download className="size-3" /> 获取</>
                    }
                </button>
            </div>
        </div>
    )
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Database; label: string; value: number; color: string }) {
    return (
        <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
                <div className={`flex size-10 items-center justify-center rounded-lg bg-gradient-to-br ${color}`}>
                    <Icon className="size-5 text-white" />
                </div>
                <div>
                    <p className="text-2xl font-bold text-foreground">{value}</p>
                    <p className="text-sm text-muted-foreground">{label}</p>
                </div>
            </div>
        </div>
    )
}
