import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
    AlertCircle,
    BookOpen,
    Bot,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Database,
    FileText,
    Loader2,
    MessageSquareText,
    Plus,
    Send,
    Sparkles,
    Target,
    Trash2,
    User,
    X,
    Zap,
} from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { MathText } from '@/components/shared/MathText'
import {
    kbApi,
    knowledgeChatApi,
    subscribeKnowledgeChatSSE,
    type KBDocument,
    type KnowledgeBase,
    type KnowledgeChatExecutionTrace,
    type KnowledgeChatMessage,
    type KnowledgeChatScopeDocument,
    type KnowledgeChatSession,
    type KnowledgeChatSessionListItem,
    type KnowledgeChatTraceChunk,
    type KnowledgeChatTraceStepKey,
    type SSEEvent,
} from '@/lib/api'
import { cn } from '@/lib/utils'

const SESSION_PAGE_SIZE = 10

function sortSessions(items: KnowledgeChatSessionListItem[]) {
    return [...items].sort(
        (a, b) =>
            new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
    )
}

function sessionToListItem(session: KnowledgeChatSession): KnowledgeChatSessionListItem {
    return {
        id: session.id,
        title: session.title,
        knowledge_base_id: session.knowledge_base_id,
        knowledge_base_name: session.knowledge_base_name,
        status: session.status,
        message_count: session.message_count,
        selected_doc_count: session.scope_doc_ids.length,
        last_message_at: session.last_message_at,
        created_at: session.created_at,
        updated_at: session.updated_at,
    }
}

function mergeMessagesUnique(messages: KnowledgeChatMessage[]) {
    const map = new Map<number, KnowledgeChatMessage>()
    for (const message of messages) {
        map.set(message.id, message)
    }
    return Array.from(map.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
}

function statusText(status: KnowledgeChatSession['status']) {
    if (status === 'streaming') return '生成中'
    if (status === 'error') return '异常'
    return '空闲'
}

function statusTone(status: KnowledgeChatSession['status']) {
    if (status === 'streaming') return 'bg-amber-500/10 text-amber-600 border-amber-500/20'
    if (status === 'error') return 'bg-red-500/10 text-red-600 border-red-500/20'
    return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
}

function formatDateTime(value: string) {
    const d = new Date(value)
    return `${d.getMonth() + 1}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

const TRACE_STEP_META: Array<{ key: KnowledgeChatTraceStepKey; label: string }> = [
    { key: 'rewrite_query', label: '理解问题' },
    { key: 'retrieve_knowledge', label: '检索证据' },
    { key: 'generate_answer', label: '组织回答' },
]

function createEmptyTrace(assistantMessageId: number): KnowledgeChatExecutionTrace {
    return {
        assistant_message_id: assistantMessageId,
        current_step: null,
        status_message: null,
        steps: {
            rewrite_query: { status: 'pending', message: null },
            retrieve_knowledge: { status: 'pending', message: null },
            generate_answer: { status: 'pending', message: null },
        },
        rewrite_query: null,
        query_source: null,
        history_turns_used: 0,
        retrieval_query: null,
        vector_result_count: 0,
        keyword_result_count: 0,
        hybrid_result_count: 0,
        expanded_candidate_count: 0,
        retrieval_results: [],
        rerank_results: [],
    }
}

function normalizeTrace(
    trace: KnowledgeChatExecutionTrace | null | undefined,
    assistantMessageId: number,
): KnowledgeChatExecutionTrace {
    const base = createEmptyTrace(assistantMessageId)
    if (!trace) return base

    return {
        ...base,
        ...trace,
        assistant_message_id: assistantMessageId,
        steps: {
            ...base.steps,
            ...trace.steps,
        },
        retrieval_results: Array.isArray(trace.retrieval_results) ? trace.retrieval_results : [],
        rerank_results: Array.isArray(trace.rerank_results) ? trace.rerank_results : [],
    }
}

function nodeToTraceStep(node: unknown): KnowledgeChatTraceStepKey | null {
    if (node === 'rewrite_query' || node === 'retrieve_knowledge' || node === 'generate_answer') {
        return node
    }
    return null
}

function querySourceText(source: string | null) {
    if (source === 'rewrite') return '结合上下文改写'
    if (source === 'fallback') return '改写失败，退回原问题'
    if (source === 'direct') return '直接使用原问题'
    return '检索查询'
}

function traceStepTone(
    status: KnowledgeChatExecutionTrace['steps'][KnowledgeChatTraceStepKey]['status'],
) {
    if (status === 'active') return 'border-primary/20 bg-primary/10 text-primary'
    if (status === 'complete') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
    if (status === 'error') return 'border-destructive/20 bg-destructive/10 text-destructive'
    return 'border-border bg-muted/50 text-muted-foreground'
}

function SessionStatusBadge({ status }: { status: KnowledgeChatSession['status'] }) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                statusTone(status),
            )}
        >
            {statusText(status)}
        </span>
    )
}

function TraceStepBadge({
    label,
    status,
}: {
    label: string
    status: KnowledgeChatExecutionTrace['steps'][KnowledgeChatTraceStepKey]['status']
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                traceStepTone(status),
            )}
        >
            {status === 'active' ? (
                <Loader2 className="size-3 animate-spin" />
            ) : status === 'complete' ? (
                <CheckCircle2 className="size-3" />
            ) : status === 'error' ? (
                <AlertCircle className="size-3" />
            ) : (
                <span className="size-1.5 rounded-full bg-current opacity-60" />
            )}
            {label}
        </span>
    )
}

function PaginationControls({
    page,
    hasMore,
    loading,
    onPrev,
    onNext,
}: {
    page: number
    hasMore: boolean
    loading: boolean
    onPrev: () => void
    onNext: () => void
}) {
    return (
        <div className="flex items-center justify-between gap-3 px-2 py-3">
            <button
                type="button"
                onClick={onPrev}
                disabled={page === 0 || loading}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border/50 text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
                <ChevronLeft className="size-4" />
            </button>
            <span className="text-xs text-muted-foreground">第 {page + 1} 页</span>
            <button
                type="button"
                onClick={onNext}
                disabled={!hasMore || loading}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border/50 text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
                <ChevronRight className="size-4" />
            </button>
        </div>
    )
}

function SidebarSessionItem({
    item,
    active,
    deleting,
    onOpen,
    onDelete,
}: {
    item: KnowledgeChatSessionListItem
    active: boolean
    deleting: boolean
    onOpen: () => void
    onDelete: () => void
}) {
    return (
        <div
            onClick={onOpen}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpen()
                }
            }}
            role="button"
            tabIndex={0}
            className={cn(
                'group relative flex w-full cursor-pointer flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-all duration-200',
                active
                    ? 'bg-primary/10 text-primary font-medium shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm leading-tight text-foreground group-hover:text-foreground">
                    {item.title}
                </p>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        onDelete()
                    }}
                    disabled={deleting}
                    className="absolute right-2 top-2 hidden rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block disabled:opacity-50"
                    title="删除会话"
                >
                    {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </button>
            </div>
            <p className="mt-0.5 truncate text-xs opacity-80">
                {item.knowledge_base_name}
            </p>
            <div className="mt-1.5 flex items-center justify-between text-[10px] opacity-70">
                <span>{item.message_count} 消息 · {item.selected_doc_count} 文档</span>
                <span>{formatDateTime(item.last_message_at)}</span>
            </div>
        </div>
    )
}

function TraceSection({
    title,
    items,
    showRerankScore = false,
}: {
    title: string
    items: KnowledgeChatTraceChunk[]
    showRerankScore?: boolean
}) {
    if (items.length === 0) return null

    return (
        <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
            <div className="grid gap-2">
                {items.slice(0, 3).map((item) => (
                    <div
                        key={`${title}-${item.chunk_id}`}
                        className="rounded-xl border border-border/50 bg-background/50 px-3 py-2.5 transition-colors hover:bg-background"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-foreground">{item.document_name}</p>
                                <p className="truncate text-[10px] text-muted-foreground mt-0.5">
                                    {item.section_path || item.heading || '未标注章节'}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                                {showRerankScore && item.rerank_score != null && (
                                    <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                                        重排 {item.rerank_score}
                                    </span>
                                )}
                                {item.similarity != null && (
                                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                                        {Math.round(item.similarity * 100)}%
                                    </span>
                                )}
                            </div>
                        </div>
                        <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{item.snippet}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}

function ExecutionDetails({ trace }: { trace: KnowledgeChatExecutionTrace }) {
    return (
        <div className="mt-3 space-y-4 border-t border-border/50 pt-3">
            <div className="space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">执行阶段</p>
                <div className="grid gap-1.5">
                    {TRACE_STEP_META.map((step) => {
                        const state = trace.steps[step.key]
                        return (
                            <div
                                key={step.key}
                                className="flex items-start justify-between gap-3 rounded-lg bg-background/40 px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-foreground">{step.label}</p>
                                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                                        {state.message || '等待执行'}
                                    </p>
                                </div>
                                <TraceStepBadge label={step.label} status={state.status} />
                            </div>
                        )
                    })}
                </div>
            </div>

            {trace.rewrite_query && trace.query_source !== 'fast' && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">检索改写</p>
                        <span className="rounded-md bg-background px-1.5 py-0.5 text-[9px] text-muted-foreground border border-border/50">
                            {querySourceText(trace.query_source)}
                        </span>
                    </div>
                    <div className="rounded-lg bg-background/40 px-3 py-2.5">
                        <p className="text-xs leading-relaxed text-foreground">{trace.rewrite_query}</p>
                        {trace.history_turns_used > 0 && (
                            <p className="mt-1.5 text-[10px] text-muted-foreground">
                                使用了 {trace.history_turns_used} 条上下文消息
                            </p>
                        )}
                    </div>
                </div>
            )}

            {trace.retrieval_results.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">检索结果</p>
                        <span className="rounded-md bg-background px-1.5 py-0.5 text-[9px] text-muted-foreground border border-border/50">
                            向量 {trace.vector_result_count} · 关键词 {trace.keyword_result_count} · 候选 {trace.expanded_candidate_count}
                        </span>
                    </div>
                    <TraceSection title="Top Chunks" items={trace.retrieval_results} />
                </div>
            )}

            {trace.rerank_results.length > 0 && (
                <TraceSection
                    title="Rerank"
                    items={trace.rerank_results}
                    showRerankScore
                />
            )}
        </div>
    )
}

function CitationModal({
    citation,
    index,
    onClose,
}: {
    citation: KnowledgeChatMessage['citations'][number] | null
    index: number
    onClose: () => void
}) {
    useEffect(() => {
        if (!citation) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [citation, onClose])

    if (!citation) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150 p-4"
            onClick={onClose}
        >
            <div
                className="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 border-b border-border/50 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            <span className="inline-flex size-4 items-center justify-center rounded bg-primary/10 text-[9px] font-semibold text-primary">
                                {index + 1}
                            </span>
                            引用来源
                            {typeof citation.similarity === 'number' && (
                                <span className="rounded-md border border-border/50 bg-background px-1.5 py-0.5 text-[10px] normal-case tracking-normal">
                                    相似度 {Math.round(citation.similarity * 1000) / 1000}
                                </span>
                            )}
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-foreground">
                            {citation.document_name}
                        </p>
                        {(citation.section_path || citation.heading) && (
                            <p className="truncate text-xs text-muted-foreground mt-0.5">
                                {citation.section_path || citation.heading}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="关闭"
                    >
                        <X className="size-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-auto px-5 py-4">
                    <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-foreground">
                        {citation.snippet || '(无内容)'}
                    </pre>
                </div>
            </div>
        </div>
    )
}

function MessageBubble({
    message,
    traceOpen,
    onToggleTrace,
    onOpenCitation,
}: {
    message: KnowledgeChatMessage
    traceOpen?: boolean
    onToggleTrace?: () => void
    onOpenCitation?: (citation: KnowledgeChatMessage['citations'][number], index: number) => void
}) {
    const isUser = message.role === 'user'
    const trace = !isUser && message.trace ? normalizeTrace(message.trace, message.id) : null

    return (
        <div className={cn('flex w-full group', isUser ? 'justify-end' : 'justify-start')}>
            <div className={cn('flex gap-2 max-w-[92%] md:max-w-[88%]', isUser ? 'flex-row-reverse' : 'flex-row')}>
                <div
                    className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full mt-1 shadow-sm border',
                        isUser
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card text-primary border-border/60'
                    )}
                >
                    {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                    {!isUser && trace && (
                        <div className="mb-2 overflow-hidden rounded-2xl border border-border/50 bg-muted/30">
                            <div
                                className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                                onClick={onToggleTrace}
                            >
                                <div className="flex flex-wrap items-center gap-2 overflow-hidden">
                                    <div className="flex shrink-0 gap-1.5">
                                        {TRACE_STEP_META.filter(
                                            (step) =>
                                                !(step.key === 'rewrite_query' && trace.query_source === 'fast'),
                                        ).map((step) => (
                                            <TraceStepBadge
                                                key={step.key}
                                                label={step.label}
                                                status={trace.steps[step.key].status}
                                            />
                                        ))}
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground max-w-[200px]">
                                        {trace.status_message || trace.steps.generate_answer.message || '等待执行'}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                    详情
                                    {traceOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                                </div>
                            </div>
                            {traceOpen && (
                                <div className="px-4 pb-4">
                                    <ExecutionDetails trace={trace} />
                                </div>
                            )}
                        </div>
                    )}

                    <div
                        className={cn(
                            'rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm',
                            isUser
                                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                : 'bg-card border border-border/50 text-foreground rounded-tl-sm'
                        )}
                    >
                        {isUser ? (
                            <p className="whitespace-pre-wrap">{message.content}</p>
                        ) : message.content ? (
                            <MathText className={isUser ? 'text-primary-foreground' : 'text-foreground'}>
                                {message.content}
                            </MathText>
                        ) : (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                {message.status === 'streaming' ? (
                                    <>
                                        <Loader2 className="size-4 animate-spin text-primary" />
                                        正在组织回答...
                                    </>
                                ) : (
                                    '暂无内容'
                                )}
                            </div>
                        )}

                        {message.error_message && (
                            <div className="mt-3 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                <AlertCircle className="size-4 shrink-0" />
                                <p>{message.error_message}</p>
                            </div>
                        )}
                    </div>

                    {!isUser && message.citations.length > 0 && (
                        <div className="mt-3">
                            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                                <BookOpen className="size-3.5" />
                                引用来源
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {message.citations.map((citation, idx) => (
                                    <button
                                        key={`${message.id}-${citation.chunk_id}-${idx}`}
                                        type="button"
                                        onClick={() => onOpenCitation?.(citation, idx)}
                                        className="group relative flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    >
                                        <div className="flex size-4 shrink-0 items-center justify-center rounded bg-primary/10 text-[9px] font-medium text-primary mt-0.5">
                                            {idx + 1}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                                                {citation.document_name}
                                            </p>
                                            <p className="truncate text-[10px] text-muted-foreground mt-0.5">
                                                {citation.section_path || citation.heading || '相关片段'}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function NewChatModal({
    open,
    knowledgeBases,
    kbsLoading,
    selectedKbId,
    draftDocs,
    draftDocsLoading,
    selectedDocIds,
    docsExpanded,
    creating,
    onClose,
    onSelectKb,
    onToggleDocsExpanded,
    onSelectAll,
    onClear,
    onToggleDoc,
    onCreate,
}: {
    open: boolean
    knowledgeBases: KnowledgeBase[]
    kbsLoading: boolean
    selectedKbId: number | null
    draftDocs: KBDocument[]
    draftDocsLoading: boolean
    selectedDocIds: number[]
    docsExpanded: boolean
    creating: boolean
    onClose: () => void
    onSelectKb: (kbId: number) => void
    onToggleDocsExpanded: () => void
    onSelectAll: () => void
    onClear: () => void
    onToggleDoc: (docId: number) => void
    onCreate: () => void
}) {
    if (!open) return null

    const readyDocs = draftDocs.filter((doc) => doc.status === 'ready')

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-4xl rounded-3xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between border-b border-border/50 px-6 py-5 bg-muted/10">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <MessageSquareText className="size-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-foreground">新建知识库问答</h3>
                            <p className="text-sm text-muted-foreground">配置对话的知识范围</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                <div className="grid gap-6 px-6 py-6 lg:grid-cols-[280px_minmax(0,1fr)] overflow-y-auto">
                    <div className="space-y-3">
                        <p className="text-sm font-semibold text-foreground">选择知识库</p>
                        {kbsLoading ? (
                            <div className="flex h-32 items-center justify-center rounded-2xl border border-border/50 bg-muted/20">
                                <Loader2 className="size-5 animate-spin text-primary" />
                            </div>
                        ) : knowledgeBases.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-border/50 bg-muted/10 px-4 py-8 text-center">
                                <Database className="mx-auto mb-3 size-8 text-muted-foreground" />
                                <p className="text-sm font-medium text-foreground">暂无可用知识库</p>
                                <p className="mt-1 text-xs text-muted-foreground">请先创建知识库</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {knowledgeBases.map((kb) => {
                                    const selected = kb.id === selectedKbId
                                    return (
                                        <button
                                            key={kb.id}
                                            type="button"
                                            onClick={() => onSelectKb(kb.id)}
                                            className={cn(
                                                'w-full flex items-center justify-between rounded-xl border p-3 text-left transition-all',
                                                selected
                                                    ? 'border-primary bg-primary/5 shadow-sm'
                                                    : 'border-border/50 bg-background hover:border-primary/30 hover:bg-accent/30',
                                            )}
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-foreground">{kb.name}</p>
                                                <p className="mt-0.5 text-[11px] text-muted-foreground">{kb.document_count} 个文档</p>
                                            </div>
                                            {selected && <CheckCircle2 className="size-4 text-primary shrink-0" />}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-2xl border border-border/50 bg-background overflow-hidden shadow-sm">
                            <button
                                type="button"
                                onClick={onToggleDocsExpanded}
                                className="flex w-full items-center justify-between bg-muted/20 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                            >
                                <div>
                                    <p className="text-sm font-semibold text-foreground">指定文档范围</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        已选择 <span className="font-medium text-primary">{selectedDocIds.length}</span> / {readyDocs.length} 个就绪文档
                                    </p>
                                </div>
                                {docsExpanded ? <ChevronUp className="size-5 text-muted-foreground" /> : <ChevronDown className="size-5 text-muted-foreground" />}
                            </button>

                            {docsExpanded && (
                                <div className="border-t border-border/50 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3 px-1">
                                        <button
                                            type="button"
                                            onClick={onSelectAll}
                                            className="text-xs font-medium text-primary hover:underline"
                                        >
                                            全选就绪文档
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onClear}
                                            className="text-xs font-medium text-muted-foreground hover:underline"
                                        >
                                            清空
                                        </button>
                                    </div>

                                    {draftDocsLoading ? (
                                        <div className="flex h-40 items-center justify-center">
                                            <Loader2 className="size-6 animate-spin text-primary" />
                                        </div>
                                    ) : readyDocs.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 py-10 text-center text-muted-foreground">
                                            <FileText className="mb-2 size-8 opacity-50" />
                                            <p className="text-sm">当前知识库没有就绪文档</p>
                                        </div>
                                    ) : (
                                        <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-2">
                                            {readyDocs.map((doc) => {
                                                const checked = selectedDocIds.includes(doc.id)
                                                return (
                                                    <button
                                                        key={doc.id}
                                                        type="button"
                                                        onClick={() => onToggleDoc(doc.id)}
                                                        className={cn(
                                                            'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                                                            checked
                                                                ? 'border-primary/40 bg-primary/5'
                                                                : 'border-transparent hover:bg-accent',
                                                        )}
                                                    >
                                                        <div
                                                            className={cn(
                                                                'flex size-4 shrink-0 items-center justify-center rounded-md border transition-colors',
                                                                checked ? 'border-primary bg-primary' : 'border-input bg-background',
                                                            )}
                                                        >
                                                            {checked && <CheckCircle2 className="size-3 text-white" />}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-sm text-foreground">{doc.original_filename}</p>
                                                            <p className="text-[10px] text-muted-foreground">{doc.chunk_count} 个分块</p>
                                                        </div>
                                                        <FileText className="size-3.5 shrink-0 text-muted-foreground opacity-70" />
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-primary/80">
                            <strong>提示：</strong> 会话创建后，知识库与文档范围将被固定。如需更改范围，请创建新的会话。
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-border/50 px-6 py-4 bg-muted/10">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        onClick={onCreate}
                        disabled={creating || knowledgeBases.length === 0 || selectedDocIds.length === 0 || !selectedKbId}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4 -ml-1" />}
                        开始聊天
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function KnowledgeChatPage() {
    const navigate = useNavigate()
    const { sessionId } = useParams<{ sessionId: string }>()

    const [sessions, setSessions] = useState<KnowledgeChatSessionListItem[]>([])
    const [sessionsLoading, setSessionsLoading] = useState(true)
    const [sessionsPage, setSessionsPage] = useState(0)
    const [hasMoreSessions, setHasMoreSessions] = useState(false)

    const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
    const [kbsLoading, setKbsLoading] = useState(true)

    const [activeSession, setActiveSession] = useState<KnowledgeChatSession | null>(null)
    const [sessionLoading, setSessionLoading] = useState(false)
    const [streamStatus, setStreamStatus] = useState('')
    const [composer, setComposer] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [sseConnected, setSseConnected] = useState(false)
    const [expandedTraceIds, setExpandedTraceIds] = useState<Record<number, boolean>>({})
    const [scopeOpen, setScopeOpen] = useState(false)
    const [chatMode, setChatMode] = useState<'fast' | 'accurate'>(() => {
        if (typeof window === 'undefined') return 'accurate'
        return window.localStorage.getItem('kbChatMode') === 'fast' ? 'fast' : 'accurate'
    })
    useEffect(() => {
        if (typeof window !== 'undefined') window.localStorage.setItem('kbChatMode', chatMode)
    }, [chatMode])
    const [openCitation, setOpenCitation] = useState<{
        citation: KnowledgeChatMessage['citations'][number]
        index: number
    } | null>(null)

    const [showNewChatModal, setShowNewChatModal] = useState(false)
    const [selectedKbId, setSelectedKbId] = useState<number | null>(null)
    const [draftDocs, setDraftDocs] = useState<KBDocument[]>([])
    const [draftDocsLoading, setDraftDocsLoading] = useState(false)
    const [selectedDocIds, setSelectedDocIds] = useState<number[]>([])
    const [docsExpanded, setDocsExpanded] = useState(true)
    const [creatingSession, setCreatingSession] = useState(false)

    const [deleteTarget, setDeleteTarget] = useState<KnowledgeChatSessionListItem | null>(null)
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)

    const chatScrollRef = useRef<HTMLDivElement | null>(null)
    const scopeDropdownRef = useRef<HTMLDivElement | null>(null)
    const activeSessionRef = useRef<KnowledgeChatSession | null>(null)
    const activeStreamingAssistantIdRef = useRef<number | null>(null)
    activeSessionRef.current = activeSession

    const readyDraftDocs = useMemo(
        () => draftDocs.filter((doc) => doc.status === 'ready'),
        [draftDocs],
    )

    const activeMessages = activeSession?.messages || []
    const canSend =
        !!sessionId &&
        !!activeSession &&
        activeSession.status !== 'streaming' &&
        composer.trim().length > 0 &&
        !submitting

    const loadSessionsPage = async (page: number, showLoading = true) => {
        if (showLoading) setSessionsLoading(true)
        try {
            const rawItems = await knowledgeChatApi.listSessions(
                SESSION_PAGE_SIZE + 1,
                page * SESSION_PAGE_SIZE,
            )
            const hasMore = rawItems.length > SESSION_PAGE_SIZE
            let items = sortSessions(rawItems.slice(0, SESSION_PAGE_SIZE))
            const currentSession = activeSessionRef.current
            if (currentSession && !items.some((item) => item.id === currentSession.id)) {
                items = sortSessions([sessionToListItem(currentSession), ...items]).slice(0, SESSION_PAGE_SIZE)
            }
            setSessions(items)
            setHasMoreSessions(hasMore)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '加载会话失败')
        } finally {
            if (showLoading) setSessionsLoading(false)
        }
    }

    const loadKnowledgeBases = async () => {
        setKbsLoading(true)
        try {
            const items = await kbApi.listAll()
            setKnowledgeBases(items)
        } catch {
            toast.error('加载知识库失败')
        } finally {
            setKbsLoading(false)
        }
    }

    const loadSession = async (id: string) => {
        setSessionLoading(true)
        try {
            const detail = await knowledgeChatApi.getSession(id)
            setActiveSession(detail)
            setScopeOpen(false)
            setSessions((prev) =>
                sortSessions([sessionToListItem(detail), ...prev.filter((item) => item.id !== detail.id)]).slice(0, SESSION_PAGE_SIZE),
            )
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '加载会话失败')
            navigate('/knowledge-chat', { replace: true })
        } finally {
            setSessionLoading(false)
        }
    }

    const openNewChatModal = () => {
        setShowNewChatModal(true)
        setDocsExpanded(true)
        setSelectedDocIds([])
        setDraftDocs([])
        if (knowledgeBases.length > 0) {
            setSelectedKbId(knowledgeBases[0].id)
        } else {
            setSelectedKbId(null)
        }
    }

    const closeNewChatModal = () => {
        if (creatingSession) return
        setShowNewChatModal(false)
        setDraftDocs([])
        setSelectedDocIds([])
        setDocsExpanded(true)
    }

    const upsertSessionItem = (item: KnowledgeChatSessionListItem) => {
        setSessions((prev) =>
            sortSessions([item, ...prev.filter((entry) => entry.id !== item.id)]).slice(0, SESSION_PAGE_SIZE),
        )
    }

    const patchSessionById = (
        targetSessionId: string,
        updater: (session: KnowledgeChatSession) => KnowledgeChatSession,
    ) => {
        setActiveSession((prev) => {
            if (!prev || prev.id !== targetSessionId) return prev
            const next = updater(prev)
            upsertSessionItem(sessionToListItem(next))
            return next
        })
    }

    const patchMessageById = (
        targetSessionId: string,
        messageId: number,
        updater: (message: KnowledgeChatMessage) => KnowledgeChatMessage,
    ) => {
        patchSessionById(targetSessionId, (session) => ({
            ...session,
            messages: (session.messages || []).map((message) =>
                message.id === messageId ? updater(message) : message,
            ),
        }))
    }

    const patchAssistantTrace = (
        targetSessionId: string,
        assistantMessageId: number,
        updater: (trace: KnowledgeChatExecutionTrace) => KnowledgeChatExecutionTrace,
    ) => {
        patchMessageById(targetSessionId, assistantMessageId, (message) => ({
            ...message,
            trace: updater(normalizeTrace(message.trace, assistantMessageId)),
        }))
    }

    useEffect(() => {
        void loadKnowledgeBases()
    }, [])

    useEffect(() => {
        void loadSessionsPage(sessionsPage)
    }, [sessionsPage])

    useEffect(() => {
        if (!showNewChatModal) return
        if (!selectedKbId) {
            setDraftDocs([])
            setSelectedDocIds([])
            return
        }

        setDraftDocsLoading(true)
        kbApi.listDocs(selectedKbId)
            .then((docs) => {
                setDraftDocs(docs)
                const readyIds = docs.filter((doc) => doc.status === 'ready').map((doc) => doc.id)
                setSelectedDocIds(readyIds)
            })
            .catch(() => toast.error('加载文档失败'))
            .finally(() => setDraftDocsLoading(false))
    }, [showNewChatModal, selectedKbId])

    useEffect(() => {
        if (!showNewChatModal || selectedKbId || knowledgeBases.length === 0) return
        setSelectedKbId(knowledgeBases[0].id)
    }, [showNewChatModal, selectedKbId, knowledgeBases])

    useEffect(() => {
        if (!sessionId) {
            setActiveSession(null)
            setExpandedTraceIds({})
            setScopeOpen(false)
            setStreamStatus('')
            setSseConnected(false)
            activeStreamingAssistantIdRef.current = null
            return
        }
        setExpandedTraceIds({})
        void loadSession(sessionId)
    }, [sessionId])

    useEffect(() => {
        if (!scopeOpen) return
        const handleClickOutside = (event: MouseEvent) => {
            if (
                scopeDropdownRef.current &&
                !scopeDropdownRef.current.contains(event.target as Node)
            ) {
                setScopeOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [scopeOpen])

    useEffect(() => {
        if (!sessionId) return

        let disposed = false
        let cleanup: (() => void) | undefined

        const handleStreamEvent = (event: SSEEvent) => {
            if ((event.session_id as string | undefined) && event.session_id !== sessionId) return
            setSseConnected(true)

            if (event.type === 'message_started') {
                const assistantMessageId = Number(event.assistant_message_id)
                activeStreamingAssistantIdRef.current = assistantMessageId
                patchAssistantTrace(sessionId, assistantMessageId, (trace) =>
                    normalizeTrace(trace, assistantMessageId),
                )
                patchSessionById(sessionId, (session) => ({ ...session, status: 'streaming' }))
                setExpandedTraceIds((prev) => ({ ...prev, [assistantMessageId]: false }))
            }

            if (event.type === 'node_start') {
                const nodeKey = nodeToTraceStep(event.node)
                const assistantMessageId = Number(event.assistant_message_id || activeStreamingAssistantIdRef.current || 0)
                if (!assistantMessageId || !nodeKey) return
                const messageText = String(event.message || '')
                setStreamStatus(messageText)
                patchAssistantTrace(sessionId, assistantMessageId, (trace) => ({
                    ...trace,
                    current_step: nodeKey,
                    status_message: messageText,
                    steps: {
                        ...trace.steps,
                        [nodeKey]: {
                            ...trace.steps[nodeKey],
                            status: 'active',
                            message: messageText || trace.steps[nodeKey].message,
                        },
                    },
                }))
            }

            if (event.type === 'node_complete') {
                const nodeKey = nodeToTraceStep(event.node)
                const assistantMessageId = Number(event.assistant_message_id || activeStreamingAssistantIdRef.current || 0)
                if (!assistantMessageId || !nodeKey) return
                const messageText = String(event.message || '')
                setStreamStatus(messageText)
                patchAssistantTrace(sessionId, assistantMessageId, (trace) => ({
                    ...trace,
                    current_step: trace.current_step === nodeKey ? null : trace.current_step,
                    status_message: messageText || trace.status_message,
                    steps: {
                        ...trace.steps,
                        [nodeKey]: {
                            ...trace.steps[nodeKey],
                            status: 'complete',
                            message: messageText || trace.steps[nodeKey].message,
                        },
                    },
                }))
            }

            if (event.type === 'rewrite_result') {
                const assistantMessageId = Number(event.assistant_message_id)
                patchAssistantTrace(sessionId, assistantMessageId, (trace) => ({
                    ...trace,
                    rewrite_query: String(event.retrieval_query || ''),
                    query_source: typeof event.query_source === 'string' ? event.query_source : null,
                    history_turns_used: Number(event.history_turns_used || 0),
                    retrieval_query:
                        typeof event.retrieval_query === 'string'
                            ? event.retrieval_query
                            : trace.retrieval_query,
                }))
            }

            if (event.type === 'retrieval_results') {
                const assistantMessageId = Number(event.assistant_message_id)
                patchAssistantTrace(sessionId, assistantMessageId, (trace) => ({
                    ...trace,
                    retrieval_query:
                        typeof event.retrieval_query === 'string'
                            ? event.retrieval_query
                            : trace.retrieval_query,
                    vector_result_count: Number(event.vector_result_count || 0),
                    keyword_result_count: Number(event.keyword_result_count || 0),
                    hybrid_result_count: Number(event.hybrid_result_count || 0),
                    expanded_candidate_count: Number(event.expanded_candidate_count || 0),
                    retrieval_results: Array.isArray(event.results)
                        ? event.results as KnowledgeChatTraceChunk[]
                        : [],
                }))
            }

            if (event.type === 'rerank_results') {
                const assistantMessageId = Number(event.assistant_message_id)
                patchAssistantTrace(sessionId, assistantMessageId, (trace) => ({
                    ...trace,
                    rerank_results: Array.isArray(event.results)
                        ? event.results as KnowledgeChatTraceChunk[]
                        : [],
                }))
            }

            if (event.type === 'citations') {
                const assistantMessageId = Number(event.assistant_message_id)
                const citations = Array.isArray(event.citations) ? event.citations : []
                patchSessionById(sessionId, (session) => ({
                    ...session,
                    messages: (session.messages || []).map((message) =>
                        message.id === assistantMessageId
                            ? { ...message, citations }
                            : message,
                    ),
                }))
            }

            if (event.type === 'answer_delta') {
                const assistantMessageId = Number(event.assistant_message_id)
                const delta = String(event.delta || '')
                patchSessionById(sessionId, (session) => ({
                    ...session,
                    status: 'streaming',
                    messages: (session.messages || []).map((message) =>
                        message.id === assistantMessageId
                            ? {
                                ...message,
                                content: `${message.content}${delta}`,
                                status: 'streaming',
                                error_message: null,
                            }
                            : message,
                    ),
                }))
            }

            if (event.type === 'message_complete') {
                const assistantMessageId = Number(event.assistant_message_id)
                activeStreamingAssistantIdRef.current = null
                setSubmitting(false)
                setStreamStatus('')
                patchSessionById(sessionId, (session) => ({
                    ...session,
                    status: 'idle',
                    last_message_at: new Date().toISOString(),
                    messages: (session.messages || []).map((message) =>
                        message.id === assistantMessageId
                            ? { ...message, status: 'complete' }
                            : message,
                    ),
                }))
                void knowledgeChatApi.getSession(sessionId)
                    .then((detail) => {
                        setActiveSession(detail)
                        upsertSessionItem(sessionToListItem(detail))
                    })
                    .catch(() => {
                        // Keep optimistic state if the refetch fails.
                    })
            }

            if (event.type === 'message_error') {
                const assistantMessageId = Number(event.assistant_message_id)
                const error = String(event.error || '回答生成失败')
                activeStreamingAssistantIdRef.current = null
                setSubmitting(false)
                setStreamStatus(error)
                patchAssistantTrace(sessionId, assistantMessageId, (trace) => {
                    const currentStep = trace.current_step || 'generate_answer'
                    return {
                        ...trace,
                        current_step: currentStep,
                        status_message: error,
                        steps: {
                            ...trace.steps,
                            [currentStep]: {
                                ...trace.steps[currentStep],
                                status: 'error',
                                message: error,
                            },
                        },
                    }
                })
                patchSessionById(sessionId, (session) => ({
                    ...session,
                    status: 'error',
                    messages: (session.messages || []).map((message) =>
                        message.id === assistantMessageId
                            ? { ...message, status: 'error', error_message: error }
                            : message,
                    ),
                }))
            }
        }

        subscribeKnowledgeChatSSE(sessionId, {
            onEvent: handleStreamEvent,
            onReconnect: () => setSseConnected(true),
            onError: () => {
                setSseConnected(false)
                setStreamStatus('实时连接已断开，请刷新重试')
            },
        })
            .then((fn) => {
                if (disposed) {
                    fn()
                    return
                }
                cleanup = fn
                setSseConnected(true)
            })
            .catch(() => {
                setSseConnected(false)
            })

        return () => {
            disposed = true
            setSseConnected(false)
            if (cleanup) cleanup()
        }
    }, [sessionId])

    // Force scroll-to-bottom when switching into a session (initial render).
    useEffect(() => {
        if (!sessionId) return
        const target = chatScrollRef.current
        if (!target) return
        // Defer to next paint so the message list has rendered.
        requestAnimationFrame(() => {
            target.scrollTop = target.scrollHeight
        })
    }, [sessionId, sessionLoading])

    useEffect(() => {
        const target = chatScrollRef.current
        if (!target) return
        // Only auto-scroll if the user is already near the bottom — otherwise
        // they're reading older messages and we should not yank them down on
        // every streaming delta.
        const distanceFromBottom =
            target.scrollHeight - target.scrollTop - target.clientHeight
        if (distanceFromBottom < 120) {
            target.scrollTop = target.scrollHeight
        }
    }, [activeSession?.messages, streamStatus])

    const toggleDraftDoc = (docId: number) => {
        setSelectedDocIds((prev) =>
            prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId],
        )
    }

    const sendToSession = async (targetSessionId: string, content: string) => {
        const res = await knowledgeChatApi.sendMessage(targetSessionId, { content, mode: chatMode })
        const mergedMessages = mergeMessagesUnique([
            ...((activeSessionRef.current?.id === targetSessionId && activeSessionRef.current.messages) || []),
            res.user_message,
            res.assistant_message,
        ])
        const nextSession: KnowledgeChatSession = {
            ...res.session,
            messages: mergedMessages,
        }
        setActiveSession(nextSession)
        upsertSessionItem(sessionToListItem(nextSession))
    }

    const handleSend = async () => {
        if (!sessionId) return
        const content = composer.trim()
        if (!content) return
        setSubmitting(true)

        try {
            await sendToSession(sessionId, content)
            setComposer('')
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '发送失败')
            setSubmitting(false)
        }
    }

    const handleCreateSession = async () => {
        if (!selectedKbId) {
            toast.error('请先选择知识库')
            return
        }
        if (selectedDocIds.length === 0) {
            toast.error('请至少选择一个就绪文档')
            return
        }

        setCreatingSession(true)
        try {
            const created = await knowledgeChatApi.createSession({
                knowledge_base_id: selectedKbId,
                doc_ids: selectedDocIds,
            })
            setShowNewChatModal(false)
            setSessionsPage(0)
            upsertSessionItem(sessionToListItem(created))
            void loadSessionsPage(0, false)
            navigate(`/knowledge-chat/${created.id}`)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '创建会话失败')
        } finally {
            setCreatingSession(false)
        }
    }

    const handleDeleteSession = async () => {
        if (!deleteTarget) return
        const target = deleteTarget
        const nextPage = sessions.length === 1 && sessionsPage > 0 ? sessionsPage - 1 : sessionsPage
        setDeletingSessionId(target.id)

        try {
            await knowledgeChatApi.deleteSession(target.id)
            if (sessionId === target.id) {
                navigate('/knowledge-chat')
                setActiveSession(null)
                setExpandedTraceIds({})
            }
            setDeleteTarget(null)
            if (nextPage !== sessionsPage) {
                setSessionsPage(nextPage)
            } else {
                void loadSessionsPage(nextPage, false)
            }
            toast.success('会话已删除')
        } catch {
            toast.error('删除失败')
        } finally {
            setDeletingSessionId(null)
        }
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] min-h-[600px] w-full overflow-hidden animate-fade-in bg-background">
            {/* Sidebar */}
            <aside className="hidden w-[240px] shrink-0 flex-col border-r border-border bg-muted/5 md:flex lg:w-[280px] xl:w-[320px]">
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                    <h2 className="font-medium text-foreground">会话列表</h2>
                    <button
                        type="button"
                        onClick={openNewChatModal}
                        className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                        title="新聊天"
                    >
                        <Plus className="size-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                    {sessionsLoading ? (
                        <div className="flex h-40 items-center justify-center">
                            <Loader2 className="size-6 animate-spin text-primary" />
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 p-6 text-center text-muted-foreground">
                            <MessageSquareText className="mb-2 size-6 opacity-50" />
                            <p className="text-sm">暂无问答会话</p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {sessions.map((item) => (
                                <SidebarSessionItem
                                    key={item.id}
                                    item={item}
                                    active={sessionId === item.id}
                                    deleting={deletingSessionId === item.id}
                                    onOpen={() => navigate(`/knowledge-chat/${item.id}`)}
                                    onDelete={() => setDeleteTarget(item)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div className="border-t border-border/50">
                    <PaginationControls
                        page={sessionsPage}
                        hasMore={hasMoreSessions}
                        loading={sessionsLoading}
                        onPrev={() => setSessionsPage((prev) => Math.max(prev - 1, 0))}
                        onNext={() => setSessionsPage((prev) => prev + 1)}
                    />
                </div>
            </aside>

            {/* Main Content Area */}
            <section className="relative flex min-w-0 flex-1 flex-col bg-background">
                {!sessionId ? (
                    <div className="flex h-full flex-col items-center justify-center text-center p-8 bg-background">
                        <div className="mb-6 flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 shadow-sm ring-1 ring-border/50">
                            <Sparkles className="size-10 text-primary" />
                        </div>
                        <h2 className="text-2xl font-semibold text-foreground">知识库问答</h2>
                        <p className="mt-3 max-w-[320px] text-sm leading-relaxed text-muted-foreground">
                            在左侧选择历史对话，或新建一个会话，限定知识范围来获取准确回答。
                        </p>
                        <button
                            type="button"
                            onClick={openNewChatModal}
                            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
                        >
                            <Plus className="size-4" />
                            新建聊天
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 md:px-6 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 z-10">
                            <div className="min-w-0 flex flex-1 items-center gap-3">
                                {/* Mobile Sidebar Toggle could go here later */}
                                <h1 className="truncate font-medium text-foreground text-sm md:text-base">
                                    {activeSession?.title || '加载中...'}
                                </h1>
                                {activeSession && <SessionStatusBadge status={activeSession.status} />}

                                {activeSession && (
                                    <div ref={scopeDropdownRef} className="relative hidden md:block ml-2">
                                        <button
                                            type="button"
                                            onClick={() => setScopeOpen((prev) => !prev)}
                                            className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/20 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                        >
                                            <Database className="size-3" />
                                            <span className="max-w-[200px] truncate">
                                                {activeSession.knowledge_base_name}
                                            </span>
                                            {scopeOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                                        </button>

                                        {scopeOpen && (
                                            <div className="absolute left-0 top-full mt-2 w-[320px] rounded-xl border border-border/60 bg-card p-4 shadow-lg ring-1 ring-black/5">
                                                <p className="text-sm font-medium text-foreground">{activeSession.knowledge_base_name}</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    已绑定 {activeSession.selected_documents.length} 个文档
                                                </p>
                                                <div className="mt-3 max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
                                                    {activeSession.selected_documents.map((doc: KnowledgeChatScopeDocument) => (
                                                        <div
                                                            key={doc.id}
                                                            className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-2.5 py-2"
                                                        >
                                                            <FileText className="size-3.5 text-muted-foreground shrink-0" />
                                                            <p className="truncate text-xs text-foreground">{doc.original_filename}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                                <div className="hidden items-center gap-1.5 sm:flex">
                                    <div className={cn("size-1.5 rounded-full", sseConnected ? "bg-emerald-500" : "bg-muted-foreground")} />
                                    <span className="text-[11px] font-medium text-muted-foreground">
                                        {sseConnected ? '实时连接' : '连接中断'}
                                    </span>
                                </div>
                                {activeSession && (
                                    <button
                                        onClick={() => setDeleteTarget(sessionToListItem(activeSession))}
                                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                        title="删除会话"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                )}
                            </div>
                        </header>

                        {/* Chat Messages */}
                        <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
                            {sessionLoading ? (
                                <div className="flex h-full items-center justify-center">
                                    <Loader2 className="size-6 animate-spin text-primary" />
                                </div>
                            ) : activeMessages.length === 0 ? (
                                <div className="flex h-full flex-col items-center justify-center text-center">
                                    <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted/30">
                                        <BookOpen className="size-6 text-muted-foreground" />
                                    </div>
                                    <h3 className="font-medium text-foreground">会话已就绪</h3>
                                    <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                                        您可以直接在下方输入问题，系统将严格基于当前绑定的文档为您解答。
                                    </p>
                                </div>
                            ) : (
                                <div className="mx-auto max-w-5xl space-y-6">
                                    {activeMessages.map((message) => (
                                        <MessageBubble
                                            key={message.id}
                                            message={message}
                                            traceOpen={!!expandedTraceIds[message.id]}
                                            onToggleTrace={() => {
                                                setExpandedTraceIds((prev) => ({
                                                    ...prev,
                                                    [message.id]: !prev[message.id],
                                                }))
                                            }}
                                            onOpenCitation={(citation, idx) =>
                                                setOpenCitation({ citation, index: idx })
                                            }
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="shrink-0 px-4 py-4 md:px-6">
                            <div className="mx-auto max-w-5xl relative">
                                <div className="relative flex flex-col rounded-2xl border border-input bg-card shadow-sm transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                                    <textarea
                                        value={composer}
                                        onChange={(e) => setComposer(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                if (canSend) void handleSend()
                                            }
                                        }}
                                        placeholder="向知识库提问，或要求总结..."
                                        className="max-h-[200px] min-h-[60px] w-full resize-none bg-transparent px-4 py-3.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                                    />
                                    <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setChatMode((m) => (m === 'fast' ? 'accurate' : 'fast'))
                                            }
                                            title={
                                                chatMode === 'fast'
                                                    ? '快速模式：跳过 Query 改写、Rerank,并对支持的模型(如通义千问)关闭思考模式,延迟最低。再次点击切回准确模式。'
                                                    : '准确模式：完整 LLM 改写 + Rerank,质量更高但更慢。再次点击切到快速模式。'
                                            }
                                            className={cn(
                                                'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
                                                chatMode === 'fast'
                                                    ? 'border-amber-300/70 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/15'
                                                    : 'border-border/60 bg-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground',
                                            )}
                                        >
                                            {chatMode === 'fast' ? (
                                                <>
                                                    <Zap className="size-3.5" fill="currentColor" />
                                                    快速
                                                </>
                                            ) : (
                                                <>
                                                    <Target className="size-3.5" />
                                                    准确
                                                </>
                                            )}
                                        </button>
                                        <div className="flex items-center gap-3">
                                            <span className="hidden text-[11px] font-medium text-muted-foreground/70 sm:inline">
                                                Shift + Enter 换行
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => void handleSend()}
                                                disabled={!canSend}
                                                className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 -ml-0.5" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                {/* Stream status indicator above input if needed, or we just rely on bubble */}
                            </div>
                        </div>
                    </>
                )}
            </section>

            <CitationModal
                citation={openCitation?.citation ?? null}
                index={openCitation?.index ?? 0}
                onClose={() => setOpenCitation(null)}
            />

            <NewChatModal
                open={showNewChatModal}
                knowledgeBases={knowledgeBases}
                kbsLoading={kbsLoading}
                selectedKbId={selectedKbId}
                draftDocs={draftDocs}
                draftDocsLoading={draftDocsLoading}
                selectedDocIds={selectedDocIds}
                docsExpanded={docsExpanded}
                creating={creatingSession}
                onClose={closeNewChatModal}
                onSelectKb={setSelectedKbId}
                onToggleDocsExpanded={() => setDocsExpanded((prev) => !prev)}
                onSelectAll={() => setSelectedDocIds(readyDraftDocs.map((doc) => doc.id))}
                onClear={() => setSelectedDocIds([])}
                onToggleDoc={toggleDraftDoc}
                onCreate={() => void handleCreateSession()}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                title="删除聊天会话"
                description={`确定删除「${deleteTarget?.title || ''}」吗？历史消息将不可恢复。`}
                confirmLabel="删除"
                cancelLabel="取消"
                destructive
                onCancel={() => {
                    if (deletingSessionId) return
                    setDeleteTarget(null)
                }}
                onConfirm={() => {
                    void handleDeleteSession()
                }}
            />
        </div>
    )
}
