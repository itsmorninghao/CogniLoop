/**
 * OAuth callback page — handles Linux DO OAuth2 redirect.
 * Reads `code` + `state` from URL, determines flow from sessionStorage,
 * then calls the appropriate API and redirects.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { linuxDoApi, ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { Loader2, XCircle } from 'lucide-react'

export default function OAuthCallbackPage() {
    const [error, setError] = useState<string | null>(null)
    const navigate = useNavigate()
    const { fetchUser } = useAuthStore()

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        const state = params.get('state')
        const flow = sessionStorage.getItem('linux_do_flow')

        if (!code || !state) {
            setError('回调参数缺失（code 或 state），请重新尝试')
            return
        }
        sessionStorage.removeItem('linux_do_flow')

        const run = async () => {
            try {
                if (flow === 'login') {
                    const { access_token } = await linuxDoApi.exchange(code, state)
                    localStorage.setItem('token', access_token)
                    await fetchUser()
                    navigate('/', { replace: true })
                } else if (flow === 'bind') {
                    await linuxDoApi.bind(code, state)
                    await fetchUser()
                    navigate('/profile', { replace: true })
                } else {
                    setError('未知的 OAuth 流程，请重新操作')
                }
            } catch (err) {
                setError(err instanceof ApiError ? err.message : '操作失败，请重试')
            }
        }

        run()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    if (error) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background p-4">
                <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
                    <XCircle className="mx-auto mb-4 size-12 text-destructive" />
                    <h2 className="mb-2 text-lg font-semibold text-foreground">登录失败</h2>
                    <p className="mb-6 text-sm text-muted-foreground">{error}</p>
                    <button
                        onClick={() => navigate('/login', { replace: true })}
                        className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 transition"
                    >
                        返回登录
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">正在处理授权，请稍候...</p>
            </div>
        </div>
    )
}
