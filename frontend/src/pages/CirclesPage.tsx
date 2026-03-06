/**
 * Study Circles — list + create/join modals. Detail via /circles/:id.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
    Users, Plus, Search, UserPlus, ChevronRight, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { circleApi, type Circle } from '@/lib/api'

export default function CirclesPage() {
    const [circles, setCircles] = useState<Circle[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [showJoin, setShowJoin] = useState(false)

    useEffect(() => { loadCircles() }, [])

    const loadCircles = async () => {
        try {
            setLoading(true)
            const data = await circleApi.list()
            setCircles(data)
        } catch { /* empty */ } finally { setLoading(false) }
    }

    return (
        <div className="container mx-auto space-y-6 p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-foreground">学习圈</h1>
                    <p className="mt-1 text-sm text-muted-foreground">和志同道合的伙伴一起学习、出题、互相挑战</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowJoin(true)} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent">
                        <UserPlus className="size-4" /> 加入学习圈
                    </button>
                    <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:-translate-y-0.5">
                        <Plus className="size-4" /> 创建学习圈
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
            ) : circles.length === 0 ? (
                <EmptyState onCreateClick={() => setShowCreate(true)} onJoinClick={() => setShowJoin(true)} />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {circles.map((c) => (
                        <Link
                            key={c.id}
                            to={`/circles/${c.id}`}
                            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition hover:shadow-md hover:border-primary/30"
                        >
                            <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-lg font-bold text-white shadow-md shrink-0">
                                {c.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-foreground truncate">{c.name}</h4>
                                <p className="text-sm text-muted-foreground truncate">{c.description || '暂无描述'}</p>
                                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                    <Users className="size-3" />
                                    {c.member_count}/{c.max_members}
                                </div>
                            </div>
                            <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                        </Link>
                    ))}
                </div>
            )}

            {showCreate && <CreateCircleModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadCircles() }} />}
            {showJoin && <JoinCircleModal onClose={() => setShowJoin(false)} onJoined={() => { setShowJoin(false); loadCircles() }} />}
        </div>
    )
}

/* ── Empty State ──────────────────────────────────────────── */
function EmptyState({ onCreateClick, onJoinClick }: { onCreateClick: () => void; onJoinClick: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-20 transition-colors hover:border-primary/30">
            <div className="mb-6 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30">
                <Users className="size-10 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-lg font-medium text-foreground">还没有加入学习圈</h3>
            <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
                创建学习圈或使用邀请码加入，和伙伴一起出题互测，共同进步
            </p>
            <div className="mt-6 flex gap-3">
                <button onClick={onCreateClick} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:-translate-y-0.5">
                    <Plus className="size-4" /> 创建学习圈
                </button>
                <button onClick={onJoinClick} className="flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent">
                    <Search className="size-4" /> 输入邀请码加入
                </button>
            </div>
        </div>
    )
}

/* ── Create Modal ─────────────────────────────────────────── */
function CreateCircleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [maxMembers, setMaxMembers] = useState(30)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async () => {
        if (!name.trim()) return toast.error('请输入名称')
        try {
            setLoading(true)
            await circleApi.create({ name, description: description || undefined, max_members: maxMembers })
            toast.success('学习圈已创建')
            onCreated()
        } catch { toast.error('创建失败') } finally { setLoading(false) }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">创建学习圈</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">名称 *</label>
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：高等数学学习组" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">简介</label>
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述学习圈的目标和内容..." rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">最大人数</label>
                        <input type="number" value={maxMembers} onChange={(e) => setMaxMembers(Number(e.target.value))} min={2} max={200} className="w-32 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                    <button onClick={handleSubmit} disabled={loading} className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white hover:opacity-90 transition disabled:opacity-50">
                        {loading ? '创建中...' : '创建'}
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ── Join Modal ───────────────────────────────────────────── */
function JoinCircleModal({ onClose, onJoined }: { onClose: () => void; onJoined: () => void }) {
    const [code, setCode] = useState('')
    const [loading, setLoading] = useState(false)

    const handleJoin = async () => {
        if (!code.trim()) return toast.error('请输入邀请码')
        try {
            setLoading(true)
            await circleApi.join(code.trim())
            toast.success('已加入学习圈')
            onJoined()
        } catch { toast.error('加入失败，请检查邀请码') } finally { setLoading(false) }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">加入学习圈</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">邀请码</label>
                        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="粘贴邀请码..." className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                    <button onClick={handleJoin} disabled={loading} className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white hover:opacity-90 transition disabled:opacity-50">
                        {loading ? '加入中...' : '加入'}
                    </button>
                </div>
            </div>
        </div>
    )
}
