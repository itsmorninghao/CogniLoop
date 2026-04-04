/**
 * Knowledge Base detail page — full-page view of a single KB.
 * Document KBs: centered max-w-5xl layout.
 */

import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAsync } from '@/hooks/useAsync'
import {
    ArrowLeft, Database, BookMarked, Upload, Trash2, Share2, Copy,
    Link2Off, FileText, Loader2, Globe,
    Hash, CalendarDays, FileStack, AlertCircle,
    ChevronRight, GlobeLock, RotateCcw,
} from 'lucide-react'
import { kbApi, type KnowledgeBase, type KBDocument } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'


export default function KnowledgeBaseDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { user } = useAuthStore()

    const kbId = parseInt(id ?? '0')

    const { data: kb, loading, refetch: refetchKb } = useAsync<KnowledgeBase | null>(
        async () => {
            if (!kbId) return null
            try {
                return await kbApi.get(kbId)
            } catch {
                toast.error('知识库不存在或无权限')
                navigate('/knowledge')
                return null
            }
        },
        [kbId, navigate]
    )
    const { data: documents, loading: docsLoading, refetch: refetchDocs } = useAsync<KBDocument[]>(
        () => kb ? kbApi.listDocs(kb.id) : Promise.resolve([]),
        [kb?.id]
    )
    const docsArray = documents ?? []

    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [sharingCode, setSharingCode] = useState(false)
    const [revokingCode, setRevokingCode] = useState(false)
    const [publishingPlaza, setPublishingPlaza] = useState(false)
    const [deletingKb, setDeletingKb] = useState(false)

    const isOwner = kb != null && user != null && kb.owner_id === user.id

    const handleUpload = async (files: FileList) => {
        if (!kb) return
        setUploading(true)
        let success = 0
        for (const file of Array.from(files)) {
            try {
                await kbApi.uploadDoc(kb.id, file)
                toast.success(`${file.name} 上传成功，正在解析...`)
                success++
            } catch (err: unknown) {
                toast.error(`上传 ${file.name} 失败: ${err instanceof Error ? err.message : '未知错误'}`)
            }
        }
        if (success > 0) { await refetchKb(); refetchDocs() }
        setUploading(false)
    }

    const handleDeleteDoc = async (docId: number) => {
        if (!kb) return
        try {
            await kbApi.deleteDoc(kb.id, docId)
            toast.success('文档已删除')
            refetchDocs(); refetchKb()
        } catch { toast.error('删除失败') }
    }

    const [retryingDocId, setRetryingDocId] = useState<number | null>(null)
    const handleRetryDoc = async (docId: number) => {
        if (!kb) return
        setRetryingDocId(docId)
        try {
            await kbApi.retryDoc(kb.id, docId)
            toast.success('已重新开始处理')
            refetchDocs()
        } catch { toast.error('重试失败') }
        finally { setRetryingDocId(null) }
    }

    const handleGenerateShareCode = async () => {
        if (!kb) return
        setSharingCode(true)
        try {
            const updated = await kbApi.generateShareCode(kb.id)
            refetchKb()
            if (updated.share_code) {
                await navigator.clipboard.writeText(updated.share_code)
                toast.success(`分享码已生成并复制: ${updated.share_code}`)
            }
        } catch { toast.error('生成分享码失败') }
        finally { setSharingCode(false) }
    }

    const handleRevokeShareCode = async () => {
        if (!kb || !confirm('确定吊销分享码？已分享的链接将失效。')) return
        setRevokingCode(true)
        try {
            await kbApi.revokeShareCode(kb.id)
            refetchKb()
            toast.success('分享码已吊销')
        } catch { toast.error('吊销失败') }
        finally { setRevokingCode(false) }
    }

    const handlePublishToPlaza = async () => {
        if (!kb) return
        setPublishingPlaza(true)
        try {
            await kbApi.publishToPlaza(kb.id)
            refetchKb()
            toast.success('已发布到知识广场')
        } catch { toast.error('发布失败') }
        finally { setPublishingPlaza(false) }
    }

    const handleUnpublishFromPlaza = async () => {
        if (!kb || !confirm('确定从广场撤下此知识库？')) return
        setPublishingPlaza(true)
        try {
            await kbApi.unpublishFromPlaza(kb.id)
            refetchKb()
            toast.success('已从广场撤下')
        } catch { toast.error('撤下失败') }
        finally { setPublishingPlaza(false) }
    }

    const handleDeleteKb = async () => {
        if (!kb || !confirm('确定删除此知识库？所有文档和数据将一并删除，此操作不可撤销。')) return
        setDeletingKb(true)
        try {
            await kbApi.delete(kb.id)
            toast.success('知识库已删除')
            navigate('/knowledge')
        } catch { toast.error('删除失败'); setDeletingKb(false) }
    }

    const fileTypeColor = (type: string) => ({ PDF: 'text-red-500 bg-red-500/10', WORD: 'text-blue-500 bg-blue-500/10', PPT: 'text-orange-500 bg-orange-500/10', MARKDOWN: 'text-purple-500 bg-purple-500/10', TXT: 'text-gray-500 bg-gray-500/10' })[type] ?? 'text-gray-500 bg-gray-500/10'

    const statusBadge = (status: string) => {
        if (status === 'ready') return <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">就绪</span>
        if (status === 'processing') return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600"><Loader2 className="size-3 animate-spin" />处理中</span>
        if (status === 'error') return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600"><AlertCircle className="size-3" />失败</span>
        return <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{status}</span>
    }

    if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>
    if (!kb) return null

    return (
        <div className="min-h-full bg-background animate-fade-in">
            {/* Breadcrumb */}
            <div className="border-b border-border bg-card/50 px-6 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <button onClick={() => navigate('/knowledge')} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                        <ArrowLeft className="size-3.5" />知识库
                    </button>
                    <ChevronRight className="size-3.5" />
                    <span className="text-foreground font-medium truncate max-w-xs">{kb.name}</span>
                </div>
            </div>

            <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
                {/* KB Header Card */}
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex items-start gap-5">
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-purple-500/15">
                            {isOwner
                                ? <Database className="size-7 text-indigo-600" />
                                : <BookMarked className="size-7 text-cyan-600" />
                            }
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-xl font-medium text-foreground">{kb.name}</h1>
                                {!isOwner && <span className="rounded-md bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-600 border border-cyan-500/20">已获取</span>}
                            </div>
                            {kb.description && <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{kb.description}</p>}
                            <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1.5"><FileStack className="size-3.5" />{kb.document_count} 个文档</span>
                                <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />{new Date(kb.created_at).toLocaleDateString('zh-CN')}</span>
                            </div>
                        </div>
                        {isOwner && (
                            <button onClick={handleDeleteKb} disabled={deletingKb} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:opacity-50 shrink-0">
                                {deletingKb ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}删除
                            </button>
                        )}
                    </div>

                    {/* Share code — owner only */}
                    {isOwner && (
                        <div className="mt-5 border-t border-border pt-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-foreground">分享码</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">生成分享码后，他人可通过此码获取此知识库</p>
                                </div>
                                {kb.share_code ? (
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
                                            <Hash className="size-3.5 text-muted-foreground" />
                                            <span className="font-mono text-sm font-medium text-foreground tracking-widest">{kb.share_code}</span>
                                        </div>
                                        <button onClick={async () => { await navigator.clipboard.writeText(kb.share_code!); toast.success('分享码已复制') }} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent">
                                            <Copy className="size-3.5" />复制
                                        </button>
                                        <button onClick={() => kb.shared_to_plaza_at ? toast.error('请先从广场撤下再吊销分享码') : handleRevokeShareCode()} disabled={revokingCode} title={kb.shared_to_plaza_at ? '请先从广场撤下' : undefined} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:opacity-50">
                                            {revokingCode ? <Loader2 className="size-3.5 animate-spin" /> : <Link2Off className="size-3.5" />}吊销
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={handleGenerateShareCode} disabled={sharingCode} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50">
                                        {sharingCode ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}生成分享码
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Plaza publish — owner only */}
                    {isOwner && (
                        <div className="mt-5 border-t border-border pt-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-foreground">发布到广场</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {kb.shared_to_plaza_at
                                            ? `已于 ${new Date(kb.shared_to_plaza_at).toLocaleDateString('zh-CN')} 发布，任何人均可在广场浏览并获取`
                                            : '发布后将出现在知识广场，供所有用户浏览获取'}
                                    </p>
                                </div>
                                {kb.shared_to_plaza_at ? (
                                    <button
                                        onClick={handleUnpublishFromPlaza}
                                        disabled={publishingPlaza}
                                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:opacity-50"
                                    >
                                        {publishingPlaza ? <Loader2 className="size-3.5 animate-spin" /> : <GlobeLock className="size-3.5" />}从广场撤下
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => !kb.share_code ? toast.error('请先生成分享码再发布到广场') : handlePublishToPlaza()}
                                        disabled={publishingPlaza}
                                        title={!kb.share_code ? '请先生成分享码' : undefined}
                                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                        {publishingPlaza ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}发布到广场
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Upload zone — owner only */}
                {isOwner && (
                    <div className="rounded-xl border border-border bg-card p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-medium text-foreground">上传文档</h2>
                        </div>
                        <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.doc,.pptx,.ppt,.md,.txt" className="hidden" onChange={e => e.target.files && handleUpload(e.target.files)} />
                        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="group flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border py-7 text-muted-foreground transition-all hover:border-primary/40 hover:text-primary disabled:opacity-50">
                            {uploading ? (
                                <><Loader2 className="size-5 animate-spin" /><span className="text-sm">上传中...</span></>
                            ) : (
                                <>
                                    <div className="flex size-10 items-center justify-center rounded-xl bg-muted group-hover:bg-primary/10 transition-colors">
                                        <Upload className="size-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-medium">点击或拖拽文件到此处上传</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">支持 PDF、Word、PPT、Markdown、TXT</p>
                                    </div>
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Content list */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    {docsArray.length > 0 && (
                        <div className="grid grid-cols-[auto_1fr_100px_80px_120px_auto] items-center gap-4 border-b border-border bg-muted/20 px-6 py-2 text-xs font-medium text-muted-foreground">
                            <span className="w-8" /><span>文件名</span><span>状态</span><span>分块</span><span>上传时间</span><span />
                        </div>
                    )}

                    {docsLoading ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 animate-spin text-primary" /></div>
                    ) : docsArray.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted"><FileText className="size-7 text-muted-foreground" /></div>
                            <p className="text-sm font-medium text-foreground">暂无文档</p>
                            <p className="mt-1 text-xs text-muted-foreground">{isOwner ? '点击上方上传文档开始使用' : '知识库暂无文档'}</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {docsArray.map(doc => (
                                <div key={doc.id} className="grid grid-cols-[auto_1fr_100px_80px_120px_auto] items-center gap-4 px-6 py-3.5 hover:bg-muted/20 transition-colors">
                                    <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${fileTypeColor(doc.file_type)}`}><FileText className="size-4" /></div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">{doc.original_filename}</p>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">{doc.file_type}</p>
                                    </div>
                                    <div>{statusBadge(doc.status)}</div>
                                    <div className="text-sm text-muted-foreground">{doc.chunk_count > 0 ? `${doc.chunk_count} 块` : '—'}</div>
                                    <div className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleDateString('zh-CN')}</div>
                                    {isOwner ? (
                                        <div className="flex items-center gap-1">
                                            {doc.status === 'error' && (
                                                <button
                                                    onClick={() => handleRetryDoc(doc.id)}
                                                    disabled={retryingDocId === doc.id}
                                                    title="重试处理"
                                                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                                                >
                                                    {retryingDocId === doc.id
                                                        ? <Loader2 className="size-3.5 animate-spin" />
                                                        : <RotateCcw className="size-3.5" />}
                                                </button>
                                            )}
                                            <button onClick={() => handleDeleteDoc(doc.id)} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </div>
                                    ) : <span />}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
