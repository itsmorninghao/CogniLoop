import { Loader2 } from 'lucide-react'

const CONFIG: Record<string, { label: string; cls: string; spin?: boolean }> = {
    generating:  { label: '生成中', cls: 'bg-amber-500/10 text-amber-600',   spin: true },
    ready:       { label: '待作答', cls: 'bg-indigo-500/10 text-indigo-600' },
    in_progress: { label: '进行中', cls: 'bg-indigo-500/10 text-indigo-600' },
    grading:     { label: '批改中', cls: 'bg-purple-500/10 text-purple-600', spin: true },
    graded:      { label: '已完成', cls: 'bg-emerald-500/10 text-emerald-600' },
    error:       { label: '出错',   cls: 'bg-destructive/10 text-destructive' },
}

export function QuizStatusBadge({ status }: { status: string }) {
    const c = CONFIG[status]
    if (!c) return <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{status}</span>
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${c.cls}`}>
            {c.spin && <Loader2 className="size-3 animate-spin" />}
            {c.label}
        </span>
    )
}
