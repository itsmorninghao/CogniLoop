interface Props {
    trajectory: { date: string; accuracy: number }[]
    opacityRange?: [number, number]
}

export function TrajectoryBar({ trajectory, opacityRange = [0.6, 1.0] }: Props) {
    const [minO, maxO] = opacityRange
    return (
        <div className="flex items-end gap-1 h-28">
            {trajectory.map((t, i) => (
                <div
                    key={i}
                    className="group relative flex-1 rounded-t transition-all cursor-default"
                    style={{
                        height: `${Math.max(t.accuracy * 100, 5)}%`,
                        backgroundColor: t.accuracy >= 0.8 ? '#10b981' : t.accuracy >= 0.6 ? '#f59e0b' : '#ef4444',
                        opacity: minO + (i / trajectory.length) * (maxO - minO),
                    }}
                >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                        {(t.accuracy * 100).toFixed(0)}%
                    </div>
                </div>
            ))}
        </div>
    )
}
