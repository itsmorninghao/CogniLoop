import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
    Search, FileText, ClipboardList, Users,
    Download, Loader2, TrendingUp, Clock, BookOpen,
} from 'lucide-react'
import {
    plazaApi, kbApi, quizPlazaApi, quizApi, examTemplateApi,
    type KBPlazaItem, type QuizPlazaItem, type PlazaTemplateItem,
} from '@/lib/api'
import { toast } from 'sonner'

type PlazaTab = 'all' | 'knowledge' | 'quizzes' | 'templates' | 'hot'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300

export default function PlazaPage() {
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState<PlazaTab>('all')
    const [search, setSearch] = useState('')

    const [kbs, setKbs] = useState<KBPlazaItem[]>([])
    const [kbTotal, setKbTotal] = useState(0)
    const [kbLoading, setKbLoading] = useState(false)
    const [acquiring, setAcquiring] = useState<number | null>(null)

    const [quizzes, setQuizzes] = useState<QuizPlazaItem[]>([])
    const [quizTotal, setQuizTotal] = useState(0)
    const [quizLoading, setQuizLoading] = useState(false)
    const [acquiringQuizId, setAcquiringQuizId] = useState<string | null>(null)

    const [plazaTemplates, setPlazaTemplates] = useState<PlazaTemplateItem[]>([])
    const [templateTotal, setTemplateTotal] = useState(0)
    const [templateLoading, setTemplateLoading] = useState(false)
    const [acquiringTemplateId, setAcquiringTemplateId] = useState<number | null>(null)

    const [loadingMore, setLoadingMore] = useState(false)

    const initialLoadDone = useRef(false)
    // tracks the search term that was used to fetch the current data
    const loadedForSearch = useRef<string>('')

    const loadKbs = useCallback(async (q: string, offset = 0, append = false) => {
        try {
            if (!append) setKbLoading(true)
            const data = await plazaApi.list(q || undefined, PAGE_SIZE, offset)
            setKbs((prev) => (append ? [...prev, ...data.items] : data.items))
            setKbTotal(data.total)
        } catch {
            toast.error('知识库加载失败，请刷新重试')
        } finally {
            setKbLoading(false)
        }
    }, [])

    const loadQuizzes = useCallback(async (q: string, offset = 0, append = false) => {
        try {
            if (!append) setQuizLoading(true)
            const data = await quizPlazaApi.list(q || undefined, PAGE_SIZE, offset)
            setQuizzes((prev) => (append ? [...prev, ...data.items] : data.items))
            setQuizTotal(data.total)
        } catch {
            toast.error('题目加载失败，请刷新重试')
        } finally {
            setQuizLoading(false)
        }
    }, [])

    const loadTemplates = useCallback(async (offset = 0, append = false) => {
        try {
            if (!append) setTemplateLoading(true)
            const data = await examTemplateApi.listPlaza(PAGE_SIZE, offset)
            setPlazaTemplates((prev) => (append ? [...prev, ...data.items] : data.items))
            setTemplateTotal(data.total)
        } catch {
            toast.error('试卷模板加载失败，请刷新重试')
        } finally {
            setTemplateLoading(false)
        }
    }, [])

    // guard against double-invocation in React StrictMode
    useEffect(() => {
        if (!initialLoadDone.current) {
            initialLoadDone.current = true
            loadKbs('')
            loadQuizzes('')
            loadTemplates()
        }
    }, [loadKbs, loadQuizzes, loadTemplates])

    // debounced server-side search; templates reset to page 1 only on clear
    useEffect(() => {
        const trimmed = search.trim()
        if (trimmed === loadedForSearch.current) return
        const timer = setTimeout(() => {
            loadedForSearch.current = trimmed
            loadKbs(trimmed)
            loadQuizzes(trimmed)
            // template API has no q param; reload first page when search is cleared
            if (!trimmed) loadTemplates()
        }, SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [search, loadKbs, loadQuizzes, loadTemplates])

    const handleLoadMore = async () => {
        const q = search.trim()
        setLoadingMore(true)
        try {
            const tasks: Promise<void>[] = []
            const showKb = activeTab === 'all' || activeTab === 'knowledge'
            const showQuiz = activeTab === 'all' || activeTab === 'quizzes'
            const showTmpl = activeTab === 'all' || activeTab === 'templates'

            if (showKb && kbs.length < kbTotal) tasks.push(loadKbs(q, kbs.length, true))
            if (showQuiz && quizzes.length < quizTotal) tasks.push(loadQuizzes(q, quizzes.length, true))
            if (showTmpl && plazaTemplates.length < templateTotal) tasks.push(loadTemplates(plazaTemplates.length, true))
            await Promise.all(tasks)
        } finally {
            setLoadingMore(false)
        }
    }

    const handleAcquireKb = async (kb: KBPlazaItem) => {
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
            // update count in-place to avoid re-fetching all loaded pages
            setQuizzes((prev) =>
                prev.map((q) =>
                    q.id === quiz.id ? { ...q, acquire_count: q.acquire_count + 1 } : q
                )
            )
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '获取失败'
            if (msg.includes('Already acquired')) {
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

    // template API has no q param; filter by name and subject client-side
    const matchesTemplateSearch = (t: PlazaTemplateItem) => {
        const q = search.trim().toLowerCase()
        if (!q) return true
        return t.name.toLowerCase().includes(q) || (t.subject ?? '').toLowerCase().includes(q)
    }

    const isHot = (acquireCount: number) => acquireCount >= 3

    const displayKbs =
        activeTab === 'knowledge' || activeTab === 'all' ? kbs
        : activeTab === 'hot' ? kbs.filter((kb) => isHot(kb.acquire_count))
        : []

    const displayQuizzes =
        activeTab === 'quizzes' || activeTab === 'all' ? quizzes
        : activeTab === 'hot' ? quizzes.filter((q) => isHot(q.acquire_count))
        : []

    const displayTemplates =
        activeTab === 'templates' || activeTab === 'all'
            ? plazaTemplates.filter(matchesTemplateSearch)
        : []  // templates have no acquire_count, excluded from hot tab

    const totalLoaded = kbs.length + quizzes.length + plazaTemplates.length
    const totalCount = kbTotal + quizTotal + templateTotal
    const initialLoading = kbLoading || quizLoading || templateLoading
    const noResults = displayKbs.length === 0 && displayQuizzes.length === 0 && displayTemplates.length === 0

    const hasMore =
        activeTab === 'all'
            ? kbs.length < kbTotal || quizzes.length < quizTotal || plazaTemplates.length < templateTotal
        : activeTab === 'knowledge' ? kbs.length < kbTotal
        : activeTab === 'quizzes' ? quizzes.length < quizTotal
        : activeTab === 'templates' ? plazaTemplates.length < templateTotal
        : false

    const tabs: { key: PlazaTab; label: string; count?: number }[] = [
        { key: 'all', label: '全部', count: totalCount },
        { key: 'knowledge', label: '知识库', count: kbTotal },
        { key: 'quizzes', label: '题目', count: quizTotal },
        { key: 'templates', label: '试卷模板', count: templateTotal },
        { key: 'hot', label: '热门' },
    ]

    return (
        <div className="container mx-auto space-y-6 p-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-medium text-foreground">公共广场</h1>
                <p className="mt-1 text-sm text-muted-foreground">探索社区分享的知识库和题目</p>
            </div>

            <div className="relative">
                <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                    type="search"
                    placeholder="搜索知识库、题目..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-12 w-full rounded-xl border border-border bg-muted/40 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
            </div>

            <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                            activeTab === tab.key
                                ? 'bg-primary text-white shadow-sm'
                                : 'border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                        }`}
                    >
                        {tab.label}
                        {tab.count !== undefined && tab.count > 0 && (
                            <span className={`ml-1.5 text-xs ${activeTab === tab.key ? 'opacity-70' : ''}`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {initialLoading && totalLoaded === 0 ? (
                <div className="flex h-40 items-center justify-center">
                    <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
            ) : noResults ? (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                    <Search className="size-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-medium">暂无内容</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {search ? '试试其他关键词' : '社区还没有分享内容'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {displayKbs.map((kb) => (
                        <KbCard
                            key={`kb-${kb.id}`}
                            kb={kb}
                            acquiring={acquiring === kb.id}
                            onAcquire={() => handleAcquireKb(kb)}
                        />
                    ))}
                    {displayQuizzes.map((quiz) => (
                        <QuizCard
                            key={`quiz-${quiz.id}`}
                            quiz={quiz}
                            acquiring={acquiringQuizId === quiz.id}
                            onAcquire={() => handleAcquireQuiz(quiz)}
                        />
                    ))}
                    {displayTemplates.map((tmpl) => (
                        <TemplateCard
                            key={`tmpl-${tmpl.id}`}
                            tmpl={tmpl}
                            acquiring={acquiringTemplateId === tmpl.id}
                            onAcquire={() => handleAcquireTemplate(tmpl)}
                        />
                    ))}

                    {hasMore && activeTab !== 'hot' && (
                        <div className="flex justify-center pt-4">
                            <button
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                                className="flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                            >
                                {loadingMore
                                    ? <><Loader2 className="size-4 animate-spin" />加载中...</>
                                    : '加载更多'
                                }
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function HotBadge() {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
            <TrendingUp className="size-3" />
            热门
        </span>
    )
}

function Avatar({ url, name }: { url: string | null; name: string }) {
    if (url) {
        return (
            <img
                src={url}
                alt={name}
                className="size-5 rounded-full object-cover ring-1 ring-border"
            />
        )
    }
    return (
        <span className="flex size-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-[10px] font-medium text-white">
            {name.charAt(0).toUpperCase()}
        </span>
    )
}

function CardFooter({
    authorName,
    authorAvatar,
    stats,
    date,
    actionLabel,
    actionIcon,
    acquiring,
    canAcquire,
    onAcquire,
}: {
    authorName: string
    authorAvatar: string | null
    stats?: { icon: React.ElementType; label: string }[]
    date: string
    actionLabel: string
    actionIcon?: React.ElementType
    acquiring: boolean
    canAcquire: boolean
    onAcquire: () => void
}) {
    const ActionIcon = actionIcon
    return (
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
                <Avatar url={authorAvatar} name={authorName} />
                <span>{authorName}</span>
            </span>
            {(stats ?? []).map(({ icon: Icon, label }) => (
                <span key={label} className="flex items-center gap-1">
                    <Icon className="size-3.5 shrink-0" />
                    {label}
                </span>
            ))}
            <span className="flex items-center gap-1">
                <Clock className="size-3.5 shrink-0" />
                {new Date(date).toLocaleDateString('zh-CN')}
            </span>
            {canAcquire && (
                <button
                    onClick={onAcquire}
                    disabled={acquiring}
                    className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition-all duration-150 hover:bg-indigo-600 active:scale-95 disabled:opacity-50"
                >
                    {acquiring ? (
                        <><Loader2 className="size-3 animate-spin" />获取中</>
                    ) : (
                        <>{ActionIcon && <ActionIcon className="size-3" />}{actionLabel}</>
                    )}
                </button>
            )}
        </div>
    )
}

function KbCard({
    kb, acquiring, onAcquire,
}: {
    kb: KBPlazaItem
    acquiring: boolean
    onAcquire: () => void
}) {
    return (
        <div className="rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:shadow-md hover:border-primary/20">
            <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium text-foreground">{kb.name}</h3>
                {kb.acquire_count >= 3 && <HotBadge />}
            </div>
            {kb.description && (
                <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">{kb.description}</p>
            )}
            {(kb.tags || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {kb.tags!.slice(0, 5).map((tag) => (
                        <span
                            key={tag}
                            className="rounded-full border border-border bg-muted/50 px-3 py-0.5 text-xs text-muted-foreground"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            )}
            <CardFooter
                authorName={kb.creator_full_name}
                authorAvatar={kb.creator_avatar_url}
                stats={[
                    { icon: BookOpen, label: `${kb.document_count} 文档` },
                    { icon: Download, label: `${kb.acquire_count} 获取` },
                ]}
                date={kb.created_at}
                actionLabel="获取"
                actionIcon={Download}
                acquiring={acquiring}
                canAcquire={!!kb.share_code}
                onAcquire={onAcquire}
            />
        </div>
    )
}

function QuizCard({
    quiz, acquiring, onAcquire,
}: {
    quiz: QuizPlazaItem
    acquiring: boolean
    onAcquire: () => void
}) {
    return (
        <div className="rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:shadow-md hover:border-primary/20">
            <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium text-foreground">
                    {quiz.title || `试卷 ${quiz.id.slice(0, 8)}`}
                </h3>
                {quiz.acquire_count >= 3 && <HotBadge />}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
                {quiz.question_count} 道题
                {quiz.accuracy != null && ` · 平均正确率 ${Math.round(quiz.accuracy * 100)}%`}
            </p>
            <CardFooter
                authorName={quiz.creator_full_name}
                authorAvatar={quiz.creator_avatar_url}
                stats={[{ icon: Users, label: `${quiz.acquire_count} 人参与` }]}
                date={quiz.shared_to_plaza_at}
                actionLabel="参加"
                acquiring={acquiring}
                canAcquire={!!quiz.share_code}
                onAcquire={onAcquire}
            />
        </div>
    )
}

function TemplateCard({
    tmpl, acquiring, onAcquire,
}: {
    tmpl: PlazaTemplateItem
    acquiring: boolean
    onAcquire: () => void
}) {
    return (
        <div className="rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:shadow-md hover:border-primary/20">
            <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium text-foreground">{tmpl.name}</h3>
            </div>
            {tmpl.description && (
                <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">{tmpl.description}</p>
            )}
            {tmpl.subject && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-border bg-muted/50 px-3 py-0.5 text-xs text-muted-foreground">
                        {tmpl.subject}
                    </span>
                </div>
            )}
            <CardFooter
                authorName={tmpl.creator_full_name}
                authorAvatar={tmpl.creator_avatar_url}
                stats={[
                    { icon: ClipboardList, label: `${tmpl.slot_count} 题位` },
                    { icon: FileText, label: `${tmpl.question_count} 道真题` },
                ]}
                date={tmpl.created_at}
                actionLabel="获取"
                actionIcon={Download}
                acquiring={acquiring}
                canAcquire={true}
                onAcquire={onAcquire}
            />
        </div>
    )
}
