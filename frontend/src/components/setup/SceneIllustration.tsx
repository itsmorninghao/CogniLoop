/**
 * Per-step abstract scene illustrations using inline SVG + CSS animations.
 * No external images, supports dark mode via currentColor and opacity.
 */

interface SceneProps {
    success?: boolean
    waiting?: boolean
}

/* Step 1: Key unlocking a planet */
export function Step1Scene({ success }: SceneProps) {
    return (
        <svg viewBox="0 0 200 180" className="w-full max-w-[240px]" aria-hidden>
            <defs>
                <radialGradient id="planet-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={success ? '0.4' : '0.15'} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </radialGradient>
                <style>{`
                    @media (prefers-reduced-motion: no-preference) {
                        .key-rotate { animation: key-float 3s ease-in-out infinite; }
                        .planet-pulse { animation: planet-glow-pulse 2s ease-in-out infinite; }
                        .circuit-line { animation: circuit-appear 0.6s ease-out forwards; }
                        .ring-expand { animation: ring-out 0.8s ease-out forwards; }
                    }
                    @keyframes key-float {
                        0%, 100% { transform: translate(58px, 90px) rotate(-20deg); }
                        50% { transform: translate(62px, 85px) rotate(-15deg); }
                    }
                    @keyframes planet-glow-pulse {
                        0%, 100% { opacity: 0.6; }
                        50% { opacity: 1; }
                    }
                    @keyframes circuit-appear {
                        from { stroke-dashoffset: 60; opacity: 0; }
                        to { stroke-dashoffset: 0; opacity: 0.7; }
                    }
                    @keyframes ring-out {
                        from { r: 34; opacity: 0.6; }
                        to { r: 55; opacity: 0; }
                    }
                `}</style>
            </defs>

            {/* Planet */}
            <circle cx="130" cy="90" r="34" fill="url(#planet-glow)" className="planet-pulse" />
            <circle cx="130" cy="90" r="34" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeOpacity="0.5" />
            <ellipse cx="130" cy="90" rx="34" ry="10" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeOpacity="0.3" />

            {success && (
                <>
                    <circle cx="130" cy="90" r="34" fill="none" stroke="#6366f1" strokeWidth="1.5" className="ring-expand" />
                    {/* Circuit lines */}
                    <line x1="130" y1="56" x2="130" y2="46" stroke="#6366f1" strokeWidth="1" strokeDasharray="60" className="circuit-line" style={{ animationDelay: '0.1s' }} />
                    <line x1="155" y1="72" x2="165" y2="66" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="60" className="circuit-line" style={{ animationDelay: '0.2s' }} />
                    <line x1="155" y1="108" x2="165" y2="114" stroke="#a78bfa" strokeWidth="1" strokeDasharray="60" className="circuit-line" style={{ animationDelay: '0.3s' }} />
                </>
            )}

            {/* Key */}
            <g className="key-rotate">
                <circle cx="0" cy="0" r="8" fill="none" stroke="#f59e0b" strokeWidth="2" transform="translate(68,90)" />
                <line x1="76" y1="90" x2="96" y2="90" stroke="#f59e0b" strokeWidth="2" />
                <line x1="91" y1="90" x2="91" y2="95" stroke="#f59e0b" strokeWidth="2" />
                <line x1="96" y1="90" x2="96" y2="95" stroke="#f59e0b" strokeWidth="2" />
            </g>

            {/* Stars */}
            {[[40, 40], [170, 30], [50, 140], [165, 150], [100, 25]].map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r="1.5" fill="#6366f1" fillOpacity="0.4" />
            ))}
        </svg>
    )
}

/* Step 2: Neural network activating */
export function Step2Scene({ success, waiting }: SceneProps) {
    const nodes = [
        { cx: 100, cy: 90, r: 12, main: true },
        { cx: 60, cy: 55, r: 7 },
        { cx: 145, cy: 55, r: 7 },
        { cx: 55, cy: 95, r: 7 },
        { cx: 145, cy: 125, r: 7 },
        { cx: 75, cy: 135, r: 7 },
        { cx: 130, cy: 90, r: 5 },
    ]

    const edges = [
        [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 2], [3, 5],
    ]

    return (
        <svg viewBox="0 0 200 180" className="w-full max-w-[240px]" aria-hidden>
            <defs>
                <style>{`
                    @media (prefers-reduced-motion: no-preference) {
                        .node-pulse { animation: node-blink ${waiting ? '0.6s' : '2s'} ease-in-out infinite; }
                        .edge-flow { animation: edge-pulse 1.8s ease-in-out infinite; }
                        .node-light { animation: node-appear 0.4s ease-out forwards; }
                    }
                    @keyframes node-blink {
                        0%, 100% { opacity: 0.4; }
                        50% { opacity: 1; }
                    }
                    @keyframes edge-pulse {
                        0%, 100% { stroke-opacity: 0.15; }
                        50% { stroke-opacity: 0.5; }
                    }
                    @keyframes node-appear {
                        from { opacity: 0; r: 3; }
                        to { opacity: 1; }
                    }
                `}</style>
            </defs>

            {edges.map(([a, b], i) => (
                <line
                    key={i}
                    x1={nodes[a].cx} y1={nodes[a].cy}
                    x2={nodes[b].cx} y2={nodes[b].cy}
                    stroke={success ? '#6366f1' : '#8b5cf6'}
                    strokeWidth="1.5"
                    className="edge-flow"
                    style={{ animationDelay: `${i * 0.15}s` }}
                />
            ))}

            {nodes.map((n, i) => (
                <circle
                    key={i}
                    cx={n.cx}
                    cy={n.cy}
                    r={n.r ?? 7}
                    fill={success ? '#6366f1' : (n.main ? '#8b5cf6' : 'none')}
                    stroke={n.main ? '#6366f1' : '#8b5cf6'}
                    strokeWidth="1.5"
                    fillOpacity={success ? '0.8' : (n.main ? '0.3' : '0')}
                    className={n.main ? 'node-pulse' : 'node-pulse'}
                    style={{ animationDelay: `${i * 0.2}s` }}
                />
            ))}

            {/* Center brain icon hint */}
            <text x="100" y="94" textAnchor="middle" fontSize="10" fill="#6366f1" fillOpacity="0.7">✦</text>
        </svg>
    )
}

/* Step 3: Document → vector grid */
export function Step3Scene({ success }: SceneProps) {
    const dots = Array.from({ length: 18 }, (_, i) => ({
        x: 115 + (i % 6) * 12,
        y: 65 + Math.floor(i / 6) * 12,
    }))

    return (
        <svg viewBox="0 0 200 180" className="w-full max-w-[240px]" aria-hidden>
            <defs>
                <style>{`
                    @media (prefers-reduced-motion: no-preference) {
                        .doc-float { animation: doc-hover 3s ease-in-out infinite; }
                        .dot-appear { animation: dot-in 0.5s ease-out forwards; }
                        .dot-glow { animation: dot-pulse 2s ease-in-out infinite; }
                    }
                    @keyframes doc-hover {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-4px); }
                    }
                    @keyframes dot-in {
                        from { opacity: 0; transform: scale(0); }
                        to { opacity: var(--dot-opacity); transform: scale(1); }
                    }
                    @keyframes dot-pulse {
                        0%, 100% { opacity: 0.4; }
                        50% { opacity: 0.9; }
                    }
                `}</style>
            </defs>

            {/* Document */}
            <g className="doc-float">
                <rect x="35" y="55" width="55" height="70" rx="4" fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeOpacity="0.6" />
                <line x1="45" y1="72" x2="78" y2="72" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.4" />
                <line x1="45" y1="82" x2="78" y2="82" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.4" />
                <line x1="45" y1="92" x2="70" y2="92" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.3" />
                <line x1="45" y1="102" x2="75" y2="102" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.3" />
            </g>

            {/* Arrow */}
            <path d="M95 90 L110 90" stroke="#6366f1" strokeWidth="1.5" strokeOpacity="0.5" markerEnd="url(#arr)" />
            <defs>
                <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#6366f1" fillOpacity="0.5" />
                </marker>
            </defs>

            {/* Vector dots */}
            {dots.map((d, i) => (
                <circle
                    key={i}
                    cx={d.x} cy={d.y} r="4"
                    fill={success ? '#6366f1' : '#8b5cf6'}
                    style={{
                        '--dot-opacity': success ? '0.8' : '0.5',
                        animationDelay: `${i * 0.05}s`,
                    } as React.CSSProperties}
                    className={success ? 'dot-appear' : 'dot-glow'}
                    fillOpacity={success ? undefined : '0.5'}
                />
            ))}
        </svg>
    )
}

/* Step 4: Paper → structured text */
export function Step4Scene({ success }: SceneProps) {
    return (
        <svg viewBox="0 0 200 180" className="w-full max-w-[240px]" aria-hidden>
            <defs>
                <style>{`
                    @media (prefers-reduced-motion: no-preference) {
                        .paper-spin { animation: paper-rotate 8s linear infinite; }
                        .text-fly { animation: text-float 3s ease-in-out infinite; }
                        .list-slide { animation: list-in 0.5s ease-out forwards; }
                    }
                    @keyframes paper-rotate {
                        0%, 100% { transform-origin: 70px 90px; transform: rotate(-3deg); }
                        50% { transform-origin: 70px 90px; transform: rotate(3deg); }
                    }
                    @keyframes text-float {
                        0%, 100% { transform: translateY(0) translateX(0); opacity: 0.5; }
                        50% { transform: translateY(-6px) translateX(2px); opacity: 0.8; }
                    }
                    @keyframes list-in {
                        from { opacity: 0; transform: translateX(10px); }
                        to { opacity: 0.8; transform: translateX(0); }
                    }
                `}</style>
            </defs>

            {/* Paper */}
            <g className="paper-spin">
                <rect x="30" y="50" width="80" height="90" rx="4" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.5" />
                <text x="50" y="78" fontSize="9" fill="#f59e0b" fillOpacity="0.5" className="text-fly">A文b字</text>
                <text x="45" y="95" fontSize="9" fill="#f59e0b" fillOpacity="0.4" className="text-fly" style={{ animationDelay: '0.5s' }}>c 字 d</text>
                <text x="52" y="112" fontSize="9" fill="#f59e0b" fillOpacity="0.3" className="text-fly" style={{ animationDelay: '1s' }}>e 文 f</text>
            </g>

            {/* Arrow */}
            <path d="M115 90 L130 90" stroke="#6366f1" strokeWidth="1.5" strokeOpacity="0.5" />
            <polygon points="130,86 137,90 130,94" fill="#6366f1" fillOpacity="0.5" />

            {/* Structured list */}
            <g style={{ opacity: success ? 1 : undefined }}>
                {[0, 1, 2, 3].map(i => (
                    <g key={i} className="list-slide" style={{ animationDelay: `${i * 0.1}s` }}>
                        <rect x="140" y={65 + i * 22} width="35" height="14" rx="2" fill="none" stroke="#6366f1" strokeWidth="1" strokeOpacity="0.5" />
                        <line x1="146" y1={72 + i * 22} x2="168" y2={72 + i * 22} stroke="#6366f1" strokeWidth="1" strokeOpacity="0.4" />
                    </g>
                ))}
            </g>
        </svg>
    )
}

/* Step 5: Rocket launch */
export function Step5Scene() {
    return (
        <svg viewBox="0 0 200 200" className="w-full max-w-[240px]" aria-hidden>
            <defs>
                <linearGradient id="rocket-trail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
                </linearGradient>
                <style>{`
                    @media (prefers-reduced-motion: no-preference) {
                        .rocket-rise { animation: rocket-up 2.5s ease-out forwards; }
                        .trail-fade { animation: trail-grow 2.5s ease-out forwards; }
                        .icon-appear { animation: icon-in 0.4s ease-out forwards; }
                    }
                    @keyframes rocket-up {
                        0% { transform: translateY(40px); opacity: 0; }
                        20% { opacity: 1; }
                        100% { transform: translateY(-20px); opacity: 1; }
                    }
                    @keyframes trail-grow {
                        0% { height: 0; opacity: 0; }
                        100% { height: 60px; opacity: 1; }
                    }
                    @keyframes icon-in {
                        from { opacity: 0; transform: scale(0.5); }
                        to { opacity: 1; transform: scale(1); }
                    }
                `}</style>
            </defs>

            {/* Trail */}
            <rect x="98" y="110" width="4" height="60" rx="2" fill="url(#rocket-trail)" className="trail-fade" />

            {/* Rocket body */}
            <g className="rocket-rise">
                <ellipse cx="100" cy="95" rx="10" ry="16" fill="#6366f1" fillOpacity="0.9" />
                <polygon points="100,74 92,90 108,90" fill="#8b5cf6" fillOpacity="0.9" />
                <polygon points="90,100 85,115 95,108" fill="#ec4899" fillOpacity="0.7" />
                <polygon points="110,100 115,115 105,108" fill="#ec4899" fillOpacity="0.7" />
                <circle cx="100" cy="94" r="4" fill="white" fillOpacity="0.3" />
            </g>

            {/* Base icons */}
            {[
                { x: 55, y: 155, label: '🌐', delay: '1.2s' },
                { x: 80, y: 160, label: '✨', delay: '1.4s' },
                { x: 107, y: 163, label: '🧠', delay: '1.6s' },
                { x: 133, y: 157, label: '📋', delay: '1.8s' },
            ].map(({ x, y, label, delay }, i) => (
                <text key={i} x={x} y={y} fontSize="14" className="icon-appear" style={{ animationDelay: delay, opacity: 0 }}>
                    {label}
                </text>
            ))}
        </svg>
    )
}
