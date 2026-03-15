/**
 * MyQuizzesPage — manage created quizzes and view acquired quizzes.
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
    FileText, BookMarked, KeyRound, Copy, Check, Loader2,
    Trash2, Share2, Globe, GlobeOff, Eye, ClipboardCheck,
} from 'lucide-react'
import { quizApi, type QuizSessionListItem } from '@/lib/api'
import { QuizStatusBadge } from '@/components/shared/QuizStatusBadge'
import { useAsync } from '@/hooks/useAsync'

export default function MyQuizzesPage() {
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState<'created' | 'acquired'>('created')

    // Created quizzes
    const { data: myQuizzesRaw, loading: myLoading, refetch: refetchMyQuizzes } = useAsync<QuizSessionListItem[]>(
        () => quizApi.listMyQuizzes(),
        []
    )
    const myQuizzes = myQuizzesRaw ?? []

    // Acquired quizzes
    const { data: acquiredQuizzesRaw, loading: acquiredLoading, refetch: refetchAcquiredQuizzes } = useAsync<QuizSessionListItem[]>(
        () => quizApi.listAcquired(),
        []
    )
    const acquiredQuizzes = acquiredQuizzesRaw ?? []

    // Per-card loading states
    const [sharingId, setSharingId] = useState<string | null>(null)
    const [publishingId, setPublishingId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)

    // Acquire by share code modal
    const [showAcquire, setShowAcquire] = useState(false)
    const [acquireCode, setAcquireCode] = useState('')
    const [acquiring, setAcquiring] = useState(false)

    // Delete confirmation modal
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    const handleGenerateShareCode = useCallback(async (id: string) => {
        setSharingId(id)
        try {
            await quizApi.generateShareCode(id)
            toast.success('分享码已生成')
            refetchMyQuizzes()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '操作失败')
        } finally {
            setSharingId(null)
        }
    }, [refetchMyQuizzes])

    const handleRevokeShareCode = useCallback(async (id: string) => {
        setSharingId(id)
        try {
            await quizApi.revokeShareCode(id)
            toast.success('分享码已撤销')
            refetchMyQuizzes()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '操作失败')
        } finally {
            setSharingId(null)
        }
    }, [refetchMyQuizzes])

    const handlePublish = useCallback(async (id: string) => {
        setPublishingId(id)
        try {
            await quizApi.publishToPlaza(id)
            toast.success('已发布到广场')
            refetchMyQuizzes()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '发布失败，请确保试卷已批改')
        } finally {
            setPublishingId(null)
        }
    }, [refetchMyQuizzes])

    const handleUnpublish = useCallback(async (id: string) => {
        setPublishingId(id)
        try {
            await quizApi.unpublishFromPlaza(id)
            toast.success('已从广场下架')
            refetchMyQuizzes()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '操作失败')
        } finally {
            setPublishingId(null)
        }
    }, [refetchMyQuizzes])

    const handleDelete = useCallback(async (id: string) => {
        setDeletingId(id)
        try {
            await quizApi.deleteSession(id)
            toast.success('试卷已删除')
            refetchMyQuizzes()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '删除失败')
        } finally {
            setDeletingId(null)
            setConfirmDeleteId(null)
        }
    }, [refetchMyQuizzes])

    const handleCopyShareCode = (id: string, code: string) => {
        navigator.clipboard.writeText(code).then(() => {
            setCopiedId(id)
            setTimeout(() => setCopiedId(null), 2000)
        })
    }

    const handleAcquireByCode = async () => {
        if (!acquireCode.trim()) return
        setAcquiring(true)
        try {
            await quizApi.acquire(acquireCode.trim())
            toast.success('试卷获取成功！')
            setShowAcquire(false)
            setAcquireCode('')
            refetchAcquiredQuizzes()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '获取失败，请检查分享码')
        } finally {
            setAcquiring(false)
        }
    }

    // Stats for created quizzes
    const gradedCount = myQuizzes.filter(q => q.status === 'graded').length
    const avgAccuracy = gradedCount > 0
        ? Math.round(myQuizzes.filter(q => q.status === 'graded' && q.accuracy != null)
            .reduce((s, q) => s + (q.accuracy ?? 0), 0) / gradedCount * 100)
        : null

    return (
        <div className="min-h-full bg-background animate-fade-in p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-foreground">我的试卷</h1>
                    <p className="mt-1 text-sm text-muted-foreground">管理你出的题目，分享和获取试卷资源</p>
                </div>
                <button
                    onClick={() => setShowAcquire(true)}
                    className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-accent"
                >
                    <KeyRound className="size-4" />
                    输入分享码获取
                </button>
            </div>

            {/* Stats row (created quizzes tab) */}
            {activeTab === 'created' && (
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-2xl font-bold text-foreground">{myQuizzes.length}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">全部试卷</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-2xl font-bold text-emerald-600">{gradedCount}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">已批改</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-2xl font-bold text-primary">
                            {avgAccuracy !== null ? `${avgAccuracy}%` : '—'}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">平均正确率</p>
                    </div>
                </div>
            )}

            {/* Tab switcher */}
            <div className="mt-5 flex gap-1 rounded-xl border border-border bg-muted/30 p-1 w-fit">
                <button
                    onClick={() => setActiveTab('created')}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${activeTab === 'created' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <FileText className="size-3.5" />
                    出的题
                    {myQuizzes.length > 0 && (
                        <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{myQuizzes.length}</span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('acquired')}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${activeTab === 'acquired' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <BookMarked className="size-3.5" />
                    已获取
                    {acquiredQuizzes.length > 0 && (
                        <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{acquiredQuizzes.length}</span>
                    )}
                </button>
            </div>

            {activeTab === 'created' && (
                <div className="mt-5">
                    {myLoading ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 className="size-6 animate-spin text-primary" />
                        </div>
                    ) : myQuizzes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-24">
                            <div className="mb-6 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30">
                                <FileText className="size-10 text-primary" />
                            </div>
                            <h3 className="text-lg font-medium text-foreground">还没有试卷</h3>
                            <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
                                前往「出题中心」创建你的第一套试卷
                            </p>
                            <button
                                onClick={() => navigate('/quiz')}
                                className="mt-6 flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25"
                            >
                                去出题
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {myQuizzes.map(q => (
                                <CreatedQuizCard
                                    key={q.id}
                                    quiz={q}
                                    sharingId={sharingId}
                                    publishingId={publishingId}
                                    deletingId={deletingId}
                                    copiedId={copiedId}
                                    confirmDeleteId={confirmDeleteId}
                                    onView={() => navigate(`/quiz/${q.id}/result`)}
                                    onGenerateShare={() => handleGenerateShareCode(q.id)}
                                    onRevokeShare={() => handleRevokeShareCode(q.id)}
                                    onCopy={() => q.share_code && handleCopyShareCode(q.id, q.share_code)}
                                    onPublish={() => handlePublish(q.id)}
                                    onUnpublish={() => handleUnpublish(q.id)}
                                    onConfirmDelete={() => setConfirmDeleteId(q.id)}
                                    onCancelDelete={() => setConfirmDeleteId(null)}
                                    onDelete={() => handleDelete(q.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'acquired' && (
                <div className="mt-5">
                    {acquiredLoading ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 className="size-6 animate-spin text-primary" />
                        </div>
                    ) : acquiredQuizzes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-24">
                            <div className="mb-6 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-100 to-blue-100 dark:from-cyan-900/30 dark:to-blue-900/30">
                                <BookMarked className="size-10 text-cyan-600" />
                            </div>
                            <h3 className="text-lg font-medium text-foreground">还没有获取的试卷</h3>
                            <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
                                输入分享码，或在广场获取他人分享的试卷
                            </p>
                            <button
                                onClick={() => setShowAcquire(true)}
                                className="mt-6 flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                            >
                                <KeyRound className="size-4" />输入分享码
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {acquiredQuizzes.map(q => (
                                <AcquiredQuizCard
                                    key={q.id}
                                    quiz={q}
                                    onView={() => navigate(`/quiz/${q.id}/result`)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Acquire by share code modal */}
            {showAcquire && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
                    <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20">
                                <KeyRound className="size-5 text-cyan-600" />
                            </div>
                            <div>
                                <h3 className="text-base font-medium text-foreground">输入分享码</h3>
                                <p className="text-xs text-muted-foreground">获取他人分享的试卷</p>
                            </div>
                        </div>
                        <input
                            value={acquireCode}
                            onChange={e => setAcquireCode(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAcquireByCode()}
                            placeholder="请输入 12 位分享码"
                            className="w-full rounded-lg border border-border bg-input-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30"
                            autoFocus
                        />
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                onClick={() => { setShowAcquire(false); setAcquireCode('') }}
                                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleAcquireByCode}
                                disabled={!acquireCode.trim() || acquiring}
                                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                                {acquiring ? <><Loader2 className="mr-1.5 inline size-4 animate-spin" />获取中...</> : '获取试卷'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}


interface CreatedQuizCardProps {
    quiz: QuizSessionListItem
    sharingId: string | null
    publishingId: string | null
    deletingId: string | null
    copiedId: string | null
    confirmDeleteId: string | null
    onView: () => void
    onGenerateShare: () => void
    onRevokeShare: () => void
    onCopy: () => void
    onPublish: () => void
    onUnpublish: () => void
    onConfirmDelete: () => void
    onCancelDelete: () => void
    onDelete: () => void
}

function CreatedQuizCard({
    quiz, sharingId, publishingId, deletingId, copiedId, confirmDeleteId,
    onView, onGenerateShare, onRevokeShare, onCopy, onPublish, onUnpublish,
    onConfirmDelete, onCancelDelete, onDelete,
}: CreatedQuizCardProps) {
    const isSharingThis = sharingId === quiz.id
    const isPublishingThis = publishingId === quiz.id
    const isDeletingThis = deletingId === quiz.id
    const isCopied = copiedId === quiz.id
    const isConfirmingDelete = confirmDeleteId === quiz.id
    const canDelete = quiz.circle_id === null && ['graded', 'error', 'ready'].includes(quiz.status)

    return (
        <div className="rounded-xl border border-border bg-card p-5 transition-all hover:shadow-md">
            {/* Top row: title + status + actions */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-foreground truncate">
                            {quiz.title || `试卷 ${quiz.id.slice(0, 8)}`}
                        </h4>
                        <QuizStatusBadge status={quiz.status} />
                        {quiz.shared_to_plaza_at && (
                            <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-600">
                                已在广场
                            </span>
                        )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{quiz.question_count} 题</span>
                        <span>·</span>
                        <span>{new Date(quiz.created_at).toLocaleDateString('zh-CN')}</span>
                        {quiz.status === 'graded' && quiz.accuracy != null && (
                            <>
                                <span>·</span>
                                <span className="text-emerald-600 font-medium">
                                    正确率 {Math.round(quiz.accuracy * 100)}%
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* View & Delete */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {quiz.status === 'graded' && (
                        <button
                            onClick={onView}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                        >
                            <Eye className="size-3.5" />查看
                        </button>
                    )}
                    {canDelete && !isConfirmingDelete && (
                        <button
                            onClick={onConfirmDelete}
                            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        >
                            <Trash2 className="size-3.5" />
                        </button>
                    )}
                    {isConfirmingDelete && (
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">确认删除？</span>
                            <button
                                onClick={onDelete}
                                disabled={isDeletingThis}
                                className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-medium text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
                            >
                                {isDeletingThis ? <Loader2 className="size-3 animate-spin" /> : '删除'}
                            </button>
                            <button
                                onClick={onCancelDelete}
                                className="rounded-lg border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent transition-colors"
                            >
                                取消
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Share section */}
            <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap items-center gap-2">
                <Share2 className="size-3.5 text-muted-foreground shrink-0" />
                {!quiz.share_code ? (
                    <button
                        onClick={onGenerateShare}
                        disabled={isSharingThis}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                    >
                        {isSharingThis ? <Loader2 className="size-3 animate-spin" /> : null}
                        生成分享码
                    </button>
                ) : (
                    <>
                        <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-foreground select-all">
                            {quiz.share_code}
                        </code>
                        <button
                            onClick={onCopy}
                            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-primary transition-colors"
                            title="复制分享码"
                        >
                            {isCopied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                        </button>
                        <button
                            onClick={onRevokeShare}
                            disabled={isSharingThis}
                            className="flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                        >
                            {isSharingThis ? <Loader2 className="size-3 animate-spin" /> : '撤销'}
                        </button>
                    </>
                )}

                {/* Plaza toggle (only when graded) */}
                {quiz.status === 'graded' && quiz.share_code && (
                    <>
                        <span className="text-muted-foreground/40">|</span>
                        {!quiz.shared_to_plaza_at ? (
                            <button
                                onClick={onPublish}
                                disabled={isPublishingThis}
                                className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-cyan-500/10 hover:text-cyan-600 hover:border-cyan-500/30 transition-colors disabled:opacity-50"
                            >
                                {isPublishingThis ? <Loader2 className="size-3 animate-spin" /> : <Globe className="size-3.5" />}
                                发布到广场
                            </button>
                        ) : (
                            <button
                                onClick={onUnpublish}
                                disabled={isPublishingThis}
                                className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-600 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors disabled:opacity-50"
                            >
                                {isPublishingThis ? <Loader2 className="size-3 animate-spin" /> : <GlobeOff className="size-3.5" />}
                                从广场下架
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}


// Acquired Quiz Card
function AcquiredQuizCard({ quiz, onView }: { quiz: QuizSessionListItem; onView: () => void }) {
    return (
        <div className="rounded-xl border border-border bg-card p-5 transition-all hover:shadow-md">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h4 className="font-medium text-foreground truncate">
                            {quiz.title || `试卷 ${quiz.id.slice(0, 8)}`}
                        </h4>
                        <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-600">
                            已获取
                        </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        {quiz.creator_full_name && <span>来自 {quiz.creator_full_name}</span>}
                        <span>·</span>
                        <span>{quiz.question_count} 题</span>
                        {quiz.acquired_at && (
                            <>
                                <span>·</span>
                                <span>获取于 {new Date(quiz.acquired_at).toLocaleDateString('zh-CN')}</span>
                            </>
                        )}
                    </div>
                </div>
                <button
                    onClick={onView}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors shrink-0"
                >
                    <ClipboardCheck className="size-3.5" />查看
                </button>
            </div>
        </div>
    )
}
