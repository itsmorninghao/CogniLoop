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
import { courseApi, courseGenApi, type CourseNodeResponse, type NodeContentResponse } from '@/lib/api'
import { useAsync } from '@/hooks/useAsync'
import ReactMarkdown from 'react-markdown'

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

    // Auto-select first leaf node
    useEffect(() => {
        if (!course || selectedNodeId !== null) return
        const firstLeaf = course.nodes.find((n) => n.is_leaf)
        if (firstLeaf) setSelectedNodeId(firstLeaf.id)
    }, [course, selectedNodeId])

    // Load node content when selection changes
    useEffect(() => {
        if (!selectedNodeId || !course) return
        setNodeContent(null)
        setContentLoading(true)
        courseApi.getNodeContent(course.id, selectedNodeId)
            .then(setNodeContent)
            .catch(() => {})
            .finally(() => setContentLoading(false))
    }, [selectedNodeId, course])

    // Poll generation status if course is still generating (max 120 polls = ~10 min)
    const pollCountRef = useRef(0)
    useEffect(() => {
        if (!course || !['generating', 'draft'].includes(course.status)) {
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
            if (selectedNodeId && course) {
                courseApi.getNodeContent(course.id, selectedNodeId)
                    .then(setNodeContent)
                    .catch(() => {})
            }
        }, 5000)
        return () => clearInterval(timer)
    }, [course, selectedNodeId, refetchCourse])

    const handleSelectNode = (node: CourseNodeResponse) => {
        if (!node.is_leaf) return
        setSelectedNodeId(node.id)
    }

    const handleMarkComplete = async (nodeId: number) => {
        if (!course) return
        try {
            await courseApi.updateNodeProgress(course.id, nodeId, 'completed')
            refetchCourse()
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
            const node = course.nodes.find((n) => n.id === selectedNodeId)
            if (node?.progress_status !== 'completed') {
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
    const completedLeaf = course.nodes.filter((n) => n.is_leaf && n.progress_status === 'completed').length

    // Build outline tree
    const rootNodes = course.nodes.filter((n) => !n.parent_id)
    const childrenOf = (parentId: number) => course.nodes.filter((n) => n.parent_id === parentId)

    const renderOutlineNode = (node: CourseNodeResponse, depth = 0): React.ReactNode => {
        const children = childrenOf(node.id)
        const isSelected = node.id === selectedNodeId
        const isLeaf = node.is_leaf

        const progressIcon = isLeaf ? (
            node.progress_status === 'completed' ? (
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
            <div className={`flex flex-col border-r border-border bg-card transition-all duration-300 ${sidebarCollapsed ? 'w-12' : 'w-64'} flex-shrink-0`}>
                <div className="flex items-center justify-between border-b border-border p-3">
                    {!sidebarCollapsed && (
                        <span className="text-xs font-medium text-muted-foreground truncate">课程大纲</span>
                    )}
                    <button
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="ml-auto rounded-lg p-1 hover:bg-muted transition-colors"
                    >
                        {sidebarCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
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
                <div className="border-b border-border px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <button onClick={() => navigate('/courses')} className="hover:text-foreground transition-colors">
                            我的课程
                        </button>
                        <ChevronRight className="size-3" />
                        <span className="truncate text-foreground">{course.title}</span>
                        {selectedNode && (
                            <>
                                <ChevronRight className="size-3" />
                                <span className="truncate">{selectedNode.title}</span>
                            </>
                        )}
                    </div>
                    <div className="flex items-center justify-between">
                        <h1 className="text-xl font-medium line-clamp-1">{course.title}</h1>
                        <div className="flex items-center gap-2">
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

                <div className="px-6 py-6 max-w-4xl space-y-6">
                    {!selectedNodeId && (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <GraduationCap className="size-12 text-muted-foreground mb-3" />
                            <p className="text-muted-foreground">请在左侧选择一个节点开始学习</p>
                        </div>
                    )}

                    {selectedNode && (
                        <>
                            <div>
                                <h2 className="text-2xl font-medium">{selectedNode.title}</h2>
                                <div className="flex items-center gap-2 mt-2">
                                    {selectedNode.content_type === 'video' ? (
                                        <span className="flex items-center gap-1 text-xs text-primary">
                                            <Video className="size-3.5" /> 视频讲解
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                            <FileText className="size-3.5" /> 文字讲解
                                        </span>
                                    )}
                                </div>
                            </div>

                            {contentLoading ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin" />
                                    加载内容中...
                                </div>
                            ) : nodeContent ? (
                                <NodeContentView
                                    node={selectedNode}
                                    content={nodeContent}
                                    onMarkComplete={() => handleMarkComplete(selectedNode.id)}
                                    onRetry={() => handleRetryNode(selectedNode.id)}
                                    retrying={retrying}
                                    textExpanded={textExpanded}
                                    setTextExpanded={setTextExpanded}
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
    onMarkComplete: () => void
    onRetry: () => void
    retrying: boolean
    textExpanded: boolean
    setTextExpanded: (v: boolean) => void
}

function NodeContentView({
    node,
    content,
    onMarkComplete,
    onRetry,
    retrying,
    textExpanded,
    setTextExpanded,
}: NodeContentViewProps) {
    if (content.gen_status === 'pending' || content.gen_status === 'generating') {
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
                <div className="rounded-xl border border-border bg-card">
                    <button
                        onClick={() => setTextExpanded(!textExpanded)}
                        className="flex w-full items-center justify-between p-4 text-sm font-medium hover:bg-muted/50 transition-colors rounded-xl"
                    >
                        <span className="flex items-center gap-2">
                            <FileText className="size-4" />
                            {node.content_type === 'video' ? '文字版（快速复习）' : '文字讲解'}
                        </span>
                        {textExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                    {textExpanded && (
                        <div className="border-t border-border px-5 py-4 prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>{content.text_content}</ReactMarkdown>
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

            {node.progress_status !== 'completed' && content.gen_status === 'done' && (
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

            {node.progress_status === 'completed' && (
                <div className="flex items-center gap-2 justify-end text-sm text-green-500">
                    <CheckCircle2 className="size-4" />
                    已完成
                </div>
            )}
        </div>
    )
}
