/**
 * QuizCreateSmartPage — select knowledge scope + configure Smart mode generation.
 * Shows full-chain traceability panel during generation.
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import {
    ArrowLeft, Sparkles, BookOpen, ChevronDown, ChevronUp,
    Loader2, CheckCircle2, Brain, Target, Circle, XCircle,
    Clock, ArrowRight, Search, User, FileText, ShieldCheck, Info, Swords, X,
    ClipboardList, Check, Users
} from 'lucide-react'
import { kbApi, quizApi, profileApi, userApi, presetApi, circleApi, subscribeSSE, type KnowledgeBase, type KBDocument, type SSEEvent, type UserPublicInfo, type QuizPreset } from '../lib/api'


type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer'
type Difficulty = 'easy' | 'medium' | 'hard'

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
    single_choice: '单选题',
    multiple_choice: '多选题',
    true_false: '判断题',
    fill_blank: '填空题',
    short_answer: '简答题',
}

const DIFFICULTY_CONFIG: { value: Difficulty; label: string; color: string }[] = [
    { value: 'easy', label: '简单', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    { value: 'medium', label: '中等', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    { value: 'hard', label: '困难', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
]


interface NodeTrace {
    id: string
    label: string
    icon: typeof Brain
    status: 'pending' | 'running' | 'done' | 'error'
    message: string
    startTime?: number
    endTime?: number
    inputSummary?: Record<string, unknown>
    outputSummary?: Record<string, unknown>
}

const STANDARD_NODE_CONFIG: { id: string; label: string; icon: typeof Brain }[] = [
    { id: 'scope_resolver', label: '解析知识范围', icon: Target },
    { id: 'rag_retriever', label: '检索相关知识', icon: Search },
    { id: 'profile_analyzer', label: '分析画像·规划出题', icon: User },
    { id: 'question_generator', label: '并发生成题目', icon: FileText },
    { id: 'quality_checker', label: '逐题质量校验', icon: ShieldCheck },
]



export default function QuizCreateSmartPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const targetUserId = searchParams.get('target') ? Number(searchParams.get('target')) : null
    const circleIdParam = searchParams.get('circle_id') ? Number(searchParams.get('circle_id')) : null

    // KB selection
    const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
    const [selectedKbIds, setSelectedKbIds] = useState<number[]>([])
    const [selectedDocIds, setSelectedDocIds] = useState<number[]>([])
    const [kbExpanded, setKbExpanded] = useState<number[]>([])
    const [kbDocs, setKbDocs] = useState<Record<number, KBDocument[]>>({})

    const [questionCounts, setQuestionCounts] = useState<Record<QuestionType, number>>({
        single_choice: 0,
        multiple_choice: 0,
        true_false: 0,
        fill_blank: 0,
        short_answer: 0,
    })
    const [difficulty, setDifficulty] = useState<Difficulty>('medium')
    const [title, setTitle] = useState('')
    const [customPrompt, setCustomPrompt] = useState('')
    const [subject, setSubject] = useState('')

    // Generation state
    const [isGenerating, setIsGenerating] = useState(false)
    const [progress, setProgress] = useState(0)
    const [nodes, setNodes] = useState<NodeTrace[]>([])
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    const [isComplete, setIsComplete] = useState(false)
    const [completedSessionId, setCompletedSessionId] = useState<string | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    // Challenge / circle mode
    const [quizMode, setQuizMode] = useState<'self_test' | 'challenge' | 'circle'>(
        circleIdParam ? 'circle' : targetUserId ? 'challenge' : 'self_test'
    )
    const [challengeTarget, setChallengeTarget] = useState<UserPublicInfo | null>(null)
    const [circleName, setCircleName] = useState<string | null>(null)

    // Presets
    const [presets, setPresets] = useState<QuizPreset[]>([])
    const [showPresetPanel, setShowPresetPanel] = useState(false)
    const [showSaveInput, setShowSaveInput] = useState(false)
    const [savingName, setSavingName] = useState('')

    // User search (for challenge mode)
    const [userQuery, setUserQuery] = useState('')
    const [userResults, setUserResults] = useState<UserPublicInfo[]>([])
    const [userSearching, setUserSearching] = useState(false)

    useEffect(() => {
        kbApi.listAll().then(kbs => setKnowledgeBases(kbs)).catch(() => toast.error('加载知识库失败'))
        presetApi.list().then(setPresets).catch(() => {})
    }, [])

    // Load circle name for circle mode banner
    useEffect(() => {
        if (!circleIdParam) return
        circleApi.get(circleIdParam).then(c => setCircleName(c.name)).catch(() => {})
    }, [circleIdParam])

    // Load target user profile for suggested difficulty
    useEffect(() => {
        if (!targetUserId) return
        profileApi.getUserProfile(targetUserId).then(p => {
            const acc = p.overall_accuracy
            if (acc > 0.8) setDifficulty('hard')
            else if (acc >= 0.6) setDifficulty('medium')
            else setDifficulty('easy')
        }).catch(() => { /* ignore — target may not have a profile yet */ })
    }, [targetUserId])

    // Debounced user search for challenge mode
    useEffect(() => {
        if (!userQuery.trim() || quizMode !== 'challenge') {
            setUserResults([])
            return
        }
        setUserSearching(true)
        const t = setTimeout(async () => {
            try {
                const res = await userApi.search(userQuery)
                setUserResults(res)
            } catch { /* ignore */ } finally {
                setUserSearching(false)
            }
        }, 300)
        return () => clearTimeout(t)
    }, [userQuery, quizMode])

    const toggleKbExpand = useCallback(async (id: number) => {
        setKbExpanded(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        )
        if (!kbDocs[id]) {
            try {
                const docs = await kbApi.listDocs(id)
                setKbDocs(prev => ({ ...prev, [id]: docs }))
            } catch (err) {
                toast.error('加载文档失败')
            }
        }
    }, [kbDocs])

    const toggleKbSelect = useCallback((kbId: number) => {
        const isSelected = selectedKbIds.includes(kbId)

        if (isSelected) {
            setSelectedKbIds(prev => prev.filter(id => id !== kbId))
            if (kbDocs[kbId]) {
                const docIds = kbDocs[kbId].map(d => d.id)
                setSelectedDocIds(prev => prev.filter(id => !docIds.includes(id)))
            }
        } else {
            setSelectedKbIds(prev => [...prev, kbId])
            if (kbDocs[kbId]) {
                const docIds = kbDocs[kbId].map(d => d.id)
                setSelectedDocIds(prev => prev.filter(id => !docIds.includes(id)))
            }
        }
    }, [selectedKbIds, kbDocs])

    const toggleDocSelect = useCallback((kbId: number, docId: number) => {
        if (selectedKbIds.includes(kbId)) {
            setSelectedKbIds(prev => prev.filter(id => id !== kbId))
            const docs = kbDocs[kbId] || []
            const otherDocIds = docs.map(d => d.id).filter(id => id !== docId)
            setSelectedDocIds(prev => [...prev, ...otherDocIds])
            return
        }

        setSelectedDocIds(prev => {
            const isDocSelected = prev.includes(docId)
            const newDocIds = isDocSelected
                ? prev.filter(id => id !== docId)
                : [...prev, docId]

            const docs = kbDocs[kbId] || []
            const allSelected = docs.length > 0 && docs.every(d => newDocIds.includes(d.id))

            if (allSelected) {
                setSelectedKbIds(kbs => [...kbs, kbId])
                const docIdsToRemove = docs.map(d => d.id)
                return newDocIds.filter(id => !docIdsToRemove.includes(id))
            }

            return newDocIds
        })
    }, [selectedKbIds, kbDocs])

    const isKbPartiallySelected = useCallback((kbId: number) => {
        if (selectedKbIds.includes(kbId)) return false
        const docs = kbDocs[kbId] || []
        return docs.some(d => selectedDocIds.includes(d.id))
    }, [selectedKbIds, selectedDocIds, kbDocs])

    const isDocSelected = useCallback((kbId: number, docId: number) => {
        if (selectedKbIds.includes(kbId)) return true
        return selectedDocIds.includes(docId)
    }, [selectedKbIds, selectedDocIds])

    const updateCount = (type: QuestionType, delta: number) => {
        setQuestionCounts(prev => {
            const current = prev[type]
            const next = Math.max(0, Math.min(20, current + delta))
            return { ...prev, [type]: next }
        })
    }

    const loadPreset = (p: QuizPreset) => {
        if (p.title) setTitle(p.title)
        setDifficulty(p.difficulty as Difficulty)
        setQuestionCounts(prev => ({ ...prev, ...p.question_counts }))
        if (p.subject) setSubject(p.subject)
        if (p.custom_prompt) setCustomPrompt(p.custom_prompt)
        setShowPresetPanel(false)
        toast.success(`已加载方案「${p.name}」`)
    }

    const savePreset = async () => {
        if (!savingName.trim()) { toast.error('请输入方案名称'); return }
        try {
            const preset = await presetApi.create({
                name: savingName.trim(),
                title: title || null,
                difficulty,
                question_counts: questionCounts,
                subject: subject || null,
                custom_prompt: customPrompt || null,
            })
            setPresets(prev => [preset, ...prev])
            setShowSaveInput(false)
            setSavingName('')
            toast.success('方案已保存')
        } catch {
            toast.error('保存失败，请重试')
        }
    }

    const deletePreset = async (id: number) => {
        try {
            await presetApi.delete(id)
            setPresets(prev => prev.filter(p => p.id !== id))
        } catch {
            toast.error('删除失败')
        }
    }

    const handleGenerate = useCallback(async () => {
        if (selectedKbIds.length === 0 && selectedDocIds.length === 0) {
            toast.error('请至少选择一个知识库或文档')
            return
        }

        // Initialize nodes
        const activeNodeConfig = STANDARD_NODE_CONFIG
        const initialNodes: NodeTrace[] = activeNodeConfig.map(n => ({
            ...n,
            status: 'pending' as const,
            message: '',
        }))

        setIsGenerating(true)
        setProgress(0)
        setNodes(initialNodes)
        setSelectedNodeId(null)
        setIsComplete(false)
        setCompletedSessionId(null)
        setErrorMessage(null)

        try {
            const solverUserId = quizMode === 'challenge'
                ? (challengeTarget?.id ?? targetUserId ?? undefined)
                : undefined

            const session = await quizApi.create({
                mode: quizMode,
                generation_mode: 'standard',
                title: title || undefined,
                knowledge_scope: { kb_ids: selectedKbIds, doc_ids: selectedDocIds },
                quiz_config: {
                    question_counts: questionCounts,
                    difficulty,
                    custom_prompt: customPrompt,
                    subject: subject.trim() || undefined,
                },
                ...(solverUserId ? { solver_id: solverUserId } : {}),
                ...(circleIdParam ? { circle_id: circleIdParam } : {}),
            })

            setCompletedSessionId(session.id)

            // Subscribe to SSE for progress (with auto-reconnect)
            const cleanup = await subscribeSSE(session.id, {
                onEvent: (event: SSEEvent) => {
                    if (event.type === 'node_start' && event.node) {
                        setNodes(prev => prev.map(n =>
                            n.id === event.node
                                ? { ...n, status: 'running', message: (event.message as string) || '', startTime: Date.now() }
                                : n
                        ))
                        setSelectedNodeId(event.node as string)
                    }

                    if (event.type === 'node_complete' && event.node) {
                        setNodes(prev => prev.map(n =>
                            n.id === event.node
                                ? {
                                    ...n,
                                    status: 'done',
                                    message: (event.message as string) || '',
                                    endTime: Date.now(),
                                    inputSummary: event.input_summary as Record<string, unknown> | undefined,
                                    outputSummary: event.output_summary as Record<string, unknown> | undefined,
                                }
                                : n
                        ))
                    }

                    if (event.progress !== undefined) {
                        setProgress(event.progress as number)
                    }

                    if (event.type === 'complete') {
                        cleanup()
                        setIsComplete(true)
                        toast.success(`出题完成！共 ${event.question_count || 0} 道题目`)
                    }

                    if (event.type === 'error') {
                        cleanup()
                        setErrorMessage((event.error as string) || '出题失败')
                        // Mark current running node as error
                        setNodes(prev => prev.map(n =>
                            n.status === 'running'
                                ? { ...n, status: 'error', message: (event.error as string) || '执行出错' }
                                : n
                        ))
                    }
                },
                onReconnect: async () => {
                    try {
                        const s = await quizApi.get(session.id)
                        if (s.status === 'ready') {
                            cleanup()
                            setIsComplete(true)
                            toast.success('出题完成！')
                        }
                    } catch { /* ignore — SSE reconnected, subsequent events will arrive */ }
                },
                onError: () => {
                    quizApi.get(session.id).then(s => {
                        if (s.status === 'ready') setIsComplete(true)
                        else setErrorMessage('连接中断，请刷新页面重试')
                    }).catch(() => setErrorMessage('连接中断，请刷新页面重试'))
                },
            })
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '出题失败')
            setIsGenerating(false)
        }
    }, [selectedKbIds, selectedDocIds, questionCounts, difficulty, title, customPrompt, subject, quizMode, challengeTarget, targetUserId, circleIdParam])

    const selectedNode = nodes.find(n => n.id === selectedNodeId)

    if (isGenerating) {
        return (
            <div className="flex h-full flex-col animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
                            <Brain className="size-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-foreground">AI 出题追踪面板</h2>
                            <p className="text-xs text-muted-foreground">
                                {isComplete ? '出题完成' : errorMessage ? '出题出错' : '正在生成中...'}
                            </p>
                        </div>
                    </div>
                    {/* Progress badge */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
                            {!isComplete && !errorMessage && <Loader2 className="size-3.5 animate-spin text-primary" />}
                            {isComplete && <CheckCircle2 className="size-3.5 text-emerald-500" />}
                            {errorMessage && <XCircle className="size-3.5 text-red-500" />}
                            <span className="text-sm font-medium text-foreground">
                                {Math.round(progress * 100)}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="h-1 bg-muted">
                    <div
                        className={`h-full transition-all duration-700 ease-out ${errorMessage ? 'bg-red-500' : 'bg-gradient-to-r from-indigo-500 to-purple-600'} `}
                        style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                </div>

                {/* Split panel */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Node timeline */}
                    <div className="w-[340px] flex-shrink-0 overflow-y-auto border-r border-border bg-card/50 p-4">
                        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            节点执行流程
                        </h3>
                        <div className="space-y-1">
                            {nodes.map((node) => {
                                const Icon = node.icon
                                const isSelected = selectedNodeId === node.id
                                const duration = node.startTime && node.endTime
                                    ? ((node.endTime - node.startTime) / 1000).toFixed(1) + 's'
                                    : node.startTime && node.status === 'running'
                                        ? '...'
                                        : null

                                return (
                                    <button
                                        key={node.id}
                                        onClick={() => setSelectedNodeId(node.id)}
                                        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${isSelected
                                            ? 'bg-primary/8 ring-1 ring-primary/20'
                                            : 'hover:bg-accent/60'
                                            } `}
                                    >
                                        {/* Status icon */}
                                        <div className="flex-shrink-0">
                                            {node.status === 'done' && (
                                                <CheckCircle2 className="size-5 text-emerald-500" />
                                            )}
                                            {node.status === 'running' && (
                                                <Loader2 className="size-5 animate-spin text-primary" />
                                            )}
                                            {node.status === 'error' && (
                                                <XCircle className="size-5 text-red-500" />
                                            )}
                                            {node.status === 'pending' && (
                                                <Circle className="size-5 text-muted-foreground/30" />
                                            )}
                                        </div>

                                        {/* Label */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <Icon className={`size-3.5 ${node.status === 'pending' ? 'text-muted-foreground/40' : 'text-muted-foreground'} `} />
                                                <span className={`text-sm ${node.status === 'running'
                                                    ? 'font-medium text-foreground'
                                                    : node.status === 'done'
                                                        ? 'text-foreground'
                                                        : node.status === 'error'
                                                            ? 'text-red-500'
                                                            : 'text-muted-foreground/50'
                                                    } `}>
                                                    {node.label}
                                                </span>
                                            </div>
                                            {node.message && node.status !== 'pending' && (
                                                <p className="mt-0.5 truncate text-xs text-muted-foreground pl-5.5">
                                                    {node.message}
                                                </p>
                                            )}
                                        </div>

                                        {/* Duration */}
                                        {duration && (
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                                <Clock className="size-3" />
                                                {duration}
                                            </div>
                                        )}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Connecting lines decoration between nodes */}
                    </div>

                    {/* Right: Selected node detail */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {selectedNode ? (
                            <div className="space-y-5 animate-fade-in">
                                {/* Node header */}
                                <div className="flex items-center gap-3">
                                    {(() => {
                                        const Icon = selectedNode.icon
                                        return (
                                            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
                                                <Icon className="size-5 text-primary" />
                                            </div>
                                        )
                                    })()}
                                    <div>
                                        <h3 className="font-semibold text-foreground">{selectedNode.label}</h3>
                                        <p className="text-xs text-muted-foreground">{selectedNode.id}</p>
                                    </div>
                                    <div className="ml-auto">
                                        {selectedNode.status === 'done' && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
                                                <CheckCircle2 className="size-3" /> 完成
                                            </span>
                                        )}
                                        {selectedNode.status === 'running' && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                                                <Loader2 className="size-3 animate-spin" /> 执行中
                                            </span>
                                        )}
                                        {selectedNode.status === 'error' && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600">
                                                <XCircle className="size-3" /> 出错
                                            </span>
                                        )}
                                        {selectedNode.status === 'pending' && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                                <Circle className="size-3" /> 等待中
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Status message */}
                                {selectedNode.message && (
                                    <div className="rounded-lg border border-border bg-accent/30 px-4 py-3">
                                        <p className="text-sm text-foreground">{selectedNode.message}</p>
                                    </div>
                                )}

                                {/* Input Summary */}
                                {selectedNode.inputSummary && Object.keys(selectedNode.inputSummary).length > 0 && (
                                    <div>
                                        <h4 className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                            <ArrowRight className="size-3" /> 输入参数
                                        </h4>
                                        <div className="rounded border border-border/50 bg-card overflow-hidden">
                                            <div className="divide-y divide-border">
                                                {Object.entries(selectedNode.inputSummary).map(([key, value]) => (
                                                    <div key={key} className="flex gap-4 px-3 py-1.5">
                                                        <span className="text-[10px] font-mono text-muted-foreground w-28 flex-shrink-0 pt-0.5">{key}</span>
                                                        <span className="text-xs text-foreground break-all">
                                                            {renderValue(value)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Output Summary */}
                                {selectedNode.outputSummary && Object.keys(selectedNode.outputSummary).length > 0 && (
                                    <div>
                                        <h4 className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                            <ArrowLeft className="size-3" /> 输出结果
                                        </h4>
                                        <div className="rounded border border-border/50 bg-card overflow-hidden">
                                            <div className="divide-y divide-border">
                                                {Object.entries(selectedNode.outputSummary).map(([key, value]) => (
                                                    <div key={key} className="flex gap-4 px-3 py-1.5">
                                                        <span className="text-[10px] font-mono text-muted-foreground w-28 flex-shrink-0 pt-0.5">{key}</span>
                                                        <div className="text-xs text-foreground break-all flex-1">
                                                            {renderValue(value)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Timing */}
                                {selectedNode.startTime && (
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Clock className="size-3" />
                                            开始: {new Date(selectedNode.startTime).toLocaleTimeString()}
                                        </span>
                                        {selectedNode.endTime && (
                                            <>
                                                <span>
                                                    结束: {new Date(selectedNode.endTime).toLocaleTimeString()}
                                                </span>
                                                <span className="font-medium text-foreground">
                                                    耗时: {((selectedNode.endTime - selectedNode.startTime) / 1000).toFixed(2)}s
                                                </span>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Running placeholder */}
                                {selectedNode.status === 'running' && !selectedNode.outputSummary && (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="text-center">
                                            <Loader2 className="mx-auto size-8 animate-spin text-primary/40" />
                                            <p className="mt-3 text-sm text-muted-foreground">正在执行中...</p>
                                        </div>
                                    </div>
                                )}

                                {/* Pending placeholder */}
                                {selectedNode.status === 'pending' && (
                                    <div className="flex items-center justify-center py-12">
                                        <p className="text-sm text-muted-foreground/50">等待前置节点完成</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex h-full items-center justify-center">
                                <div className="text-center">
                                    <Brain className="mx-auto size-12 text-muted-foreground/20" />
                                    <p className="mt-3 text-sm text-muted-foreground">
                                        点击左侧节点查看执行详情
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom bar */}
                {(isComplete || errorMessage) && (
                    <div className="border-t border-border bg-card px-6 py-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                                {isComplete && '所有节点已执行完毕'}
                                {errorMessage && `出错: ${errorMessage} `}
                            </p>
                            <div className="flex gap-3">
                                {errorMessage && (
                                    <button
                                        onClick={() => { setIsGenerating(false); setErrorMessage(null) }}
                                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                                    >
                                        返回修改
                                    </button>
                                )}
                                {isComplete && completedSessionId && (
                                    <button
                                        onClick={() => navigate(`/quiz/${completedSessionId}`)}
                                        className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:-translate-y-0.5"
                                    >
                                        查看生成的题目
                                        <ArrowRight className="size-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="container mx-auto max-w-7xl space-y-6 p-6 lg:p-10 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button onClick={() => navigate('/quiz')} className="flex size-9 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent">
                    <ArrowLeft className="size-4" />
                </button>
                <div>
                    <h1 className="text-foreground">智能出题</h1>
                    <p className="text-sm text-muted-foreground">AI 根据你的学习画像，从知识库中智能抽取内容并生成测验题目。</p>
                </div>
            </div>

            {/* Target user banner */}
            {quizMode === 'challenge' && (challengeTarget || targetUserId) && (
                <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                    <Info className="size-4 shrink-0 text-primary" />
                    <span className="text-foreground">
                        正在为 <span className="font-semibold">
                            {challengeTarget ? (challengeTarget.full_name || challengeTarget.username) : `#${targetUserId}`}
                        </span> 出题，已根据其学习画像预填难度配置
                    </span>
                </div>
            )}

            {/* Circle mode banner */}
            {quizMode === 'circle' && circleIdParam && (
                <div className="flex items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 py-3 text-sm">
                    <Users className="size-4 shrink-0 text-violet-600" />
                    <span className="text-foreground">
                        正在为「<span className="font-semibold text-violet-600">{circleName || '加载中...'}</span>」出题 — 题目将基于圈子集体画像的薄弱知识点生成
                    </span>
                </div>
            )}

            {/* Quiz Mode Selector (not shown for circle mode) */}
            {!circleIdParam && (
                <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/10 to-pink-500/10">
                            <Swords className="size-5 text-violet-600" />
                        </div>
                        <div>
                            <h3 className="font-medium text-foreground">出题模式</h3>
                            <p className="text-xs text-muted-foreground">选择题目用途</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {/* Self test */}
                        <button
                            onClick={() => { setQuizMode('self_test'); setChallengeTarget(null); setUserQuery(''); setUserResults([]) }}
                            className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition-all ${
                                quizMode === 'self_test'
                                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                                    : 'border-border bg-card hover:border-primary/30 hover:bg-accent/40'
                            }`}
                        >
                            <Target className={`size-6 ${quizMode === 'self_test' ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className={`font-medium ${quizMode === 'self_test' ? 'text-primary' : 'text-foreground'}`}>自我测试</span>
                            <span className="text-xs text-muted-foreground">仅自己作答</span>
                        </button>

                        {/* Challenge */}
                        <button
                            onClick={() => setQuizMode('challenge')}
                            className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition-all ${
                                quizMode === 'challenge'
                                    ? 'border-violet-500/50 bg-violet-500/5 ring-1 ring-violet-500/20'
                                    : 'border-border bg-card hover:border-violet-500/30 hover:bg-accent/40'
                            }`}
                        >
                            <Swords className={`size-6 ${quizMode === 'challenge' ? 'text-violet-600' : 'text-muted-foreground'}`} />
                            <span className={`font-medium ${quizMode === 'challenge' ? 'text-violet-600' : 'text-foreground'}`}>挑战他人</span>
                            <span className="text-xs text-muted-foreground">指定用户作答</span>
                        </button>
                    </div>

                    {/* Challenge target picker */}
                    {quizMode === 'challenge' && (
                        <div className="space-y-2 pt-1">
                            <label className="text-sm font-medium text-foreground">搜索挑战对象</label>

                            {/* Selected target pill */}
                            {challengeTarget ? (
                                <div className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 px-3 py-2">
                                    <div className="flex size-7 items-center justify-center rounded-full bg-violet-500/10">
                                        <User className="size-4 text-violet-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">
                                            {challengeTarget.full_name || challengeTarget.username}
                                        </p>
                                        <p className="text-xs text-muted-foreground">@{challengeTarget.username}</p>
                                    </div>
                                    <button
                                        onClick={() => { setChallengeTarget(null); setUserQuery(''); setUserResults([]) }}
                                        className="flex size-6 items-center justify-center rounded-full hover:bg-violet-500/10 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        <X className="size-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                                        <input
                                            value={userQuery}
                                            onChange={e => setUserQuery(e.target.value)}
                                            placeholder="搜索用户名..."
                                            className="w-full rounded-xl border border-border bg-input-background pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                                        />
                                        {userSearching && (
                                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                                        )}
                                    </div>

                                    {userResults.length > 0 && (
                                        <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                                            {userResults.map(u => (
                                                <button
                                                    key={u.id}
                                                    onClick={() => {
                                                        setChallengeTarget(u)
                                                        setUserQuery('')
                                                        setUserResults([])
                                                        // Adjust difficulty based on target's profile
                                                        profileApi.getUserProfile(u.id).then(p => {
                                                            const acc = p.overall_accuracy
                                                            if (acc > 0.8) setDifficulty('hard')
                                                            else if (acc >= 0.6) setDifficulty('medium')
                                                            else setDifficulty('easy')
                                                        }).catch(() => { /* no profile yet */ })
                                                    }}
                                                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/60 transition-colors border-b border-border last:border-0"
                                                >
                                                    <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                                                        <User className="size-4 text-primary" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-foreground truncate">
                                                            {u.full_name || u.username}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">@{u.username}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {userQuery.trim() && !userSearching && userResults.length === 0 && (
                                        <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-lg">
                                            未找到匹配用户
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
                {/* Left Column: Knowledge Base */}
                <div className="space-y-6">
                    <div className="rounded-2xl border border-border bg-card overflow-hidden">
                        <div className="flex items-center gap-3 p-6 border-b border-border bg-accent/10">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
                                <BookOpen className="size-5 text-primary" />
                            </div>
                            <div className="text-left">
                                <h3 className="font-medium text-foreground">选择知识库</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {selectedKbIds.length > 0 || selectedDocIds.length > 0
                                        ? `已选择 ${selectedKbIds.length} 个知识库, ${selectedDocIds.length} 个文档`
                                        : '从左侧勾选你需要的出题范围'}
                                </p>
                            </div>
                        </div>

                        <div className="p-4 space-y-3">
                            {knowledgeBases.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">暂无知识库，请先上传文档</p>
                            ) : (
                                knowledgeBases.map(kb => {
                                    const isFullySelected = selectedKbIds.includes(kb.id)
                                    const isPartiallySelected = isKbPartiallySelected(kb.id)
                                    const isExpanded = kbExpanded.includes(kb.id)
                                    const docs = kbDocs[kb.id] || []

                                    return (
                                        <div key={kb.id} className={`rounded-xl border transition-all ${isFullySelected || isPartiallySelected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:border-primary/20'} `}>
                                            <div className="flex items-center gap-3 p-3 text-left w-full cursor-pointer hover:bg-accent/30 rounded-t-xl transition-colors" onClick={() => toggleKbExpand(kb.id)}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); toggleKbSelect(kb.id); }}
                                                    className={`flex-shrink-0 flex size-5 items-center justify-center rounded border transition-colors ${isFullySelected ? 'border-primary bg-primary' :
                                                        isPartiallySelected ? 'border-primary bg-primary/20' :
                                                            'border-border hover:border-primary/50'
                                                        } `}
                                                >
                                                    {isFullySelected && <CheckCircle2 className="size-3.5 text-white" />}
                                                    {isPartiallySelected && <div className="size-2.5 rounded-sm bg-primary" />}
                                                </button>

                                                <div className="flex-1 min-w-0">
                                                    <p className="truncate text-sm font-semibold text-foreground">{kb.name}</p>
                                                    <p className="text-xs text-muted-foreground">{kb.document_count} 个文档</p>
                                                </div>

                                                <div className="p-1 rounded text-muted-foreground">
                                                    {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div className="border-t border-border/40 bg-background/50 p-2 space-y-1 rounded-b-xl">
                                                    {docs.length === 0 ? (
                                                        <p className="py-3 text-center text-xs text-muted-foreground italic">无文档数据</p>
                                                    ) : (
                                                        docs.map(doc => {
                                                            const docSelected = isDocSelected(kb.id, doc.id)
                                                            return (
                                                                <button
                                                                    key={doc.id}
                                                                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/80 transition-colors"
                                                                    onClick={() => toggleDocSelect(kb.id, doc.id)}
                                                                >
                                                                    <div className={`flex size-4 items-center justify-center rounded border transition-colors ${docSelected ? 'border-primary bg-primary' : 'border-border'} `}>
                                                                        {docSelected && <CheckCircle2 className="size-3 text-white" />}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0 text-left">
                                                                        <p className="text-xs text-foreground/80 truncate">
                                                                            {doc.original_filename}
                                                                        </p>
                                                                    </div>
                                                                </button>
                                                            )
                                                        })
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Quiz Config */}
                <div className="space-y-6">
                    <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10">
                                    <Target className="size-5 text-amber-600" />
                                </div>
                                <div>
                                    <h3 className="font-medium text-foreground">题目配置</h3>
                                    <p className="text-xs text-muted-foreground">自定义题型、数量和难度</p>
                                </div>
                            </div>
                            {/* Preset button */}
                            <div className="relative">
                                <button
                                    onClick={() => { setShowPresetPanel(v => !v); setShowSaveInput(false) }}
                                    className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                >
                                    <ClipboardList className="size-3.5" />
                                    方案
                                    <ChevronDown className={`size-3 transition-transform ${showPresetPanel ? 'rotate-180' : ''}`} />
                                </button>
                                {showPresetPanel && (
                                    <div className="absolute right-0 top-full mt-1 z-20 w-72 rounded-xl border border-border bg-card shadow-lg p-3 space-y-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-medium text-muted-foreground">我的方案（{presets.length}/10）</span>
                                            {!showSaveInput ? (
                                                <button
                                                    onClick={() => setShowSaveInput(true)}
                                                    disabled={presets.length >= 10}
                                                    title={presets.length >= 10 ? '已达上限（10/10）' : '保存当前配置'}
                                                    className="text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    + 保存当前
                                                </button>
                                            ) : (
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        autoFocus
                                                        value={savingName}
                                                        onChange={e => setSavingName(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter') savePreset(); if (e.key === 'Escape') { setShowSaveInput(false); setSavingName('') } }}
                                                        placeholder="方案名称"
                                                        className="w-28 rounded-lg border border-border bg-input-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                                                    />
                                                    <button onClick={savePreset} className="flex size-6 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary/90"><Check className="size-3" /></button>
                                                    <button onClick={() => { setShowSaveInput(false); setSavingName('') }} className="flex size-6 items-center justify-center rounded-lg border border-border hover:bg-accent"><X className="size-3" /></button>
                                                </div>
                                            )}
                                        </div>
                                        {presets.length === 0 ? (
                                            <p className="text-xs text-muted-foreground text-center py-3">暂无方案，保存当前配置即可快速复用</p>
                                        ) : (
                                            <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
                                                {presets.map(p => (
                                                    <div key={p.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent/50 transition-colors">
                                                        <div className="min-w-0 flex-1">
                                                            <span className="text-xs font-medium text-foreground truncate block">{p.name}</span>
                                                            <span className="text-xs text-muted-foreground">{p.difficulty === 'easy' ? '简单' : p.difficulty === 'hard' ? '困难' : '中等'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 ml-2 shrink-0">
                                                            <button onClick={() => loadPreset(p)} className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors">加载</button>
                                                            <button onClick={() => deletePreset(p.id)} className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><X className="size-3" /></button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>



                        {/* Title */}
                        <div>
                            <label className="text-sm font-medium text-foreground">测验标题（可选）</label>
                            <input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="例如：第三章复习测验"
                                className="mt-2 w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30 transition-all font-medium"
                            />
                        </div>

                        {/* Difficulty */}
                        <div>
                            <label className="text-sm font-medium text-foreground">难度等级</label>
                            <div className="mt-2 grid grid-cols-3 gap-2">
                                {DIFFICULTY_CONFIG.map(d => (
                                    <button
                                        key={d.value}
                                        onClick={() => setDifficulty(d.value)}
                                        className={`rounded - xl border py - 2.5 text - sm transition - all focus: outline - none focus: ring - 2 focus: ring - primary / 30 ${difficulty === d.value
                                            ? `${d.color} shadow-sm ring-1 ring-current/20`
                                            : 'border-border bg-card text-muted-foreground hover:border-border/80 hover:bg-accent/50'
                                            } `}
                                    >
                                        {d.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Question Type Counts */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-foreground">题型与数量</label>
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                    总计: {Object.values(questionCounts).reduce((a, b) => a + b, 0)} 题
                                </span>
                            </div>
                            <div className="space-y-2 rounded-xl border border-border bg-card overflow-hidden">
                                {(Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]).map(([type, label]) => (
                                    <div key={type} className="flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors border-b border-border last:border-0">
                                        <span className={`text-sm ${questionCounts[type] > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'} `}>
                                            {label}
                                        </span>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => updateCount(type, -1)}
                                                disabled={questionCounts[type] <= 0}
                                                className="flex size-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <span className="text-lg leading-none font-medium mb-0.5">-</span>
                                            </button>
                                            <span className="w-6 text-center text-sm font-medium text-foreground">
                                                {questionCounts[type]}
                                            </span>
                                            <button
                                                onClick={() => updateCount(type, 1)}
                                                disabled={questionCounts[type] >= 20 || Object.values(questionCounts).reduce((a, b) => a + b, 0) >= 50}
                                                className="flex size-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <span className="text-lg leading-none font-medium mb-0.5">+</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Subject */}
                        <div>
                            <label className="text-sm font-medium text-foreground">科目 / 主题（可选）</label>
                            <input
                                type="text"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                placeholder="例：数学、英语、综合..."
                                className="mt-2 w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">用于学习画像统计，留空则归入「综合」</p>
                        </div>

                        {/* Custom Prompt */}
                        <div>
                            <label className="text-sm font-medium text-foreground">自定义出题要求（可选）</label>
                            <textarea
                                value={customPrompt}
                                onChange={e => setCustomPrompt(e.target.value)}
                                placeholder="例如：重点考察第二部分的知识，选项要具有迷惑性..."
                                className="mt-2 w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30 transition-all min-h-[100px] resize-y custom-scrollbar"
                            />
                        </div>

                        {/* Generate button inside the card for better flow in right column */}
                        <div className="pt-2">
                            <button
                                onClick={handleGenerate}
                                disabled={(selectedKbIds.length === 0 && selectedDocIds.length === 0) || Object.values(questionCounts).reduce((a, b) => a + b, 0) === 0}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 py-3.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Sparkles className="size-4" />
                                开始 AI 出题
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}


function LongTextValue({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false)
    return (
        <div>
            <pre className={`text-xs text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed ${expanded ? '' : 'max-h-24 overflow-hidden'}`}>
                {text}
            </pre>
            {text.length > 300 && (
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="mt-1 text-[10px] text-primary hover:underline"
                >
                    {expanded ? '收起' : `展开全文（${text.length} 字符）`}
                </button>
            )}
        </div>
    )
}

function renderValue(value: unknown): React.ReactNode {
    if (value === null || value === undefined) {
        return <span className="text-muted-foreground/50 italic">null</span>
    }
    if (typeof value === 'boolean') {
        return <span className={value ? 'text-emerald-600' : 'text-red-500'}>{String(value)}</span>
    }
    if (typeof value === 'number') {
        return <span className="font-mono">{value}</span>
    }
    if (typeof value === 'string') {
        if (value.length > 300) return <LongTextValue text={value} />
        return value
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-muted-foreground/50 italic">[]</span>
        // Check if it's an array of objects (like top_chunks)
        if (typeof value[0] === 'object' && value[0] !== null) {
            return (
                <div className="space-y-2">
                    {value.map((item, i) => (
                        <div key={i} className="rounded-md border border-border/50 bg-accent/20 px-3 py-2 text-xs">
                            {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                                <div key={k} className="flex gap-2">
                                    <span className="font-mono text-muted-foreground">{k}:</span>
                                    <div className="text-foreground">{renderValue(v)}</div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )
        }
        // Simple array
        return (
            <div className="flex flex-wrap gap-1.5">
                {value.map((item, i) => (
                    <span key={i} className="inline-block rounded-md bg-accent/50 px-2 py-0.5 text-xs">
                        {String(item).length > 60 ? String(item).slice(0, 60) + '...' : String(item)}
                    </span>
                ))}
            </div>
        )
    }
    if (typeof value === 'object') {
        return (
            <div className="space-y-1">
                {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                        <span className="font-mono text-muted-foreground">{k}:</span>
                        <div className="text-foreground">{renderValue(v)}</div>
                    </div>
                ))}
            </div>
        )
    }
    return String(value)
}
