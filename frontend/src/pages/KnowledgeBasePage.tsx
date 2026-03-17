/**
 * Knowledge Base list page — shows owned and acquired KBs, navigates to detail page on click.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
    Grid3X3, List, Database, Plus, BookMarked, KeyRound,
    Loader2, ChevronRight, Share2, FileStack, Trash2,
} from 'lucide-react'
import { kbApi } from '@/lib/api'
import { useAsync } from '@/hooks/useAsync'

export default function KnowledgeBasePage() {
    const navigate = useNavigate()
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

    const { data: kbsRaw, loading } = useAsync(() => kbApi.list(), [])
    const kbs = kbsRaw ?? []

    const [activeTab, setActiveTab] = useState<'mine' | 'acquired'>('mine')
    const { data: acquiredKbsRaw, loading: acquiredLoading, refetch: refetchAcquiredKbs } = useAsync(() => kbApi.listAcquired(), [])
    const acquiredKbs = acquiredKbsRaw ?? []

    // Create KB modal
    const [showCreate, setShowCreate] = useState(false)
    const [newName, setNewName] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [creating, setCreating] = useState(false)

    // Acquire by share code modal
    const [showAcquire, setShowAcquire] = useState(false)
    const [acquireCode, setAcquireCode] = useState('')
    const [acquiring, setAcquiring] = useState(false)

    const handleTabChange = (tab: 'mine' | 'acquired') => {
        setActiveTab(tab)
    }

    const handleCreateKb = async () => {
        if (!newName.trim()) return
        setCreating(true)
        try {
            const kb = await kbApi.create({ name: newName.trim(), description: newDesc.trim() || undefined, kb_type: 'document' })
            toast.success('知识库创建成功')
            setShowCreate(false)
            setNewName('')
            setNewDesc('')
            navigate(`/knowledge/${kb.id}`)
        } catch {
            toast.error('创建失败')
        } finally {
            setCreating(false)
        }
    }

    const handleAcquire = async () => {
        if (!acquireCode.trim()) return
        setAcquiring(true)
        try {
            const kb = await kbApi.acquire(acquireCode.trim())
            toast.success('知识库获取成功')
            setShowAcquire(false)
            setAcquireCode('')
            navigate(`/knowledge/${kb.id}`)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '获取失败，请检查分享码')
        } finally {
            setAcquiring(false)
        }
    }

    const handleUnacquire = async (kbId: number, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm('确定要移除这个已获取的知识库吗？')) return
        try {
            await kbApi.unacquire(kbId)
            refetchAcquiredKbs()
            toast.success('已移除')
        } catch {
            toast.error('移除失败')
        }
    }

    const displayList = activeTab === 'mine' ? kbs : acquiredKbs
    const isLoadingCurrent = activeTab === 'mine' ? loading : acquiredLoading

    return (
        <div className="container mx-auto space-y-6 p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-foreground">知识库</h1>
                    <p className="mt-1 text-sm text-muted-foreground">管理和分享你的学习资料</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setViewMode('grid')} className={`flex size-9 items-center justify-center rounded-lg border border-border transition-colors ${viewMode === 'grid' ? 'bg-accent text-primary' : 'text-muted-foreground hover:bg-accent'}`}>
                        <Grid3X3 className="size-4" />
                    </button>
                    <button onClick={() => setViewMode('list')} className={`flex size-9 items-center justify-center rounded-lg border border-border transition-colors ${viewMode === 'list' ? 'bg-accent text-primary' : 'text-muted-foreground hover:bg-accent'}`}>
                        <List className="size-4" />
                    </button>
                    <button onClick={() => setShowAcquire(true)} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-accent">
                        <KeyRound className="size-4" />
                        输入分享码
                    </button>
                    <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:-translate-y-0.5 hover:scale-105 active:scale-95">
                        <Plus className="size-4" />
                        创建知识库
                    </button>
                </div>
            </div>

            {/* Tab switcher */}
            <div className="mt-5 flex gap-1 rounded-xl border border-border bg-muted/30 p-1 w-fit">
                <button
                    onClick={() => handleTabChange('mine')}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${activeTab === 'mine' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <Database className="size-3.5" />
                    我的知识库
                    {kbs.length > 0 && <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{kbs.length}</span>}
                </button>
                <button
                    onClick={() => handleTabChange('acquired')}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${activeTab === 'acquired' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <BookMarked className="size-3.5" />
                    已获取
                    {acquiredKbs.length > 0 && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{acquiredKbs.length}</span>}
                </button>
            </div>

            <div className="mt-5">
                {isLoadingCurrent ? (
                    <div className="flex items-center justify-center py-24">
                        <Loader2 className="size-6 animate-spin text-primary" />
                    </div>
                ) : displayList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-24 transition-colors hover:border-primary/30">
                        <div className={`mb-6 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br ${activeTab === 'mine' ? 'from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30' : 'from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30'}`}>
                            {activeTab === 'mine'
                                ? <Database className="size-10 text-primary" />
                                : <BookMarked className="size-10 text-cyan-600" />
                            }
                        </div>
                        {activeTab === 'mine' ? (
                            <>
                                <h3 className="text-lg font-medium text-foreground">还没有知识库</h3>
                                <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">创建知识库并上传文档，系统将自动完成解析和向量化</p>
                                <button onClick={() => setShowCreate(true)} className="mt-6 flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 hover:scale-105 active:scale-95 transition-all">
                                    <Plus className="size-4" />创建知识库
                                </button>
                            </>
                        ) : (
                            <>
                                <h3 className="text-lg font-medium text-foreground">还没有获取的知识库</h3>
                                <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">输入他人分享的分享码，或在知识广场获取公开知识库</p>
                                <button onClick={() => setShowAcquire(true)} className="mt-6 flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors">
                                    <KeyRound className="size-4" />输入分享码
                                </button>
                            </>
                        )}
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {displayList.map(kb => (
                            <button
                                key={kb.id}
                                onClick={() => navigate(`/knowledge/${kb.id}`)}
                                className="group text-left rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5 relative"
                            >
                                {activeTab === 'acquired' && (
                                    <button
                                        onClick={(e) => handleUnacquire(kb.id, e)}
                                        className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-lg text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500"
                                        title="移除"
                                    >
                                        <Trash2 className="size-3.5" />
                                    </button>
                                )}
                                <div className={`mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br ${activeTab === 'acquired' ? 'from-indigo-500/10 to-purple-500/10' : 'from-indigo-500/10 to-purple-500/10'}`}>
                                    {activeTab === 'acquired'
                                        ? <BookMarked className="size-6 text-cyan-600" />
                                        : <Database className="size-6 text-primary" />
                                    }
                                </div>
                                <div className="flex items-start gap-2 mb-1">
                                    <p className="flex-1 truncate font-medium text-foreground">{kb.name}</p>
                                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                    {activeTab === 'acquired' && (
                                        <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-600 border border-cyan-500/20">已获取</span>
                                    )}
                                    {kb.share_code && activeTab === 'mine' && (
                                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 border border-emerald-500/20 flex items-center gap-0.5"><Share2 className="size-2.5" />已分享</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <FileStack className="size-3.5" />
                                    {kb.document_count} 个文档
                                </div>
                                {kb.description && (
                                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{kb.description}</p>
                                )}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        {/* Table header */}
                        <div className="grid grid-cols-[auto_1fr_120px_100px_80px] items-center gap-4 border-b border-border bg-muted/30 px-5 py-2.5 text-xs font-medium text-muted-foreground">
                            <span className="w-10" />
                            <span>名称</span>
                            <span>状态</span>
                            <span>文档数</span>
                            <span>创建时间</span>
                        </div>
                        {displayList.map(kb => (
                            <button
                                key={kb.id}
                                onClick={() => navigate(`/knowledge/${kb.id}`)}
                                className="group grid w-full grid-cols-[auto_1fr_120px_100px_80px] items-center gap-4 border-b border-border px-5 py-4 text-left last:border-0 hover:bg-muted/30 transition-colors"
                            >
                                <div className={`flex size-10 items-center justify-center rounded-lg bg-gradient-to-br ${activeTab === 'acquired' ? 'from-indigo-500/10 to-purple-500/10' : 'from-indigo-500/10 to-purple-500/10'}`}>
                                    {activeTab === 'acquired'
                                        ? <BookMarked className="size-5 text-cyan-600" />
                                        : <Database className="size-5 text-primary" />
                                    }
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="truncate text-sm font-medium text-foreground">{kb.name}</p>
                                        {activeTab === 'acquired' && <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-600 border border-cyan-500/20">已获取</span>}
                                    </div>
                                    {kb.description && <p className="truncate text-xs text-muted-foreground mt-0.5">{kb.description}</p>}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    {kb.share_code && activeTab === 'mine' ? (
                                        <span className="flex items-center gap-1 text-emerald-600"><Share2 className="size-3" />已分享</span>
                                    ) : <span>—</span>}
                                </div>
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <FileStack className="size-3.5" />
                                    {kb.document_count}
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">{new Date(kb.created_at).toLocaleDateString('zh-CN')}</span>
                                    <div className="flex items-center gap-1">
                                        {activeTab === 'acquired' && (
                                            <button
                                                onClick={(e) => handleUnacquire(kb.id, e)}
                                                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500"
                                                title="移除"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        )}
                                        <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Create KB modal */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
                    <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
                        <h3 className="text-lg font-medium text-foreground">创建知识库</h3>
                        <div className="mt-4 space-y-3">
                            <div>
                                <label className="text-sm font-medium text-foreground">名称</label>
                                <input
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleCreateKb()}
                                    placeholder="例如：数据结构与算法"
                                    className="mt-1.5 w-full rounded-lg border border-border bg-input-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-foreground">描述（可选）</label>
                                <textarea
                                    value={newDesc}
                                    onChange={e => setNewDesc(e.target.value)}
                                    placeholder="简要描述知识库内容..."
                                    rows={3}
                                    className="mt-1.5 w-full rounded-lg border border-border bg-input-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-foreground">类型</label>
                                <div className="mt-1.5 flex gap-3">
                                    <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-primary p-3 bg-primary/5">
                                        <input type="radio" name="kb_type" value="document" checked readOnly className="text-primary" />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">普通知识库</span>
                                            <span className="text-xs text-muted-foreground">PDF/Word 等文档</span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors">取消</button>
                            <button onClick={handleCreateKb} disabled={!newName.trim() || creating} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50">
                                {creating ? '创建中...' : '创建'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Acquire by share code modal */}
            {showAcquire && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
                    <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20">
                                <KeyRound className="size-5 text-cyan-600" />
                            </div>
                            <div>
                                <h3 className="text-base font-medium text-foreground">输入分享码</h3>
                                <p className="text-xs text-muted-foreground">获取他人分享的知识库</p>
                            </div>
                        </div>
                        <input
                            value={acquireCode}
                            onChange={e => setAcquireCode(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAcquire()}
                            placeholder="请输入 6-12 位分享码"
                            className="w-full rounded-lg border border-border bg-input-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30"
                            autoFocus
                        />
                        <div className="mt-5 flex justify-end gap-2">
                            <button onClick={() => { setShowAcquire(false); setAcquireCode('') }} className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors">取消</button>
                            <button onClick={handleAcquire} disabled={!acquireCode.trim() || acquiring} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50">
                                {acquiring ? <><Loader2 className="mr-1.5 inline size-4 animate-spin" />获取中...</> : '获取知识库'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
