/**
 * Login page — split-screen with animated characters on the left.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth'
import { api, setupApi, linuxDoApi, authApi, ApiError } from '@/lib/api'
import { Loader2, Sparkles, Shield, CheckCircle, Eye, EyeOff } from 'lucide-react'

function EyeBall({
    size = 18,
    pupilSize = 7,
    maxDistance = 5,
    eyeColor = 'white',
    pupilColor = '#1e1b4b',
    isBlinking = false,
    forceLookX,
    forceLookY,
    mouseX = 0,
    mouseY = 0,
}: {
    size?: number
    pupilSize?: number
    maxDistance?: number
    eyeColor?: string
    pupilColor?: string
    isBlinking?: boolean
    forceLookX?: number
    forceLookY?: number
    mouseX?: number
    mouseY?: number
}) {
    const ref = useRef<HTMLDivElement>(null)

    const pos = (() => {
        if (forceLookX !== undefined && forceLookY !== undefined) {
            return { x: forceLookX, y: forceLookY }
        }
        if (!ref.current) return { x: 0, y: 0 }
        const r = ref.current.getBoundingClientRect()
        const dx = mouseX - (r.left + r.width / 2)
        const dy = mouseY - (r.top + r.height / 2)
        const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance)
        const angle = Math.atan2(dy, dx)
        return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist }
    })()

    return (
        <div
            ref={ref}
            className="rounded-full flex items-center justify-center"
            style={{
                width: `${size}px`,
                height: isBlinking ? '2px' : `${size}px`,
                backgroundColor: eyeColor,
                overflow: 'hidden',
                transition: 'height 0.12s ease',
            }}
        >
            {!isBlinking && (
                <div
                    style={{
                        width: `${pupilSize}px`,
                        height: `${pupilSize}px`,
                        borderRadius: '50%',
                        backgroundColor: pupilColor,
                        transform: `translate(${pos.x}px, ${pos.y}px)`,
                        transition: 'transform 0.08s ease-out',
                    }}
                />
            )}
        </div>
    )
}

type PageMode = 'loading' | 'setup' | 'login' | 'register'

function translateError(msg: string): string {
    const map: [string, string][] = [
        ['Invalid username or password', '用户名或密码错误'],
        ['Account is disabled', '账号已被禁用，请联系管理员'],
        ['Username or email already exists', '该用户名或邮箱已被注册'],
        ['Username or email', '该用户名或邮箱已被注册'],
        ['System is already set up', '系统已完成初始化，请直接登录'],
    ]
    for (const [key, val] of map) {
        if (msg.includes(key)) return val
    }
    return msg
}

export default function LoginPage() {
    const [mode, setMode] = useState<PageMode>('loading')
    const [form, setForm] = useState({ username: '', email: '', password: '', full_name: '' })
    const [error, setError] = useState('')
    const [successMsg, setSuccessMsg] = useState('')
    const [loading, setLoading] = useState(false)
    const [setupDone, setSetupDone] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [captchaId, setCaptchaId] = useState('')
    const [captchaSvg, setCaptchaSvg] = useState('')
    const [captchaAnswer, setCaptchaAnswer] = useState('')
    const [captchaLoading, setCaptchaLoading] = useState(false)
    const [linuxDoEnabled, setLinuxDoEnabled] = useState(false)
    const [linuxDoLoading, setLinuxDoLoading] = useState(false)
    const [registrationEnabled, setRegistrationEnabled] = useState(true)
    const { login, register } = useAuthStore()
    const navigate = useNavigate()

    const [mouse, setMouse] = useState({ x: 0, y: 0 })
    const [isTyping, setIsTyping] = useState(false)
    const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false)
    const [isPurplePeeking, setIsPurplePeeking] = useState(false)
    const [char1Blink, setChar1Blink] = useState(false)
    const [char2Blink, setChar2Blink] = useState(false)
    const char1Ref = useRef<HTMLDivElement>(null)
    const char2Ref = useRef<HTMLDivElement>(null)
    const char3Ref = useRef<HTMLDivElement>(null)
    const char4Ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setupApi.check().then(({ needs_setup }) => {
            setMode(needs_setup ? 'setup' : 'login')
        }).catch((err) => {
            setMode('login')
            if (err instanceof ApiError && err.status === 0) {
                setError('无法连接到服务器，请刷新页面后重试')
            }
        })
        linuxDoApi.isEnabled().then(({ enabled }) => setLinuxDoEnabled(enabled)).catch(() => {})
        authApi.isRegistrationEnabled().then(({ enabled }) => {
            if (!enabled) setMode(m => m === 'register' ? 'login' : m)
            setRegistrationEnabled(enabled)
        }).catch(() => {})
    }, [])

    const loadCaptcha = async () => {
        setCaptchaLoading(true)
        setCaptchaAnswer('')
        try {
            const data = await api.get<{ captcha_id: string; svg: string }>('/auth/captcha')
            setCaptchaId(data.captcha_id)
            setCaptchaSvg(data.svg)
        } finally {
            setCaptchaLoading(false)
        }
    }

    useEffect(() => {
        if (mode === 'login' || mode === 'register') loadCaptcha()
    }, [mode])

    useEffect(() => {
        const onMove = (e: MouseEvent) => setMouse({ x: e.clientX, y: e.clientY })
        window.addEventListener('mousemove', onMove)
        return () => window.removeEventListener('mousemove', onMove)
    }, [])

    useEffect(() => {
        const scheduleBlink = (set: (v: boolean) => void): ReturnType<typeof setTimeout> => {
            const t = setTimeout(() => {
                set(true)
                setTimeout(() => { set(false); scheduleBlink(set) }, 150)
            }, Math.random() * 4000 + 3000)
            return t
        }
        const t1 = scheduleBlink(setChar1Blink)
        const t2 = scheduleBlink(setChar2Blink)
        return () => { clearTimeout(t1); clearTimeout(t2) }
    }, [])

    useEffect(() => {
        if (!isTyping) { setIsLookingAtEachOther(false); return }
        setIsLookingAtEachOther(true)
        const t = setTimeout(() => setIsLookingAtEachOther(false), 800)
        return () => clearTimeout(t)
    }, [isTyping])

    // char1 peeks sideways when password is revealed
    useEffect(() => {
        if (form.password.length > 0 && showPassword) {
            const t = setTimeout(() => {
                setIsPurplePeeking(true)
                setTimeout(() => setIsPurplePeeking(false), 800)
            }, Math.random() * 3000 + 1500)
            return () => clearTimeout(t)
        }
        setIsPurplePeeking(false)
    }, [form.password, showPassword, isPurplePeeking])

    const calcSkew = (ref: React.RefObject<HTMLDivElement | null>) => {
        if (!ref.current) return 0
        const r = ref.current.getBoundingClientRect()
        const dx = mouse.x - (r.left + r.width / 2)
        return Math.max(-6, Math.min(6, -dx / 120))
    }
    const calcFaceOffset = (ref: React.RefObject<HTMLDivElement | null>) => {
        if (!ref.current) return { fx: 0, fy: 0 }
        const r = ref.current.getBoundingClientRect()
        return {
            fx: Math.max(-15, Math.min(15, (mouse.x - r.left - r.width / 2) / 20)),
            fy: Math.max(-10, Math.min(10, (mouse.y - r.top - r.height / 3) / 30)),
        }
    }

    const s1 = calcSkew(char1Ref), s2 = calcSkew(char2Ref)
    const s3 = calcSkew(char3Ref), s4 = calcSkew(char4Ref)
    const f1 = calcFaceOffset(char1Ref), f2 = calcFaceOffset(char2Ref)
    const f3 = calcFaceOffset(char3Ref), f4 = calcFaceOffset(char4Ref)

    const passwordHiding = form.password.length > 0 && !showPassword
    const passwordRevealed = form.password.length > 0 && showPassword

    function validateForm(): string | null {
        if (!form.username.trim()) return '请输入用户名'
        if (mode === 'register' || mode === 'setup') {
            if (form.username.length < 3) return '用户名至少需要 3 个字符'
            if (form.username.length > 50) return '用户名不能超过 50 个字符'
            if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return '请输入有效的邮箱地址'
            if (!form.full_name.trim()) return '请输入姓名'
        }
        if (!form.password) return '请输入密码'
        if (mode !== 'login' && form.password.length < 6) return '密码至少需要 6 个字符'
        if ((mode === 'login' || mode === 'register') && !captchaAnswer.trim()) return '请输入验证码'
        return null
    }

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault()
        const err = validateForm()
        if (err) { setError(err); return }
        setError('')
        setLoading(true)
        try {
            await setupApi.createAdmin(form)
            setSetupDone(true)
            setTimeout(() => {
                setMode('login')
                setSetupDone(false)
                setSuccessMsg('管理员账户创建成功！请使用您的账号和密码登录')
            }, 1500)
        } catch (err) {
            setError(translateError(err instanceof Error ? err.message : '创建失败，请重试'))
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const err = validateForm()
        if (err) { setError(err); return }
        setError('')
        setSuccessMsg('')
        setLoading(true)
        try {
            if (mode === 'login') {
                await login(form.username, form.password, captchaId, captchaAnswer)
                navigate('/')
            } else {
                await register(form, captchaId, captchaAnswer)
                setMode('login')
                setSuccessMsg('注册成功！请使用您的账号和密码登录')
            }
        } catch (err) {
            setError(translateError(err instanceof Error ? err.message : '操作失败，请重试'))
            if (mode === 'login' || mode === 'register') loadCaptcha()
        } finally {
            setLoading(false)
        }
    }

    const inputCls =
        'w-full rounded-lg border border-border bg-input-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all'

    const passwordToggleBtn = (
        <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
        >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
    )

    if (mode === 'loading') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        )
    }

    return (
        <div className="relative min-h-screen bg-background flex items-center justify-center p-4 sm:p-8 lg:p-12">
            {/* Page background — subtle glow blobs */}
            <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute -left-48 -top-48 size-[480px] rounded-full bg-indigo-500/8 blur-3xl" />
                <div className="absolute -bottom-48 -right-48 size-[480px] rounded-full bg-purple-500/8 blur-3xl" />
                <div className="absolute left-1/2 top-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/5 blur-3xl" />
            </div>

            {/* Floating card */}
            <div className="w-full max-w-[1300px] overflow-hidden rounded-xl border border-border shadow-2xl shadow-black/8 dark:shadow-black/25 lg:grid grid-cols-[58fr_42fr]">

            {/* Left panel */}
            <div className="relative hidden lg:flex flex-col justify-between overflow-hidden p-10 text-slate-800 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50"
            >
                {/* Brand */}
                <div className="relative z-10 flex items-center gap-2.5">
                    <span className="text-lg font-medium tracking-tight">CogniLoop</span>
                </div>

                {/* Characters stage */}
                <div className="relative z-10 flex items-end justify-center h-[460px]">
                    <div className="relative w-[480px] h-[400px] scale-[1.15] origin-bottom">

                        {/* Char 1 — violet rectangle (main hero) */}
                        <div
                            ref={char1Ref}
                            className="absolute bottom-0 transition-all duration-300 ease-in-out"
                            style={{
                                left: '55px',
                                width: '155px',
                                height: passwordHiding ? '430px' : '375px',
                                backgroundColor: '#6C3FF5', // purple
                                borderRadius: '10px 10px 0 0',
                                zIndex: 1,
                                transform: passwordRevealed
                                    ? 'skewX(0deg)'
                                    : passwordHiding
                                    ? `skewX(${s1 - 11}deg) translateX(34px)`
                                    : `skewX(${s1}deg)`,
                                transformOrigin: 'bottom center',
                            }}
                        >
                            <div
                                className="absolute flex gap-7 transition-all duration-300 ease-in-out"
                                style={{
                                    left: passwordRevealed ? '18px' : isLookingAtEachOther ? '48px' : `${38 + f1.fx}px`,
                                    top: passwordRevealed ? '28px' : isLookingAtEachOther ? '58px' : `${34 + f1.fy}px`,
                                }}
                            >
                                {[0, 1].map(i => (
                                    <EyeBall key={i}
                                        size={19} pupilSize={8} maxDistance={5}
                                        eyeColor="white" pupilColor="#3b0764"
                                        isBlinking={char1Blink}
                                        mouseX={mouse.x} mouseY={mouse.y}
                                        forceLookX={passwordRevealed ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 4 : undefined}
                                        forceLookY={passwordRevealed ? (isPurplePeeking ? -5 : -4) : isLookingAtEachOther ? 3 : undefined}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Char 2 — dark navy rectangle */}
                        <div
                            ref={char2Ref}
                            className="absolute bottom-0 transition-all duration-300 ease-in-out"
                            style={{
                                left: '205px',
                                width: '110px',
                                height: '295px',
                                backgroundColor: '#2D2D2D', // dark gray
                                borderRadius: '8px 8px 0 0',
                                zIndex: 2,
                                transform: passwordRevealed
                                    ? 'skewX(0deg)'
                                    : isLookingAtEachOther
                                    ? `skewX(${s2 * 1.5 + 10}deg) translateX(16px)`
                                    : `skewX(${s2}deg)`,
                                transformOrigin: 'bottom center',
                            }}
                        >
                            <div
                                className="absolute flex gap-5 transition-all duration-300 ease-in-out"
                                style={{
                                    left: passwordRevealed ? '9px' : isLookingAtEachOther ? '26px' : `${20 + f2.fx}px`,
                                    top: passwordRevealed ? '24px' : isLookingAtEachOther ? '10px' : `${26 + f2.fy}px`,
                                }}
                            >
                                {[0, 1].map(i => (
                                    <EyeBall key={i}
                                        size={15} pupilSize={6} maxDistance={4}
                                        eyeColor="white" pupilColor="#111111"
                                        isBlinking={char2Blink}
                                        mouseX={mouse.x} mouseY={mouse.y}
                                        forceLookX={passwordRevealed ? -4 : isLookingAtEachOther ? -2 : undefined}
                                        forceLookY={passwordRevealed ? -4 : isLookingAtEachOther ? -3 : undefined}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Char 3 — emerald semi-circle */}
                        <div
                            ref={char3Ref}
                            className="absolute bottom-0 transition-all duration-300 ease-in-out"
                            style={{
                                left: '-5px',
                                width: '215px',
                                height: '188px',
                                backgroundColor: '#FF9B6B', // orange/salmon
                                borderRadius: '110px 110px 0 0',
                                zIndex: 3,
                                transform: passwordRevealed ? 'skewX(0deg)' : `skewX(${s3}deg)`,
                                transformOrigin: 'bottom center',
                            }}
                        >
                            <div
                                className="absolute flex gap-7 transition-all duration-200 ease-out"
                                style={{
                                    left: passwordRevealed ? '44px' : `${74 + f3.fx}px`,
                                    top: passwordRevealed ? '78px' : `${82 + f3.fy}px`,
                                }}
                            >
                                {[0, 1].map(i => (
                                    <EyeBall key={i}
                                        size={26} pupilSize={12} maxDistance={5}
                                        eyeColor="transparent" pupilColor="#7c2d12"
                                        mouseX={mouse.x} mouseY={mouse.y}
                                        forceLookX={passwordRevealed ? -5 : undefined}
                                        forceLookY={passwordRevealed ? -4 : undefined}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Char 4 — amber rounded rectangle */}
                        <div
                            ref={char4Ref}
                            className="absolute bottom-0 transition-all duration-300 ease-in-out"
                            style={{
                                left: '310px',
                                width: '130px',
                                height: '220px',
                                backgroundColor: '#E8D754', // yellow
                                borderRadius: '65px 65px 0 0',
                                zIndex: 4,
                                transform: passwordRevealed ? 'skewX(0deg)' : `skewX(${s4}deg)`,
                                transformOrigin: 'bottom center',
                            }}
                        >
                            <div
                                className="absolute flex gap-5 transition-all duration-200 ease-out"
                                style={{
                                    left: passwordRevealed ? '18px' : `${29 + f4.fx * 0.4}px`,
                                    top: passwordRevealed ? '30px' : `${34 + f4.fy}px`,
                                }}
                            >
                                {[0, 1].map(i => (
                                    <EyeBall key={i}
                                        size={26} pupilSize={12} maxDistance={5}
                                        eyeColor="transparent" pupilColor="#5a4700"
                                        mouseX={mouse.x} mouseY={mouse.y}
                                        forceLookX={passwordRevealed ? -5 : undefined}
                                        forceLookY={passwordRevealed ? -4 : undefined}
                                    />
                                ))}
                            </div>
                            {/* Mouth */}
                            <div
                                className="absolute h-[3px] rounded-full bg-amber-900/40 transition-all duration-200 ease-out"
                                style={{
                                    width: '46px',
                                    left: passwordRevealed ? '8px' : `${35 + f4.fx}px`,
                                    top: passwordRevealed ? '80px' : `${80 + f4.fy}px`,
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Tagline */}
                <div className="relative z-10">
                    <p className="text-sm font-medium text-slate-400 tracking-wide">AI 驱动的去中心化知识学习社区</p>
                </div>

                {/* Decorative overlays */}
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(99,102,241,0.06)_1px,transparent_1px)] bg-[length:22px_22px]"
                />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.07),transparent_55%)]" />
                <div className="pointer-events-none absolute bottom-1/3 left-1/3 size-80 rounded-full bg-indigo-200/30 blur-3xl" />
            </div>

            {/* Right panel */}
            <div className="flex items-center justify-center bg-background px-8 py-10">
                <div className="w-full max-w-md animate-fade-in-up">
                    {/* Mobile logo */}
                    <div className="mb-8 text-center lg:hidden">
                        <div className={`mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl shadow-xl ${
                            mode === 'setup'
                                ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/25'
                                : 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/25'
                        }`}>
                            {mode === 'setup' ? <Shield className="size-8 text-white" /> : <Sparkles className="size-8 text-white animate-pulse" />}
                        </div>
                        <h1 className="text-2xl font-medium tracking-tight text-foreground">CogniLoop</h1>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            {mode === 'setup' ? '首次启动 — 创建管理员账户' : 'AI 驱动的去中心化知识学习社区'}
                        </p>
                    </div>

                    {/* Desktop heading */}
                    <div className="mb-8 hidden lg:block">
                        <h2 className="text-2xl font-medium tracking-tight text-foreground">
                            {mode === 'setup' ? '初始化系统' : mode === 'login' ? '欢迎回来 👋' : '创建账户'}
                        </h2>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            {mode === 'setup'
                                ? '首次启动，请创建管理员账户'
                                : mode === 'login'
                                ? '请登录您的 CogniLoop 账户继续学习'
                                : '填写以下信息加入 CogniLoop'}
                        </p>
                    </div>

                    {/* Status banners */}
                    {setupDone && (
                        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 animate-fade-in">
                            <CheckCircle className="size-5 shrink-0" />
                            <span>管理员账户创建成功！正在自动登录...</span>
                        </div>
                    )}
                    {successMsg && (
                        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 animate-fade-in">
                            <CheckCircle className="size-5 shrink-0" />
                            <span>{successMsg}</span>
                        </div>
                    )}

                    <div className="rounded-xl border border-border bg-card/80 p-8 shadow-xl backdrop-blur-sm">
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
                                        <input type="text" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className={inputCls} placeholder="如 admin" />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-sm font-medium text-foreground">邮箱</label>
                                        <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} placeholder="admin@example.com" />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-sm font-medium text-foreground">姓名</label>
                                        <input type="text" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className={inputCls} placeholder="管理员" />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-sm font-medium text-foreground">密码</label>
                                        <div className="relative">
                                            <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={`${inputCls} pr-10`} placeholder="至少 6 个字符" />
                                            {passwordToggleBtn}
                                        </div>
                                    </div>
                                    <button type="submit" disabled={loading || setupDone} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-amber-500/25 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                                        {loading && <Loader2 className="size-4 animate-spin" />}
                                        <Shield className="size-4" />
                                        创建管理员账户
                                    </button>
                                </form>
                            </>
                        ) : (
                            <>
                                {registrationEnabled && (
                                    <div className="mb-6 flex rounded-lg bg-muted p-1">
                                        <button
                                            onClick={() => { setMode('login'); setError(''); setSuccessMsg('') }}
                                            className={`flex-1 rounded-md py-2.5 text-sm font-medium transition-all duration-200 ${mode === 'login' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            登录
                                        </button>
                                        <button
                                            onClick={() => { setMode('register'); setError(''); setSuccessMsg('') }}
                                            className={`flex-1 rounded-md py-2.5 text-sm font-medium transition-all duration-200 ${mode === 'register' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            注册
                                        </button>
                                    </div>
                                )}

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
                                            onChange={e => setForm({ ...form, username: e.target.value })}
                                            onFocus={() => setIsTyping(true)}
                                            onBlur={() => setIsTyping(false)}
                                            className={inputCls}
                                            placeholder="输入用户名"
                                        />
                                    </div>

                    {/* Register-only fields — always in DOM, grid-rows height animates open/closed */}
                                    <div className={`grid transition-all duration-300 ease-in-out ${
                                        mode === 'register' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] -mt-4'
                                    }`}>
                                        <div className="min-h-0 overflow-hidden">
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="mb-1.5 block text-sm font-medium text-foreground">邮箱</label>
                                                    <input
                                                        type="email"
                                                        value={form.email}
                                                        onChange={e => setForm({ ...form, email: e.target.value })}
                                                        onFocus={() => setIsTyping(true)}
                                                        onBlur={() => setIsTyping(false)}
                                                        className={inputCls}
                                                        placeholder="输入邮箱"
                                                        tabIndex={mode === 'register' ? 0 : -1}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="mb-1.5 block text-sm font-medium text-foreground">姓名</label>
                                                    <input
                                                        type="text"
                                                        value={form.full_name}
                                                        onChange={e => setForm({ ...form, full_name: e.target.value })}
                                                        onFocus={() => setIsTyping(true)}
                                                        onBlur={() => setIsTyping(false)}
                                                        className={inputCls}
                                                        placeholder="输入姓名"
                                                        tabIndex={mode === 'register' ? 0 : -1}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="mb-1.5 block text-sm font-medium text-foreground">密码</label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                value={form.password}
                                                onChange={e => setForm({ ...form, password: e.target.value })}
                                                className={`${inputCls} pr-10`}
                                                placeholder={mode === 'login' ? '输入密码' : '至少 6 个字符'}
                                            />
                                            {passwordToggleBtn}
                                        </div>
                                    </div>

                                    {(mode === 'login' || mode === 'register') && (
                                        <div>
                                            <label className="mb-1.5 block text-sm font-medium text-foreground">验证码</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={captchaAnswer}
                                                    onChange={e => setCaptchaAnswer(e.target.value.toUpperCase())}
                                                    className={`${inputCls} flex-1 tracking-widest`}
                                                    placeholder="输入验证码"
                                                    maxLength={4}
                                                    autoComplete="off"
                                                />
                                                <div
                                                    className={`shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border transition-opacity ${captchaLoading ? 'opacity-40' : 'opacity-100 hover:opacity-80'}`}
                                                    dangerouslySetInnerHTML={{ __html: captchaSvg }}
                                                    onClick={captchaLoading ? undefined : loadCaptcha}
                                                    title="点击刷新验证码"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5 hover:scale-105 active:scale-95 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                                    >
                                        {loading && <Loader2 className="size-4 animate-spin" />}
                                        {mode === 'login' ? '登录' : '注册'}
                                    </button>
                                </form>

                                {linuxDoEnabled && mode === 'login' && (
                                    <>
                                        <div className="my-5 flex items-center gap-3">
                                            <div className="h-px flex-1 bg-border" />
                                            <span className="text-xs text-muted-foreground">或</span>
                                            <div className="h-px flex-1 bg-border" />
                                        </div>
                                        <button
                                            type="button"
                                            disabled={linuxDoLoading}
                                            onClick={async () => {
                                                try {
                                                    setLinuxDoLoading(true)
                                                    sessionStorage.setItem('linux_do_flow', 'login')
                                                    const { url } = await linuxDoApi.getAuthorizeUrl()
                                                    window.location.href = url
                                                } catch (err) {
                                                    setError(err instanceof Error ? err.message : '跳转失败，请重试')
                                                    setLinuxDoLoading(false)
                                                }
                                            }}
                                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {linuxDoLoading
                                                ? <Loader2 className="size-4 animate-spin" />
                                                : <svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny-ps" width="16" height="16" viewBox="0 0 120 120" className="rounded-sm shrink-0"><clipPath id="a"><circle cx="60" cy="60" r="47" /></clipPath><circle fill="#f0f0f0" cx="60" cy="60" r="50" /><rect fill="#1c1c1e" clipPath="url(#a)" x="10" y="10" width="100" height="30" /><rect fill="#f0f0f0" clipPath="url(#a)" x="10" y="40" width="100" height="40" /><rect fill="#ffb003" clipPath="url(#a)" x="10" y="80" width="100" height="30" /></svg>
                                            }
                                            使用 Linux DO 登录
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                    </div>

                    <p className="mt-6 text-center text-xs text-muted-foreground">
                        如果你觉得这个项目不错，欢迎去{' '}
                        <a href="https://github.com/itsmorninghao/CogniLoop" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">GitHub</a>
                        {' '}点个 Star
                    </p>
                </div>
            </div>

            </div>
        </div>
    )
}
