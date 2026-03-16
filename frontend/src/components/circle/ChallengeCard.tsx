import { Link } from 'react-router'
import { Zap, Trophy, ChevronRight, Clock } from 'lucide-react'
import type { CircleQuizSessionItem } from '@/lib/api'

interface Props {
    session: CircleQuizSessionItem
    circleId: number
    onViewRanking: (sessionId: string) => void
}

export function ChallengeCard({ session, circleId, onViewRanking }: Props) {
    const hasParticipated = session.current_user_status != null

    return (
        <div className="flex items-center gap-4 rounded-xl border border-border p-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 shrink-0">
                <Zap className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                    {session.title || `${session.creator_full_name} 发起的挑战`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <Clock className="size-3" />
                    {new Date(session.created_at).toLocaleDateString('zh-CN')}
                    {session.participant_count > 0 && (
                        <span>· 已有 {session.participant_count} 人参与</span>
                    )}
                </p>
            </div>
            {hasParticipated ? (
                <div className="flex gap-2 shrink-0">
                    <button
                        onClick={() => onViewRanking(session.id)}
                        className="flex items-center gap-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition"
                    >
                        <Trophy className="size-3" /> 查看排名
                    </button>
                    <Link
                        to={`/quiz/${session.id}`}
                        state={{ fromCircle: circleId }}
                        className="flex items-center gap-1 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition"
                    >
                        查看试卷 <ChevronRight className="size-3" />
                    </Link>
                </div>
            ) : (
                <Link
                    to={`/quiz/${session.id}`}
                    state={{ fromCircle: circleId }}
                    className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:scale-105 active:scale-95 transition shrink-0"
                >
                    参加 <ChevronRight className="size-3" />
                </Link>
            )}
        </div>
    )
}
