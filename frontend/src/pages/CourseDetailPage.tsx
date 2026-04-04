/**
 * Course Detail / Learning Page.
 * Layout: Left sidebar outline tree + Right content area.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import {
    ChevronLeft, ChevronRight, CheckCircle2, Circle, Play,
    FileText, Video, Loader2, Sparkles, AlertCircle,
    RotateCcw, ChevronDown, ChevronUp,
    Globe, Lock, GraduationCap,
} from 'lucide-react'
import { courseApi, courseGenApi, streamNodeContent, type CourseNodeResponse, type NodeContentResponse } from '@/lib/api'
import { useAsync } from '@/hooks/useAsync'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const MD: Components = {
    h1: ({ children }) => (
        <h1 className="text-2xl font-semibold text-foreground mt-0 mb-5 pb-3 border-b border-border">{children}</h1>
    ),
    h2: ({ children }) => (
        <h2 className="text-lg font-semibold text-foreground mt-10 mb-3 pb-2 border-b border-border/60">{children}</h2>
    ),
    h3: ({ children }) => (
        <h3 className="text-base font-semibold text-primary mt-6 mb-2">{children}</h3>
    ),
    h4: ({ children }) => (
        <h4 className="text-sm font-semibold text-foreground/90 mt-4 mb-1">{children}</h4>
    ),
    p: ({ children }) => (
        <p className="text-foreground/80 leading-[1.85] mb-4 last:mb-0">{children}</p>
    ),
    strong: ({ children }) => (
        <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }) => (
        <em className="italic text-foreground/70">{children}</em>
    ),
    ul: ({ children }) => (
        <ul className="list-disc pl-5 mb-4 space-y-1.5 text-foreground/80">{children}</ul>
    ),
    ol: ({ children }) => (
        <ol className="list-decimal pl-5 mb-4 space-y-1.5 text-foreground/80">{children}</ol>
    ),
    li: ({ children }) => (
        <li className="leading-7 pl-0.5">{children}</li>
    ),
    blockquote: ({ children }) => (
        <blockquote className="my-4 border-l-4 border-primary/50 bg-primary/5 pl-4 py-2 rounded-r-lg text-foreground/70 [&>p]:mb-0">{children}</blockquote>
    ),
    hr: () => <hr className="my-8 border-border" />,
    pre: ({ children }) => (
        <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-muted p-4 text-sm font-mono leading-relaxed">{children}</pre>
    ),
    code: ({ children, className }) => {
        if (className?.startsWith('language-')) {
            return <code className={`font-mono text-sm ${className}`}>{children}</code>
        }
        return (
            <code className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[0.82em] text-primary">{children}</code>
        )
    },
    table: ({ children }) => (
        <div className="my-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">{children}</table>
        </div>
    ),
    thead: ({ children }) => (
        <thead className="bg-muted/50">{children}</thead>
    ),
    tbody: ({ children }) => (
        <tbody className="divide-y divide-border">{children}</tbody>
    ),
    tr: ({ children }) => (
        <tr className="transition-colors hover:bg-muted/30">{children}</tr>
    ),
    th: ({ children }) => (
        <th className="px-4 py-2.5 text-left font-semibold text-foreground">{children}</th>
    ),
    td: ({ children }) => (
        <td className="px-4 py-2.5 text-foreground/80">{children}</td>
    ),
}

export default function CourseDetailPage() {
    const { courseId } = useParams<{ courseId: string }>()
    const navigate = useNavigate()
    const id = Number(courseId)

    const { data: course, loading, refetch: refetchCourse } = useAsync(
        () => courseApi.get(id),
        [id]
    )

    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
    const [nodeContent, setNodeContent] = useState<NodeContentResponse | null>(null)
    const [contentLoading, setContentLoading] = useState(false)
    const [textExpanded, setTextExpanded] = useState(true)
    const [retrying, setRetrying] = useState(false)
    const contentRef = useRef<HTMLDivElement>(null)
    const autoCompletedRef = useRef<Set<number>>(new Set())
    const [localCompleted, setLocalCompleted] = useState<Set<number>>(new Set())

    // Refs to avoid stale closures in polling interval
    const courseIdRef = useRef(course?.id)
    courseIdRef.current = course?.id
    const selectedNodeIdRef = useRef(selectedNodeId)
    selectedNodeIdRef.current = selectedNodeId

    const isNodeCompleted = useCallback((nodeId: number) => {
        if (localCompleted.has(nodeId)) return true
        return course?.nodes.find(n => n.id === nodeId)?.progress_status === 'completed'
    }, [course, localCompleted])

    // Auto-select first leaf node
    useEffect(() => {
        if (!course || selectedNodeId !== null) return
        const firstLeaf = course.nodes.find((n) => n.is_leaf)
        if (firstLeaf) setSelectedNodeId(firstLeaf.id)
    }, [course, selectedNodeId])

    // Load node content when user switches node (only depends on selectedNodeId)
    useEffect(() => {
        if (!selectedNodeId || !courseIdRef.current) return
        setNodeContent(null)
        setContentLoading(true)
        courseApi.getNodeContent(courseIdRef.current, selectedNodeId)
            .then(setNodeContent)
            .catch(() => {})
            .finally(() => setContentLoading(false))
    }, [selectedNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

    // Poll generation status if course is still generating (max 120 polls = ~10 min)
    const pollCountRef = useRef(0)
    const courseStatus = course?.status
    const courseIdStable = course?.id
    useEffect(() => {
        if (!courseIdStable || !courseStatus || !['generating', 'draft'].includes(courseStatus)) {
            pollCountRef.current = 0
            return
        }
        const timer = setInterval(() => {
            if (pollCountRef.current >= 120) {
                clearInterval(timer)
                return
            }
            pollCountRef.current += 1
            refetchCourse()
            const nid = selectedNodeIdRef.current
            const cid = courseIdRef.current
            if (nid && cid) {
                courseApi.getNodeContent(cid, nid)
                    .then((nc) => {
                        setNodeContent(prev => {
                            // Don't overwrite while streaming text content
                            if (prev?.gen_status === 'generating' && prev?.content_type === 'text') {
                                // Unless server says generation finished
                                if (nc.gen_status !== 'generating') return nc
                                return prev
                            }
                            return nc
                        })
                    })
                    .catch(() => {})
            }
        }, 5000)
        return () => clearInterval(timer)
    }, [courseIdStable, courseStatus, refetchCourse])

    const handleSelectNode = (node: CourseNodeResponse) => {
        if (!node.is_leaf) return
        setSelectedNodeId(node.id)
    }


    const handleMarkComplete = async (nodeId: number) => {
        if (!course) return
        try {
            await courseApi.updateNodeProgress(course.id, nodeId, 'completed')
            // Update node progress locally — avoid refetchCourse() which resets scroll
            setLocalCompleted(prev => new Set(prev).add(nodeId))
        } catch {
            toast.error('标记失败')
        }
    }

    const handleRetryNode = async (nodeId: number) => {
        setRetrying(true)
        try {
            await courseGenApi.retryNode(nodeId)
            toast.success('已重新触发生成')
            setTimeout(() => {
                if (course) {
                    courseApi.getNodeContent(course.id, nodeId).then(setNodeContent).catch(() => {})
                }
            }, 2000)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '重试失败')
        } finally {
            setRetrying(false)
        }
    }

    // Scroll tracking to auto-mark text nodes as completed
    const handleTextScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        if (!nodeContent || nodeContent.content_type !== 'text') return
        const el = e.currentTarget
        const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50
        if (atBottom && nodeContent.gen_status === 'done' && selectedNodeId && course) {
            if (autoCompletedRef.current.has(selectedNodeId)) return
            const node = course.nodes.find((n) => n.id === selectedNodeId)
            if (!isNodeCompleted(node!.id)) {
                autoCompletedRef.current.add(selectedNodeId)
                handleMarkComplete(selectedNodeId)
            }
        }
    }, [nodeContent, selectedNodeId, course]) // eslint-disable-line

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="size-6 animate-spin text-primary" />
            </div>
        )
    }

    if (!course) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4">
                <GraduationCap className="size-12 text-muted-foreground" />
                <p className="text-muted-foreground">课程不存在</p>
                <button onClick={() => navigate('/courses')} className="rounded-xl bg-primary px-4 py-2 text-sm text-white">
                    返回课程列表
                </button>
            </div>
        )
    }

    const selectedNode = course.nodes.find((n) => n.id === selectedNodeId)
    const totalLeaf = course.nodes.filter((n) => n.is_leaf).length
    const completedLeaf = course.nodes.filter((n) => n.is_leaf && isNodeCompleted(n.id)).length

    // Build outline tree
    const rootNodes = course.nodes.filter((n) => !n.parent_id)
    const childrenOf = (parentId: number) => course.nodes.filter((n) => n.parent_id === parentId)

    const renderOutlineNode = (node: CourseNodeResponse, depth = 0): React.ReactNode => {
        const children = childrenOf(node.id)
        const isSelected = node.id === selectedNodeId
        const isLeaf = node.is_leaf

        const progressIcon = isLeaf ? (
            isNodeCompleted(node.id) ? (
                <CheckCircle2 className="size-4 text-green-500 flex-shrink-0" />
            ) : node.progress_status === 'in_progress' ? (
                <div className="size-4 rounded-full border-2 border-primary flex-shrink-0" />
            ) : (
                <Circle className="size-4 text-muted-foreground flex-shrink-0" />
            )
        ) : null

        const genIcon = isLeaf && node.gen_status ? (
            node.gen_status === 'generating' ? (
                <Sparkles className="size-3 text-purple-500 animate-pulse flex-shrink-0" />
            ) : node.gen_status === 'failed' ? (
                <AlertCircle className="size-3 text-red-500 flex-shrink-0" />
            ) : null
        ) : null

        return (
            <div key={node.id}>
                <button
                    onClick={() => handleSelectNode(node)}
                    disabled={!isLeaf}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                        isSelected
                            ? 'bg-primary/10 text-primary font-medium'
                            : isLeaf
                            ? 'hover:bg-muted/70 cursor-pointer'
                            : 'text-muted-foreground cursor-default font-medium'
                    }`}
                    style={{ paddingLeft: `${8 + depth * 16}px` }}
                >
                    {progressIcon}
                    <span className="flex-1 text-xs leading-relaxed truncate">{node.title}</span>
                    {genIcon}
                    {isLeaf && node.content_type && (
                        node.content_type === 'video' ? (
                            <Video className="size-3 text-muted-foreground flex-shrink-0" />
                        ) : (
                            <FileText className="size-3 text-muted-foreground flex-shrink-0" />
                        )
                    )}
                </button>
                {children.length > 0 && (
                    <div>{children.map((child) => renderOutlineNode(child, depth + 1))}</div>
                )}
            </div>
        )
    }

    return (
        <div className="flex h-full overflow-hidden">
            <div className={`flex flex-col border-r border-border bg-card transition-all duration-300 ${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-64'} flex-shrink-0`}>
                <div className="h-11 flex items-center justify-between border-b border-border px-3">
                    <span className="text-xs font-medium text-muted-foreground truncate">课程大纲</span>
                    <button
                        onClick={() => setSidebarCollapsed(true)}
                        className="ml-auto rounded-lg p-1 hover:bg-muted transition-colors"
                    >
                        <ChevronLeft className="size-4" />
                    </button>
                </div>

                {!sidebarCollapsed && (
                    <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                        {rootNodes.map((node) => renderOutlineNode(node))}
                    </div>
                )}

                {!sidebarCollapsed && totalLeaf > 0 && (
                    <div className="border-t border-border p-3 space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>整体进度</span>
                            <span>{Math.round(completedLeaf / totalLeaf * 100)}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted">
                            <div
                                className="h-1.5 rounded-full bg-primary transition-all duration-300"
                                style={{ width: `${completedLeaf / totalLeaf * 100}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto" onScroll={handleTextScroll} ref={contentRef}>
                <div className="h-11 flex items-center border-b border-border px-6">
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                            {sidebarCollapsed && (
                                <button
                                    onClick={() => setSidebarCollapsed(false)}
                                    className="rounded-lg p-1 hover:bg-muted transition-colors shrink-0 mr-1"
                                    title="展开课程大纲"
                                >
                                    <ChevronRight className="size-4" />
                                </button>
                            )}
                            <button onClick={() => navigate('/courses')} className="hover:text-foreground transition-colors shrink-0">
                                我的课程
                            </button>
                            <ChevronRight className="size-3 shrink-0" />
                            <span className="truncate text-foreground">{course.title}</span>
                            {selectedNode && (
                                <>
                                    <ChevronRight className="size-3 shrink-0" />
                                    <span className="truncate">{selectedNode.title}</span>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-4">
                            {course.status === 'generating' && (
                                <span className="flex items-center gap-1.5 text-xs text-purple-500">
                                    <Sparkles className="size-3.5 animate-pulse" />
                                    生成中...
                                </span>
                            )}
                            <button
                                onClick={() => courseApi.togglePublish(course.id).then(() => { toast.success('已更新'); refetchCourse() }).catch(() => toast.error('操作失败'))}
                                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted transition-colors"
                            >
                                {course.visibility === 'public' ? <Globe className="size-3" /> : <Lock className="size-3" />}
                                {course.visibility === 'public' ? '公开' : '私有'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-6 space-y-6">
                    {!selectedNodeId && (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <GraduationCap className="size-12 text-muted-foreground mb-3" />
                            <p className="text-muted-foreground">请在左侧选择一个节点开始学习</p>
                        </div>
                    )}

                    {selectedNode && (
                        <>
                            {contentLoading ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin" />
                                    加载内容中...
                                </div>
                            ) : nodeContent ? (
                                <NodeContentView
                                    node={selectedNode}
                                    content={nodeContent}
                                    isCompleted={isNodeCompleted(selectedNode.id)}
                                    onMarkComplete={() => handleMarkComplete(selectedNode.id)}
                                    onRetry={() => handleRetryNode(selectedNode.id)}
                                    retrying={retrying}
                                    textExpanded={textExpanded}
                                    setTextExpanded={setTextExpanded}
                                    onContentReady={() => {
                                        // Refetch to get the final DB-persisted content
                                        setTimeout(() => {
                                            courseApi.getNodeContent(course.id, selectedNode.id)
                                                .then(setNodeContent)
                                                .catch(() => {})
                                            refetchCourse()
                                        }, 1000)
                                    }}
                                />
                            ) : null}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

interface NodeContentViewProps {
    node: CourseNodeResponse
    content: NodeContentResponse
    isCompleted: boolean
    onMarkComplete: () => void
    onRetry: () => void
    retrying: boolean
    textExpanded: boolean
    setTextExpanded: (v: boolean) => void
    onContentReady?: (text: string) => void
}

function NodeContentView({
    node,
    content,
    isCompleted,
    onMarkComplete,
    onRetry,
    retrying,
    textExpanded,
    setTextExpanded,
    onContentReady,
}: NodeContentViewProps) {
    const [streamingText, setStreamingText] = useState('')
    const streamStarted = useRef(false)
    const streamTextRef = useRef('')

    // Start streaming for text nodes that are generating
    useEffect(() => {
        if (node.content_type !== 'text') return
        if (content.gen_status !== 'generating') return
        if (streamStarted.current) return
        streamStarted.current = true
        setStreamingText('')
        streamTextRef.current = ''

        streamNodeContent(node.id, {
            onToken: (t) => {
                streamTextRef.current += t
                setStreamingText(streamTextRef.current)
            },
            onDone: (text) => {
                setStreamingText(text)
                onContentReady?.(text)
            },
            onError: () => {},
        })
    }, [node.id, node.content_type, content.gen_status]) // eslint-disable-line

    // Reset when switching nodes
    useEffect(() => {
        streamStarted.current = false
        setStreamingText('')
        streamTextRef.current = ''
    }, [node.id])

    // Video nodes generating — keep original spinner
    if ((content.gen_status === 'pending' || content.gen_status === 'generating') && node.content_type !== 'text') {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center rounded-xl border border-border bg-muted/30">
                <div className="relative">
                    <Sparkles className="size-8 text-primary animate-pulse" />
                    <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                </div>
                <div>
                    <p className="font-medium">AI 正在生成内容...</p>
                    <p className="text-sm text-muted-foreground mt-1">请稍候，生成完成后将自动刷新</p>
                </div>
            </div>
        )
    }

    // Text node generating — show streaming or waiting
    if ((content.gen_status === 'pending' || content.gen_status === 'generating') && node.content_type === 'text') {
        return (
            <div className="space-y-6">
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                            <Sparkles className="size-3.5 text-purple-600 dark:text-purple-400 animate-pulse" />
                        </span>
                        <span className="text-sm font-medium">AI 正在生成文字讲解...</span>
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground ml-auto" />
                    </div>
                    <div className="px-8 py-7">
                        {streamingText ? (
                            <>
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{streamingText}</ReactMarkdown>
                                <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse align-middle ml-0.5" />
                            </>
                        ) : (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" />
                                <span className="text-sm">等待内容生成...</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    if (content.gen_status === 'failed') {
        return (
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 p-6 space-y-3">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertCircle className="size-5" />
                    <span className="font-medium">内容生成失败</span>
                </div>
                {content.error_msg && (
                    <p className="text-sm text-red-500 dark:text-red-400 font-mono">{content.error_msg}</p>
                )}
                <div className="flex items-center gap-2">
                    <button
                        onClick={onRetry}
                        disabled={retrying || content.retry_count >= 3}
                        className="flex items-center gap-2 rounded-lg border border-red-300 dark:border-red-700 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    >
                        {retrying ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                        重试生成 {content.retry_count >= 3 ? '（已达上限）' : `（${content.retry_count}/3）`}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {node.content_type === 'video' && content.video_url && (
                <div className="overflow-hidden rounded-xl border border-border bg-black">
                    <video
                        controls
                        className="w-full"
                        src={content.video_url}
                        onEnded={onMarkComplete}
                    >
                        您的浏览器不支持视频播放
                    </video>
                </div>
            )}

            {/* Video not ready yet (script generated but no video) */}
            {node.content_type === 'video' && !content.video_url && content.gen_status === 'done' && (
                <div className="rounded-xl border border-border bg-muted/30 p-6 text-center">
                    <Video className="mx-auto size-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">视频文件未生成（可能需要 renderer 服务）</p>
                </div>
            )}

            {content.text_content && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <button
                        onClick={() => setTextExpanded(!textExpanded)}
                        className="flex w-full items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors"
                    >
                        <span className="flex items-center gap-2.5">
                            <span className="flex size-7 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                                <FileText className="size-3.5 text-green-600 dark:text-green-400" />
                            </span>
                            <span className="text-sm font-medium">
                                {node.content_type === 'video' ? '文字版（快速复习）' : '文字讲解'}
                            </span>
                            <span className="text-xs text-muted-foreground">建议通读全文</span>
                        </span>
                        {textExpanded
                            ? <ChevronUp className="size-4 text-muted-foreground" />
                            : <ChevronDown className="size-4 text-muted-foreground" />}
                    </button>
                    {textExpanded && (
                        <div className="border-t border-border px-8 py-7">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{content.text_content}</ReactMarkdown>
                        </div>
                    )}
                </div>
            )}

            {content.quiz_session_id && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="size-5 text-green-500" />
                            <span className="font-medium text-sm">节后小测</span>
                            <span className="text-xs text-muted-foreground">检验本节理解</span>
                        </div>
                        <a
                            href={`/quiz/${content.quiz_session_id}`}
                            className="flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs text-primary font-medium hover:bg-primary/20 transition-colors"
                        >
                            <Play className="size-3" />
                            开始测验
                        </a>
                    </div>
                </div>
            )}

            {!isCompleted && content.gen_status === 'done' && (
                <div className="flex justify-end">
                    <button
                        onClick={onMarkComplete}
                        className="flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2 text-sm font-medium text-white hover:scale-105 transition-transform active:scale-95"
                    >
                        <CheckCircle2 className="size-4" />
                        标记已完成
                    </button>
                </div>
            )}

            {isCompleted && (
                <div className="flex items-center gap-2 justify-end text-sm text-green-500">
                    <CheckCircle2 className="size-4" />
                    已完成
                </div>
            )}
        </div>
    )
}
