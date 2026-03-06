interface Props {
    rank: number
}

export function RankBadge({ rank }: Props) {
    if (rank === 1) return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">1</span>
    )
    if (rank === 2) return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">2</span>
    )
    if (rank === 3) return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">3</span>
    )
    return <span className="text-sm text-muted-foreground font-mono">{rank}</span>
}
