/**
 * AdminSecurityTab — IP blocking management panel.
 * Shows recent login history (with manual block action) and currently blocked IPs.
 */

import { useEffect, useState } from 'react'
import { RefreshCw, ShieldBan, ShieldCheck } from 'lucide-react'
import { adminApi } from '@/lib/api'

interface LoginRecord {
    ip: string
    username: string
    success: boolean
    timestamp: string
}

interface BlockedIp {
    ip: string
    ttl_seconds: number
    fail_count: number
}

function formatTtl(seconds: number): string {
    if (seconds < 0) return '永久'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

export function AdminSecurityTab() {
    const [history, setHistory] = useState<LoginRecord[]>([])
    const [blocked, setBlocked] = useState<BlockedIp[]>([])
    const [loading, setLoading] = useState(false)
    const [actionIp, setActionIp] = useState<string | null>(null)
    const [blockEnabled, setBlockEnabled] = useState(false)
    const [toggleLoading, setToggleLoading] = useState(false)

    const loadAll = async () => {
        setLoading(true)
        try {
            const [h, b, cfg] = await Promise.all([
                adminApi.loginHistory(100),
                adminApi.listBlockedIps(),
                adminApi.getIpBlockConfig(),
            ])
            setHistory(h)
            setBlocked(b)
            setBlockEnabled(cfg.enabled)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadAll() }, [])

    const handleToggle = async () => {
        const next = !blockEnabled
        setToggleLoading(true)
        try {
            await adminApi.setIpBlockConfig(next)
            setBlockEnabled(next)
        } finally {
            setToggleLoading(false)
        }
    }

    const blockedSet = new Set(blocked.map(b => b.ip))

    const handleBlock = async (ip: string) => {
        setActionIp(ip)
        try {
            await adminApi.blockIp(ip)
            await loadAll()
        } finally {
            setActionIp(null)
        }
    }

    const handleUnblock = async (ip: string) => {
        setActionIp(ip)
        try {
            await adminApi.unblockIp(ip)
            await loadAll()
        } finally {
            setActionIp(null)
        }
    }

    return (
        <div className="space-y-8 p-6">
            {/* Toggle — IP blocking on/off */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4">
                <div>
                    <p className="text-sm font-medium text-foreground">IP 封锁功能</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {blockEnabled
                            ? `已启用 — 连续失败 5 次后自动封锁该 IP`
                            : '已关闭 — 登录失败不会触发 IP 封锁'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleToggle}
                    disabled={toggleLoading}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                        blockEnabled ? 'bg-indigo-500' : 'bg-muted-foreground/30'
                    }`}
                    aria-checked={blockEnabled}
                    role="switch"
                >
                    <span
                        className={`pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                            blockEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                </button>
            </div>

            {/* Section A — Login history */}
            <section>
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-medium text-foreground">最近登录记录</h2>
                    <button
                        onClick={loadAll}
                        disabled={loading}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                        <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                        刷新
                    </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/40">
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP 地址</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">用户名</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">时间</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                                        暂无登录记录
                                    </td>
                                </tr>
                            ) : (
                                history.map((rec, idx) => (
                                    <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/20">
                                        <td className="px-4 py-3 font-mono text-xs text-foreground">{rec.ip}</td>
                                        <td className="px-4 py-3 text-foreground">{rec.username}</td>
                                        <td className="px-4 py-3">
                                            {rec.success ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                                    ✅ 成功
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                                                    ❌ 失败
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatTime(rec.timestamp)}</td>
                                        <td className="px-4 py-3">
                                            {blockedSet.has(rec.ip) ? (
                                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">已封禁</span>
                                            ) : (
                                                <button
                                                    onClick={() => handleBlock(rec.ip)}
                                                    disabled={actionIp === rec.ip}
                                                    className="flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-50"
                                                >
                                                    <ShieldBan className="size-3" />
                                                    封禁
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Section B — Currently blocked IPs */}
            <section>
                <h2 className="mb-4 text-base font-medium text-foreground">当前封禁 IP</h2>

                <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/40">
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP 地址</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">剩余封锁时间</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {blocked.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                                        当前无被封锁的 IP
                                    </td>
                                </tr>
                            ) : (
                                blocked.map((b) => (
                                    <tr key={b.ip} className="border-b border-border last:border-0 hover:bg-muted/20">
                                        <td className="px-4 py-3 font-mono text-xs text-foreground">{b.ip}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{formatTtl(b.ttl_seconds)}</td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => handleUnblock(b.ip)}
                                                disabled={actionIp === b.ip}
                                                className="flex items-center gap-1 rounded-lg border border-emerald-300 px-2.5 py-1 text-xs text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 disabled:opacity-50"
                                            >
                                                <ShieldCheck className="size-3" />
                                                解封
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}
