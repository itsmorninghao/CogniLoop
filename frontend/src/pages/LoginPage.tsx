/**
 * Login page — premium auth gateway with first-run admin setup.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth'
import { setupApi } from '@/lib/api'
import { Loader2, Sparkles, Shield, CheckCircle } from 'lucide-react'

type PageMode = 'loading' | 'setup' | 'login' | 'register'

export default function LoginPage() {
    const [mode, setMode] = useState<PageMode>('loading')
    const [form, setForm] = useState({ username: '', email: '', password: '', full_name: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [setupDone, setSetupDone] = useState(false)
    const { login, register } = useAuthStore()
    const navigate = useNavigate()

    useEffect(() => {
        setupApi.check().then(({ needs_setup }) => {
            setMode(needs_setup ? 'setup' : 'login')
        }).catch(() => {
            setMode('login')
        })
    }, [])

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            await setupApi.createAdmin(form)
            setSetupDone(true)
            // Auto-login after 1.5s
            setTimeout(async () => {
                try {
                    await login(form.username, form.password)
                    navigate('/')
                } catch {
                    setMode('login')
                    setSetupDone(false)
                }
            }, 1500)
        } catch (err) {
            setError(err instanceof Error ? err.message : '创建失败，请重试')
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            if (mode === 'login') {
                await login(form.username, form.password)
                navigate('/')
            } else {
                await register(form)
                await login(form.username, form.password)
                navigate('/')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '操作失败，请重试')
        } finally {
            setLoading(false)
        }
    }

    if (mode === 'loading') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        )
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
            {/* Background decoration */}
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-1/4 top-0 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 blur-3xl" />
                <div className="absolute bottom-0 right-1/4 size-[500px] translate-x-1/2 translate-y-1/2 rounded-full bg-gradient-to-br from-pink-500/10 to-purple-500/10 blur-3xl" />
            </div>

            <div className="relative z-10 w-full max-w-md animate-fade-in-up">
                {/* Logo */}
                <div className="mb-8 text-center">
                    <div className={`mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl shadow-xl ${mode === 'setup'
                        ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/25'
                        : 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/25'
                        }`}>
                        {mode === 'setup' ? <Shield className="size-8 text-white" /> : <Sparkles className="size-8 text-white" />}
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">CogniLoop</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {mode === 'setup' ? '首次启动 — 创建管理员账户' : 'AI 驱动的去中心化知识学习社区'}
                    </p>
                </div>

                {/* Setup Done Toast */}
                {setupDone && (
                    <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 animate-fade-in">
                        <CheckCircle className="size-5 shrink-0" />
                        <span>管理员账户创建成功！正在自动登录...</span>
                    </div>
                )}

                {/* Card */}
                <div className="rounded-2xl border border-border bg-card/80 p-8 shadow-xl backdrop-blur-sm">
                    {/* Setup mode */}
                    {mode === 'setup' ? (
                        <>
                            <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                                <p className="text-center text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
                                    系统首次启动，请创建管理员账户
                                </p>
                            </div>
                            {error && (
                                <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                                    {error}
                                </div>
                            )}
                            <form onSubmit={handleSetup} className="space-y-4">
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-foreground">管理员用户名</label>
                                    <input
                                        type="text"
                                        value={form.username}
                                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                                        className="w-full rounded-lg border border-border bg-input-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                        placeholder="如 admin"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-foreground">邮箱</label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                                        className="w-full rounded-lg border border-border bg-input-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                        placeholder="admin@example.com"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-foreground">姓名</label>
                                    <input
                                        type="text"
                                        value={form.full_name}
                                        onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                                        className="w-full rounded-lg border border-border bg-input-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                        placeholder="管理员"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-foreground">密码</label>
                                    <input
                                        type="password"
                                        value={form.password}
                                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                                        className="w-full rounded-lg border border-border bg-input-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                        placeholder="至少 6 位"
                                        required
                                        minLength={6}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading || setupDone}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-amber-500/25 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading && <Loader2 className="size-4 animate-spin" />}
                                    <Shield className="size-4" />
                                    创建管理员账户
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            {/* Login / Register Tabs */}
                            <div className="mb-6 flex rounded-lg bg-muted p-1">
                                <button
                                    onClick={() => setMode('login')}
                                    className={`flex-1 rounded-md py-2.5 text-sm font-medium transition-all duration-200 ${mode === 'login'
                                        ? 'bg-card text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    登录
                                </button>
                                <button
                                    onClick={() => setMode('register')}
                                    className={`flex-1 rounded-md py-2.5 text-sm font-medium transition-all duration-200 ${mode === 'register'
                                        ? 'bg-card text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    注册
                                </button>
                            </div>

                            {error && (
                                <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-foreground">用户名</label>
                                    <input
                                        type="text"
                                        value={form.username}
                                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                                        className="w-full rounded-lg border border-border bg-input-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                        placeholder="输入用户名"
                                        required
                                    />
                                </div>

                                {mode === 'register' && (
                                    <>
                                        <div>
                                            <label className="mb-1.5 block text-sm font-medium text-foreground">邮箱</label>
                                            <input
                                                type="email"
                                                value={form.email}
                                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                                className="w-full rounded-lg border border-border bg-input-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                                placeholder="输入邮箱"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-sm font-medium text-foreground">姓名</label>
                                            <input
                                                type="text"
                                                value={form.full_name}
                                                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                                                className="w-full rounded-lg border border-border bg-input-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                                placeholder="输入姓名"
                                                required
                                            />
                                        </div>
                                    </>
                                )}

                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-foreground">密码</label>
                                    <input
                                        type="password"
                                        value={form.password}
                                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                                        className="w-full rounded-lg border border-border bg-input-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                        placeholder="输入密码"
                                        required
                                        minLength={6}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                                >
                                    {loading && <Loader2 className="size-4 animate-spin" />}
                                    {mode === 'login' ? '登录' : '注册'}
                                </button>
                            </form>
                        </>
                    )}
                </div>

                <p className="mt-6 text-center text-xs text-muted-foreground">
                    继续即表示您同意我们的服务条款和隐私政策
                </p>
            </div>
        </div>
    )
}
