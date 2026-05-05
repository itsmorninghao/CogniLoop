import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
    AlertCircle,
    BookOpen,
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
    Trash2,
    X,
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
    return new Date(value).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
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
    return 'border-border bg-background text-muted-foreground'
}

function SessionStatusBadge({ status }: { status: KnowledgeChatSession['status'] }) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
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
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
            <button
                type="button"
                onClick={onPrev}
                disabled={page === 0 || loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
                <ChevronLeft className="size-4" />
                上一页
            </button>
            <span className="text-sm text-muted-foreground">第 {page + 1} 页</span>
            <button
                type="button"
                onClick={onNext}
                disabled={!hasMore || loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
                下一页
                <ChevronRight className="size-4" />
            </button>
        </div>
    )
}

function SessionListRow({
    item,
    active,
    deleting,
    onOpen,
    onDelete,
}: {
    item: KnowledgeChatSessionListItem
    active?: boolean
    deleting?: boolean
    onOpen: () => void
    onDelete: () => void
}) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className={cn(
                'group grid w-full grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_88px_88px_120px_auto] items-center gap-4 border-b border-border px-5 py-4 text-left last:border-0 transition-colors hover:bg-muted/30',
                active && 'bg-primary/5',
            )}
        >
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    {active && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            当前
                        </span>
                    )}
                </div>
            </div>
            <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{item.knowledge_base_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.message_count} 条消息</p>
            </div>
            <div className="text-sm text-muted-foreground">{item.selected_doc_count} 个文档</div>
            <SessionStatusBadge status={item.status} />
            <div className="text-sm text-muted-foreground">{formatDateTime(item.last_message_at)}</div>
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation()
                        onDelete()
                    }}
                    disabled={deleting}
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-100"
                    title="删除会话"
                >
                    {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </button>
                <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
        </button>
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
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpen()
                }
            }}
            role="button"
            tabIndex={0}
            className={cn(
                'group rounded-2xl border px-4 py-3 text-left transition-all',
                active
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-border bg-background hover:border-primary/20 hover:bg-accent/40',
            )}
        >
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
                    <MessageSquareText className="size-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-medium text-foreground">{item.title}</p>
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation()
                                onDelete()
                            }}
                            disabled={deleting}
                            className="rounded-lg p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-100"
                            title="删除会话"
                        >
                            {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        </button>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{item.knowledge_base_name}</p>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{item.selected_doc_count} 个文档</span>
                        <span>{statusText(item.status)}</span>
                    </div>
                </div>
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
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
            {items.slice(0, 3).map((item) => (
                <div
                    key={`${title}-${item.chunk_id}`}
                    className="rounded-xl border border-border bg-background/80 px-3 py-2"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-foreground">{item.document_name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                                {item.section_path || item.heading || '未标注章节'}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            {showRerankScore && item.rerank_score != null && (
                                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                    重排 {item.rerank_score}
                                </span>
                            )}
                            {item.similarity != null && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                    {Math.round(item.similarity * 100)}%
                                </span>
                            )}
                        </div>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.snippet}</p>
                </div>
            ))}
        </div>
    )
}

function ExecutionDetails({ trace }: { trace: KnowledgeChatExecutionTrace }) {
    return (
        <div className="mt-3 space-y-4 border-t border-border/80 pt-3">
            <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">执行阶段</p>
                <div className="space-y-2">
                    {TRACE_STEP_META.map((step) => {
                        const state = trace.steps[step.key]
                        return (
                            <div
                                key={step.key}
                                className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background/80 px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-foreground">{step.label}</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                        {state.message || '等待执行'}
                                    </p>
                                </div>
                                <TraceStepBadge label={step.label} status={state.status} />
                            </div>
                        )
                    })}
                </div>
            </div>

            {trace.rewrite_query && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">检索改写</p>
                        <span className="rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                            {querySourceText(trace.query_source)}
                        </span>
                    </div>
                    <div className="rounded-xl border border-border bg-background/80 px-3 py-2">
                        <p className="text-xs leading-relaxed text-foreground">{trace.rewrite_query}</p>
                        {trace.history_turns_used > 0 && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                使用了 {trace.history_turns_used} 条上下文消息
                            </p>
                        )}
                    </div>
                </div>
            )}

            {trace.retrieval_results.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">检索结果</p>
                        <span className="rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
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

function MessageBubble({
    message,
    traceOpen,
    onToggleTrace,
}: {
    message: KnowledgeChatMessage
    traceOpen?: boolean
    onToggleTrace?: () => void
}) {
    const isUser = message.role === 'user'
    const trace = !isUser && message.trace ? normalizeTrace(message.trace, message.id) : null

    return (
        <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
            <div
                className={cn(
                    'max-w-[85%] rounded-2xl border px-4 py-3 shadow-sm',
                    isUser
                        ? 'border-primary/20 bg-primary text-white'
                        : 'border-border bg-card text-foreground',
                )}
            >
                <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide opacity-80">
                    <span>{isUser ? '你' : '知识库助手'}</span>
                    {message.status === 'streaming' && <Loader2 className="size-3 animate-spin" />}
                    {message.status === 'error' && <AlertCircle className="size-3" />}
                </div>

                {!isUser && trace && (
                    <div className="mb-4 rounded-2xl border border-primary/10 bg-primary/5 px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                            {TRACE_STEP_META.map((step) => (
                                <TraceStepBadge
                                    key={step.key}
                                    label={step.label}
                                    status={trace.steps[step.key].status}
                                />
                            ))}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                            <p className="min-w-0 truncate text-xs text-muted-foreground">
                                {trace.status_message || trace.steps.generate_answer.message || '等待执行'}
                            </p>
                            <button
                                type="button"
                                onClick={onToggleTrace}
                                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                            >
                                执行详情
                                {traceOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                            </button>
                        </div>
                        {traceOpen && <ExecutionDetails trace={trace} />}
                    </div>
                )}

                {isUser ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                ) : message.content ? (
                    <MathText className="text-sm leading-relaxed text-foreground">{message.content}</MathText>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {message.status === 'streaming' ? '正在生成回答...' : '暂无内容'}
                    </p>
                )}

                {message.error_message && (
                    <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        {message.error_message}
                    </div>
                )}

                {!isUser && message.citations.length > 0 && (
                    <div className="mt-4 space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">引用来源</p>
                        {message.citations.map((citation) => (
                            <div
                                key={`${message.id}-${citation.chunk_id}`}
                                className="rounded-xl border border-border bg-background/70 px-3 py-2"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-medium text-foreground">
                                            {citation.document_name}
                                        </p>
                                        <p className="truncate text-[11px] text-muted-foreground">
                                            {citation.section_path || citation.heading || '未标注章节'}
                                        </p>
                                    </div>
                                    {citation.similarity != null && (
                                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                            {Math.round(citation.similarity * 100)}%
                                        </span>
                                    )}
                                </div>
                                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                    {citation.snippet}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-4xl rounded-2xl border border-border bg-card shadow-2xl">
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <div>
                        <h3 className="text-lg font-medium text-foreground">新建知识库问答</h3>
                        <p className="mt-1 text-sm text-muted-foreground">先固定知识库和文档范围，再进入对话。</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="grid gap-6 px-6 py-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                    <div className="space-y-3">
                        <p className="text-sm font-medium text-foreground">知识库</p>
                        {kbsLoading ? (
                            <div className="flex h-24 items-center justify-center rounded-2xl border border-border bg-background">
                                <Loader2 className="size-5 animate-spin text-primary" />
                            </div>
                        ) : knowledgeBases.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-6 text-center">
                                <Database className="mx-auto mb-3 size-8 text-muted-foreground" />
                                <p className="text-sm font-medium text-foreground">暂无可用知识库</p>
                                <p className="mt-1 text-xs text-muted-foreground">请先到“我的知识库”创建或获取一个知识库。</p>
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
                                                'w-full rounded-2xl border px-4 py-3 text-left transition-all',
                                                selected
                                                    ? 'border-primary/30 bg-primary/5'
                                                    : 'border-border bg-background hover:border-primary/20 hover:bg-accent/30',
                                            )}
                                        >
                                            <p className="truncate text-sm font-medium text-foreground">{kb.name}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">{kb.document_count} 个文档</p>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-2xl border border-border bg-background">
                            <button
                                type="button"
                                onClick={onToggleDocsExpanded}
                                className="flex w-full items-center justify-between px-4 py-3 text-left"
                            >
                                <div>
                                    <p className="text-sm font-medium text-foreground">文档范围</p>
                                    <p className="text-xs text-muted-foreground">
                                        已选择 {selectedDocIds.length} / {readyDocs.length} 个就绪文档
                                    </p>
                                </div>
                                {docsExpanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                            </button>

                            {docsExpanded && (
                                <div className="border-t border-border px-4 py-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <button
                                            type="button"
                                            onClick={onSelectAll}
                                            className="text-xs font-medium text-primary"
                                        >
                                            全选
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onClear}
                                            className="text-xs font-medium text-muted-foreground"
                                        >
                                            清空
                                        </button>
                                    </div>

                                    {draftDocsLoading ? (
                                        <div className="flex h-32 items-center justify-center">
                                            <Loader2 className="size-5 animate-spin text-primary" />
                                        </div>
                                    ) : readyDocs.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                                            当前知识库没有就绪文档
                                        </div>
                                    ) : (
                                        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                                            {readyDocs.map((doc) => {
                                                const checked = selectedDocIds.includes(doc.id)
                                                return (
                                                    <button
                                                        key={doc.id}
                                                        type="button"
                                                        onClick={() => onToggleDoc(doc.id)}
                                                        className={cn(
                                                            'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                                                            checked
                                                                ? 'border-primary/30 bg-primary/5'
                                                                : 'border-border bg-card hover:bg-accent/40',
                                                        )}
                                                    >
                                                        <div
                                                            className={cn(
                                                                'flex size-5 shrink-0 items-center justify-center rounded border',
                                                                checked ? 'border-primary bg-primary' : 'border-border',
                                                            )}
                                                        >
                                                            {checked && <CheckCircle2 className="size-3.5 text-white" />}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-sm text-foreground">{doc.original_filename}</p>
                                                            <p className="text-xs text-muted-foreground">{doc.chunk_count} 个分块</p>
                                                        </div>
                                                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                            会话创建后，知识库与文档范围将固定。后续如果要换范围，请新建一个会话。
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        onClick={onCreate}
                        disabled={creating || knowledgeBases.length === 0 || selectedDocIds.length === 0 || !selectedKbId}
                        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
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

    const isWorkspace = !!sessionId
    const activeMessages = activeSession?.messages || []
    const canSend =
        isWorkspace &&
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

    useEffect(() => {
        const target = chatScrollRef.current
        if (!target) return
        target.scrollTop = target.scrollHeight
    }, [activeSession?.messages, streamStatus])

    const toggleDraftDoc = (docId: number) => {
        setSelectedDocIds((prev) =>
            prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId],
        )
    }

    const sendToSession = async (targetSessionId: string, content: string) => {
        const res = await knowledgeChatApi.sendMessage(targetSessionId, { content })
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
        <>
            {!isWorkspace ? (
                <div className="container mx-auto space-y-6 p-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-foreground">知识库问答</h1>
                            <p className="mt-1 text-sm text-muted-foreground">从历史会话继续对话，或基于知识库新建一个问答会话。</p>
                        </div>
                        <button
                            type="button"
                            onClick={openNewChatModal}
                            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:-translate-y-0.5"
                        >
                            <Plus className="size-4" />
                            新聊天
                        </button>
                    </div>

                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_88px_88px_120px_auto] items-center gap-4 border-b border-border bg-muted/30 px-5 py-2.5 text-xs font-medium text-muted-foreground">
                            <span>会话标题</span>
                            <span>知识库</span>
                            <span>文档数</span>
                            <span>状态</span>
                            <span>最近更新</span>
                            <span className="text-right">操作</span>
                        </div>

                        {sessionsLoading ? (
                            <div className="flex items-center justify-center py-24">
                                <Loader2 className="size-6 animate-spin text-primary" />
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 text-center">
                                <div className="mb-6 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30">
                                    <MessageSquareText className="size-10 text-primary" />
                                </div>
                                <h3 className="text-lg font-medium text-foreground">还没有知识库问答会话</h3>
                                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                                    先新建一个会话，选择知识库和文档范围，后续就可以反复续聊。
                                </p>
                                <button
                                    type="button"
                                    onClick={openNewChatModal}
                                    className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl"
                                >
                                    <Plus className="size-4" />
                                    开始新聊天
                                </button>
                            </div>
                        ) : (
                            <div>
                                {sessions.map((item) => (
                                    <SessionListRow
                                        key={item.id}
                                        item={item}
                                        deleting={deletingSessionId === item.id}
                                        onOpen={() => navigate(`/knowledge-chat/${item.id}`)}
                                        onDelete={() => setDeleteTarget(item)}
                                    />
                                ))}
                            </div>
                        )}

                        <PaginationControls
                            page={sessionsPage}
                            hasMore={hasMoreSessions}
                            loading={sessionsLoading}
                            onPrev={() => setSessionsPage((prev) => Math.max(prev - 1, 0))}
                            onNext={() => setSessionsPage((prev) => prev + 1)}
                        />
                    </div>
                </div>
            ) : (
                <div className="flex h-full min-h-[720px] animate-fade-in">
                    <aside className="flex w-[320px] shrink-0 flex-col border-r border-border bg-card">
                        <div className="border-b border-border px-5 py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-foreground">会话列表</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">切换历史对话或开启新的会话</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={openNewChatModal}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                                >
                                    <Plus className="size-4" />
                                    新聊天
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3">
                            {sessionsLoading ? (
                                <div className="flex h-40 items-center justify-center">
                                    <Loader2 className="size-5 animate-spin text-primary" />
                                </div>
                            ) : sessions.length === 0 ? (
                                <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background px-4 text-center">
                                    <MessageSquareText className="mb-3 size-8 text-muted-foreground" />
                                    <p className="text-sm font-medium text-foreground">还没有问答会话</p>
                                    <p className="mt-1 text-xs text-muted-foreground">新建一个会话后会显示在这里</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
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

                        <PaginationControls
                            page={sessionsPage}
                            hasMore={hasMoreSessions}
                            loading={sessionsLoading}
                            onPrev={() => setSessionsPage((prev) => Math.max(prev - 1, 0))}
                            onNext={() => setSessionsPage((prev) => prev + 1)}
                        />
                    </aside>

                    <section className="flex min-w-0 flex-1 flex-col">
                        <div className="border-b border-border bg-card/80 px-6 py-4 backdrop-blur-sm">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h1 className="truncate text-foreground">
                                            {activeSession?.title || '知识库问答'}
                                        </h1>
                                        {activeSession && <SessionStatusBadge status={activeSession.status} />}
                                    </div>

                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        {activeSession && (
                                            <div ref={scopeDropdownRef} className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setScopeOpen((prev) => !prev)}
                                                    className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
                                                >
                                                    <BookOpen className="size-4 text-primary" />
                                                    <span className="max-w-[360px] truncate">
                                                        {activeSession.knowledge_base_name} · {activeSession.selected_documents.length} 个文档
                                                    </span>
                                                    {scopeOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                                                </button>

                                                {scopeOpen && (
                                                    <div className="absolute left-0 top-full z-20 mt-3 w-[360px] rounded-2xl border border-border bg-card p-4 shadow-xl">
                                                        <p className="text-sm font-medium text-foreground">{activeSession.knowledge_base_name}</p>
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            当前会话固定使用以下 {activeSession.selected_documents.length} 个文档
                                                        </p>
                                                        <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto pr-1">
                                                            {activeSession.selected_documents.map((doc: KnowledgeChatScopeDocument) => (
                                                                <div
                                                                    key={doc.id}
                                                                    className="rounded-xl border border-border bg-background px-3 py-2.5"
                                                                >
                                                                    <p className="truncate text-sm text-foreground">{doc.original_filename}</p>
                                                                    <p className="text-xs text-muted-foreground">{doc.file_type}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <span className="text-sm text-muted-foreground">
                                            {sseConnected ? '实时连接正常' : '实时连接未建立'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    {streamStatus && (
                                        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                                            {streamStatus}
                                        </div>
                                    )}
                                    {activeSession && (
                                        <button
                                            type="button"
                                            onClick={() => setDeleteTarget(sessionToListItem(activeSession))}
                                            className="inline-flex items-center gap-2 rounded-lg border border-destructive/20 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                                        >
                                            <Trash2 className="size-4" />
                                            删除会话
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div ref={chatScrollRef} className="flex-1 overflow-y-auto bg-background px-6 py-6">
                            {sessionLoading ? (
                                <div className="flex h-full items-center justify-center">
                                    <Loader2 className="size-6 animate-spin text-primary" />
                                </div>
                            ) : activeMessages.length === 0 ? (
                                <div className="flex h-full flex-col items-center justify-center text-center">
                                    <div className="mb-5 flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
                                        <BookOpen className="size-8 text-primary" />
                                    </div>
                                    <h3 className="text-lg font-medium text-foreground">这个会话还没有消息</h3>
                                    <p className="mt-2 max-w-md text-sm text-muted-foreground">
                                        直接在下方输入问题，回答会严格基于当前会话绑定的知识库文档。
                                    </p>
                                </div>
                            ) : (
                                <div className="mx-auto max-w-4xl space-y-5">
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
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="border-t border-border bg-card px-6 py-4">
                            <div className="mx-auto max-w-4xl">
                                <div className="rounded-3xl border border-border bg-background p-3 shadow-sm">
                                    <textarea
                                        value={composer}
                                        onChange={(event) => setComposer(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' && !event.shiftKey) {
                                                event.preventDefault()
                                                if (canSend) void handleSend()
                                            }
                                        }}
                                        placeholder="继续追问、要求举例，或限定回答范围..."
                                        className="min-h-[88px] w-full resize-none bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                                    />
                                    <div className="mt-3 flex items-center justify-between gap-3">
                                        <p className="text-xs text-muted-foreground">Shift + Enter 换行，Enter 发送。</p>
                                        <button
                                            type="button"
                                            onClick={() => void handleSend()}
                                            disabled={!canSend}
                                            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                                            发送
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            )}

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
                description={`确定删除「${deleteTarget?.title || ''}」吗？历史消息会一并移除。`}
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
        </>
    )
}
