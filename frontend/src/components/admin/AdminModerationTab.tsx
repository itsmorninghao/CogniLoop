/**
 * AdminModerationTab — KB and Circle content moderation.
 */

import { useEffect, useState } from 'react'
import { Search, BookOpen, Users, Trash2, Globe, GlobeLock, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { adminApi, type AdminKBItem, type AdminCircleItem } from '@/lib/api'

type SubTab = 'kb' | 'circles'

export function AdminModerationTab() {
    const [subTab, setSubTab] = useState<SubTab>('kb')

    const tabClass = (active: boolean) =>
        `flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors border-b-2 ${
            active
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
        }`

    return (
        <div className="animate-fade-in">
            {/* Page header */}
            <div className="px-6 py-5 border-b border-border flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-red-600 shadow-lg shadow-rose-500/25">
                    <ShieldAlert className="size-5 text-white" />
                </div>
                <div>
                    <h2 className="text-base font-semibold text-foreground">内容审核</h2>
                    <p className="text-xs text-muted-foreground">管理广场内容，维护平台安全</p>
                </div>
            </div>

            {/* Sub-tab bar */}
            <div className="px-6 py-3 border-b border-border flex items-center gap-1">
                <button onClick={() => setSubTab('kb')} className={tabClass(subTab === 'kb')}>
                    <BookOpen className="size-4" /> 知识库审核
                </button>
                <button onClick={() => setSubTab('circles')} className={tabClass(subTab === 'circles')}>
                    <Users className="size-4" /> 圈子管理
                </button>
            </div>

            {/* Panel content */}
            <div className="p-6">
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    {subTab === 'kb' && <KBModerationPanel />}
                    {subTab === 'circles' && <CircleModerationPanel />}
                </div>
            </div>
        </div>
    )
}

function KBModerationPanel() {
    const [items, setItems] = useState<AdminKBItem[]>([])
    const [search, setSearch] = useState('')
    const [plazaOnly, setPlazaOnly] = useState(false)
    const [loading, setLoading] = useState(true)

    const load = async () => {
        try {
            setLoading(true)
            const data = await adminApi.listKBs(search || undefined, plazaOnly)
            setItems(data)
        } catch {
            toast.error('加载失败')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [search, plazaOnly])

    const handleUnpublish = async (id: number, name: string) => {
        if (!confirm(`确定要将「${name}」从广场下架吗？`)) return
        try {
            await adminApi.unpublishKB(id)
            toast.success('已从广场下架')
            setItems(prev => prev.map(kb => kb.id === id ? { ...kb, share_code: null, shared_to_plaza_at: null } : kb))
        } catch {
            toast.error('操作失败')
        }
    }

    return (
        <>
            {/* Filters */}
            <div className="px-5 py-3.5 border-b border-border flex gap-4 items-center">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="搜索知识库名称..."
                        className="w-full bg-transparent border-0 border-b border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
                    />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={plazaOnly} onChange={e => setPlazaOnly(e.target.checked)} className="rounded" />
                    仅显示已发布广场
                </label>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                {loading ? (
                    <div className="flex h-32 items-center justify-center">
                        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                ) : items.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">暂无数据</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-muted/30 border-b border-border">
                            <tr>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">知识库</th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">归属</th>
                                <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">类型</th>
                                <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">广场状态</th>
                                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {items.map(kb => (
                                <tr key={kb.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-5 py-3">
                                        <p className="font-medium text-foreground">{kb.name}</p>
                                        {kb.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{kb.description}</p>}
                                    </td>
                                    <td className="px-5 py-3 text-muted-foreground text-sm">@{kb.owner_username}</td>
                                    <td className="px-5 py-3 text-center">
                                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs">{kb.kb_type === 'question_bank' ? '题库' : '文档'}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        {kb.shared_to_plaza_at ? (
                                            <span className="flex items-center justify-center gap-1 text-emerald-600 text-xs">
                                                <Globe className="size-3.5" /> 已发布
                                            </span>
                                        ) : (
                                            <span className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
                                                <GlobeLock className="size-3.5" /> 未发布
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        {kb.shared_to_plaza_at && (
                                            <button
                                                onClick={() => handleUnpublish(kb.id, kb.name)}
                                                className="flex items-center gap-1 ml-auto rounded-lg border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition"
                                            >
                                                <Trash2 className="size-3.5" /> 下架
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </>
    )
}

function CircleModerationPanel() {
    const [items, setItems] = useState<AdminCircleItem[]>([])
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(true)

    const load = async () => {
        try {
            setLoading(true)
            const data = await adminApi.listCircles(search || undefined)
            setItems(data)
        } catch {
            toast.error('加载失败')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [search])

    const handleDissolve = async (id: number, name: string) => {
        if (!confirm(`确定要强制解散「${name}」吗？此操作不可撤销。`)) return
        try {
            await adminApi.deleteCircle(id)
            toast.success('圈子已解散')
            setItems(prev => prev.map(c => c.id === id ? { ...c, is_active: false } : c))
        } catch {
            toast.error('操作失败')
        }
    }

    return (
        <>
            {/* Search */}
            <div className="px-5 py-3.5 border-b border-border">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="搜索圈子名称..."
                        className="w-full bg-transparent border-0 border-b border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                {loading ? (
                    <div className="flex h-32 items-center justify-center">
                        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                ) : items.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">暂无数据</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-muted/30 border-b border-border">
                            <tr>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">圈子</th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">创建者</th>
                                <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">成员</th>
                                <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">状态</th>
                                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {items.map(circle => (
                                <tr key={circle.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-5 py-3">
                                        <p className="font-medium text-foreground">{circle.name}</p>
                                        {circle.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{circle.description}</p>}
                                    </td>
                                    <td className="px-5 py-3 text-muted-foreground text-sm">@{circle.creator_username}</td>
                                    <td className="px-5 py-3 text-center text-foreground">{circle.member_count}/{circle.max_members}</td>
                                    <td className="px-5 py-3 text-center">
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${circle.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                            {circle.is_active ? '活跃' : '已解散'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        {circle.is_active && (
                                            <button
                                                onClick={() => handleDissolve(circle.id, circle.name)}
                                                className="flex items-center gap-1 ml-auto rounded-lg border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition"
                                            >
                                                <Trash2 className="size-3.5" /> 解散
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </>
    )
}
