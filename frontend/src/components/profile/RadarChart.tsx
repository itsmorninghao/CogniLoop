const QT_LABELS: Record<string, string> = {
    single_choice: '单选题',
    multiple_choice: '多选题',
    fill_blank: '填空题',
    short_answer: '简答题',
    true_false: '判断题',
}

interface Props {
    data: Record<string, { accuracy: number; count: number }>
}

export function RadarChart({ data }: Props) {
    const keys = Object.keys(data)
    const n = keys.length
    const cx = 120, cy = 120, r = 90
    const angleStep = (2 * Math.PI) / n

    const pointAt = (i: number, scale: number) => {
        const angle = -Math.PI / 2 + i * angleStep
        return {
            x: cx + r * scale * Math.cos(angle),
            y: cy + r * scale * Math.sin(angle),
        }
    }

    const gridLevels = [0.25, 0.5, 0.75, 1.0]

    const dataPoints = keys.map((k, i) => pointAt(i, data[k].accuracy))
    const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z'

    return (
        <svg width={240} height={240} viewBox="0 0 240 240" className="drop-shadow-sm">
            {gridLevels.map((level) => {
                const pts = Array.from({ length: n }, (_, i) => pointAt(i, level))
                const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z'
                return <path key={level} d={path} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={1} />
            })}

            {keys.map((_, i) => {
                const p = pointAt(i, 1)
                return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="currentColor" strokeOpacity={0.1} strokeWidth={1} />
            })}

            <path d={dataPath} fill="rgba(124, 58, 237, 0.15)" stroke="rgb(124, 58, 237)" strokeWidth={2} />

            {keys.map((k, i) => {
                const dp = pointAt(i, data[k].accuracy)
                const lp = pointAt(i, 1.2)
                return (
                    <g key={k}>
                        <circle cx={dp.x} cy={dp.y} r={4} fill="rgb(124, 58, 237)" />
                        <text
                            x={lp.x}
                            y={lp.y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={11}
                            fill="currentColor"
                            opacity={0.6}
                        >
                            {QT_LABELS[k] || k}
                        </text>
                    </g>
                )
            })}
        </svg>
    )
}
