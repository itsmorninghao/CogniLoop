import { useEffect, useState } from 'react'
import { adminApi, type AdminUser } from '@/lib/api'
import { toast } from 'sonner'
import { Search, Shield, Crown, CheckCircle2, XCircle, Users } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'

export function AdminUsersTab() {
    const { user: currentUser } = useAuthStore()
    const [users, setUsers] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    const loadUsers = async (q?: string) => {
        try {
            setLoading(true)
            const data = await adminApi.listUsers(q)
            setUsers(data)
        } catch {
            toast.error('加载用户失败')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadUsers() }, [])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        loadUsers(search)
    }

    const toggleActive = async (user: AdminUser) => {
        if (!window.confirm(`确定要${user.is_active ? '封禁' : '解封'}用户 ${user.username} 吗？`)) return
        try {
            await adminApi.updateUser(user.id, { is_active: !user.is_active })
            toast.success('状态已更新')
            loadUsers(search)
        } catch {
            toast.error('更新失败')
        }
    }

    const toggleAdmin = async (user: AdminUser) => {
        if (!currentUser?.is_superadmin) {
            toast.error('只有超级管理员可以修改管理员权限')
            return
        }
        if (user.is_superadmin) {
            toast.error('无法直接修改超级管理员的权限')
            return
        }
        if (!window.confirm(`确定要${user.is_admin ? '撤销' : '授予'} ${user.username} 的管理员权限吗？`)) return
        try {
            await adminApi.updateUser(user.id, { is_admin: !user.is_admin })
            toast.success('权限已更新')
            loadUsers(search)
        } catch {
            toast.error('更新权限失败')
        }
    }

    const toggleSuperAdmin = async (user: AdminUser) => {
        if (!currentUser?.is_superadmin) {
            toast.error('只有超级管理员可以执行此操作')
            return
        }
        if (!window.confirm(`超级管理员拥有最高权限，确定要${user.is_superadmin ? '撤销' : '授予'} ${user.username} 超级管理员权限吗？`)) return
        try {
            await adminApi.updateUser(user.id, { is_superadmin: !user.is_superadmin })
            toast.success('超级管理员权限已更新')
            loadUsers(search)
        } catch {
            toast.error('更新超级管理员失败')
        }
    }

    return (
        <div className="animate-fade-in p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                        <Users className="size-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">用户管理</h2>
                        <p className="text-xs text-muted-foreground">管理账号状态与权限分配</p>
                    </div>
                </div>
                <form onSubmit={handleSearch} className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="搜索用户名或邮箱..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-64 rounded-lg border border-border bg-transparent py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/60"
                    />
                </form>
            </div>

            {/* Table Card */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-muted/30 text-muted-foreground border-b border-border">
                            <tr>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">用户</th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">状态</th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">角色</th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">注册时间</th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading && users.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                            <span className="text-xs">加载中...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">未找到用户</td>
                                </tr>
                            ) : (
                                users.map(u => (
                                    <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-6 py-3.5">
                                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                                                {u.username}
                                                {u.is_superadmin && <Crown className="size-3 text-amber-500" />}
                                            </div>
                                            <div className="text-muted-foreground text-xs mt-0.5">{u.email}</div>
                                        </td>
                                        <td className="px-6 py-3.5">
                                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${u.is_active ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {u.is_active ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                                                {u.is_active ? '正常' : '封禁'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3.5">
                                            {u.is_superadmin ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                                    <Crown className="size-3" /> 超管
                                                </span>
                                            ) : u.is_admin ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                                                    <Shield className="size-3" /> 管理员
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">普通用户</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3.5 text-muted-foreground text-xs">
                                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="px-6 py-3.5 text-right space-x-2">
                                            {currentUser?.id !== u.id && (
                                                <>
                                                    <button
                                                        onClick={() => toggleActive(u)}
                                                        className={`text-xs font-medium px-2 py-1 rounded transition-colors ${u.is_active ? 'text-rose-600 hover:bg-rose-500/10' : 'text-emerald-600 hover:bg-emerald-500/10'}`}
                                                    >
                                                        {u.is_active ? '封禁' : '解封'}
                                                    </button>
                                                    {currentUser?.is_superadmin && !u.is_superadmin && (
                                                        <button
                                                            onClick={() => toggleAdmin(u)}
                                                            className="text-xs font-medium px-2 py-1 rounded text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-400 transition-colors"
                                                        >
                                                            {u.is_admin ? '撤销管理' : '设为管理'}
                                                        </button>
                                                    )}
                                                    {currentUser?.is_superadmin && (
                                                        <button
                                                            onClick={() => toggleSuperAdmin(u)}
                                                            className="text-xs font-medium px-2 py-1 rounded text-amber-600 hover:bg-amber-500/10 dark:text-amber-400 transition-colors"
                                                            title="超级管理员"
                                                        >
                                                            <Crown className="size-3.5" />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                            {currentUser?.id === u.id && (
                                                <span className="text-xs text-muted-foreground font-medium">当前账号</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
