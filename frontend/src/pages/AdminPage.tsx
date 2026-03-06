/**
 * Admin page — dashboard container layout.
 * Requires is_admin = true.
 */

import { useState } from 'react'
import {
    Users, Database, Settings, Megaphone, Activity, ShieldAlert, ShieldBan
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'

// Sub-components
import { AdminStatsTab } from '@/components/admin/AdminStatsTab'
import { AdminUsersTab } from '@/components/admin/AdminUsersTab'
import { AdminConfigTab } from '@/components/admin/AdminConfigTab'
import { AdminBroadcastTab } from '@/components/admin/AdminBroadcastTab'
import { AdminModerationTab } from '@/components/admin/AdminModerationTab'
import { AdminSecurityTab } from '@/components/admin/AdminSecurityTab'

type Tab = 'stats' | 'users' | 'configs' | 'broadcast' | 'moderation' | 'security'

export default function AdminPage() {
    const { user } = useAuthStore()
    const [activeTab, setActiveTab] = useState<Tab>('stats')

    if (!user || (!user.is_admin && !user.is_superadmin)) {
        return (
            <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 animate-fade-in">
                <div className="rounded-full bg-rose-500/10 p-4">
                    <Settings className="size-8 text-rose-500" />
                </div>
                <div className="text-center">
                    <h2 className="text-xl font-bold text-foreground">访问被拒绝</h2>
                    <p className="text-muted-foreground mt-1">您需要管理员权限才能访问此页面</p>
                </div>
            </div>
        )
    }

    const tabs = [
        { id: 'stats', label: '运行概览', icon: Activity },
        { id: 'users', label: '用户管理', icon: Users },
        { id: 'configs', label: '系统设置', icon: Database },
        { id: 'broadcast', label: '全站广播', icon: Megaphone },
        { id: 'moderation', label: '内容审核', icon: ShieldAlert },
        { id: 'security', label: 'IP 封锁', icon: ShieldBan },
    ] as const

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background animate-fade-in">
            {/* Top Navigation — left-aligned, flush with content */}
            <header className="flex-none border-b border-border px-6">
                <nav className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
                    {tabs.map(tab => {
                        const Icon = tab.icon
                        const isActive = activeTab === tab.id
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`relative flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${isActive
                                    ? 'text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                <Icon className="size-4" />
                                {tab.label}
                                {isActive && <span className="absolute bottom-0 inset-x-1 h-0.5 rounded-full bg-foreground" />}
                            </button>
                        )
                    })}
                </nav>
            </header>

            {/* Main Content Area — scrolls independently, tabs stay fixed */}
            <main className="flex-1 min-h-0 overflow-y-auto bg-background custom-scrollbar relative">
                <div>
                    {activeTab === 'stats' && <AdminStatsTab />}
                    {activeTab === 'users' && <AdminUsersTab />}
                    {activeTab === 'configs' && <AdminConfigTab />}
                    {activeTab === 'broadcast' && <AdminBroadcastTab />}
                    {activeTab === 'moderation' && <AdminModerationTab />}
                    {activeTab === 'security' && <AdminSecurityTab />}
                </div>
            </main>
        </div>
    )
}
