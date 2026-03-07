/**
 * QuizCreatePage — select knowledge scope + configure quiz parameters.
 * Shows full-chain traceability panel during generation.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
    ArrowLeft, Sparkles, BookOpen, ChevronDown, ChevronUp,
    Loader2, CheckCircle2, Brain, Target, Circle, XCircle,
    Clock, ArrowRight, Search, PenTool, FileText, Shuffle
} from 'lucide-react'
import { kbApi, quizApi, subscribeSSE, type KnowledgeBase, type KBDocument, type SSEEvent } from '../lib/api'


type QuestionType = 'single_choice' | 'multiple_choice' | 'fill_blank' | 'short_answer' | 'true_false'
type Difficulty = 'easy' | 'medium' | 'hard'

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
    single_choice: '单选题',
    multiple_choice: '多选题',
    fill_blank: '填空题',
    short_answer: '简答题',
    true_false: '判断题',
}

const DIFFICULTY_CONFIG: { value: Difficulty; label: string; color: string }[] = [
    { value: 'easy', label: '简单', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    { value: 'medium', label: '中等', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    { value: 'hard', label: '困难', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
]


/** A single step execution within a question's pipeline */
interface StepExecution {
    nodeId: string
    nodeLabel: string
    status: 'running' | 'done' | 'error'
    message: string
    startTime: number
    endTime?: number
    inputSummary?: Record<string, unknown>
    outputSummary?: Record<string, unknown>
}

/** All the pipeline steps grouped by question */
interface QuestionPipeline {
    questionIndex: number       // 1-indexed
    status: 'running' | 'done' | 'error'
    steps: StepExecution[]      // ordered sub-steps
}

/** Non-loop (prep / assembly) node trace */
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

// Left-panel nodes that run once (non-loop)
const PREP_NODES: { id: string; label: string; icon: typeof Brain }[] = [
    { id: 'scope_resolver', label: '解析出题范围', icon: Target },
    { id: 'rag_retriever', label: '检索文档知识', icon: Search },
    { id: 'hotspot_searcher', label: '检索时事热点', icon: Search },
    { id: 'few_shot_retriever', label: '预取真题范例', icon: BookOpen },
    { id: 'distributor', label: '分配出题素材', icon: Shuffle },
]
const ASSEMBLY_NODE = { id: 'paper_assembler', label: '组卷', icon: FileText }

// Loop sub-step node IDs → labels (few_shot_retriever moved to prep phase)
const PIPELINE_STEP_LABELS: Record<string, string> = {
    question_generator: '原创命题',
    quality_checker: '质量快审',
    solve_verifier: 'AI学情模拟测算',
    difficulty_analyzer: '难度分析与调校',
}
const PIPELINE_STEP_IDS = new Set(Object.keys(PIPELINE_STEP_LABELS))

export default function QuizCreateProPage() {
    const navigate = useNavigate()

    // KB selection — split into document KBs and question bank KBs
    const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
    const [selectedDocumentKbIds, setSelectedDocumentKbIds] = useState<number[]>([])
    const [selectedDocumentDocIds, setSelectedDocumentDocIds] = useState<number[]>([])
    const [kbExpanded, setKbExpanded] = useState<number[]>([])
    const [kbDocs, setKbDocs] = useState<Record<number, KBDocument[]>>({})
    const [selectedBankKbIds, setSelectedBankKbIds] = useState<number[]>([])
    const [bankKbSubjects, setBankKbSubjects] = useState<Record<number, string[]>>({})
    const [selectedBankKbSubjects, setSelectedBankKbSubjects] = useState<Record<number, string[]>>({})

    const documentKBs = knowledgeBases.filter(kb => kb.kb_type !== 'question_bank')
    const bankKBs = knowledgeBases.filter(kb => kb.kb_type === 'question_bank')

    // Config
    const [questionCounts, setQuestionCounts] = useState<Record<QuestionType, number>>({
        single_choice: 2, multiple_choice: 0, fill_blank: 1, short_answer: 2, true_false: 0,
    })
    const [difficulty, setDifficulty] = useState<Difficulty>('medium')
    const [title, setTitle] = useState('')
    const [customPrompt, setCustomPrompt] = useState('')
    const [subject, setSubject] = useState('')

    // Generation state
    const [isGenerating, setIsGenerating] = useState(false)
    const [progress, setProgress] = useState(0)
    const [prepNodes, setPrepNodes] = useState<NodeTrace[]>([])
    const [assemblyNode, setAssemblyNode] = useState<NodeTrace | null>(null)
    const [questionPipelines, setQuestionPipelines] = useState<QuestionPipeline[]>([])
    const [isComplete, setIsComplete] = useState(false)
    const [completedSessionId, setCompletedSessionId] = useState<string | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    // Detail panel selection
    type Selection = { type: 'prep'; nodeId: string } | { type: 'pipeline'; questionIdx: number } | { type: 'assembly' } | null
    const [selection, setSelection] = useState<Selection>(null)
    const [expandedStepIdx, setExpandedStepIdx] = useState<number | null>(null)
    // For pipeline view: which questions are expanded (for many-question scrollable list)
    const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set())

    // Load knowledge bases
    useEffect(() => {
        kbApi.list().then(setKnowledgeBases).catch(() => toast.error('加载知识库失败'))
    }, [])

    const toggleKbExpand = useCallback(async (id: number) => {
        setKbExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
        if (!kbDocs[id]) {
            try {
                const docs = await kbApi.listDocs(id)
                setKbDocs(prev => ({ ...prev, [id]: docs }))
            } catch { toast.error('加载文档失败') }
        }
    }, [kbDocs])

    const toggleKbSelect = useCallback((kbId: number) => {
        const isSelected = selectedDocumentKbIds.includes(kbId)
        if (isSelected) {
            setSelectedDocumentKbIds(prev => prev.filter(id => id !== kbId))
            if (kbDocs[kbId]) {
                const docIds = kbDocs[kbId].map(d => d.id)
                setSelectedDocumentDocIds(prev => prev.filter(id => !docIds.includes(id)))
            }
        } else {
            setSelectedDocumentKbIds(prev => [...prev, kbId])
            if (kbDocs[kbId]) {
                const docIds = kbDocs[kbId].map(d => d.id)
                setSelectedDocumentDocIds(prev => prev.filter(id => !docIds.includes(id)))
            }
        }
    }, [selectedDocumentKbIds, kbDocs])

    const toggleDocSelect = useCallback((kbId: number, docId: number) => {
        if (selectedDocumentKbIds.includes(kbId)) {
            setSelectedDocumentKbIds(prev => prev.filter(id => id !== kbId))
            const docs = kbDocs[kbId] || []
            const otherDocIds = docs.map(d => d.id).filter(id => id !== docId)
            setSelectedDocumentDocIds(prev => [...prev, ...otherDocIds])
            return
        }
        setSelectedDocumentDocIds(prev => {
            const isDocSelected = prev.includes(docId)
            const newDocIds = isDocSelected ? prev.filter(id => id !== docId) : [...prev, docId]
            const docs = kbDocs[kbId] || []
            const allSelected = docs.length > 0 && docs.every(d => newDocIds.includes(d.id))
            if (allSelected) {
                setSelectedDocumentKbIds(kbs => [...kbs, kbId])
                const docIdsToRemove = docs.map(d => d.id)
                return newDocIds.filter(id => !docIdsToRemove.includes(id))
            }
            return newDocIds
        })
    }, [selectedDocumentKbIds, kbDocs])

    const isKbPartiallySelected = useCallback((kbId: number) => {
        if (selectedDocumentKbIds.includes(kbId)) return false
        const docs = kbDocs[kbId] || []
        return docs.some(d => selectedDocumentDocIds.includes(d.id))
    }, [selectedDocumentKbIds, selectedDocumentDocIds, kbDocs])

    const isDocSelected = useCallback((kbId: number, docId: number) => {
        if (selectedDocumentKbIds.includes(kbId)) return true
        return selectedDocumentDocIds.includes(docId)
    }, [selectedDocumentKbIds, selectedDocumentDocIds])

    const toggleBankKbSelect = useCallback((kbId: number) => {
        if (selectedBankKbIds.includes(kbId)) {
            setSelectedBankKbIds(prev => prev.filter(id => id !== kbId))
            setSelectedBankKbSubjects(prev => { const { [kbId]: _, ...rest } = prev; return rest })
            setBankKbSubjects(prev => { const { [kbId]: _, ...rest } = prev; return rest })
        } else {
            setSelectedBankKbIds(prev => [...prev, kbId])
            kbApi.getBankSubjects(kbId)
                .then(data => setBankKbSubjects(prev => ({ ...prev, [kbId]: data.subjects })))
                .catch(() => {})
        }
    }, [selectedBankKbIds])

    const toggleBankSubject = useCallback((kbId: number, subject: string) => {
        setSelectedBankKbSubjects(prev => {
            const current = prev[kbId] ?? []
            const has = current.includes(subject)
            return { ...prev, [kbId]: has ? current.filter(s => s !== subject) : [...current, subject] }
        })
    }, [])

    const updateCount = (type: QuestionType, delta: number) => {
        setQuestionCounts(prev => ({ ...prev, [type]: Math.max(0, Math.min(20, prev[type] + delta)) }))
    }

    const pipelineSummary = useMemo(() => {
        const total = questionPipelines.length
        const done = questionPipelines.filter(q => q.status === 'done').length
        const running = questionPipelines.filter(q => q.status === 'running').length
        const error = questionPipelines.filter(q => q.status === 'error').length
        const status: NodeTrace['status'] = error > 0 ? 'error' : running > 0 ? 'running' : done > 0 ? 'done' : 'pending'
        return { total, done, running, error, status }
    }, [questionPipelines])

    const handleGenerate = useCallback(async () => {
        if (selectedDocumentKbIds.length === 0 && selectedDocumentDocIds.length === 0 && selectedBankKbIds.length === 0) {
            toast.error('请至少选择一个文档知识库或真题库')
            return
        }

        setPrepNodes(PREP_NODES.map(n => ({ ...n, status: 'pending' as const, message: '' })))
        setAssemblyNode({ ...ASSEMBLY_NODE, status: 'pending', message: '' })
        setQuestionPipelines([])
        setIsGenerating(true)
        setProgress(0)
        setSelection(null)
        setIsComplete(false)
        setCompletedSessionId(null)
        setErrorMessage(null)
        setExpandedStepIdx(null)
        setExpandedQuestions(new Set())

        try {
            const session = await quizApi.create({
                mode: 'self_test',
                generation_mode: 'pro',
                title: title || undefined,
                knowledge_scope: {
                    document_kb_ids: selectedDocumentKbIds,
                    bank_kb_ids: selectedBankKbIds,
                    bank_kb_subjects: selectedBankKbSubjects,
                    doc_ids: selectedDocumentDocIds,
                },
                quiz_config: {
                    question_counts: questionCounts,
                    difficulty,
                    custom_prompt: customPrompt,
                    subject: subject.trim() || undefined,
                },
            })

            setCompletedSessionId(session.id)

            // SSE handler — routes events to prep nodes vs pipeline questions
            const cleanup = await subscribeSSE(
                session.id,
                (event: SSEEvent) => {
                    const nodeId = event.node as string | undefined

                    // Prep / assembly node events
                    if (nodeId && !PIPELINE_STEP_IDS.has(nodeId)) {
                        if (nodeId === 'paper_assembler') {
                            if (event.type === 'node_start') {
                                setAssemblyNode(prev => prev ? { ...prev, status: 'running', message: (event.message as string) || '', startTime: Date.now() } : prev)
                            }
                            if (event.type === 'node_complete') {
                                setAssemblyNode(prev => prev ? {
                                    ...prev, status: 'done',
                                    message: (event.message as string) || '',
                                    endTime: Date.now(),
                                    inputSummary: event.input_summary as Record<string, unknown> | undefined,
                                    outputSummary: event.output_summary as Record<string, unknown> | undefined,
                                } : prev)
                            }
                        } else {
                            // Prep node
                            if (event.type === 'node_start') {
                                setPrepNodes(prev => prev.map(n =>
                                    n.id === nodeId ? { ...n, status: 'running', message: (event.message as string) || '', startTime: Date.now() } : n
                                ))
                                setSelection({ type: 'prep', nodeId })
                            }
                            if (event.type === 'node_complete') {
                                setPrepNodes(prev => prev.map(n =>
                                    n.id === nodeId ? {
                                        ...n, status: 'done',
                                        message: (event.message as string) || '',
                                        endTime: Date.now(),
                                        inputSummary: event.input_summary as Record<string, unknown> | undefined,
                                        outputSummary: event.output_summary as Record<string, unknown> | undefined,
                                    } : n
                                ))
                            }
                        }
                    }

                    // Pipeline step events — routed by question_index
                    if (nodeId && PIPELINE_STEP_IDS.has(nodeId)) {
                        const msg = (event.message as string) || ''
                        const qi = event.question_index as number | undefined

                        if (event.type === 'node_start') {
                            setQuestionPipelines(prev => {
                                const next = [...prev]

                                // Find existing pipeline by question_index, or create one
                                let target = qi ? next.find(q => q.questionIndex === qi) : undefined

                                if (!target) {
                                    // Create a new question pipeline
                                    const qIdx = qi || (next.length + 1)
                                    target = {
                                        questionIndex: qIdx,
                                        status: 'running' as const,
                                        steps: [],
                                    }
                                    next.push(target)
                                    // Sort by question index to keep order stable
                                    next.sort((a, b) => a.questionIndex - b.questionIndex)
                                    setSelection({ type: 'pipeline', questionIdx: qIdx })
                                }

                                // Append step to the target question
                                const targetIdx = next.findIndex(q => q.questionIndex === target!.questionIndex)
                                next[targetIdx] = {
                                    ...next[targetIdx],
                                    status: 'running',
                                    steps: [...next[targetIdx].steps, {
                                        nodeId,
                                        nodeLabel: PIPELINE_STEP_LABELS[nodeId],
                                        status: 'running',
                                        message: msg,
                                        startTime: Date.now(),
                                    }],
                                }

                                return next
                            })
                        }

                        if (event.type === 'node_complete') {
                            setQuestionPipelines(prev => {
                                const next = [...prev]

                                // Find the target question by question_index
                                const targetIdx = qi
                                    ? next.findIndex(q => q.questionIndex === qi)
                                    : -1

                                // Fallback: search from end for a running step with matching nodeId
                                let queueIdx = targetIdx
                                if (queueIdx === -1) {
                                    for (let i = next.length - 1; i >= 0; i--) {
                                        if (next[i].steps.some(s => s.nodeId === nodeId && s.status === 'running')) {
                                            queueIdx = i
                                            break
                                        }
                                    }
                                }
                                if (queueIdx === -1) return prev

                                // Find the last running step matching this nodeId in the target question
                                const steps = [...next[queueIdx].steps]
                                let stepIdx = -1
                                for (let j = steps.length - 1; j >= 0; j--) {
                                    if (steps[j].nodeId === nodeId && steps[j].status === 'running') {
                                        stepIdx = j
                                        break
                                    }
                                }
                                if (stepIdx === -1) return prev

                                steps[stepIdx] = {
                                    ...steps[stepIdx],
                                    status: 'done',
                                    message: msg,
                                    endTime: Date.now(),
                                    inputSummary: event.input_summary as Record<string, unknown> | undefined,
                                    outputSummary: event.output_summary as Record<string, unknown> | undefined,
                                }

                                // Mark question as done when difficulty_analyzer completes with accepted=true
                                const isDone = nodeId === 'difficulty_analyzer' &&
                                    (event.output_summary as Record<string, unknown> | undefined)?.accepted === true

                                next[queueIdx] = {
                                    ...next[queueIdx],
                                    steps,
                                    status: isDone ? 'done' : next[queueIdx].status,
                                }

                                return next
                            })
                        }
                    }

                    if (event.progress !== undefined) {
                        setProgress(prev => Math.max(prev, event.progress as number))
                    }

                    if (event.type === 'complete') {
                        cleanup()
                        setIsComplete(true)
                        setProgress(1)
                        // Finalize any still-running nodes
                        setPrepNodes(prev => prev.map(n => n.status === 'running' ? { ...n, status: 'done', endTime: Date.now() } : n))
                        setAssemblyNode(prev => prev && prev.status === 'running' ? { ...prev, status: 'done', endTime: Date.now() } : prev)
                        setQuestionPipelines(prev => prev.map(q => {
                            if (q.status !== 'running') return q
                            return {
                                ...q,
                                status: 'done',
                                steps: q.steps.map(s => s.status === 'running' ? { ...s, status: 'done' as const, endTime: Date.now() } : s),
                            }
                        }))
                        toast.success(`出题完成！共 ${event.question_count || 0} 道题目`)
                    }

                    if (event.type === 'error') {
                        cleanup()
                        setErrorMessage((event.error as string) || '出题失败')
                        setPrepNodes(prev => prev.map(n => n.status === 'running' ? { ...n, status: 'error', endTime: Date.now() } : n))
                        setAssemblyNode(prev => prev && prev.status === 'running' ? { ...prev, status: 'error', endTime: Date.now() } : prev)
                        setQuestionPipelines(prev => prev.map(q => {
                            if (q.status !== 'running') return q
                            return {
                                ...q,
                                status: 'error',
                                steps: q.steps.map(s => s.status === 'running' ? { ...s, status: 'error' as const, message: '执行出错', endTime: Date.now() } : s),
                            }
                        }))
                    }
                },
                () => {
                    setTimeout(() => {
                        quizApi.get(session.id).then(s => {
                            if (s.status === 'ready') { setIsComplete(true); setProgress(1) }
                            else setErrorMessage('连接中断')
                        })
                    }, 2000)
                },
            )
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '出题失败')
            setIsGenerating(false)
        }
    }, [selectedDocumentKbIds, selectedDocumentDocIds, selectedBankKbIds, selectedBankKbSubjects, questionCounts, difficulty, title, customPrompt, subject])

    const StatusIcon = ({ status }: { status: string }) => {
        if (status === 'done') return <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
        if (status === 'running') return <Loader2 className="size-4 animate-spin text-primary shrink-0" />
        if (status === 'error') return <XCircle className="size-4 text-red-500 shrink-0" />
        return <Circle className="size-4 text-muted-foreground/30 shrink-0" />
    }

    const StatusBadge = ({ status }: { status: string }) => {
        if (status === 'done') return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600"><CheckCircle2 className="size-2.5" />完成</span>
        if (status === 'running') return <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"><Loader2 className="size-2.5 animate-spin" />执行中</span>
        if (status === 'error') return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600"><XCircle className="size-2.5" />出错</span>
        return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"><Circle className="size-2.5" />等待</span>
    }

    const formatDuration = (ms: number) => (ms / 1000).toFixed(1) + 's'

    if (isGenerating) {
        // Find the selected detail for right panel
        const selectedPrep = selection?.type === 'prep' ? prepNodes.find(n => n.id === selection.nodeId) : null
        const selectedAssembly = selection?.type === 'assembly' ? assemblyNode : null

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
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
                        {!isComplete && !errorMessage && <Loader2 className="size-3.5 animate-spin text-primary" />}
                        {isComplete && <CheckCircle2 className="size-3.5 text-emerald-500" />}
                        {errorMessage && <XCircle className="size-3.5 text-red-500" />}
                        <span className="text-sm font-medium text-foreground">
                            {Math.round(progress * 100)}%
                        </span>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="h-1 bg-muted">
                    <div
                        className={`h-full transition-all duration-700 ease-out ${errorMessage ? 'bg-red-500' : 'bg-gradient-to-r from-indigo-500 to-purple-600'}`}
                        style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                </div>

                {/* Split panel */}
                <div className="flex flex-1 overflow-hidden">
                    <div className="w-[300px] flex-shrink-0 overflow-y-auto border-r border-border bg-card/50 p-3">
                        <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-2">
                            执行流程
                        </h3>
                        <div className="space-y-0.5">
                            {/* Prep nodes */}
                            {prepNodes.map(node => {
                                const Icon = node.icon
                                const isSelected = selection?.type === 'prep' && selection.nodeId === node.id
                                const dur = node.startTime && node.endTime ? formatDuration(node.endTime - node.startTime) : node.status === 'running' ? '...' : null
                                return (
                                    <button
                                        key={node.id}
                                        onClick={() => { setSelection({ type: 'prep', nodeId: node.id }); setExpandedStepIdx(null) }}
                                        className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all ${isSelected ? 'bg-primary/8 ring-1 ring-primary/20' : 'hover:bg-accent/60'}`}
                                    >
                                        <StatusIcon status={node.status} />
                                        <Icon className={`size-3.5 ${node.status === 'pending' ? 'text-muted-foreground/30' : 'text-muted-foreground'}`} />
                                        <span className={`text-sm flex-1 truncate ${node.status === 'running' ? 'font-medium text-foreground' : node.status === 'done' ? 'text-foreground' : node.status === 'error' ? 'text-red-500' : 'text-muted-foreground/50'}`}>
                                            {node.label}
                                        </span>
                                        {dur && <span className="text-[10px] text-muted-foreground shrink-0">{dur}</span>}
                                    </button>
                                )
                            })}

                            {/* Divider */}
                            <div className="my-1.5 border-t border-border/50" />

                            {/* Pipeline summary row */}
                            <button
                                onClick={() => { setSelection({ type: 'pipeline', questionIdx: questionPipelines.length > 0 ? questionPipelines[questionPipelines.length - 1].questionIndex : 1 }); setExpandedStepIdx(null) }}
                                className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-all ${selection?.type === 'pipeline' ? 'bg-primary/8 ring-1 ring-primary/20' : 'hover:bg-accent/60'}`}
                            >
                                <StatusIcon status={pipelineSummary.status} />
                                <PenTool className={`size-3.5 ${pipelineSummary.status === 'pending' ? 'text-muted-foreground/30' : 'text-muted-foreground'}`} />
                                <span className={`text-sm flex-1 ${pipelineSummary.status === 'running' ? 'font-medium text-foreground' : pipelineSummary.status === 'done' ? 'text-foreground' : pipelineSummary.status === 'error' ? 'text-red-500' : 'text-muted-foreground/50'}`}>
                                    出题流水线
                                </span>
                                {pipelineSummary.total > 0 && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                                        {pipelineSummary.done}/{pipelineSummary.total}
                                    </span>
                                )}
                            </button>

                            {/* Divider */}
                            <div className="my-1.5 border-t border-border/50" />

                            {/* Assembly node */}
                            {assemblyNode && (
                                <button
                                    onClick={() => { setSelection({ type: 'assembly' }); setExpandedStepIdx(null) }}
                                    className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all ${selection?.type === 'assembly' ? 'bg-primary/8 ring-1 ring-primary/20' : 'hover:bg-accent/60'}`}
                                >
                                    <StatusIcon status={assemblyNode.status} />
                                    <FileText className={`size-3.5 ${assemblyNode.status === 'pending' ? 'text-muted-foreground/30' : 'text-muted-foreground'}`} />
                                    <span className={`text-sm flex-1 ${assemblyNode.status === 'running' ? 'font-medium text-foreground' : assemblyNode.status === 'done' ? 'text-foreground' : assemblyNode.status === 'error' ? 'text-red-500' : 'text-muted-foreground/50'}`}>
                                        {assemblyNode.label}
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5">
                        {/* Prep node detail */}
                        {selectedPrep && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="flex items-center gap-3">
                                    {(() => { const Icon = selectedPrep.icon; return <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10"><Icon className="size-4 text-primary" /></div> })()}
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-foreground text-sm">{selectedPrep.label}</h3>
                                        <p className="text-xs text-muted-foreground">{selectedPrep.id}</p>
                                    </div>
                                    <StatusBadge status={selectedPrep.status} />
                                </div>
                                {selectedPrep.message && <p className="text-sm text-muted-foreground">{selectedPrep.message}</p>}
                                {selectedPrep.inputSummary && Object.keys(selectedPrep.inputSummary).length > 0 && (
                                    <IOSection label="输入" data={selectedPrep.inputSummary} />
                                )}
                                {selectedPrep.outputSummary && Object.keys(selectedPrep.outputSummary).length > 0 && (
                                    <IOSection label="输出" data={selectedPrep.outputSummary} />
                                )}
                                {selectedPrep.startTime && (
                                    <TimingLine start={selectedPrep.startTime} end={selectedPrep.endTime} />
                                )}
                            </div>
                        )}

                        {/* Assembly node detail */}
                        {selectedAssembly && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="flex items-center gap-3">
                                    <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10"><FileText className="size-4 text-primary" /></div>
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-foreground text-sm">{selectedAssembly.label}</h3>
                                        <p className="text-xs text-muted-foreground">{selectedAssembly.id}</p>
                                    </div>
                                    <StatusBadge status={selectedAssembly.status} />
                                </div>
                                {selectedAssembly.message && <p className="text-sm text-muted-foreground">{selectedAssembly.message}</p>}
                                {selectedAssembly.outputSummary && Object.keys(selectedAssembly.outputSummary).length > 0 && (
                                    <IOSection label="输出" data={selectedAssembly.outputSummary} />
                                )}
                            </div>
                        )}

                        {/* Pipeline detail — per-question view */}
                        {selection?.type === 'pipeline' && (
                            <div className="space-y-3 animate-fade-in">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
                                        <PenTool className="size-4 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-foreground text-sm">出题流水线</h3>
                                        <p className="text-xs text-muted-foreground">
                                            提取真题 → 命题 → 质检 → 学情测算 → 难度调校
                                            {pipelineSummary.total > 0 && ` | ${pipelineSummary.done}/${pipelineSummary.total} 题完成`}
                                        </p>
                                    </div>
                                    <StatusBadge status={pipelineSummary.status} />
                                </div>

                                {questionPipelines.length === 0 && (
                                    <div className="flex items-center justify-center py-12">
                                        <p className="text-sm text-muted-foreground/50">等待前置节点完成</p>
                                    </div>
                                )}

                                {/* Question cards */}
                                <div className="space-y-2">
                                    {questionPipelines.map(q => {
                                        const isExpanded = expandedQuestions.has(q.questionIndex)
                                        const totalMs = q.steps.reduce((acc, s) => s.startTime && s.endTime ? acc + (s.endTime - s.startTime) : acc, 0)
                                        const lastStep = q.steps[q.steps.length - 1]
                                        // Extract question type / preview from generator output
                                        const genStep = q.steps.find(s => s.nodeId === 'question_generator' && s.status === 'done')
                                        const qType = genStep?.outputSummary?.question_type as string | undefined
                                        const preview = genStep?.outputSummary?.content_preview as string | undefined
                                        const diffStep = q.steps.find(s => s.nodeId === 'difficulty_analyzer' && s.status === 'done')
                                        const diffScore = diffStep?.outputSummary?.difficulty_score as number | undefined

                                        return (
                                            <div key={q.questionIndex} className="rounded-xl border border-border overflow-hidden">
                                                {/* Question header row */}
                                                <button
                                                    onClick={() => setExpandedQuestions(prev => {
                                                        const next = new Set(prev)
                                                        next.has(q.questionIndex) ? next.delete(q.questionIndex) : next.add(q.questionIndex)
                                                        return next
                                                    })}
                                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
                                                >
                                                    <StatusIcon status={q.status} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-medium text-foreground">
                                                                第 {q.questionIndex} 题
                                                            </span>
                                                            {qType && (
                                                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                                                                    {QUESTION_TYPE_LABELS[qType as QuestionType] || qType}
                                                                </span>
                                                            )}
                                                            {diffScore !== undefined && (
                                                                <span className="text-[10px] font-mono text-muted-foreground">
                                                                    难度 {diffScore.toFixed(2)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {preview && (
                                                            <p className="text-xs text-muted-foreground truncate mt-0.5">{preview}</p>
                                                        )}
                                                        {!preview && lastStep && (
                                                            <p className="text-xs text-muted-foreground truncate mt-0.5">{lastStep.message}</p>
                                                        )}
                                                    </div>
                                                    {totalMs > 0 && (
                                                        <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                                                            <Clock className="size-3" />
                                                            {formatDuration(totalMs)}
                                                        </span>
                                                    )}
                                                    {isExpanded ? <ChevronUp className="size-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />}
                                                </button>

                                                {/* Expanded: sub-step list */}
                                                {isExpanded && (
                                                    <div className="border-t border-border bg-accent/5">
                                                        {q.steps.map((step, sIdx) => {
                                                            const stepDur = step.startTime && step.endTime ? formatDuration(step.endTime - step.startTime) : step.status === 'running' ? '...' : null
                                                            const isStepExpanded = expandedStepIdx === sIdx && selection?.type === 'pipeline' && selection.questionIdx === q.questionIndex
                                                            return (
                                                                <div key={sIdx}>
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelection({ type: 'pipeline', questionIdx: q.questionIndex })
                                                                            setExpandedStepIdx(isStepExpanded ? null : sIdx)
                                                                        }}
                                                                        className="w-full flex items-center gap-2.5 px-5 py-2 hover:bg-accent/30 transition-colors text-left"
                                                                    >
                                                                        {step.status === 'done' && <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />}
                                                                        {step.status === 'running' && <Loader2 className="size-3 animate-spin text-primary shrink-0" />}
                                                                        {step.status === 'error' && <XCircle className="size-3 text-red-500 shrink-0" />}
                                                                        <span className="text-xs text-foreground/80 flex-1 truncate">{step.nodeLabel}</span>
                                                                        {stepDur && <span className="text-[10px] text-muted-foreground shrink-0">{stepDur}</span>}
                                                                    </button>
                                                                    {isStepExpanded && (step.inputSummary || step.outputSummary) && (
                                                                        <div className="px-5 pb-2 space-y-2">
                                                                            {step.inputSummary && Object.keys(step.inputSummary).length > 0 && (
                                                                                <IOSection label="输入" data={step.inputSummary} compact />
                                                                            )}
                                                                            {step.outputSummary && Object.keys(step.outputSummary).length > 0 && (
                                                                                <IOSection label="输出" data={step.outputSummary} compact />
                                                                            )}
                                                                            <TimingLine start={step.startTime} end={step.endTime} />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Empty state */}
                        {!selection && (
                            <div className="flex h-full items-center justify-center">
                                <div className="text-center">
                                    <Brain className="mx-auto size-12 text-muted-foreground/20" />
                                    <p className="mt-3 text-sm text-muted-foreground">点击左侧节点查看执行详情</p>
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
                                {errorMessage && `出错: ${errorMessage}`}
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
                    <h1 className="text-foreground">仿真组卷</h1>
                    <p className="text-sm text-muted-foreground">引入时事热点与真实题库特征，并通过 AI 学生模拟解答来严格把控难度与质量。</p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
                {/* Left Column: Knowledge Base Selection */}
                <div className="space-y-6">
                    {/* Panel 1: Document Knowledge Bases */}
                    <div className="rounded-2xl border border-border bg-card overflow-hidden">
                        <div className="flex items-center gap-3 p-6 border-b border-border bg-accent/10">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
                                <BookOpen className="size-5 text-primary" />
                            </div>
                            <div className="text-left">
                                <h3 className="font-medium text-foreground">选择文档知识库</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {selectedDocumentKbIds.length > 0 || selectedDocumentDocIds.length > 0
                                        ? `已选择 ${selectedDocumentKbIds.length} 个知识库, ${selectedDocumentDocIds.length} 个文档`
                                        : '提供出题的知识内容来源'}
                                </p>
                            </div>
                        </div>
                        <div className="p-4 space-y-3">
                            {documentKBs.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">暂无文档知识库</p>
                            ) : documentKBs.map(kb => {
                                const isFullySelected = selectedDocumentKbIds.includes(kb.id)
                                const isPartiallySelected = isKbPartiallySelected(kb.id)
                                const isExpanded = kbExpanded.includes(kb.id)
                                const docs = kbDocs[kb.id] || []
                                return (
                                    <div key={kb.id} className={`rounded-xl border transition-all ${isFullySelected || isPartiallySelected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:border-primary/20'}`}>
                                        <div className="flex items-center gap-3 p-3 text-left w-full cursor-pointer hover:bg-accent/30 rounded-t-xl transition-colors" onClick={() => toggleKbExpand(kb.id)}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleKbSelect(kb.id) }}
                                                className={`flex-shrink-0 flex size-5 items-center justify-center rounded border transition-colors ${isFullySelected ? 'border-primary bg-primary' : isPartiallySelected ? 'border-primary bg-primary/20' : 'border-border hover:border-primary/50'}`}
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
                                                ) : docs.map(doc => {
                                                    const docSelected = isDocSelected(kb.id, doc.id)
                                                    return (
                                                        <button key={doc.id} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/80 transition-colors" onClick={() => toggleDocSelect(kb.id, doc.id)}>
                                                            <div className={`flex size-4 items-center justify-center rounded border transition-colors ${docSelected ? 'border-primary bg-primary' : 'border-border'}`}>
                                                                {docSelected && <CheckCircle2 className="size-3 text-white" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0 text-left">
                                                                <p className="text-xs text-foreground/80 truncate">{doc.original_filename}</p>
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Panel 2: Question Bank KBs */}
                    <div className="rounded-2xl border border-border bg-card overflow-hidden">
                        <div className="flex items-center gap-3 p-6 border-b border-border bg-accent/10">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10">
                                <FileText className="size-5 text-amber-600" />
                            </div>
                            <div className="text-left">
                                <h3 className="font-medium text-foreground">选择真题库</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {selectedBankKbIds.length > 0
                                        ? (() => {
                                            const totalSubjects = Object.values(selectedBankKbSubjects).reduce((acc, s) => acc + s.length, 0)
                                            return totalSubjects > 0
                                                ? `已选择 ${selectedBankKbIds.length} 个真题库，共 ${totalSubjects} 个科目`
                                                : `已选择 ${selectedBankKbIds.length} 个真题库`
                                        })()
                                        : '提供出题风格与格式的参考范例'}
                                </p>
                            </div>
                        </div>
                        <div className="p-4 space-y-3">
                            {bankKBs.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">暂无真题库</p>
                            ) : bankKBs.map(kb => {
                                const isSelected = selectedBankKbIds.includes(kb.id)
                                return (
                                    <div key={kb.id} className={`rounded-xl border transition-all ${isSelected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:border-primary/20'}`}>
                                        <button onClick={() => toggleBankKbSelect(kb.id)} className="w-full p-3 text-left">
                                            <div className="flex items-center gap-3">
                                                <div className={`flex-shrink-0 flex size-5 items-center justify-center rounded border transition-colors ${isSelected ? 'border-primary bg-primary' : 'border-border hover:border-primary/50'}`}>
                                                    {isSelected && <CheckCircle2 className="size-3.5 text-white" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="truncate text-sm font-semibold text-foreground">{kb.name}</p>
                                                    <p className="text-xs text-muted-foreground">{kb.document_count} 套真题</p>
                                                </div>
                                            </div>
                                        </button>
                                        {isSelected && bankKbSubjects[kb.id]?.length > 0 && (
                                            <div className="pb-3 pl-8 pr-3 flex flex-wrap gap-1.5">
                                                {bankKbSubjects[kb.id].map(subject => {
                                                    const subjectSelected = (selectedBankKbSubjects[kb.id] ?? []).includes(subject)
                                                    return (
                                                        <button
                                                            key={subject}
                                                            onClick={e => { e.stopPropagation(); toggleBankSubject(kb.id, subject) }}
                                                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border
                                                                ${subjectSelected
                                                                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40'
                                                                    : 'bg-muted text-muted-foreground border-border hover:border-amber-500/30'
                                                                }`}
                                                        >
                                                            {subject}
                                                        </button>
                                                    )
                                                })}
                                                {(selectedBankKbSubjects[kb.id]?.length ?? 0) > 0 && (
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation()
                                                            setSelectedBankKbSubjects(prev => ({ ...prev, [kb.id]: [] }))
                                                        }}
                                                        className="rounded-full px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground border border-border"
                                                    >
                                                        全部
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* Right Column: Quiz Config */}
                <div className="space-y-6">
                    <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10">
                                <Target className="size-5 text-amber-600" />
                            </div>
                            <div>
                                <h3 className="font-medium text-foreground">题目配置</h3>
                                <p className="text-xs text-muted-foreground">自定义题型、数量和难度</p>
                            </div>
                        </div>

                        {/* Title */}
                        <div>
                            <label className="text-sm font-medium text-foreground">测验标题（可选）</label>
                            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：第三章复习测验" className="mt-2 w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30 transition-all font-medium" />
                        </div>

                        {/* Difficulty */}
                        <div>
                            <label className="text-sm font-medium text-foreground">难度等级</label>
                            <div className="mt-2 grid grid-cols-3 gap-2">
                                {DIFFICULTY_CONFIG.map(d => (
                                    <button key={d.value} onClick={() => setDifficulty(d.value)} className={`rounded-xl border py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${difficulty === d.value ? `${d.color} shadow-sm ring-1 ring-current/20` : 'border-border bg-card text-muted-foreground hover:border-border/80 hover:bg-accent/50'}`}>
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
                                        <span className={`text-sm ${questionCounts[type] > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{label}</span>
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => updateCount(type, -1)} disabled={questionCounts[type] <= 0} className="flex size-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                                <span className="text-lg leading-none font-medium mb-0.5">-</span>
                                            </button>
                                            <span className="w-6 text-center text-sm font-medium text-foreground">{questionCounts[type]}</span>
                                            <button onClick={() => updateCount(type, 1)} disabled={questionCounts[type] >= 20 || Object.values(questionCounts).reduce((a, b) => a + b, 0) >= 50} className="flex size-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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
                            <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} placeholder="例如：重点考察第二部分的知识，选项要具有迷惑性..." className="mt-2 w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30 transition-all min-h-[100px] resize-y custom-scrollbar" />
                        </div>

                        <div className="pt-2">
                            <button onClick={handleGenerate} disabled={(selectedDocumentKbIds.length === 0 && selectedDocumentDocIds.length === 0 && selectedBankKbIds.length === 0) || Object.values(questionCounts).reduce((a, b) => a + b, 0) === 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 py-3.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed">
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


function IOSection({ label, data, compact }: { label: string; data: Record<string, unknown>; compact?: boolean }) {
    return (
        <div>
            <h4 className={`mb-1 flex items-center gap-1.5 font-medium uppercase tracking-wider text-muted-foreground ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
                {label === '输入' ? <ArrowRight className="size-2.5" /> : <ArrowLeft className="size-2.5" />}
                {label}
            </h4>
            <div className="rounded border border-border/50 bg-card divide-y divide-border/50">
                {Object.entries(data).map(([key, value]) => (
                    <div key={key} className="flex gap-3 px-3 py-1.5">
                        <span className="text-[10px] font-mono text-muted-foreground w-28 shrink-0">{key}</span>
                        <div className="text-xs text-foreground break-all flex-1">{renderValue(value)}</div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function TimingLine({ start, end }: { start: number; end?: number }) {
    return (
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="size-2.5" />{new Date(start).toLocaleTimeString()}</span>
            {end && (
                <>
                    <span>→ {new Date(end).toLocaleTimeString()}</span>
                    <span className="font-medium text-foreground">{((end - start) / 1000).toFixed(2)}s</span>
                </>
            )}
        </div>
    )
}

function renderValue(value: unknown): React.ReactNode {
    if (value === null || value === undefined) return <span className="text-muted-foreground/50 italic">null</span>
    if (typeof value === 'boolean') return <span className={value ? 'text-emerald-600' : 'text-red-500'}>{String(value)}</span>
    if (typeof value === 'number') return <span className="font-mono">{value}</span>
    if (typeof value === 'string') return value.length > 200 ? value.slice(0, 200) + '...' : value
    if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-muted-foreground/50 italic">[]</span>
        if (typeof value[0] === 'object' && value[0] !== null) {
            return (
                <div className="space-y-2">
                    {value.map((item, i) => (
                        <div key={i} className="rounded-md border border-border/50 bg-accent/20 px-3 py-2 text-xs">
                            {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                                <div key={k} className="flex gap-2"><span className="font-mono text-muted-foreground">{k}:</span><div className="text-foreground">{renderValue(v)}</div></div>
                            ))}
                        </div>
                    ))}
                </div>
            )
        }
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
                    <div key={k} className="flex gap-2 text-xs"><span className="font-mono text-muted-foreground">{k}:</span><div className="text-foreground">{renderValue(v)}</div></div>
                ))}
            </div>
        )
    }
    return String(value)
}
