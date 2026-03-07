import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Search, BookOpen, FileText, Loader2 } from 'lucide-react'
import { plazaApi, quizPlazaApi, userApi, KnowledgeBase, QuizPlazaItem, UserPublicInfo } from '@/lib/api'

interface SearchResults {
    kbs: KnowledgeBase[]
    quizzes: QuizPlazaItem[]
    users: UserPublicInfo[]
}

export function GlobalSearchBar() {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<SearchResults | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const navigate = useNavigate()

    const performSearch = async (q: string) => {
        setIsLoading(true)
        const [kbRes, quizRes, userRes] = await Promise.allSettled([
            plazaApi.list(q),
            quizPlazaApi.list(q),
            userApi.search(q, 5),
        ])
        setResults({
            kbs: kbRes.status === 'fulfilled' ? kbRes.value.slice(0, 4) : [],
            quizzes: quizRes.status === 'fulfilled' ? quizRes.value.slice(0, 4) : [],
            users: userRes.status === 'fulfilled' ? userRes.value.slice(0, 4) : [],
        })
        setIsLoading(false)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value
        setQuery(q)

        if (debounceRef.current) clearTimeout(debounceRef.current)

        if (q.trim().length < 2) {
            setResults(null)
            setIsOpen(false)
            return
        }

        setIsOpen(true)
        debounceRef.current = setTimeout(() => {
            performSearch(q.trim())
        }, 300)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            setQuery('')
            setResults(null)
            setIsOpen(false)
        }
    }

    const handleSelect = (path: string) => {
        navigate(path)
        setQuery('')
        setResults(null)
        setIsOpen(false)
    }

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const hasResults = results && (results.kbs.length > 0 || results.quizzes.length > 0 || results.users.length > 0)

    return (
        <div ref={containerRef} className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
                type="search"
                value={query}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={() => { if (results) setIsOpen(true) }}
                placeholder="搜索知识库、题目、用户..."
                className="w-full rounded-lg border border-border bg-input-background py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                    {isLoading ? (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            搜索中...
                        </div>
                    ) : !hasResults ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                            无搜索结果
                        </div>
                    ) : (
                        <div className="max-h-[480px] overflow-y-auto">
                            {results.kbs.length > 0 && (
                                <section>
                                    <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
                                        <BookOpen className="size-3" />
                                        知识库
                                    </div>
                                    {results.kbs.map((kb) => (
                                        <button
                                            key={kb.id}
                                            onClick={() => handleSelect(`/knowledge/${kb.id}`)}
                                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors"
                                        >
                                            <BookOpen className="size-4 shrink-0 text-indigo-500" />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-foreground">{kb.name}</p>
                                                {kb.description && (
                                                    <p className="truncate text-xs text-muted-foreground">{kb.description}</p>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </section>
                            )}

                            {results.quizzes.length > 0 && (
                                <section>
                                    <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
                                        <FileText className="size-3" />
                                        题目 / 试卷
                                    </div>
                                    {results.quizzes.map((quiz) => (
                                        <button
                                            key={quiz.id}
                                            onClick={() => handleSelect(`/quiz/${quiz.id}/result`)}
                                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors"
                                        >
                                            <FileText className="size-4 shrink-0 text-emerald-500" />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-foreground">
                                                    {quiz.title || '无标题试卷'}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {quiz.question_count} 题 · {quiz.creator_full_name}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </section>
                            )}

                            {results.users.length > 0 && (
                                <section>
                                    <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
                                        用户
                                    </div>
                                    {results.users.map((user) => (
                                        <button
                                            key={user.id}
                                            onClick={() => handleSelect(`/profile/${user.id}`)}
                                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors"
                                        >
                                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-medium text-white overflow-hidden">
                                                {user.avatar_url ? (
                                                    <img src={user.avatar_url} alt="" className="size-full object-cover" />
                                                ) : (
                                                    user.full_name?.charAt(0) || user.username.charAt(0)
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-foreground">{user.full_name}</p>
                                                <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
                                            </div>
                                        </button>
                                    ))}
                                </section>
                            )}
                        </div>
                    )}
                    <div className="border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
                        按 Esc 关闭
                    </div>
                </div>
            )}
        </div>
    )
}
