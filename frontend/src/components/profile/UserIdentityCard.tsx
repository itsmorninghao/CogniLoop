import { Calendar, BookOpen, BookMarked, Users } from 'lucide-react'
import type { UserProfile } from '@/lib/api'

interface Props {
    profile: UserProfile
    /** Pass auth store user to reflect real-time name/avatar edits on own profile page. */
    authUser?: { username: string; full_name: string; avatar_url: string | null } | null
}

export function UserIdentityCard({ profile, authUser }: Props) {
    const displayName = authUser?.full_name ?? profile.full_name ?? profile.username
    const displayUsername = authUser?.username ?? profile.username
    const avatarUrl = authUser?.avatar_url ?? profile.avatar_url
    const learningDays = profile.learning_trajectory?.length ?? 0

    return (
        <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-start gap-5">
                {/* Avatar */}
                <div className="shrink-0">
                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt={displayName}
                            className="size-16 rounded-2xl object-cover ring-2 ring-border"
                        />
                    ) : (
                        <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 ring-2 ring-border">
                            <span className="text-2xl font-medium text-primary">
                                {displayName.charAt(0).toUpperCase()}
                            </span>
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1 space-y-3">
                    {/* Name & username */}
                    <div>
                        <h2 className="text-lg font-medium leading-tight text-foreground">
                            {displayName}
                        </h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">@{displayUsername}</p>
                    </div>

                    {/* Badges row */}
                    <div className="flex flex-wrap gap-2">
                        {profile.joined_at && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                                <Calendar className="size-3.5 shrink-0 text-primary/60" />
                                加入于 {profile.joined_at}
                            </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <BookOpen className="size-3.5 shrink-0" />
                            累计学习 {learningDays} 天
                        </span>
                    </div>

                    {/* Stats row */}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-3">
                        <Stat value={profile.total_questions_answered} label="已做题目" icon={<BookMarked className="size-3.5 text-indigo-500" />} />
                        <Stat value={profile.total_quizzes_created} label="已出/获题" icon={<BookOpen className="size-3.5 text-amber-500" />} />
                        <Stat value={profile.circles_count} label="学习圈" icon={<Users className="size-3.5 text-sky-500" />} />
                    </div>
                </div>
            </div>
        </div>
    )
}

function Stat({ value, label, icon }: { value: number; label: string; icon: React.ReactNode }) {
    return (
        <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-sm font-medium text-foreground">{value.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
        </div>
    )
}
