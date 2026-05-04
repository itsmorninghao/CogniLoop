import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type {
  RenderScene,
  RenderSceneBeat,
  RenderSceneObject,
  SlideData,
  ThemeConfig,
} from "../types";

interface RenderSceneSlideProps {
  slide: SlideData;
  scene: RenderScene;
  theme: ThemeConfig;
  slideIndex: number;
  totalSlides: number;
}

const W = 1920;
const H = 1080;
const SAFE_X = 112;
const SAFE_Y = 76;
const SAFE_W = W - SAFE_X * 2;
const SAFE_H = H - SAFE_Y * 2;
const COLORS = ["#6d7cff", "#19c7d4", "#ffb020", "#35d399", "#ff5ca8"];

export const RenderSceneSlide: React.FC<RenderSceneSlideProps> = ({
  slide,
  scene,
  theme,
  slideIndex,
  totalSlides,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = Math.max(1, Math.ceil((slide.duration_ms / 1000) * fps));
  const beats = normalizeBeats(scene.beats, scene);
  const accent = scene.accent || theme.primary;
  const progress = clamp(frame / Math.max(1, totalFrames - 1), 0, 1);
  const activeBeat = Math.min(beats.length - 1, Math.floor(progress * beats.length));
  const intro = spring({ frame, fps, config: { damping: 24, stiffness: 115, mass: 0.9 } });

  return (
    <AbsoluteFill
      style={{
        background: theme.name === "clean-bright"
          ? "linear-gradient(135deg, #fbfcff 0%, #eef3ff 45%, #f8fafc 100%)"
          : "linear-gradient(135deg, #070b14 0%, #0e1424 52%, #0a0c12 100%)",
        color: theme.textPrimary,
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        overflow: "hidden",
      }}
    >
      <SceneBackground theme={theme} accent={accent} progress={progress} />
      <div
        style={{
          position: "absolute",
          left: SAFE_X,
          top: SAFE_Y,
          width: SAFE_W,
          height: SAFE_H,
          transform: `translateY(${(1 - intro) * 18}px)`,
          opacity: intro,
        }}
      >
        <SceneHeader
          scene={scene}
          theme={theme}
          accent={accent}
          slideIndex={slideIndex}
          totalSlides={totalSlides}
        />
        <div style={{ position: "absolute", left: 0, top: 172, width: SAFE_W, height: 704 }}>
          {renderLayout(scene, beats, theme, accent, frame, fps, totalFrames, activeBeat)}
        </div>
        <BeatRail
          beats={beats}
          theme={theme}
          accent={accent}
          frame={frame}
          fps={fps}
          totalFrames={totalFrames}
          activeBeat={activeBeat}
        />
      </div>
    </AbsoluteFill>
  );
};

function renderLayout(
  scene: RenderScene,
  beats: RenderSceneBeat[],
  theme: ThemeConfig,
  accent: string,
  frame: number,
  fps: number,
  totalFrames: number,
  activeBeat: number,
): React.ReactNode {
  switch (scene.layout) {
    case "hook_focus":
      return <HookFocus scene={scene} beats={beats} theme={theme} accent={accent} frame={frame} fps={fps} totalFrames={totalFrames} activeBeat={activeBeat} />;
    case "mechanism_map":
      return <MechanismMap scene={scene} beats={beats} theme={theme} accent={accent} frame={frame} fps={fps} totalFrames={totalFrames} activeBeat={activeBeat} />;
    case "contrast_lanes":
      return <ContrastLanes scene={scene} beats={beats} theme={theme} accent={accent} frame={frame} fps={fps} totalFrames={totalFrames} activeBeat={activeBeat} />;
    case "evidence_scan":
      return <EvidenceScan scene={scene} beats={beats} theme={theme} accent={accent} frame={frame} fps={fps} totalFrames={totalFrames} activeBeat={activeBeat} />;
    case "process_path":
      return <ProcessPath scene={scene} beats={beats} theme={theme} accent={accent} frame={frame} fps={fps} totalFrames={totalFrames} activeBeat={activeBeat} />;
    case "metric_panel":
      return <MetricPanel scene={scene} beats={beats} theme={theme} accent={accent} frame={frame} fps={fps} totalFrames={totalFrames} activeBeat={activeBeat} />;
    case "bridge_map":
      return <BridgeMap scene={scene} beats={beats} theme={theme} accent={accent} frame={frame} fps={fps} totalFrames={totalFrames} activeBeat={activeBeat} />;
    case "recap_grid":
      return <RecapGrid scene={scene} beats={beats} theme={theme} accent={accent} frame={frame} fps={fps} totalFrames={totalFrames} activeBeat={activeBeat} />;
    case "system_map":
    default:
      return <SystemMap scene={scene} beats={beats} theme={theme} accent={accent} frame={frame} fps={fps} totalFrames={totalFrames} activeBeat={activeBeat} />;
  }
}

function SceneBackground({ theme, accent, progress }: { theme: ThemeConfig; accent: string; progress: number }) {
  const lineColor = theme.name === "clean-bright" ? "rgba(30, 41, 59, 0.07)" : "rgba(255,255,255,0.055)";
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(${lineColor} 1px, transparent 1px),
            linear-gradient(90deg, ${lineColor} 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
          transform: `translateX(${-progress * 32}px) translateY(${-progress * 18}px)`,
          opacity: 0.7,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -160,
          top: 110,
          width: 2260,
          height: 220,
          transform: `rotate(-9deg) translateX(${progress * 78}px)`,
          background: `linear-gradient(90deg, transparent, ${alpha(accent, 0.12)}, transparent)`,
          filter: "blur(1px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          height: 180,
          background:
            theme.name === "clean-bright"
              ? "linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,255,255,0))"
              : "linear-gradient(180deg, rgba(4,7,14,0.88), rgba(4,7,14,0))",
        }}
      />
    </>
  );
}

function SceneHeader({
  scene,
  theme,
  accent,
  slideIndex,
  totalSlides,
}: {
  scene: RenderScene;
  theme: ThemeConfig;
  accent: string;
  slideIndex: number;
  totalSlides: number;
}) {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: SAFE_W, height: 138 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 14 }}>
        <div
          style={{
            width: 64,
            height: 6,
            borderRadius: 999,
            background: accent,
            boxShadow: `0 0 24px ${alpha(accent, 0.55)}`,
          }}
        />
        <div
          style={{
            fontSize: 24,
            letterSpacing: 0,
            color: theme.textSecondary,
            fontWeight: 700,
          }}
        >
          {formatSceneType(scene.scene_type)}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 22, color: theme.textMuted, fontWeight: 700 }}>
          {String(slideIndex + 1).padStart(2, "0")} / {String(totalSlides).padStart(2, "0")}
        </div>
      </div>
      <div
        style={{
          fontSize: fitFont(scene.title, 72, 42),
          lineHeight: 1.04,
          fontWeight: 880,
          maxWidth: 1480,
          letterSpacing: 0,
          ...clampLines(1),
        }}
      >
        {scene.title}
      </div>
      {scene.subtitle && (
        <div
          style={{
            marginTop: 12,
            fontSize: fitFont(scene.subtitle, 30, 22),
            lineHeight: 1.25,
            color: theme.textSecondary,
          maxWidth: 1260,
          ...clampLines(2),
          }}
        >
          {scene.subtitle}
        </div>
      )}
    </div>
  );
}

function BeatRail({
  beats,
  theme,
  accent,
  frame,
  fps,
  totalFrames,
  activeBeat,
}: {
  beats: RenderSceneBeat[];
  theme: ThemeConfig;
  accent: string;
  frame: number;
  fps: number;
  totalFrames: number;
  activeBeat: number;
}) {
  return (
    <div style={{ position: "absolute", left: 0, bottom: 0, width: SAFE_W, height: 112 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 22,
          width: SAFE_W,
          height: 1,
          background: theme.cardBorder,
        }}
      />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${beats.length}, 1fr)`, gap: 16 }}>
        {beats.map((beat, index) => {
          const p = reveal(frame, totalFrames, index, beats.length);
          const active = index <= activeBeat;
          return (
            <div
              key={`${beat.label}-${index}`}
              style={{
                opacity: 0.28 + p * 0.72,
                transform: `translateY(${(1 - p) * 18}px)`,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  background: active ? accent : "transparent",
                  border: `2px solid ${active ? accent : theme.cardBorder}`,
                  boxShadow: active ? `0 0 20px ${alpha(accent, 0.5)}` : "none",
                  marginBottom: 14,
                }}
              />
              <div
                style={{
                  fontSize: 26,
                  lineHeight: 1.1,
                  color: active ? theme.textPrimary : theme.textSecondary,
                  fontWeight: active ? 850 : 650,
                  ...clampLines(1),
                }}
              >
                {beat.label || beat.emphasis || `Beat ${index + 1}`}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 18,
                  lineHeight: 1.25,
                  color: theme.textMuted,
                  ...clampLines(2),
                }}
              >
                {beat.intent}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HookFocus(props: LayoutProps) {
  const { scene, beats, theme, accent, frame, fps, totalFrames, activeBeat } = props;
  const keywords = mergeLabels(
    beats.map((beat) => beat.label || beat.emphasis || ""),
    scene.keywords || [],
  );
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", left: 8, top: 46, width: 560 }}>
        <InfoBlock title="核心问题" body={scene.intent || scene.title} theme={theme} accent={accent} frame={frame} fps={fps} delay={0} />
        {scene.metaphor && (
          <InfoBlock title="视觉隐喻" body={scene.metaphor} theme={theme} accent={COLORS[2]} frame={frame} fps={fps} delay={0.8} top={244} />
        )}
      </div>
      <div style={{ position: "absolute", left: 650, top: 4, width: 900, height: 612 }}>
        <MetaphorStage
          scene={scene}
          labels={keywords.slice(0, 5)}
          theme={theme}
          accent={accent}
          frame={frame}
          fps={fps}
          totalFrames={totalFrames}
          activeBeat={activeBeat}
        />
      </div>
    </div>
  );
}

function MechanismMap(props: LayoutProps) {
  const { beats, theme, accent, frame, fps, totalFrames, activeBeat } = props;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", left: 68, top: 38, width: 590, height: 548 }}>
        {beats.map((beat, index) => {
          const p = reveal(frame, totalFrames, index, beats.length);
          return (
            <LayerCard
              key={index}
              beat={beat}
              index={index}
              progress={p}
              active={index <= activeBeat}
              theme={theme}
              accent={COLORS[index % COLORS.length]}
            />
          );
        })}
      </div>
      <svg style={{ position: "absolute", left: 660, top: 30, width: 880, height: 574 }}>
        {beats.slice(0, -1).map((_, index) => {
          const p = reveal(frame, totalFrames, index + 1, beats.length);
          const y1 = 126 + index * 92;
          const y2 = 126 + (index + 1) * 92;
          return (
            <path
              key={index}
              d={`M120 ${y1} C300 ${y1}, 280 ${y2}, 460 ${y2}`}
              fill="none"
              stroke={COLORS[(index + 1) % COLORS.length]}
              strokeWidth={5}
              strokeDasharray="580"
              strokeDashoffset={580 * (1 - p)}
              strokeLinecap="round"
              opacity={0.9}
            />
          );
        })}
        {beats.map((beat, index) => {
          const p = reveal(frame, totalFrames, index, beats.length);
          const x = index % 2 === 0 ? 120 : 460;
          const y = 126 + index * 92;
          return (
            <g key={index} opacity={p} transform={`translate(${x} ${y}) scale(${0.92 + p * 0.08})`}>
              <rect x="-102" y="-42" width="204" height="84" rx="24" fill={panelFill(theme)} stroke={index <= activeBeat ? COLORS[index % COLORS.length] : theme.cardBorder} strokeWidth="2" />
              <text x="0" y="8" textAnchor="middle" fill={theme.textPrimary} fontSize="24" fontWeight="800">
                {shortSvg(beat.label || beat.emphasis || "", 8)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ContrastLanes(props: LayoutProps) {
  const { scene, beats, theme, accent, frame, totalFrames, activeBeat } = props;
  const lanes = laneObjects(scene.objects, beats);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 34, width: "100%", height: "100%", paddingTop: 20 }}>
      {lanes.map((lane, laneIndex) => (
        <div
          key={laneIndex}
          style={{
            position: "relative",
            border: `1px solid ${laneIndex === 1 ? alpha(accent, 0.55) : theme.cardBorder}`,
            background: laneIndex === 1 ? alpha(accent, theme.name === "clean-bright" ? 0.08 : 0.12) : panelFill(theme),
            borderRadius: 28,
            padding: 38,
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: 30, fontWeight: 880, color: laneIndex === 1 ? accent : theme.textSecondary }}>
            {lane.label}
          </div>
          <div style={{ position: "absolute", left: 38, top: 104, right: 38, bottom: 38 }}>
            {(lane.items || []).slice(0, 4).map((item, index) => {
              const p = reveal(frame, totalFrames, index + laneIndex, beats.length + 1);
              const active = laneIndex === 1 && index <= activeBeat;
              return (
                <div
                  key={item}
                  style={{
                    minHeight: 92,
                    marginBottom: 24,
                    borderRadius: 22,
                    border: `1px solid ${active ? accent : theme.cardBorder}`,
                    background: active ? alpha(accent, 0.12) : softPanelFill(theme),
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    padding: "0 26px",
                    transform: `translateX(${(1 - p) * (laneIndex === 0 ? -32 : 32)}px)`,
                    opacity: p,
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 54,
                      borderRadius: 999,
                      background: active ? accent : theme.cardBorder,
                    }}
                  />
                  <div style={{ fontSize: fitFont(item, 27, 19), lineHeight: 1.14, fontWeight: 780, ...clampLines(2) }}>
                    {item}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function EvidenceScan(props: LayoutProps) {
  const { scene, beats, theme, accent, frame, fps, totalFrames, activeBeat } = props;
  const labels = scene.keywords || beats.map((beat) => beat.label || "");
  const scan = interpolate(frame % 96, [0, 48, 96], [0, 1, 0]);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", left: 32, top: 20, width: 850, height: 586 }}>
        {labels.slice(0, 5).map((label, index) => {
          const p = reveal(frame, totalFrames, index, beats.length);
          return (
            <div
              key={index}
              style={{
                position: "absolute",
                left: 50 + (index % 2) * 320,
                top: 18 + index * 88,
                width: 390,
                height: 120,
                borderRadius: 20,
                background: panelFill(theme),
                border: `1px solid ${index <= activeBeat ? alpha(accent, 0.65) : theme.cardBorder}`,
                padding: 22,
                opacity: p,
                transform: `rotate(${index % 2 === 0 ? -2 : 2}deg) translateY(${(1 - p) * 26}px)`,
              }}
            >
              <div style={{ height: 10, width: 92, borderRadius: 999, background: alpha(accent, 0.7), marginBottom: 18 }} />
              <div style={{ fontSize: fitFont(label, 28, 20), fontWeight: 820, ...clampLines(1) }}>{label}</div>
              <div style={{ marginTop: 14, height: 8, width: "72%", borderRadius: 999, background: theme.cardBorder }} />
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            left: 30,
            top: 40 + scan * 410,
            width: 700,
            height: 4,
            borderRadius: 999,
            background: accent,
            boxShadow: `0 0 30px ${alpha(accent, 0.8)}`,
          }}
        />
      </div>
      <div style={{ position: "absolute", right: 46, top: 72, width: 610 }}>
        <ConclusionPanel scene={scene} beats={beats} theme={theme} accent={accent} frame={frame} fps={fps} />
      </div>
    </div>
  );
}

function ProcessPath(props: LayoutProps) {
  const { beats, theme, accent, frame, totalFrames, activeBeat } = props;
  const points = beats.map((_, index) => ({
    x: 150 + index * (1320 / Math.max(1, beats.length - 1)),
    y: 330 + Math.sin(index * 1.2) * 92,
  }));
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <path
          d={pathFromPoints(points)}
          fill="none"
          stroke={theme.cardBorder}
          strokeWidth={16}
          strokeLinecap="round"
        />
        <path
          d={pathFromPoints(points)}
          fill="none"
          stroke={accent}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray="1800"
          strokeDashoffset={1800 * (1 - clamp((activeBeat + 1) / beats.length, 0, 1))}
        />
      </svg>
      {beats.map((beat, index) => {
        const p = reveal(frame, totalFrames, index, beats.length);
        const active = index <= activeBeat;
        const point = points[index];
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: point.x - 132,
              top: point.y - 84,
              width: 264,
              height: 168,
              borderRadius: 28,
              background: solidPanelFill(theme),
              border: `1px solid ${active ? accent : theme.cardBorder}`,
              boxShadow: active ? `0 18px 60px ${alpha(accent, 0.18)}` : "none",
              padding: 24,
              opacity: p,
              transform: `scale(${0.88 + p * 0.12})`,
            }}
          >
            <div style={{ fontSize: 22, color: active ? accent : theme.textMuted, fontWeight: 820 }}>
              步骤 {index + 1}
            </div>
            <div style={{ marginTop: 12, fontSize: fitFont(beat.label || "", 30, 21), fontWeight: 860, ...clampLines(2) }}>
              {beat.label || beat.emphasis}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SystemMap(props: LayoutProps) {
  const { scene, beats, theme, accent, frame, totalFrames, activeBeat } = props;
  const labels = scene.keywords || beats.map((beat) => beat.label || "");
  const center = { x: 820, y: 332 };
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {labels.slice(0, 6).map((_, index) => {
          const p = reveal(frame, totalFrames, index, labels.length);
          const pos = radial(center.x, center.y, 270, index, labels.length);
          return (
            <line
              key={index}
              x1={center.x}
              y1={center.y}
              x2={center.x + (pos.x - center.x) * p}
              y2={center.y + (pos.y - center.y) * p}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.75}
            />
          );
        })}
      </svg>
      <NodeBubble
        x={center.x}
        y={center.y}
        w={340}
        h={170}
        label={scene.title}
        active
        theme={theme}
        accent={accent}
        progress={1}
        large
      />
      {labels.slice(0, 6).map((label, index) => {
        const p = reveal(frame, totalFrames, index, labels.length);
        const pos = radial(center.x, center.y, 270, index, labels.length);
        return (
          <NodeBubble
            key={index}
            x={pos.x}
            y={pos.y}
            w={250}
            h={112}
            label={label}
            active={index <= activeBeat}
            theme={theme}
            accent={COLORS[index % COLORS.length]}
            progress={p}
          />
        );
      })}
    </div>
  );
}

function MetricPanel(props: LayoutProps) {
  const { scene, beats, theme, accent, frame, totalFrames, activeBeat } = props;
  const metrics = metricObjects(scene.objects, scene.keywords || beats.map((beat) => beat.label || ""));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.28fr", gap: 34, width: "100%", height: "100%", paddingTop: 18 }}>
      <div style={{ display: "grid", gridTemplateRows: "repeat(2, 1fr)", gap: 24 }}>
        {metrics.slice(0, 2).map((metric, index) => {
          const p = reveal(frame, totalFrames, index, metrics.length);
          return <MetricCard key={index} object={metric} theme={theme} accent={COLORS[index % COLORS.length]} progress={p} active={index <= activeBeat} />;
        })}
      </div>
      <div
        style={{
          borderRadius: 30,
          border: `1px solid ${theme.cardBorder}`,
          background: panelFill(theme),
          padding: 34,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 860, color: theme.textSecondary, marginBottom: 32 }}>
          趋势观察
        </div>
        <div style={{ position: "absolute", left: 34, right: 34, bottom: 54, height: 388 }}>
          <svg width="100%" height="100%" viewBox="0 0 840 388">
            {[0, 1, 2, 3].map((i) => (
              <line key={i} x1="0" x2="840" y1={70 + i * 78} y2={70 + i * 78} stroke={theme.cardBorder} />
            ))}
            <polyline
              points={metrics.map((metric, index) => `${80 + index * 220},${320 - (metric.value || 50) * 2.6}`).join(" ")}
              fill="none"
              stroke={accent}
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="1300"
              strokeDashoffset={1300 * (1 - clamp((activeBeat + 1) / metrics.length, 0, 1))}
            />
            {metrics.map((metric, index) => {
              const p = reveal(frame, totalFrames, index, metrics.length);
              const x = 80 + index * 220;
              const y = 320 - (metric.value || 50) * 2.6;
              return (
                <g key={index} opacity={p}>
                  <circle cx={x} cy={y} r={18} fill={COLORS[index % COLORS.length]} />
                  <text x={x} y={y - 34} textAnchor="middle" fill={theme.textPrimary} fontSize="22" fontWeight="800">
                    {shortSvg(metric.label, 7)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

function BridgeMap(props: LayoutProps) {
  const { scene, beats, theme, accent, frame, fps, totalFrames, activeBeat } = props;
  const labels = mergeLabels(
    beats.map((beat) => beat.label || beat.emphasis || ""),
    scene.keywords || [],
  );
  const left = labels.slice(0, 2);
  const right = labels.slice(2, 5);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Cluster title="已知经验" labels={left} x={80} y={88} theme={theme} accent={COLORS[1]} frame={frame} fps={fps} />
      <Cluster title="新概念" labels={right} x={1110} y={88} theme={theme} accent={accent} frame={frame} fps={fps} delay={1} />
      <svg style={{ position: "absolute", left: 560, top: 220, width: 560, height: 220 }}>
        <path
          d="M20 110 C160 10, 390 10, 540 110"
          fill="none"
          stroke={accent}
          strokeWidth={10}
          strokeDasharray="760"
          strokeDashoffset={760 * (1 - clamp((activeBeat + 1) / beats.length, 0, 1))}
          strokeLinecap="round"
        />
        <text x="280" y="82" textAnchor="middle" fill={theme.textSecondary} fontSize="28" fontWeight="800">
          类比桥
        </text>
      </svg>
      <div style={{ position: "absolute", left: 628, top: 398, width: 434 }}>
        <InfoBlock title="迁移规则" body={scene.metaphor || scene.intent || scene.title} theme={theme} accent={accent} frame={frame} fps={fps} delay={1.3} />
      </div>
    </div>
  );
}

function RecapGrid(props: LayoutProps) {
  const { scene, beats, theme, accent, frame, fps, totalFrames, activeBeat } = props;
  const labels = (scene.keywords && scene.keywords.length >= beats.length)
    ? scene.keywords
    : beats.map((beat) => beat.label || beat.emphasis || "");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28, width: "100%", height: "100%", paddingTop: 20 }}>
      {labels.slice(0, 6).map((label, index) => {
        const p = reveal(frame, totalFrames, index, labels.length);
        const active = index <= activeBeat;
        return (
          <div
            key={index}
            style={{
              borderRadius: 28,
              border: `1px solid ${active ? COLORS[index % COLORS.length] : theme.cardBorder}`,
              background: active ? alpha(COLORS[index % COLORS.length], 0.13) : panelFill(theme),
              padding: 30,
              opacity: p,
              transform: `translateY(${(1 - p) * 32}px)`,
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 860, color: active ? COLORS[index % COLORS.length] : theme.textMuted }}>
              {String(index + 1).padStart(2, "0")}
            </div>
            <div style={{ marginTop: 56, fontSize: fitFont(label, 38, 24), lineHeight: 1.12, fontWeight: 880, ...clampLines(2) }}>
              {label}
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", right: 54, bottom: 126, width: 470 }}>
        <ConclusionPanel scene={scene} beats={beats} theme={theme} accent={accent} frame={frame} fps={fps} compact />
      </div>
    </div>
  );
}

function InfoBlock({
  title,
  body,
  theme,
  accent,
  frame,
  fps,
  delay,
  top,
}: {
  title: string;
  body: string;
  theme: ThemeConfig;
  accent: string;
  frame: number;
  fps: number;
  delay: number;
  top?: number;
}) {
  const p = revealAt(frame, fps, delay);
  return (
    <div
      style={{
        position: top === undefined ? "relative" : "absolute",
        top,
        width: "100%",
        borderRadius: 28,
        border: `1px solid ${alpha(accent, 0.42)}`,
        background: panelFill(theme),
        padding: "30px 32px",
        opacity: p,
        transform: `translateY(${(1 - p) * 24}px)`,
      }}
    >
      <div style={{ fontSize: 20, color: accent, fontWeight: 850, marginBottom: 14 }}>{title}</div>
      <div style={{ fontSize: fitFont(body, 32, 23), lineHeight: 1.25, fontWeight: 780, ...clampLines(3) }}>{body}</div>
    </div>
  );
}

function MetaphorStage({
  scene,
  labels,
  theme,
  accent,
  frame,
  fps,
  totalFrames,
  activeBeat,
}: {
  scene: RenderScene;
  labels: string[];
  theme: ThemeConfig;
  accent: string;
  frame: number;
  fps: number;
  totalFrames: number;
  activeBeat: number;
}) {
  const kind = scene.visual_kind || "abstract";
  if (kind === "recipe") {
    return (
      <RecipeStage
        labels={labels}
        theme={theme}
        accent={accent}
        frame={frame}
        totalFrames={totalFrames}
        activeBeat={activeBeat}
      />
    );
  }
  if (kind === "classroom") {
    return (
      <ClassroomStage
        labels={labels}
        theme={theme}
        accent={accent}
        frame={frame}
        fps={fps}
        totalFrames={totalFrames}
        activeBeat={activeBeat}
      />
    );
  }
  if (kind === "amplifier") {
    return (
      <AmplifierStage
        labels={labels}
        theme={theme}
        accent={accent}
        frame={frame}
        totalFrames={totalFrames}
        activeBeat={activeBeat}
      />
    );
  }
  if (kind === "filter" || kind === "document") {
    return (
      <DocumentFilterStage
        labels={labels}
        theme={theme}
        accent={accent}
        frame={frame}
        totalFrames={totalFrames}
        activeBeat={activeBeat}
      />
    );
  }
  return (
    <FocusField
      labels={labels}
      theme={theme}
      accent={accent}
      frame={frame}
      fps={fps}
      totalFrames={totalFrames}
      activeBeat={activeBeat}
    />
  );
}

function RecipeStage(props: {
  labels: string[];
  theme: ThemeConfig;
  accent: string;
  frame: number;
  totalFrames: number;
  activeBeat: number;
}) {
  const { labels, theme, accent, frame, totalFrames, activeBeat } = props;
  const ingredients = labels.slice(0, 4);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg width="900" height="612" style={{ position: "absolute", inset: 0 }}>
        <path d="M132 176 C290 112, 408 128, 520 246" stroke={COLORS[1]} strokeWidth="6" fill="none" strokeDasharray="620" strokeDashoffset={620 * (1 - clamp((activeBeat + 1) / Math.max(1, ingredients.length), 0, 1))} strokeLinecap="round" />
        <path d="M172 386 C342 454, 554 442, 704 320" stroke={accent} strokeWidth="6" fill="none" strokeDasharray="720" strokeDashoffset={720 * (1 - clamp((activeBeat + 1) / Math.max(1, ingredients.length), 0, 1))} strokeLinecap="round" />
        <ellipse cx="560" cy="322" rx="210" ry="104" fill={alpha(accent, 0.12)} stroke={alpha(accent, 0.72)} strokeWidth="3" />
        <path d="M372 322 C408 470, 704 470, 748 322" fill={alpha(accent, 0.09)} stroke={alpha(accent, 0.5)} strokeWidth="3" />
        <text x="560" y="334" textAnchor="middle" fill={theme.textPrimary} fontSize="34" fontWeight="900">风格生成</text>
      </svg>
      {ingredients.map((label, index) => {
        const p = reveal(frame, totalFrames, index, ingredients.length);
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: 70 + (index % 2) * 126,
              top: 98 + index * 92,
              width: 250,
              minHeight: 76,
              borderRadius: 22,
              border: `1px solid ${index <= activeBeat ? COLORS[index % COLORS.length] : theme.cardBorder}`,
              background: solidPanelFill(theme),
              padding: "18px 22px",
              opacity: p,
              transform: `translateX(${(1 - p) * -34}px)`,
              boxShadow: index <= activeBeat ? `0 16px 44px ${alpha(COLORS[index % COLORS.length], 0.16)}` : "none",
            }}
          >
            <div style={{ fontSize: 16, color: COLORS[index % COLORS.length], fontWeight: 860, marginBottom: 8 }}>原料 {index + 1}</div>
            <div style={{ fontSize: fitFont(label, 26, 19), lineHeight: 1.14, fontWeight: 850, ...clampLines(2) }}>{label}</div>
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          right: 54,
          bottom: 72,
          width: 284,
          borderRadius: 26,
          border: `1px solid ${alpha(accent, 0.62)}`,
          background: alpha(accent, 0.13),
          padding: 24,
          opacity: reveal(frame, totalFrames, Math.max(1, ingredients.length - 1), Math.max(1, ingredients.length)),
        }}
      >
        <div style={{ fontSize: 18, color: accent, fontWeight: 860, marginBottom: 10 }}>输出口味</div>
        <div style={{ fontSize: 28, lineHeight: 1.12, fontWeight: 900 }}>表达风格被喂养出来</div>
      </div>
    </div>
  );
}

function ClassroomStage(props: {
  labels: string[];
  theme: ThemeConfig;
  accent: string;
  frame: number;
  fps: number;
  totalFrames: number;
  activeBeat: number;
}) {
  const { labels, theme, accent, frame, fps, totalFrames, activeBeat } = props;
  const scan = interpolate(frame % (fps * 3), [0, fps * 1.5, fps * 3], [0, 1, 0]);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        style={{
          position: "absolute",
          left: 76,
          top: 58,
          width: 720,
          height: 410,
          borderRadius: 28,
          border: `1px solid ${alpha(accent, 0.58)}`,
          background: "linear-gradient(135deg, rgba(8,32,38,0.92), rgba(8,16,28,0.96))",
          boxShadow: `0 22px 90px ${alpha(accent, 0.15)}`,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", left: 34, top: 34, fontSize: 24, color: accent, fontWeight: 880 }}>课堂语法框架</div>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 42,
              top: 98 + i * 64,
              width: 270 + i * 82,
              height: 8,
              borderRadius: 999,
              background: alpha("#ffffff", 0.32),
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: 52 + scan * 560,
            top: 88,
            width: 5,
            height: 244,
            borderRadius: 999,
            background: accent,
            boxShadow: `0 0 30px ${alpha(accent, 0.75)}`,
          }}
        />
        {labels.slice(0, 4).map((label, index) => {
          const p = reveal(frame, totalFrames, index, labels.length);
          return (
            <div
              key={index}
              style={{
                position: "absolute",
                right: 38,
                top: 86 + index * 72,
                width: 238,
                minHeight: 58,
                borderRadius: 18,
                background: alpha(COLORS[index % COLORS.length], 0.12),
                border: `1px solid ${COLORS[index % COLORS.length]}`,
                padding: "14px 18px",
                opacity: p,
                transform: `translateX(${(1 - p) * 28}px)`,
              }}
            >
              <div style={{ fontSize: fitFont(label, 24, 18), lineHeight: 1.12, fontWeight: 850, ...clampLines(2) }}>{label}</div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          left: 274,
          bottom: 48,
          width: 350,
          borderRadius: 28,
          border: `1px solid ${alpha(accent, 0.46)}`,
          background: panelFill(theme),
          padding: 28,
          opacity: reveal(frame, totalFrames, activeBeat, labels.length),
        }}
      >
        <div style={{ fontSize: 18, color: accent, fontWeight: 860, marginBottom: 10 }}>定调机制</div>
        <div style={{ fontSize: 30, lineHeight: 1.12, fontWeight: 900 }}>课堂规则变成表达默认值</div>
      </div>
    </div>
  );
}

function AmplifierStage(props: {
  labels: string[];
  theme: ThemeConfig;
  accent: string;
  frame: number;
  totalFrames: number;
  activeBeat: number;
}) {
  const { labels, theme, accent, frame, totalFrames, activeBeat } = props;
  const p = clamp((activeBeat + 1) / Math.max(1, labels.length), 0, 1);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg width="900" height="612" style={{ position: "absolute", inset: 0 }}>
        <circle cx="390" cy="298" r="112" fill={alpha(accent, 0.12)} stroke={accent} strokeWidth="6" />
        <line x1="468" y1="376" x2="626" y2="526" stroke={accent} strokeWidth="14" strokeLinecap="round" />
        <path d="M80 300 C190 230, 265 238, 374 294" stroke={COLORS[1]} strokeWidth="6" fill="none" strokeDasharray="520" strokeDashoffset={520 * (1 - p)} strokeLinecap="round" />
        <path d="M506 276 C626 198, 728 178, 836 142" stroke={COLORS[3]} strokeWidth="7" fill="none" strokeDasharray="560" strokeDashoffset={560 * (1 - p)} strokeLinecap="round" />
        <path d="M502 318 C638 370, 728 428, 838 496" stroke={COLORS[2]} strokeWidth="7" fill="none" strokeDasharray="560" strokeDashoffset={560 * (1 - p)} strokeLinecap="round" />
        <text x="390" y="310" textAnchor="middle" fill={theme.textPrimary} fontSize="32" fontWeight="900">放大器</text>
      </svg>
      {labels.slice(0, 5).map((label, index) => {
        const point = [
          { x: 104, y: 236 },
          { x: 152, y: 352 },
          { x: 650, y: 126 },
          { x: 700, y: 476 },
          { x: 586, y: 236 },
        ][index] || { x: 120, y: 120 };
        const rp = reveal(frame, totalFrames, index, labels.length);
        return (
          <NodeBubble
            key={index}
            x={point.x}
            y={point.y}
            w={index < 2 ? 230 : 260}
            h={92}
            label={label}
            active={index <= activeBeat}
            theme={theme}
            accent={COLORS[index % COLORS.length]}
            progress={rp}
          />
        );
      })}
    </div>
  );
}

function DocumentFilterStage(props: {
  labels: string[];
  theme: ThemeConfig;
  accent: string;
  frame: number;
  totalFrames: number;
  activeBeat: number;
}) {
  const { labels, theme, accent, frame, totalFrames, activeBeat } = props;
  const p = clamp((activeBeat + 1) / Math.max(1, labels.length), 0, 1);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {[0, 1, 2].map((i) => {
        const rp = reveal(frame, totalFrames, i, labels.length);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 84 + i * 72,
              top: 96 + i * 42,
              width: 330,
              height: 244,
              borderRadius: 18,
              border: `1px solid ${theme.cardBorder}`,
              background: solidPanelFill(theme),
              opacity: rp,
              transform: `rotate(${-5 + i * 4}deg) translateY(${(1 - rp) * 26}px)`,
              padding: 28,
            }}
          >
            <div style={{ width: 86, height: 8, borderRadius: 999, background: alpha(accent, 0.7), marginBottom: 26 }} />
            {[0, 1, 2, 3].map((line) => (
              <div key={line} style={{ height: 9, width: `${78 - line * 9}%`, borderRadius: 999, background: theme.cardBorder, marginBottom: 18 }} />
            ))}
          </div>
        );
      })}
      <svg width="900" height="612" style={{ position: "absolute", inset: 0 }}>
        <path d="M382 320 L550 218 L694 320 L550 424 Z" fill={alpha(accent, 0.1)} stroke={accent} strokeWidth="5" strokeDasharray="860" strokeDashoffset={860 * (1 - p)} />
        <path d="M442 320 L658 320" stroke={accent} strokeWidth="6" strokeLinecap="round" opacity="0.72" />
        <path d="M550 234 L550 406" stroke={accent} strokeWidth="6" strokeLinecap="round" opacity="0.42" />
        <text x="550" y="330" textAnchor="middle" fill={theme.textPrimary} fontSize="30" fontWeight="900">筛选</text>
      </svg>
      {labels.slice(0, 4).map((label, index) => {
        const rp = reveal(frame, totalFrames, index, labels.length);
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              right: 52,
              top: 94 + index * 92,
              width: 276,
              minHeight: 68,
              borderRadius: 22,
              border: `1px solid ${index <= activeBeat ? COLORS[index % COLORS.length] : theme.cardBorder}`,
              background: index <= activeBeat ? alpha(COLORS[index % COLORS.length], 0.13) : panelFill(theme),
              padding: "17px 22px",
              opacity: rp,
              transform: `translateX(${(1 - rp) * 34}px)`,
            }}
          >
            <div style={{ fontSize: fitFont(label, 25, 18), lineHeight: 1.14, fontWeight: 850, ...clampLines(2) }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function FocusField({
  labels,
  theme,
  accent,
  frame,
  fps,
  totalFrames,
  activeBeat,
}: {
  labels: string[];
  theme: ThemeConfig;
  accent: string;
  frame: number;
  fps: number;
  totalFrames: number;
  activeBeat: number;
}) {
  const center = { x: 450, y: 285 };
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg width="900" height="580" style={{ position: "absolute", left: 0, top: 0 }}>
        {[0, 1, 2].map((i) => (
          <ellipse
            key={i}
            cx={center.x}
            cy={center.y}
            rx={180 + i * 92}
            ry={96 + i * 58}
            fill="none"
            stroke={i === activeBeat % 3 ? accent : theme.cardBorder}
            strokeWidth="2"
            opacity={0.65 - i * 0.12}
          />
        ))}
        {labels.map((_, index) => {
          const p = reveal(frame, totalFrames, index, labels.length);
          const pos = radial(center.x, center.y, 280, index, labels.length);
          return (
            <line
              key={index}
              x1={center.x}
              y1={center.y}
              x2={center.x + (pos.x - center.x) * p}
              y2={center.y + (pos.y - center.y) * p}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth="3"
              opacity="0.8"
            />
          );
        })}
      </svg>
      <NodeBubble
        x={center.x}
        y={center.y}
        w={330}
        h={154}
        label="核心命题"
        active
        theme={theme}
        accent={accent}
        progress={1}
        large
      />
      {labels.map((label, index) => {
        const p = reveal(frame, totalFrames, index, labels.length);
        const pos = radial(center.x, center.y, 280, index, labels.length);
        return (
          <NodeBubble
            key={index}
            x={pos.x}
            y={pos.y}
            w={226}
            h={104}
            label={label}
            active={index <= activeBeat}
            theme={theme}
            accent={COLORS[index % COLORS.length]}
            progress={p}
          />
        );
      })}
    </div>
  );
}

function LayerCard({
  beat,
  index,
  progress,
  active,
  theme,
  accent,
}: {
  beat: RenderSceneBeat;
  index: number;
  progress: number;
  active: boolean;
  theme: ThemeConfig;
  accent: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: index * 132,
        width: 520,
        height: 112,
        borderRadius: 24,
        border: `1px solid ${active ? accent : theme.cardBorder}`,
        background: active ? alpha(accent, 0.13) : panelFill(theme),
        padding: "18px 26px",
        opacity: progress,
        transform: `translateX(${(1 - progress) * -36}px)`,
      }}
    >
      <div style={{ fontSize: 18, color: accent, fontWeight: 860 }}>第 {index + 1} 层</div>
      <div style={{ marginTop: 8, fontSize: fitFont(beat.label || "", 30, 21), fontWeight: 860, ...clampLines(1) }}>
        {beat.label || beat.emphasis}
      </div>
      <div style={{ marginTop: 8, fontSize: 18, color: theme.textSecondary, ...clampLines(1) }}>
        {beat.intent}
      </div>
    </div>
  );
}

function NodeBubble({
  x,
  y,
  w,
  h,
  label,
  active,
  theme,
  accent,
  progress,
  large,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  active: boolean;
  theme: ThemeConfig;
  accent: string;
  progress: number;
  large?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        borderRadius: large ? 34 : 26,
        border: `1px solid ${active ? accent : theme.cardBorder}`,
        background: active ? alpha(accent, large ? 0.16 : 0.12) : panelFill(theme),
        boxShadow: active ? `0 18px 60px ${alpha(accent, 0.16)}` : "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 22,
        opacity: progress,
        transform: `scale(${0.82 + progress * 0.18})`,
      }}
    >
      <div style={{ fontSize: fitFont(label, large ? 34 : 25, large ? 24 : 18), lineHeight: 1.14, fontWeight: 880, ...clampLines(2) }}>
        {label}
      </div>
    </div>
  );
}

function MetricCard({
  object,
  theme,
  accent,
  progress,
  active,
}: {
  object: RenderSceneObject;
  theme: ThemeConfig;
  accent: string;
  progress: number;
  active: boolean;
}) {
  const value = object.value || 64;
  return (
    <div
      style={{
        borderRadius: 30,
        border: `1px solid ${active ? accent : theme.cardBorder}`,
        background: active ? alpha(accent, 0.12) : panelFill(theme),
        padding: 34,
        opacity: progress,
        transform: `translateY(${(1 - progress) * 28}px)`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ fontSize: 26, color: theme.textSecondary, fontWeight: 780, ...clampLines(1) }}>{object.label}</div>
      <div style={{ marginTop: 24, fontSize: 76, lineHeight: 1, fontWeight: 900, color: active ? accent : theme.textPrimary }}>
        {Math.round(value)}%
      </div>
      <div style={{ position: "absolute", left: 34, right: 34, bottom: 34, height: 12, borderRadius: 999, background: theme.cardBorder }}>
        <div style={{ width: `${value}%`, height: "100%", borderRadius: 999, background: accent }} />
      </div>
    </div>
  );
}

function ConclusionPanel({
  scene,
  beats,
  theme,
  accent,
  frame,
  fps,
  compact,
}: {
  scene: RenderScene;
  beats: RenderSceneBeat[];
  theme: ThemeConfig;
  accent: string;
  frame: number;
  fps: number;
  compact?: boolean;
}) {
  const p = revealAt(frame, fps, compact ? 1.4 : 1.1);
  const finalBeat = beats[beats.length - 1];
  const body = finalBeat?.intent || scene.intent || scene.title;
  return (
    <div
      style={{
        borderRadius: 30,
        border: `1px solid ${alpha(accent, 0.52)}`,
        background: alpha(accent, 0.12),
        padding: compact ? 28 : 38,
        opacity: p,
        transform: `translateY(${(1 - p) * 30}px)`,
      }}
    >
      <div style={{ fontSize: 22, color: accent, fontWeight: 880, marginBottom: 14 }}>结论</div>
      <div style={{ fontSize: compact ? fitFont(body, 30, 22) : fitFont(body, 38, 25), lineHeight: 1.22, fontWeight: 880, ...clampLines(compact ? 3 : 4) }}>
        {body}
      </div>
    </div>
  );
}

function Cluster({
  title,
  labels,
  x,
  y,
  theme,
  accent,
  frame,
  fps,
  delay = 0,
}: {
  title: string;
  labels: string[];
  x: number;
  y: number;
  theme: ThemeConfig;
  accent: string;
  frame: number;
  fps: number;
  delay?: number;
}) {
  const p = revealAt(frame, fps, delay);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 470,
        height: 382,
        borderRadius: 32,
        background: panelFill(theme),
        border: `1px solid ${alpha(accent, 0.48)}`,
        padding: 34,
        opacity: p,
        transform: `translateY(${(1 - p) * 24}px)`,
      }}
    >
      <div style={{ fontSize: 28, color: accent, fontWeight: 880, marginBottom: 28 }}>{title}</div>
      {labels.slice(0, 3).map((label, index) => (
        <div
          key={index}
          style={{
            minHeight: 78,
            borderRadius: 20,
            background: alpha(accent, 0.1),
            marginBottom: 18,
            display: "flex",
            alignItems: "center",
            padding: "0 22px",
            fontSize: fitFont(label, 28, 20),
            fontWeight: 800,
            lineHeight: 1.14,
            ...clampLines(2),
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

interface LayoutProps {
  scene: RenderScene;
  beats: RenderSceneBeat[];
  theme: ThemeConfig;
  accent: string;
  frame: number;
  fps: number;
  totalFrames: number;
  activeBeat: number;
}

function normalizeBeats(beats: RenderSceneBeat[] | undefined, scene: RenderScene): RenderSceneBeat[] {
  const cleaned = (beats || [])
    .filter(Boolean)
    .slice(0, 5)
    .map((beat, index) => ({
      ...beat,
      index,
      label: beat.label || beat.emphasis || beat.narration_anchor || `步骤 ${index + 1}`,
      intent: beat.intent || scene.intent || scene.title,
      visual_action: beat.visual_action || "逐步建立画面结构",
    }));
  while (cleaned.length < 3) {
    cleaned.push({
      index: cleaned.length,
      label: scene.keywords?.[cleaned.length] || `步骤 ${cleaned.length + 1}`,
      intent: scene.intent || scene.title,
      visual_action: "逐步建立画面结构",
      emphasis: scene.keywords?.[cleaned.length],
    });
  }
  return cleaned;
}

function laneObjects(objects: RenderSceneObject[] | undefined, beats: RenderSceneBeat[]) {
  const lanes = (objects || []).filter((object) => object.kind === "lane");
  if (lanes.length >= 2) {
    return lanes.slice(0, 2);
  }
  return [
    {
      kind: "lane" as const,
      label: "常见理解",
      items: beats.slice(0, 3).map((beat) => beat.label || beat.emphasis || ""),
    },
    {
      kind: "lane" as const,
      label: "更准确模型",
      items: beats.slice(1, 5).map((beat) => beat.label || beat.emphasis || ""),
    },
  ];
}

function metricObjects(objects: RenderSceneObject[] | undefined, labels: string[]) {
  const metrics = (objects || []).filter((object) => object.kind === "metric");
  if (metrics.length >= 3) {
    return metrics.slice(0, 4);
  }
  return labels.slice(0, 4).map((label, index) => ({
    kind: "metric" as const,
    label,
    value: [42, 58, 73, 86][index % 4],
  }));
}

function mergeLabels(primary: string[], secondary: string[]): string[] {
  const result: string[] = [];
  for (const value of [...primary, ...secondary]) {
    const label = (value || "").trim();
    if (label && !result.includes(label)) {
      result.push(label);
    }
  }
  return result;
}

function reveal(frame: number, totalFrames: number, index: number, total: number): number {
  const progress = clamp(frame / Math.max(1, totalFrames - 1), 0, 1);
  const count = Math.max(1, total);
  const safeIndex = clamp(index, 0, count - 1);
  const start = Math.min(0.9, 0.06 + (safeIndex / count) * 0.72);
  const end = Math.min(0.98, Math.max(start + 0.02, start + Math.max(0.08, 0.32 / count)));
  return interpolate(
    progress,
    [start, end],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}

function revealAt(frame: number, fps: number, delaySeconds: number): number {
  return interpolate(
    frame,
    [delaySeconds * fps, delaySeconds * fps + 18],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}

function radial(cx: number, cy: number, radius: number, index: number, total: number) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, total);
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

function pathFromPoints(points: { x: number; y: number }[]) {
  if (points.length === 0) {
    return "";
  }
  return points
    .map((point, index) => {
      if (index === 0) {
        return `M${point.x} ${point.y}`;
      }
      const prev = points[index - 1];
      const midX = (prev.x + point.x) / 2;
      return `C${midX} ${prev.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
    })
    .join(" ");
}

function fitFont(text: string | undefined, max: number, min: number): number {
  const length = (text || "").length;
  if (length <= 8) return max;
  if (length <= 16) return Math.max(min, max - 5);
  if (length <= 28) return Math.max(min, max - 10);
  return min;
}

function clampLines(lines: number): React.CSSProperties {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lines,
    overflow: "hidden",
    wordBreak: "break-word",
  } as React.CSSProperties;
}

function panelFill(theme: ThemeConfig): string {
  return theme.name === "clean-bright" ? "rgba(255,255,255,0.78)" : "rgba(12,18,32,0.76)";
}

function softPanelFill(theme: ThemeConfig): string {
  return theme.name === "clean-bright" ? "rgba(248,250,252,0.86)" : "rgba(255,255,255,0.045)";
}

function solidPanelFill(theme: ThemeConfig): string {
  return theme.name === "clean-bright" ? "#ffffff" : "#101827";
}

function alpha(color: string, opacity: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shortSvg(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

function formatSceneType(value: string): string {
  const labels: Record<string, string> = {
    concept_opening: "问题开场",
    mechanism_build: "机制拆解",
    contrastive_explainer: "对比解释",
    evidence_scan: "证据扫描",
    process_walkthrough: "流程推进",
    system_map: "系统关系",
    metric_inspection: "指标观察",
    mistake_reveal: "误区纠偏",
    analogy_bridge: "类比桥接",
    recap_synthesis: "总结收束",
  };
  return labels[value] || value;
}
