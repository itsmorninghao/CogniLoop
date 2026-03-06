import { Link } from 'react-router'
import { CheckCircle2 } from 'lucide-react'
import type { CircleQuizSessionItem } from '@/lib/api'

interface Props {
    session: CircleQuizSessionItem
}

export function ActivityCard({ session }: Props) {
    const userParticipated = session.current_user_status != null
    const topAccuracy = session.accuracy != null ? (session.accuracy * 100).toFixed(1) : null

    return (
        <Link
            to={`/quiz/${session.id}/result`}
            className="flex items-center gap-4 rounded-xl border border-border p-4 hover:bg-muted/30 hover:shadow-sm transition-all duration-200"
        >
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-600 shrink-0">
                <CheckCircle2 className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                    {session.title || `${session.creator_full_name} 的练习`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                    @{session.creator_username} · {session.participant_count} 人参与
                    {userParticipated && <span className="ml-1 text-indigo-500">· 已参与</span>}
                </p>
            </div>
            <div className="text-right shrink-0">
                {topAccuracy && (
                    <p className={`text-sm font-mono font-semibold ${
                        parseFloat(topAccuracy) >= 80 ? 'text-emerald-600' : parseFloat(topAccuracy) >= 60 ? 'text-amber-600' : 'text-rose-500'
                    }`}>
                        {topAccuracy}%
                    </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(session.created_at).toLocaleDateString('zh-CN')}
                </p>
            </div>
        </Link>
    )
}
