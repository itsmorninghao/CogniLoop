import type { CircleSessionParticipantItem } from '@/lib/api'
import { RankBadge } from './RankBadge'

interface Props {
    participants: CircleSessionParticipantItem[]
    currentUserId?: number
}

export function SessionLeaderboard({ participants, currentUserId }: Props) {
    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="border-b border-border bg-muted/30">
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">排名</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">成员</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">正确率</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">得分</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-border">
                {participants.map((p, idx) => {
                    const isMe = p.user_id === currentUserId
                    const completed = p.status === 'completed'
                    return (
                        <tr key={p.user_id} className={`transition-colors ${isMe ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                            <td className="px-5 py-3.5">
                                <RankBadge rank={idx + 1} />
                            </td>
                            <td className="px-5 py-3.5">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
                                        {p.full_name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className={`text-sm font-medium ${isMe ? 'text-primary' : 'text-foreground'}`}>
                                            {p.full_name}{isMe && <span className="ml-1 text-xs text-muted-foreground">(你)</span>}
                                        </p>
                                        <p className="text-xs text-muted-foreground">@{p.username}</p>
                                    </div>
                                </div>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                                {completed && p.accuracy != null ? (
                                    <span className={`font-mono font-semibold text-sm ${
                                        p.accuracy >= 0.8 ? 'text-emerald-600' : p.accuracy >= 0.6 ? 'text-amber-600' : 'text-rose-500'
                                    }`}>
                                        {(p.accuracy * 100).toFixed(0)}%
                                    </span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">批改中</span>
                                )}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                                {completed && p.total_score != null ? (
                                    <span className="font-mono font-bold text-sm text-foreground">{p.total_score.toFixed(1)}</span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                )}
                            </td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    )
}
