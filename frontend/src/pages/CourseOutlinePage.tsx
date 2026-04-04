/**
 * Course Outline Review Page — shows LLM-generated outline, allows editing, then confirms to start Phase 2.
 * Supports streaming mode: nodes appear progressively as LLM generates them.
 */

import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import {
    ArrowLeft, ChevronDown, ChevronRight, Edit2, Check, X,
    Video, FileText, Loader2, Sparkles, GraduationCap,
    LayoutList,
} from 'lucide-react'
import { courseGenApi, streamOutline, type OutlineNodeDraft, type OutlineDraftResponse } from '@/lib/api'

const CONTENT_TYPE_ICONS = {
    video: <Video className="size-3.5 text-primary" />,
    text: <FileText className="size-3.5 text-green-500" />,
}

const CONTENT_TYPE_LABELS = {
    video: '视频讲解',
    text: '文字讲解',
}

export default function CourseOutlinePage() {
    const { draftId } = useParams<{ draftId: string }>()
    const location = useLocation()
    const navigate = useNavigate()

    const locationState = location.state as {
        draft?: OutlineDraftResponse
        streamParams?: { kb_ids: number[]; level: string; voice_id?: string }
    } | null

    const isStreamingMode = draftId === 'streaming' && !!locationState?.streamParams

    const [draft, setDraft] = useState<OutlineDraftResponse | null>(locationState?.draft ?? null)
    const [streamingNodes, setStreamingNodes] = useState<OutlineNodeDraft[]>([])
    const [streamingTitle, setStreamingTitle] = useState('')
    const [streamPhase, setStreamPhase] = useState<string>('')
    const [streamDone, setStreamDone] = useState(false)
    const streamStarted = useRef(false)

    // Start streaming on mount if in streaming mode
    useEffect(() => {
        if (!isStreamingMode || streamStarted.current) return
        streamStarted.current = true
        const params = locationState!.streamParams!

        setStreamPhase('正在分析知识库...')

        streamOutline(params, {
            onPhase: (step) => {
                if (step === 'kb_summary') setStreamPhase('正在分析知识库...')
                else if (step === 'llm_generating') setStreamPhase('AI 正在生成大纲...')
            },
            onTitle: (title) => {
                setStreamingTitle(title)
            },
            onNode: (node) => {
                setStreamingNodes(prev => [...prev, node])
            },
            onDone: (data) => {
                setDraft(data)
                setStreamDone(true)
                setStreamPhase('')
                // Replace URL so refresh works with the real draftId
                window.history.replaceState(
                    { draft: data },
                    '',
                    `/courses/outline/${data.draft_id}`,
                )
            },
            onError: (msg) => {
                toast.error(msg || '大纲生成失败')
                setStreamPhase('')
                setStreamDone(true)
            },
        })
    }, [isStreamingMode, locationState])

    const [courseTitle, setCourseTitle] = useState(draft?.course_title ?? '')
    const [editingTitle, setEditingTitle] = useState(false)
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
    const [editingText, setEditingText] = useState('')
    const [confirming, setConfirming] = useState(false)

    // Sync courseTitle when draft or streamingTitle changes
    useEffect(() => {
        if (draft?.course_title) setCourseTitle(draft.course_title)
        else if (streamingTitle) setCourseTitle(streamingTitle)
    }, [draft?.course_title, streamingTitle])

    // Use streamed nodes while streaming, final draft nodes when done
    const displayNodes = draft?.nodes ?? streamingNodes
    const isStreaming = isStreamingMode && !streamDone

    // Show empty state only if not streaming and no draft
    if (!isStreaming && !draft) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4">
                <GraduationCap className="size-12 text-muted-foreground" />
                <p className="text-muted-foreground">大纲草稿不存在或已过期</p>
                <button
                    onClick={() => navigate('/courses/create')}
                    className="rounded-xl bg-primary px-4 py-2 text-sm text-white"
                >
                    重新创建
                </button>
            </div>
        )
    }

    const nodes = displayNodes
    const rootNodes = nodes.filter((n) => !n.parent_temp_id)
    const childrenOf = (tempId: string) => nodes.filter((n) => n.parent_temp_id === tempId)

    const toggleContentType = (tempId: string) => {
        if (isStreaming) return
        setDraft((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                nodes: prev.nodes.map((n) =>
                    n.temp_id === tempId
                        ? { ...n, content_type: n.content_type === 'video' ? 'text' : 'video' }
                        : n
                ),
            }
        })
    }

    const saveNodeTitle = (tempId: string) => {
        if (!editingText.trim()) { setEditingNodeId(null); return }
        setDraft((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                nodes: prev.nodes.map((n) =>
                    n.temp_id === tempId ? { ...n, title: editingText.trim() } : n
                ),
            }
        })
        setEditingNodeId(null)
    }

    const handleConfirm = async () => {
        if (!draft || !draft.draft_id) return
        if (!courseTitle.trim()) {
            toast.error('请输入课程标题')
            return
        }
        setConfirming(true)
        try {
            const result = await courseGenApi.confirmOutline(draft.draft_id, {
                course_title: courseTitle,
                nodes: draft.nodes,
            })
            toast.success('课程创建成功，AI 正在后台生成内容...')
            navigate(`/courses/${result.course_id}`)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '确认失败，请重试')
        } finally {
            setConfirming(false)
        }
    }

    const leafCount = nodes.filter((n) => n.is_leaf).length
    const videoCount = nodes.filter((n) => n.is_leaf && n.content_type === 'video').length
    const textCount = nodes.filter((n) => n.is_leaf && n.content_type === 'text').length

    const renderNode = (node: OutlineNodeDraft, depth = 0) => {
        const children = childrenOf(node.temp_id)
        const isEditing = editingNodeId === node.temp_id

        return (
            <div key={node.temp_id} className="animate-fade-in">
                <div
                    className={`group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors ${
                        depth === 0 ? 'font-medium' : ''
                    }`}
                    style={{ paddingLeft: `${12 + depth * 24}px` }}
                >
                    {!node.is_leaf ? (
                        children.length > 0 ? (
                            <ChevronDown className="size-4 text-muted-foreground flex-shrink-0" />
                        ) : (
                            <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
                        )
                    ) : (
                        <LayoutList className="size-4 text-muted-foreground flex-shrink-0" />
                    )}

                    {isEditing ? (
                        <div className="flex flex-1 items-center gap-2">
                            <input
                                autoFocus
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveNodeTitle(node.temp_id)
                                    if (e.key === 'Escape') setEditingNodeId(null)
                                }}
                                className="flex-1 rounded-lg border border-primary bg-background px-2 py-0.5 text-sm focus:outline-none"
                            />
                            <button onClick={() => saveNodeTitle(node.temp_id)}>
                                <Check className="size-4 text-primary" />
                            </button>
                            <button onClick={() => setEditingNodeId(null)}>
                                <X className="size-4 text-muted-foreground" />
                            </button>
                        </div>
                    ) : (
                        <span className="flex-1 text-sm">{node.title}</span>
                    )}

                    {node.is_leaf && !isEditing && !isStreaming && (
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => toggleContentType(node.temp_id)}
                                className="flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-xs hover:border-primary/50 transition-colors"
                                title="点击切换类型"
                            >
                                {CONTENT_TYPE_ICONS[node.content_type as keyof typeof CONTENT_TYPE_ICONS]}
                                {CONTENT_TYPE_LABELS[node.content_type as keyof typeof CONTENT_TYPE_LABELS]}
                            </button>
                        </div>
                    )}

                    {!isEditing && !isStreaming && (
                        <button
                            onClick={() => { setEditingNodeId(node.temp_id); setEditingText(node.title) }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <Edit2 className="size-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                    )}
                </div>

                {children.length > 0 && (
                    <div>{children.map((child) => renderNode(child, depth + 1))}</div>
                )}
            </div>
        )
    }

    return (
        <div className="container mx-auto space-y-6 p-6">
            <button
                onClick={() => navigate('/courses/create')}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ArrowLeft className="size-4" />
                返回创建
            </button>

            <div className="flex items-start gap-3">
                <div className="relative mt-0.5">
                    <Sparkles className="size-6 text-primary animate-pulse" />
                    <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                </div>
                <div className="flex-1">
                    {isStreaming ? (
                        <div className="flex items-center gap-2 mb-1">
                            <Loader2 className="size-4 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">{streamPhase}</p>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground mb-1">AI 已生成课程大纲，请审阅后确认</p>
                    )}
                    {courseTitle ? (
                        editingTitle ? (
                            <div className="flex items-center gap-2">
                                <input
                                    autoFocus
                                    value={courseTitle}
                                    onChange={(e) => setCourseTitle(e.target.value)}
                                    onBlur={() => setEditingTitle(false)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(false) }}
                                    className="flex-1 rounded-lg border border-primary bg-background px-2 py-1 text-xl font-medium focus:outline-none"
                                />
                            </div>
                        ) : (
                            <button
                                onClick={() => !isStreaming && setEditingTitle(true)}
                                className="group flex items-center gap-2"
                                disabled={isStreaming}
                            >
                                <h1 className="text-2xl font-medium">{courseTitle}</h1>
                                {!isStreaming && <Edit2 className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
                            </button>
                        )
                    ) : isStreaming ? (
                        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
                    ) : null}
                </div>
            </div>

            {nodes.length > 0 && (
                <div className="flex flex-wrap gap-3">
                    <span className="rounded-full bg-muted px-3 py-1 text-sm">
                        {isStreaming && <Loader2 className="inline size-3 animate-spin mr-1" />}
                        {leafCount} 个内容节
                    </span>
                    {videoCount > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-sm">
                            <Video className="size-3.5" />
                            {videoCount} 个视频节
                        </span>
                    )}
                    {textCount > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 px-3 py-1 text-sm">
                            <FileText className="size-3.5" />
                            {textCount} 个文字节
                        </span>
                    )}
                </div>
            )}

            {!isStreaming && (
                <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1">
                    <p>• 点击节点标题右侧的 <Edit2 className="inline size-3" /> 图标可修改标题</p>
                    <p>• 点击 <span className="inline-flex items-center gap-0.5 rounded border border-border px-1.5 text-xs"><Video className="size-3" />视频讲解</span> 标签可在视频/文字之间切换</p>
                    <p>• 确认后 AI 将在后台异步生成所有内容，期间可以继续做其他事</p>
                </div>
            )}

            <div className="rounded-xl border border-border bg-card p-4">
                {nodes.length === 0 && isStreaming ? (
                    <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
                        <Loader2 className="size-5 animate-spin text-primary" />
                        <span className="text-sm">等待 AI 生成大纲节点...</span>
                    </div>
                ) : (
                    rootNodes.map((node) => renderNode(node))
                )}
            </div>

            <div className="flex items-center justify-end gap-4 pt-2">
                <button
                    onClick={() => navigate('/courses/create')}
                    className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
                >
                    重新生成
                </button>
                <button
                    onClick={handleConfirm}
                    disabled={confirming || isStreaming || !draft}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-2.5 text-sm font-medium text-white hover:scale-105 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                    {confirming ? (
                        <>
                            <Loader2 className="size-4 animate-spin" />
                            创建中...
                        </>
                    ) : isStreaming ? (
                        <>
                            <Loader2 className="size-4 animate-spin" />
                            生成中...
                        </>
                    ) : (
                        <>
                            <Sparkles className="size-4" />
                            确认，开始生成课程
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}
