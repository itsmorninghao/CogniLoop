/**
 * AppLayout — sidebar navigation + top bar.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import {
    LayoutDashboard,
    BookOpen,
    PlusCircle,
    Users,
    Globe,
    Target,
    Settings,
    Bell,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Moon,
    Sun,
    Sword,
    FileText,
    ClipboardList,
    GraduationCap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { notificationApi } from '@/lib/api'
import Logo from '@/components/Logo'
import { GlobalSearchBar } from '@/components/shared/GlobalSearchBar'

const NAV_ITEMS = [
    { path: '/', icon: LayoutDashboard, label: '仪表盘' },
    { path: '/knowledge', icon: BookOpen, label: '我的知识库' },
    { path: '/courses', icon: GraduationCap, label: '我的课程' },
    { path: '/exam-templates', icon: ClipboardList, label: '试卷模板' },
    { path: '/quiz', icon: PlusCircle, label: '出题中心' },
    { path: '/my-quizzes', icon: FileText, label: '我的试卷' },
    { path: '/circles', icon: Users, label: '学习圈' },
    { path: '/challenges', icon: Sword, label: '我的挑战' },
    { path: '/plaza', icon: Globe, label: '公共广场' },
    { path: '/profile', icon: Target, label: '学习画像' },
]

const ADMIN_ITEMS = [
    { path: '/admin', icon: Settings, label: '系统管理' },
]

export default function AppLayout() {
    const [collapsed, setCollapsed] = useState(false)
    const [dark, setDark] = useState(() => {
        const saved = localStorage.getItem('dark')
        if (saved !== null) return saved === 'true'
        return window.matchMedia('(prefers-color-scheme: dark)').matches
    })
    const [unreadCount, setUnreadCount] = useState(0)
    const location = useLocation()
    const { user, logout, token } = useAuthStore()
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark)
    }, [dark])

    // Auto-collapse sidebar when viewing a course detail page
    useEffect(() => {
        if (/^\/courses\/\d+/.test(location.pathname)) {
            setCollapsed(true)
        }
    }, [location.pathname])

    const toggleDark = () => {
        const next = !dark
        setDark(next)
        localStorage.setItem('dark', String(next))
    }

    // WebSocket for real-time notifications (with HTTP polling fallback)
    useEffect(() => {
        if (!token) return

        notificationApi.unreadCount().then((r) => setUnreadCount(r.count)).catch(() => {})
        const wsBase = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/v2/notifications/ws`
        let ws: WebSocket | null = null
        let unmounted = false

        const connect = async () => {
            if (unmounted) return
            try {
                const { ticket } = await notificationApi.getSseTicket()
                if (unmounted) return
                ws = new WebSocket(`${wsBase}?ticket=${encodeURIComponent(ticket)}`)
            } catch {
                if (!unmounted) reconnectTimerRef.current = setTimeout(connect, 5000)
                return
            }
            ws.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data)
                    if (data.type === 'unread_count') setUnreadCount(data.count)
                } catch { /* ignore */ }
            }
            ws.onclose = () => {
                if (!unmounted) reconnectTimerRef.current = setTimeout(connect, 5000)
            }
        }

        connect()

        const interval = setInterval(() => {
            notificationApi.unreadCount().then((r) => setUnreadCount(r.count)).catch(() => {})
        }, 60000)

        return () => {
            unmounted = true
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
            ws?.close()
            clearInterval(interval)
        }
    }, [token])

    return (
        <div className="flex h-screen overflow-hidden">
            {/* Sidebar */}
            <aside
                className={cn(
                    'relative flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out',
                    collapsed ? 'w-[68px]' : 'w-[260px]',
                )}
            >
                <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
                    <Link to="/" className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center">
                            <Logo size={32} />
                        </div>
                        {!collapsed && (
                            <div className="flex flex-col">
                                <span className="text-lg font-medium tracking-tight text-foreground">CogniLoop</span>
                                <span className="text-[11px] text-muted-foreground">v2.0</span>
                            </div>
                        )}
                    </Link>
                </div>

                <div className="flex-1 overflow-y-auto py-4 px-3">
                    {!collapsed && (
                        <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            主导航
                        </p>
                    )}
                    <nav className="space-y-1">
                        {NAV_ITEMS.map((item) => {
                            const isActive =
                                item.path === '/'
                                    ? location.pathname === '/'
                                    : location.pathname.startsWith(item.path)
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={cn(
                                        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200',
                                        isActive
                                            ? 'bg-sidebar-primary/10 text-sidebar-primary font-medium shadow-sm'
                                            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
                                    )}
                                >
                                    <item.icon
                                        className={cn(
                                            'size-[18px] shrink-0 transition-colors',
                                            isActive ? 'text-sidebar-primary' : 'text-muted-foreground group-hover:text-foreground',
                                        )}
                                    />
                                    {!collapsed && <span>{item.label}</span>}
                                </Link>
                            )
                        })}
                    </nav>

                    {/* Admin group */}
                    {user?.is_admin && (
                        <>
                            <div className="my-4 h-px bg-sidebar-border" />
                            {!collapsed && (
                                <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                    管理
                                </p>
                            )}
                            <nav className="space-y-1">
                                {ADMIN_ITEMS.map((item) => {
                                    const isActive = location.pathname.startsWith(item.path)
                                    return (
                                        <Link
                                            key={item.path}
                                            to={item.path}
                                            className={cn(
                                                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200',
                                                isActive
                                                    ? 'bg-sidebar-primary/10 text-sidebar-primary font-medium'
                                                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
                                            )}
                                        >
                                            <item.icon className="size-[18px] shrink-0" />
                                            {!collapsed && <span>{item.label}</span>}
                                        </Link>
                                    )
                                })}
                            </nav>
                        </>
                    )}
                </div>

                <div className="border-t border-sidebar-border p-3 space-y-1">
                    <div className="flex items-center gap-3 rounded-lg px-2 py-2">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground ring-1 ring-border overflow-hidden">
                            {user?.avatar_url ? (
                                <img src={user.avatar_url} alt="avatar" className="size-full object-cover" />
                            ) : (
                                user?.full_name?.charAt(0) || 'U'
                            )}
                        </div>
                        {!collapsed && (
                            <div className="flex flex-1 flex-col overflow-hidden">
                                <span className="truncate text-sm font-medium text-foreground">
                                    {user?.full_name || 'User'}
                                </span>
                                <span className="truncate text-[11px] text-muted-foreground">
                                    {user?.email || ''}
                                </span>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={logout}
                        className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive',
                            collapsed && 'justify-center px-0',
                        )}
                    >
                        <LogOut className="size-[18px] shrink-0" />
                        {!collapsed && <span>退出登录</span>}
                    </button>
                </div>

                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="absolute -right-3 top-20 z-10 flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
                >
                    {collapsed ? <ChevronRight className="size-3" /> : <ChevronLeft className="size-3" />}
                </button>
            </aside>

            <div className="flex flex-1 flex-col overflow-hidden">
                <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-card/80 backdrop-blur-sm px-6">
                    <GlobalSearchBar />

                    <div className="flex-1" />

                    <div className="flex items-center gap-1">
                        <button
                            onClick={toggleDark}
                            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                            {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
                        </button>

                        <Link
                            to="/notifications"
                            className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                            <Bell className="size-[18px]" />
                            {unreadCount > 0 && (
                                <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive ring-2 ring-card animate-pulse" />
                            )}
                        </Link>
                    </div>
                </header>

                <main className="flex-1 overflow-auto bg-background">
                    <ErrorBoundary>
                        <Outlet />
                    </ErrorBoundary>
                </main>
            </div>
        </div>
    )
}
