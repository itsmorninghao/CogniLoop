import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type {
  CameraMovement,
  RenderScene,
  RenderSceneAsset,
  RenderSceneBeat,
  RenderSceneObject,
  SlideData,
  StoryboardVisualIdentity,
  ThemeConfig,
  VisualWorld,
} from "../types";

interface CinematicSceneSlideProps {
  slide: SlideData;
  scene: RenderScene;
  theme: ThemeConfig;
  slideIndex: number;
  totalSlides: number;
}

const W = 1920;
const H = 1080;
const SAFE_X = 92;
const SAFE_Y = 66;
const SAFE_W = W - SAFE_X * 2;
const SAFE_H = H - SAFE_Y * 2;
const DEFAULT_PALETTE = ["#6d7cff", "#19c7d4", "#ffb020", "#35d399", "#ff5ca8"];

export const CinematicSceneSlide: React.FC<CinematicSceneSlideProps> = ({
  slide,
  scene,
  theme,
  slideIndex,
  totalSlides,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = Math.max(1, Math.ceil((slide.duration_ms / 1000) * fps));
  const progress = clamp(frame / Math.max(1, totalFrames - 1), 0, 1);
  const identity = normalizeIdentity(scene.visual_identity);
  const beats = normalizeBeats(scene.beats, scene);
  const activeBeat = Math.min(beats.length - 1, Math.floor(progress * beats.length));
  const palette = normalizePalette(identity.palette);
  const accent = scene.accent || palette[slideIndex % palette.length];
  const intro = spring({ frame, fps, config: { damping: 26, stiffness: 105, mass: 0.95 } });
  const camera = cameraTransform(scene.camera?.movement || identity.camera_style || "slow_push", progress, slideIndex);

  return (
    <AbsoluteFill
      style={{
        background: worldBackground(identity.world, theme),
        color: theme.textPrimary,
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        overflow: "hidden",
      }}
    >
      <WorldAtmosphere
        world={identity.world}
        theme={theme}
        palette={palette}
        accent={accent}
        progress={progress}
      />
      <div
        style={{
          position: "absolute",
          left: SAFE_X,
          top: SAFE_Y,
          width: SAFE_W,
          height: SAFE_H,
          opacity: intro,
          transform: `translateY(${(1 - intro) * 18}px)`,
        }}
      >
        <SceneChrome
          scene={scene}
          identity={identity}
          theme={theme}
          accent={accent}
          slideIndex={slideIndex}
          totalSlides={totalSlides}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 150,
            width: SAFE_W,
            height: 690,
            transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale}) rotate(${camera.rotate}deg)`,
            transformOrigin: camera.origin,
          }}
        >
          {renderCinematicLayout({
            scene,
            identity,
            beats,
            theme,
            palette,
            accent,
            frame,
            fps,
            totalFrames,
            progress,
            activeBeat,
            slideIndex,
          })}
        </div>
        <ContinuityDock
          objects={mergeObjects(identity.core_objects || [], scene.continuity_objects || [], scene.keywords || [])}
          identity={identity}
          theme={theme}
          palette={palette}
          activeBeat={activeBeat}
          frame={frame}
          totalFrames={totalFrames}
        />
        <BeatTimeline
          beats={beats}
          theme={theme}
          palette={palette}
          accent={accent}
          frame={frame}
          totalFrames={totalFrames}
          activeBeat={activeBeat}
        />
      </div>
    </AbsoluteFill>
  );
};

interface CinematicLayoutProps {
  scene: RenderScene;
  identity: StoryboardVisualIdentity;
  beats: RenderSceneBeat[];
  theme: ThemeConfig;
  palette: string[];
  accent: string;
  frame: number;
  fps: number;
  totalFrames: number;
  progress: number;
  activeBeat: number;
  slideIndex: number;
}

function renderCinematicLayout(props: CinematicLayoutProps): React.ReactNode {
  switch (props.scene.layout) {
    case "world_hook":
    case "hook_focus":
      return <WorldHook {...props} />;
    case "concept_lab":
    case "mechanism_map":
      return <ConceptLab {...props} />;
    case "split_world":
    case "contrast_lanes":
      return <SplitWorld {...props} />;
    case "evidence_wall":
    case "evidence_scan":
      return <EvidenceWall {...props} />;
    case "spatial_process":
    case "process_path":
      return <SpatialProcess {...props} />;
    case "system_landscape":
    case "system_map":
      return <SystemLandscape {...props} />;
    case "metric_story":
    case "metric_panel":
      return <MetricStory {...props} />;
    case "object_bridge":
    case "bridge_map":
      return <ObjectBridge {...props} />;
    case "recap_constellation":
    case "recap_grid":
    default:
      return <RecapConstellation {...props} />;
  }
}

function WorldHook(props: CinematicLayoutProps) {
  const { scene, identity, beats, theme, palette, accent, frame, fps, totalFrames, activeBeat } = props;
  const labels = mergeObjects(scene.continuity_objects || [], scene.keywords || [], beats.map((beat) => beat.label || ""));
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", left: 28, top: 20, width: 1050, height: 620 }}>
        <WorldAssetStage
          scene={scene}
          identity={identity}
          asset={scene.assets?.[0]}
          labels={labels}
          theme={theme}
          palette={palette}
          accent={accent}
          frame={frame}
          totalFrames={totalFrames}
          activeBeat={activeBeat}
          large
        />
      </div>
      <div style={{ position: "absolute", right: 28, top: 58, width: 560 }}>
        <DirectorCard
          label={scene.scene_space || "场景"}
          title={scene.intent || scene.title}
          body={scene.metaphor || identity.art_direction || ""}
          theme={theme}
          accent={accent}
          frame={frame}
          fps={fps}
        />
        <FocusMeter
          title={identity.visual_motif || "视觉母题"}
          items={labels.slice(0, 4)}
          theme={theme}
          palette={palette}
          frame={frame}
          totalFrames={totalFrames}
          activeBeat={activeBeat}
        />
      </div>
    </div>
  );
}

function ConceptLab(props: CinematicLayoutProps) {
  const { scene, identity, beats, theme, palette, accent, frame, totalFrames, activeBeat } = props;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <StagePlate identity={identity} theme={theme} accent={accent} />
      <div style={{ position: "absolute", left: 50, top: 54, width: 690, height: 548 }}>
        <WorldAssetStage
          scene={scene}
          identity={identity}
          asset={scene.assets?.[0]}
          labels={scene.continuity_objects || scene.keywords || []}
          theme={theme}
          palette={palette}
          accent={accent}
          frame={frame}
          totalFrames={totalFrames}
          activeBeat={activeBeat}
        />
      </div>
      <div style={{ position: "absolute", right: 44, top: 26, width: 880, height: 610 }}>
        <svg width="880" height="610" viewBox="0 0 880 610" style={{ position: "absolute", inset: 0 }}>
          <path
            d="M120 110 C330 40 548 42 740 116 L740 482 C548 552 330 548 120 478 Z"
            fill={panelFill(theme, 0.56)}
            stroke={alpha(accent, 0.45)}
            strokeWidth="2"
          />
          {beats.slice(0, -1).map((_, index) => {
            const p = reveal(frame, totalFrames, index + 1, beats.length);
            return (
              <path
                key={index}
                d={`M250 ${150 + index * 96} C398 ${124 + index * 82} 450 ${204 + index * 82} 604 ${176 + index * 96}`}
                fill="none"
                stroke={palette[(index + 1) % palette.length]}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray="560"
                strokeDashoffset={560 * (1 - p)}
              />
            );
          })}
        </svg>
        {beats.map((beat, index) => {
          const p = reveal(frame, totalFrames, index, beats.length);
          const x = index % 2 === 0 ? 210 : 620;
          const y = 140 + index * 96;
          return (
            <ConceptPart
              key={index}
              x={x}
              y={y}
              label={beat.label || beat.emphasis || ""}
              detail={beat.visual_action || beat.intent || ""}
              active={index <= activeBeat}
              progress={p}
              theme={theme}
              accent={palette[index % palette.length]}
            />
          );
        })}
      </div>
    </div>
  );
}

function EvidenceWall(props: CinematicLayoutProps) {
  const { scene, identity, beats, theme, palette, accent, frame, fps, totalFrames, activeBeat } = props;
  const labels = mergeObjects(scene.keywords || [], beats.map((beat) => beat.label || ""), identity.core_objects || []);
  const scan = interpolate(frame % Math.max(1, fps * 3), [0, fps * 1.5, fps * 3], [0, 1, 0]);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", left: 24, top: 14, width: 1110, height: 628 }}>
        <WallSurface theme={theme} accent={accent} />
        {labels.slice(0, 6).map((label, index) => {
          const p = reveal(frame, totalFrames, index, labels.length);
          const pos = [
            { x: 78, y: 62, r: -4 },
            { x: 400, y: 40, r: 2 },
            { x: 718, y: 70, r: -2 },
            { x: 150, y: 322, r: 3 },
            { x: 480, y: 302, r: -3 },
            { x: 780, y: 344, r: 2 },
          ][index];
          return (
            <EvidenceCard
              key={index}
              label={label}
              x={pos.x}
              y={pos.y}
              rotate={pos.r}
              theme={theme}
              accent={palette[index % palette.length]}
              progress={p}
              active={index <= activeBeat}
            />
          );
        })}
        <div
          style={{
            position: "absolute",
            left: 58,
            top: 78 + scan * 430,
            width: 930,
            height: 5,
            borderRadius: 999,
            background: accent,
            boxShadow: `0 0 34px ${alpha(accent, 0.75)}`,
          }}
        />
      </div>
      <div style={{ position: "absolute", right: 38, top: 70, width: 520 }}>
        <InsightPanel scene={scene} beats={beats} theme={theme} accent={accent} frame={frame} fps={fps} />
      </div>
    </div>
  );
}

function SpatialProcess(props: CinematicLayoutProps) {
  const { scene, identity, beats, theme, palette, accent, frame, totalFrames, activeBeat } = props;
  const points = beats.map((_, index) => ({
    x: 150 + index * (1390 / Math.max(1, beats.length - 1)),
    y: 300 + Math.sin(index * 1.15 + props.slideIndex) * 112,
  }));
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <StagePlate identity={identity} theme={theme} accent={accent} />
      <svg width="100%" height="100%" viewBox={`0 0 ${SAFE_W} 690`} style={{ position: "absolute", inset: 0 }}>
        <path
          d={pathFromPoints(points)}
          fill="none"
          stroke={alpha(theme.textPrimary, theme.name === "clean-bright" ? 0.12 : 0.18)}
          strokeWidth="26"
          strokeLinecap="round"
        />
        <path
          d={pathFromPoints(points)}
          fill="none"
          stroke={accent}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray="1900"
          strokeDashoffset={1900 * (1 - clamp((activeBeat + 1) / beats.length, 0, 1))}
        />
        {points.slice(0, -1).map((point, index) => {
          const next = points[index + 1];
          const p = reveal(frame, totalFrames, index + 1, beats.length);
          return (
            <circle
              key={index}
              cx={point.x + (next.x - point.x) * p}
              cy={point.y + (next.y - point.y) * p}
              r="18"
              fill={palette[index % palette.length]}
              opacity={p}
            />
          );
        })}
      </svg>
      {beats.map((beat, index) => {
        const p = reveal(frame, totalFrames, index, beats.length);
        const active = index <= activeBeat;
        const point = points[index];
        return (
          <ProcessStop
            key={index}
            x={point.x}
            y={point.y}
            index={index}
            label={beat.label || beat.emphasis || ""}
            active={active}
            progress={p}
            theme={theme}
            accent={palette[index % palette.length]}
          />
        );
      })}
      <MovingObject
        label={(scene.continuity_objects || identity.core_objects || ["核心对象"])[0]}
        points={points}
        progress={clamp((activeBeat + 0.6) / Math.max(1, beats.length - 1), 0, 1)}
        theme={theme}
        accent={accent}
      />
    </div>
  );
}

function SplitWorld(props: CinematicLayoutProps) {
  const { scene, identity, beats, theme, palette, accent, frame, totalFrames, activeBeat } = props;
  const lanes = laneObjects(scene.objects, beats);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", left: 20, top: 24, width: 790, height: 610 }}>
        <WorldPanel
          title={lanes[0]?.label || "常见理解"}
          labels={(lanes[0]?.items || beats.map((beat) => beat.label || "")).slice(0, 4)}
          mode="muted"
          identity={identity}
          theme={theme}
          palette={palette}
          accent={palette[1]}
          frame={frame}
          totalFrames={totalFrames}
          activeBeat={activeBeat}
        />
      </div>
      <div style={{ position: "absolute", right: 20, top: 24, width: 790, height: 610 }}>
        <WorldPanel
          title={lanes[1]?.label || "更准确模型"}
          labels={(lanes[1]?.items || beats.slice(1).map((beat) => beat.label || "")).slice(0, 4)}
          mode="accent"
          identity={identity}
          theme={theme}
          palette={palette}
          accent={accent}
          frame={frame}
          totalFrames={totalFrames}
          activeBeat={activeBeat}
        />
      </div>
      <svg width="240" height="610" viewBox="0 0 240 610" style={{ position: "absolute", left: 748, top: 28 }}>
        <path
          d="M50 306 C92 196 148 196 190 306 C148 416 92 416 50 306"
          fill={alpha(accent, 0.12)}
          stroke={accent}
          strokeWidth="5"
        />
        <path
          d="M70 306 L164 306"
          stroke={accent}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray="140"
          strokeDashoffset={140 * (1 - clamp((activeBeat + 1) / beats.length, 0, 1))}
        />
        <text x="120" y="274" textAnchor="middle" fill={theme.textSecondary} fontSize="22" fontWeight="850">
          转换
        </text>
      </svg>
    </div>
  );
}

function ObjectBridge(props: CinematicLayoutProps) {
  const { scene, identity, beats, theme, palette, accent, frame, fps, totalFrames, activeBeat } = props;
  const labels = mergeObjects(scene.continuity_objects || [], scene.keywords || [], beats.map((beat) => beat.label || ""));
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Island title="熟悉对象" labels={labels.slice(0, 2)} x={52} y={86} theme={theme} accent={palette[1]} frame={frame} fps={fps} />
      <Island title="新概念" labels={labels.slice(2, 5)} x={1150} y={86} theme={theme} accent={accent} frame={frame} fps={fps} delay={0.5} />
      <svg width="760" height="360" viewBox="0 0 760 360" style={{ position: "absolute", left: 500, top: 184 }}>
        <path
          d="M38 210 C180 30 572 30 722 210"
          fill="none"
          stroke={alpha(accent, 0.24)}
          strokeWidth="42"
          strokeLinecap="round"
        />
        <path
          d="M38 210 C180 30 572 30 722 210"
          fill="none"
          stroke={accent}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray="900"
          strokeDashoffset={900 * (1 - clamp((activeBeat + 1) / beats.length, 0, 1))}
        />
        <text x="380" y="124" textAnchor="middle" fill={theme.textPrimary} fontSize="34" fontWeight="900">
          类比迁移
        </text>
      </svg>
      <div style={{ position: "absolute", left: 632, top: 446, width: 472 }}>
        <DirectorCard
          label="迁移规则"
          title={scene.metaphor || scene.intent || scene.title}
          body={beats[activeBeat]?.visual_action || ""}
          theme={theme}
          accent={accent}
          frame={frame}
          fps={fps}
        />
      </div>
    </div>
  );
}

function SystemLandscape(props: CinematicLayoutProps) {
  const { scene, identity, beats, theme, palette, accent, frame, totalFrames, activeBeat } = props;
  const labels = mergeObjects(identity.core_objects || [], scene.keywords || [], beats.map((beat) => beat.label || "")).slice(0, 8);
  const center = { x: SAFE_W / 2, y: 330 };
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <StagePlate identity={identity} theme={theme} accent={accent} />
      <svg width="100%" height="100%" viewBox={`0 0 ${SAFE_W} 690`} style={{ position: "absolute", inset: 0 }}>
        {labels.map((_, index) => {
          const p = reveal(frame, totalFrames, index, labels.length);
          const pos = radial(center.x, center.y, index % 2 === 0 ? 280 : 390, index, labels.length);
          return (
            <g key={index}>
              <line
                x1={center.x}
                y1={center.y}
                x2={center.x + (pos.x - center.x) * p}
                y2={center.y + (pos.y - center.y) * p}
                stroke={palette[index % palette.length]}
                strokeWidth="4"
                strokeLinecap="round"
                opacity={0.68}
              />
              {index > 0 && (
                <path
                  d={`M${pos.x} ${pos.y} C${center.x} ${center.y - 260} ${radial(center.x, center.y, 330, index - 1, labels.length).x} ${radial(center.x, center.y, 330, index - 1, labels.length).y}`}
                  fill="none"
                  stroke={alpha(palette[index % palette.length], 0.3)}
                  strokeWidth="2"
                  opacity={p}
                />
              )}
            </g>
          );
        })}
      </svg>
      <NodeCapsule
        x={center.x}
        y={center.y}
        w={360}
        h={160}
        label={scene.title}
        theme={theme}
        accent={accent}
        progress={1}
        active
        large
      />
      {labels.map((label, index) => {
        const p = reveal(frame, totalFrames, index, labels.length);
        const pos = radial(center.x, center.y, index % 2 === 0 ? 280 : 390, index, labels.length);
        return (
          <NodeCapsule
            key={index}
            x={pos.x}
            y={pos.y}
            w={230}
            h={98}
            label={label}
            theme={theme}
            accent={palette[index % palette.length]}
            progress={p}
            active={index <= activeBeat}
          />
        );
      })}
    </div>
  );
}

function MetricStory(props: CinematicLayoutProps) {
  const { scene, beats, theme, palette, accent, frame, totalFrames, activeBeat } = props;
  const metrics = metricObjects(scene.objects, scene.keywords || beats.map((beat) => beat.label || ""));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "0.92fr 1.34fr", gap: 34, width: "100%", height: "100%", padding: "22px 18px" }}>
      <div style={{ display: "grid", gridTemplateRows: "repeat(2, 1fr)", gap: 24 }}>
        {metrics.slice(0, 2).map((metric, index) => (
          <MetricTile
            key={index}
            object={metric}
            theme={theme}
            accent={palette[index % palette.length]}
            progress={reveal(frame, totalFrames, index, metrics.length)}
            active={index <= activeBeat}
          />
        ))}
      </div>
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 34,
          border: `1px solid ${alpha(accent, 0.44)}`,
          background: panelFill(theme, 0.74),
          padding: 34,
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 880, color: theme.textSecondary }}>趋势观察台</div>
        <svg width="100%" height="430" viewBox="0 0 900 430" style={{ position: "absolute", left: 22, right: 22, bottom: 46 }}>
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1="48" x2="840" y1={70 + i * 82} y2={70 + i * 82} stroke={alpha(theme.textPrimary, 0.12)} />
          ))}
          <polyline
            points={metrics.map((metric, index) => `${96 + index * 224},${352 - (metric.value || 50) * 2.85}`).join(" ")}
            fill="none"
            stroke={accent}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="1400"
            strokeDashoffset={1400 * (1 - clamp((activeBeat + 1) / metrics.length, 0, 1))}
          />
          {metrics.map((metric, index) => {
            const p = reveal(frame, totalFrames, index, metrics.length);
            const x = 96 + index * 224;
            const y = 352 - (metric.value || 50) * 2.85;
            return (
              <g key={index} opacity={p}>
                <circle cx={x} cy={y} r="20" fill={palette[index % palette.length]} />
                <text x={x} y={y - 38} textAnchor="middle" fill={theme.textPrimary} fontSize="22" fontWeight="850">
                  {shortSvg(metric.label, 8)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function RecapConstellation(props: CinematicLayoutProps) {
  const { scene, identity, beats, theme, palette, accent, frame, fps, totalFrames, activeBeat } = props;
  const labels = mergeObjects(identity.core_objects || [], scene.keywords || [], beats.map((beat) => beat.label || "")).slice(0, 6);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <StagePlate identity={identity} theme={theme} accent={accent} />
      <div style={{ position: "absolute", left: 34, top: 34, width: 1100, height: 598 }}>
        {labels.map((label, index) => {
          const p = reveal(frame, totalFrames, index, labels.length);
          const col = index % 3;
          const row = Math.floor(index / 3);
          return (
            <RecapTile
              key={index}
              x={40 + col * 338}
              y={44 + row * 238}
              index={index}
              label={label}
              theme={theme}
              accent={palette[index % palette.length]}
              progress={p}
              active={index <= activeBeat}
            />
          );
        })}
      </div>
      <div style={{ position: "absolute", right: 54, top: 92, width: 520 }}>
        <InsightPanel scene={scene} beats={beats} theme={theme} accent={accent} frame={frame} fps={fps} big />
      </div>
    </div>
  );
}

function SceneChrome({
  scene,
  identity,
  theme,
  accent,
  slideIndex,
  totalSlides,
}: {
  scene: RenderScene;
  identity: StoryboardVisualIdentity;
  theme: ThemeConfig;
  accent: string;
  slideIndex: number;
  totalSlides: number;
}) {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: SAFE_W, height: 132 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, height: 34 }}>
        <div style={{ width: 76, height: 5, borderRadius: 999, background: accent }} />
        <div style={{ fontSize: 21, color: theme.textSecondary, fontWeight: 850 }}>
          {formatWorld(identity.world)} / {scene.scene_space || formatSceneType(scene.scene_type)}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 20, color: theme.textMuted, fontWeight: 780 }}>
          {String(slideIndex + 1).padStart(2, "0")} / {String(totalSlides).padStart(2, "0")}
        </div>
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: fitFont(scene.title, 68, 40),
          lineHeight: 1.05,
          fontWeight: 900,
          maxWidth: 1320,
          letterSpacing: 0,
          ...clampLines(1),
        }}
      >
        {scene.title}
      </div>
      {scene.subtitle && (
        <div
          style={{
            marginTop: 10,
            fontSize: fitFont(scene.subtitle, 29, 21),
            lineHeight: 1.22,
            maxWidth: 1160,
            color: theme.textSecondary,
            ...clampLines(2),
          }}
        >
          {scene.subtitle}
        </div>
      )}
    </div>
  );
}

function WorldAtmosphere({
  world,
  theme,
  palette,
  accent,
  progress,
}: {
  world: VisualWorld;
  theme: ThemeConfig;
  palette: string[];
  accent: string;
  progress: number;
}) {
  const lineColor = theme.name === "clean-bright" ? "rgba(30, 41, 59, 0.075)" : "rgba(255,255,255,0.055)";
  const pattern = worldPattern(world, lineColor);
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: pattern,
          backgroundSize: world === "classroom_studio" ? "120px 72px" : "84px 84px",
          transform: `translateX(${-progress * 34}px) translateY(${-progress * 20}px)`,
          opacity: theme.name === "clean-bright" ? 0.76 : 0.62,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -80,
          top: 148,
          width: 2160,
          height: 190,
          transform: `rotate(${world === "amplifier_factory" ? -4 : -8}deg) translateX(${progress * 70}px)`,
          background: `linear-gradient(90deg, transparent, ${alpha(accent, 0.12)}, ${alpha(palette[1], 0.08)}, transparent)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 170,
          background: theme.name === "clean-bright"
            ? "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0))"
            : "linear-gradient(180deg, rgba(5,8,14,0.9), rgba(5,8,14,0))",
        }}
      />
    </>
  );
}

function WorldAssetStage({
  scene,
  identity,
  asset,
  labels,
  theme,
  palette,
  accent,
  frame,
  totalFrames,
  activeBeat,
  large,
}: {
  scene: RenderScene;
  identity: StoryboardVisualIdentity;
  asset?: RenderSceneAsset;
  labels: string[];
  theme: ThemeConfig;
  palette: string[];
  accent: string;
  frame: number;
  totalFrames: number;
  activeBeat: number;
  large?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: large ? 38 : 32,
        border: `1px solid ${alpha(accent, 0.42)}`,
        background: panelFill(theme, theme.name === "clean-bright" ? 0.68 : 0.54),
        overflow: "hidden",
        boxShadow: `0 26px 90px ${alpha(accent, 0.14)}`,
      }}
    >
      {asset?.src ? (
        <Img
          src={asset.src}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.88,
          }}
        />
      ) : (
        <SyntheticWorldAsset
          world={identity.world}
          scene={scene}
          labels={labels}
          theme={theme}
          palette={palette}
          accent={accent}
          frame={frame}
          totalFrames={totalFrames}
          activeBeat={activeBeat}
        />
      )}
    </div>
  );
}

function SyntheticWorldAsset(props: {
  world: VisualWorld;
  scene: RenderScene;
  labels: string[];
  theme: ThemeConfig;
  palette: string[];
  accent: string;
  frame: number;
  totalFrames: number;
  activeBeat: number;
}) {
  switch (props.world) {
    case "document_lab":
      return <DocumentLabIllustration {...props} />;
    case "classroom_studio":
      return <ClassroomIllustration {...props} />;
    case "amplifier_factory":
      return <AmplifierIllustration {...props} />;
    case "data_observatory":
      return <DataObservatoryIllustration {...props} />;
    case "concept_kitchen":
      return <KitchenIllustration {...props} />;
    case "systems_map":
    default:
      return <SystemsIllustration {...props} />;
  }
}

function DocumentLabIllustration({ labels, theme, palette, accent, frame, totalFrames, activeBeat }: WorldIllustrationProps) {
  const scan = interpolate(frame % 100, [0, 50, 100], [0, 1, 0]);
  return (
    <>
      <svg width="100%" height="100%" viewBox="0 0 1000 620" style={{ position: "absolute", inset: 0 }}>
        {[0, 1, 2].map((i) => {
          const p = reveal(frame, totalFrames, i, 4);
          return (
            <g key={i} transform={`translate(${128 + i * 120} ${110 + i * 48}) rotate(${-5 + i * 4})`} opacity={p}>
              <rect width="360" height="254" rx="18" fill={solidPanelFill(theme)} stroke={alpha(palette[i % palette.length], 0.55)} strokeWidth="2" />
              <rect x="34" y="34" width="120" height="12" rx="6" fill={palette[i % palette.length]} opacity="0.82" />
              {[0, 1, 2, 3].map((line) => (
                <rect key={line} x="34" y={82 + line * 36} width={244 - line * 22} height="10" rx="5" fill={alpha(theme.textPrimary, 0.22)} />
              ))}
            </g>
          );
        })}
        <path d="M592 236 L760 134 L904 236 L760 340 Z" fill={alpha(accent, 0.12)} stroke={accent} strokeWidth="5" />
        <path d="M650 236 L870 236" stroke={accent} strokeWidth="7" strokeLinecap="round" opacity="0.72" />
        <path d="M760 150 L760 322" stroke={accent} strokeWidth="7" strokeLinecap="round" opacity="0.42" />
        <circle cx="570" cy="390" r="76" fill="none" stroke={palette[1]} strokeWidth="12" />
        <line x1="626" y1="446" x2="748" y2="568" stroke={palette[1]} strokeWidth="18" strokeLinecap="round" />
        <rect x="110" y={94 + scan * 330} width="640" height="5" rx="3" fill={accent} opacity="0.88" />
      </svg>
      <FloatingLabels labels={labels} theme={theme} palette={palette} activeBeat={activeBeat} frame={frame} totalFrames={totalFrames} />
    </>
  );
}

function ClassroomIllustration({ labels, theme, palette, accent, frame, totalFrames, activeBeat }: WorldIllustrationProps) {
  return (
    <>
      <svg width="100%" height="100%" viewBox="0 0 1000 620" style={{ position: "absolute", inset: 0 }}>
        <rect x="96" y="76" width="760" height="390" rx="28" fill="rgba(6,42,43,0.92)" stroke={alpha(accent, 0.55)} strokeWidth="3" />
        <rect x="128" y="112" width="200" height="12" rx="6" fill={accent} />
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M140 ${178 + i * 58} C300 ${150 + i * 40} 426 ${194 + i * 36} 620 ${166 + i * 58}`}
            fill="none"
            stroke={alpha("#ffffff", 0.34)}
            strokeWidth="7"
            strokeLinecap="round"
          />
        ))}
        <path d="M204 526 L770 526" stroke={alpha(theme.textPrimary, 0.18)} strokeWidth="18" strokeLinecap="round" />
        {[0, 1, 2].map((i) => {
          const p = reveal(frame, totalFrames, i, 3);
          return (
            <g key={i} opacity={p} transform={`translate(${650 + i * 42} ${166 + i * 80})`}>
              <rect width="210" height="70" rx="18" fill={alpha(palette[i % palette.length], 0.16)} stroke={palette[i % palette.length]} />
              <text x="105" y="44" textAnchor="middle" fill="#fff" fontSize="21" fontWeight="850">{shortSvg(labels[i] || `规则${i + 1}`, 7)}</text>
            </g>
          );
        })}
      </svg>
      <FloatingLabels labels={labels} theme={theme} palette={palette} activeBeat={activeBeat} frame={frame} totalFrames={totalFrames} />
    </>
  );
}

function AmplifierIllustration({ labels, theme, palette, accent, frame, totalFrames, activeBeat }: WorldIllustrationProps) {
  const power = clamp((activeBeat + 1) / Math.max(1, labels.length), 0, 1);
  return (
    <>
      <svg width="100%" height="100%" viewBox="0 0 1000 620" style={{ position: "absolute", inset: 0 }}>
        <path d="M80 318 L328 318" stroke={palette[1]} strokeWidth="12" strokeLinecap="round" strokeDasharray="420" strokeDashoffset={420 * (1 - power)} />
        <circle cx="450" cy="318" r="126" fill={alpha(accent, 0.14)} stroke={accent} strokeWidth="8" />
        <circle cx="450" cy="318" r="76" fill={alpha(accent, 0.08)} stroke={alpha(accent, 0.45)} strokeWidth="3" />
        <path d="M554 268 C678 198 802 158 932 132" stroke={palette[3]} strokeWidth="12" strokeLinecap="round" strokeDasharray="700" strokeDashoffset={700 * (1 - power)} />
        <path d="M554 368 C690 426 812 476 932 526" stroke={palette[2]} strokeWidth="12" strokeLinecap="round" strokeDasharray="700" strokeDashoffset={700 * (1 - power)} />
        <text x="450" y="330" textAnchor="middle" fill={theme.textPrimary} fontSize="36" fontWeight="900">放大</text>
        {[0, 1, 2].map((i) => (
          <rect key={i} x={150 + i * 78} y={468 + i * 20} width="320" height="16" rx="8" fill={alpha(theme.textPrimary, 0.14)} />
        ))}
      </svg>
      <FloatingLabels labels={labels} theme={theme} palette={palette} activeBeat={activeBeat} frame={frame} totalFrames={totalFrames} />
    </>
  );
}

function DataObservatoryIllustration({ labels, theme, palette, accent, frame, totalFrames, activeBeat }: WorldIllustrationProps) {
  const p = clamp((activeBeat + 1) / Math.max(1, labels.length), 0, 1);
  return (
    <>
      <svg width="100%" height="100%" viewBox="0 0 1000 620" style={{ position: "absolute", inset: 0 }}>
        <rect x="94" y="94" width="810" height="420" rx="32" fill={panelFill(theme, 0.48)} stroke={alpha(accent, 0.45)} />
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="150" x2="842" y1={180 + i * 72} y2={180 + i * 72} stroke={alpha(theme.textPrimary, 0.12)} />
        ))}
        <polyline
          points="160,430 310,342 460,370 610,250 760,198 856,154"
          fill="none"
          stroke={accent}
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1040"
          strokeDashoffset={1040 * (1 - p)}
        />
        <circle cx="640" cy="280" r="88" fill="none" stroke={palette[1]} strokeWidth="10" />
        <line x1="704" y1="344" x2="830" y2="470" stroke={palette[1]} strokeWidth="17" strokeLinecap="round" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={162 + i * 180} y="116" width="130" height="44" rx="16" fill={alpha(palette[i], 0.18)} stroke={palette[i]} />
        ))}
      </svg>
      <FloatingLabels labels={labels} theme={theme} palette={palette} activeBeat={activeBeat} frame={frame} totalFrames={totalFrames} />
    </>
  );
}

function KitchenIllustration({ labels, theme, palette, accent, frame, totalFrames, activeBeat }: WorldIllustrationProps) {
  const p = clamp((activeBeat + 1) / Math.max(1, labels.length), 0, 1);
  return (
    <>
      <svg width="100%" height="100%" viewBox="0 0 1000 620" style={{ position: "absolute", inset: 0 }}>
        <path d="M122 170 C246 116 382 136 492 246" stroke={palette[1]} strokeWidth="7" fill="none" strokeDasharray="560" strokeDashoffset={560 * (1 - p)} strokeLinecap="round" />
        <ellipse cx="560" cy="340" rx="230" ry="112" fill={alpha(accent, 0.13)} stroke={accent} strokeWidth="5" />
        <path d="M328 344 C378 520 730 518 792 344" fill={alpha(accent, 0.08)} stroke={alpha(accent, 0.55)} strokeWidth="4" />
        <path d="M690 252 C782 180 834 148 910 118" stroke={palette[2]} strokeWidth="7" fill="none" strokeDasharray="420" strokeDashoffset={420 * (1 - p)} strokeLinecap="round" />
        <text x="560" y="354" textAnchor="middle" fill={theme.textPrimary} fontSize="38" fontWeight="900">混合生成</text>
        {[0, 1, 2, 3].map((i) => {
          const rp = reveal(frame, totalFrames, i, 4);
          return (
            <g key={i} opacity={rp} transform={`translate(${104 + (i % 2) * 150} ${126 + i * 82})`}>
              <rect width="198" height="74" rx="20" fill={solidPanelFill(theme)} stroke={palette[i % palette.length]} />
              <text x="99" y="45" textAnchor="middle" fill={theme.textPrimary} fontSize="21" fontWeight="850">{shortSvg(labels[i] || `原料${i + 1}`, 7)}</text>
            </g>
          );
        })}
      </svg>
    </>
  );
}

function SystemsIllustration({ labels, theme, palette, accent, frame, totalFrames, activeBeat }: WorldIllustrationProps) {
  const center = { x: 510, y: 310 };
  return (
    <>
      <svg width="100%" height="100%" viewBox="0 0 1000 620" style={{ position: "absolute", inset: 0 }}>
        {labels.slice(0, 6).map((_, index) => {
          const p = reveal(frame, totalFrames, index, 6);
          const pos = radial(center.x, center.y, index % 2 === 0 ? 210 : 285, index, 6);
          return (
            <line
              key={index}
              x1={center.x}
              y1={center.y}
              x2={center.x + (pos.x - center.x) * p}
              y2={center.y + (pos.y - center.y) * p}
              stroke={palette[index % palette.length]}
              strokeWidth="5"
              strokeLinecap="round"
            />
          );
        })}
        <circle cx={center.x} cy={center.y} r="118" fill={alpha(accent, 0.13)} stroke={accent} strokeWidth="5" />
        <text x={center.x} y={center.y + 10} textAnchor="middle" fill={theme.textPrimary} fontSize="34" fontWeight="900">核心关系</text>
        {labels.slice(0, 6).map((label, index) => {
          const p = reveal(frame, totalFrames, index, 6);
          const pos = radial(center.x, center.y, index % 2 === 0 ? 210 : 285, index, 6);
          return (
            <g key={index} opacity={p} transform={`translate(${pos.x} ${pos.y})`}>
              <rect x="-92" y="-34" width="184" height="68" rx="20" fill={solidPanelFill(theme)} stroke={palette[index % palette.length]} />
              <text x="0" y="8" textAnchor="middle" fill={theme.textPrimary} fontSize="20" fontWeight="850">{shortSvg(label, 7)}</text>
            </g>
          );
        })}
      </svg>
    </>
  );
}

interface WorldIllustrationProps {
  scene: RenderScene;
  labels: string[];
  theme: ThemeConfig;
  palette: string[];
  accent: string;
  frame: number;
  totalFrames: number;
  activeBeat: number;
}

function DirectorCard({
  label,
  title,
  body,
  theme,
  accent,
  frame,
  fps,
}: {
  label: string;
  title: string;
  body: string;
  theme: ThemeConfig;
  accent: string;
  frame: number;
  fps: number;
}) {
  const p = revealAt(frame, fps, 0.2);
  return (
    <div
      style={{
        borderRadius: 30,
        border: `1px solid ${alpha(accent, 0.46)}`,
        background: panelFill(theme, 0.76),
        padding: "30px 32px",
        opacity: p,
        transform: `translateY(${(1 - p) * 28}px)`,
      }}
    >
      <div style={{ fontSize: 18, color: accent, fontWeight: 880, marginBottom: 14 }}>{label}</div>
      <div style={{ fontSize: fitFont(title, 32, 23), lineHeight: 1.18, fontWeight: 900, ...clampLines(3) }}>{title}</div>
      {body && (
        <div style={{ marginTop: 16, fontSize: 20, lineHeight: 1.28, color: theme.textSecondary, ...clampLines(3) }}>
          {body}
        </div>
      )}
    </div>
  );
}

function FocusMeter({
  title,
  items,
  theme,
  palette,
  frame,
  totalFrames,
  activeBeat,
}: {
  title: string;
  items: string[];
  theme: ThemeConfig;
  palette: string[];
  frame: number;
  totalFrames: number;
  activeBeat: number;
}) {
  return (
    <div style={{ marginTop: 22, borderRadius: 28, background: panelFill(theme, 0.6), border: `1px solid ${alpha(theme.textPrimary, 0.12)}`, padding: 26 }}>
      <div style={{ fontSize: 18, color: theme.textMuted, fontWeight: 850, marginBottom: 18 }}>{title}</div>
      {items.slice(0, 4).map((item, index) => {
        const p = reveal(frame, totalFrames, index, items.length);
        const active = index <= activeBeat;
        return (
          <div key={index} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, opacity: 0.3 + p * 0.7 }}>
            <div style={{ width: 12, height: 12, borderRadius: 999, background: active ? palette[index % palette.length] : alpha(theme.textPrimary, 0.2) }} />
            <div style={{ fontSize: 23, lineHeight: 1.15, fontWeight: active ? 850 : 700, ...clampLines(1) }}>{item}</div>
          </div>
        );
      })}
    </div>
  );
}

function StagePlate({ identity, theme, accent }: { identity: StoryboardVisualIdentity; theme: ThemeConfig; accent: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 18,
        top: 18,
        right: 18,
        bottom: 18,
        borderRadius: 38,
        border: `1px solid ${alpha(accent, 0.26)}`,
        background: theme.name === "clean-bright"
          ? "linear-gradient(135deg, rgba(255,255,255,0.52), rgba(238,242,255,0.34))"
          : "linear-gradient(135deg, rgba(9,14,26,0.56), rgba(14,22,40,0.36))",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 28,
          top: 22,
          fontSize: 18,
          color: theme.textMuted,
          fontWeight: 850,
        }}
      >
        {identity.visual_motif || formatWorld(identity.world)}
      </div>
    </div>
  );
}

function ConceptPart({
  x,
  y,
  label,
  detail,
  active,
  progress,
  theme,
  accent,
}: {
  x: number;
  y: number;
  label: string;
  detail: string;
  active: boolean;
  progress: number;
  theme: ThemeConfig;
  accent: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x - 150,
        top: y - 58,
        width: 300,
        minHeight: 116,
        borderRadius: 26,
        border: `1px solid ${active ? accent : alpha(theme.textPrimary, 0.14)}`,
        background: active ? alpha(accent, 0.14) : panelFill(theme, 0.66),
        padding: "20px 24px",
        opacity: progress,
        transform: `scale(${0.88 + progress * 0.12})`,
      }}
    >
      <div style={{ fontSize: fitFont(label, 28, 20), lineHeight: 1.1, fontWeight: 900, ...clampLines(1) }}>{label}</div>
      <div style={{ marginTop: 10, fontSize: 17, lineHeight: 1.2, color: theme.textSecondary, ...clampLines(2) }}>{detail}</div>
    </div>
  );
}

function WallSurface({ theme, accent }: { theme: ThemeConfig; accent: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 34,
        border: `1px solid ${alpha(accent, 0.32)}`,
        background: panelFill(theme, 0.54),
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: 32, right: 32, top: 84, height: 1, background: alpha(accent, 0.32) }} />
      <div style={{ position: "absolute", left: 32, right: 32, top: 316, height: 1, background: alpha(theme.textPrimary, 0.12) }} />
      <div style={{ position: "absolute", left: 524, top: 32, bottom: 32, width: 1, background: alpha(theme.textPrimary, 0.1) }} />
    </div>
  );
}

function EvidenceCard({
  label,
  x,
  y,
  rotate,
  theme,
  accent,
  progress,
  active,
}: {
  label: string;
  x: number;
  y: number;
  rotate: number;
  theme: ThemeConfig;
  accent: string;
  progress: number;
  active: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 276,
        height: 176,
        borderRadius: 22,
        border: `1px solid ${active ? accent : alpha(theme.textPrimary, 0.14)}`,
        background: solidPanelFill(theme),
        padding: 24,
        opacity: progress,
        transform: `rotate(${rotate}deg) translateY(${(1 - progress) * 28}px)`,
        boxShadow: active ? `0 20px 70px ${alpha(accent, 0.14)}` : "none",
      }}
    >
      <div style={{ width: 86, height: 8, borderRadius: 999, background: accent, marginBottom: 24 }} />
      <div style={{ fontSize: fitFont(label, 29, 20), lineHeight: 1.12, fontWeight: 890, ...clampLines(2) }}>{label}</div>
      <div style={{ marginTop: 22, height: 8, width: "72%", borderRadius: 999, background: alpha(theme.textPrimary, 0.14) }} />
    </div>
  );
}

function InsightPanel({
  scene,
  beats,
  theme,
  accent,
  frame,
  fps,
  big,
}: {
  scene: RenderScene;
  beats: RenderSceneBeat[];
  theme: ThemeConfig;
  accent: string;
  frame: number;
  fps: number;
  big?: boolean;
}) {
  const p = revealAt(frame, fps, 0.8);
  const finalBeat = beats[beats.length - 1];
  const body = finalBeat?.intent || scene.intent || scene.title;
  return (
    <div
      style={{
        borderRadius: 34,
        border: `1px solid ${alpha(accent, 0.52)}`,
        background: alpha(accent, 0.13),
        padding: big ? 38 : 32,
        opacity: p,
        transform: `translateY(${(1 - p) * 28}px)`,
      }}
    >
      <div style={{ fontSize: 20, color: accent, fontWeight: 880, marginBottom: 16 }}>结论镜头</div>
      <div style={{ fontSize: big ? fitFont(body, 38, 25) : fitFont(body, 32, 23), lineHeight: 1.22, fontWeight: 900, ...clampLines(big ? 4 : 3) }}>
        {body}
      </div>
    </div>
  );
}

function ProcessStop({
  x,
  y,
  index,
  label,
  active,
  progress,
  theme,
  accent,
}: {
  x: number;
  y: number;
  index: number;
  label: string;
  active: boolean;
  progress: number;
  theme: ThemeConfig;
  accent: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x - 132,
        top: y - 78,
        width: 264,
        height: 156,
        borderRadius: 28,
        border: `1px solid ${active ? accent : alpha(theme.textPrimary, 0.14)}`,
        background: active ? alpha(accent, 0.15) : solidPanelFill(theme),
        padding: 24,
        opacity: progress,
        transform: `scale(${0.86 + progress * 0.14})`,
      }}
    >
      <div style={{ fontSize: 20, color: accent, fontWeight: 880 }}>镜头 {index + 1}</div>
      <div style={{ marginTop: 14, fontSize: fitFont(label, 29, 20), lineHeight: 1.12, fontWeight: 900, ...clampLines(2) }}>{label}</div>
    </div>
  );
}

function MovingObject({
  label,
  points,
  progress,
  theme,
  accent,
}: {
  label: string;
  points: { x: number; y: number }[];
  progress: number;
  theme: ThemeConfig;
  accent: string;
}) {
  const position = pointOnPath(points, progress);
  return (
    <div
      style={{
        position: "absolute",
        left: position.x - 84,
        top: position.y - 138,
        width: 168,
        height: 70,
        borderRadius: 999,
        background: alpha(accent, 0.18),
        border: `1px solid ${accent}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: theme.textPrimary,
        fontSize: fitFont(label, 23, 17),
        fontWeight: 900,
        ...clampLines(1),
      }}
    >
      {label}
    </div>
  );
}

function WorldPanel({
  title,
  labels,
  mode,
  identity,
  theme,
  palette,
  accent,
  frame,
  totalFrames,
  activeBeat,
}: {
  title: string;
  labels: string[];
  mode: "muted" | "accent";
  identity: StoryboardVisualIdentity;
  theme: ThemeConfig;
  palette: string[];
  accent: string;
  frame: number;
  totalFrames: number;
  activeBeat: number;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: 36,
        border: `1px solid ${mode === "accent" ? alpha(accent, 0.56) : alpha(theme.textPrimary, 0.14)}`,
        background: mode === "accent" ? alpha(accent, 0.1) : panelFill(theme, 0.58),
        overflow: "hidden",
        padding: 34,
      }}
    >
      <div style={{ fontSize: 30, color: mode === "accent" ? accent : theme.textSecondary, fontWeight: 900, marginBottom: 30 }}>
        {title}
      </div>
      <div style={{ position: "absolute", right: 30, top: 30, width: 230, height: 170, opacity: 0.44 }}>
        <MiniWorldIcon world={identity.world} accent={accent} theme={theme} />
      </div>
      {labels.slice(0, 4).map((label, index) => {
        const p = reveal(frame, totalFrames, index + (mode === "accent" ? 1 : 0), labels.length + 1);
        const active = mode === "accent" && index <= activeBeat;
        return (
          <div
            key={index}
            style={{
              width: 520,
              minHeight: 82,
              borderRadius: 23,
              border: `1px solid ${active ? accent : alpha(theme.textPrimary, 0.14)}`,
              background: active ? alpha(accent, 0.15) : softPanelFill(theme),
              marginBottom: 20,
              padding: "20px 24px",
              opacity: p,
              transform: `translateX(${(1 - p) * (mode === "accent" ? 28 : -28)}px)`,
              fontSize: fitFont(label, 27, 19),
              lineHeight: 1.13,
              fontWeight: 850,
              ...clampLines(2),
            }}
          >
            {label}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 34, right: 34, bottom: 34, height: 8, borderRadius: 999, background: alpha(palette[0], 0.18) }}>
        <div style={{ width: `${Math.round(((activeBeat + 1) / 5) * 100)}%`, height: "100%", borderRadius: 999, background: accent }} />
      </div>
    </div>
  );
}

function Island({
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
        width: 460,
        height: 376,
        borderRadius: 36,
        border: `1px solid ${alpha(accent, 0.48)}`,
        background: panelFill(theme, 0.66),
        padding: 34,
        opacity: p,
        transform: `translateY(${(1 - p) * 26}px)`,
      }}
    >
      <div style={{ fontSize: 28, color: accent, fontWeight: 900, marginBottom: 28 }}>{title}</div>
      {labels.slice(0, 3).map((label, index) => (
        <div
          key={index}
          style={{
            minHeight: 76,
            borderRadius: 21,
            background: alpha(accent, 0.12),
            marginBottom: 18,
            display: "flex",
            alignItems: "center",
            padding: "0 22px",
            fontSize: fitFont(label, 27, 19),
            fontWeight: 850,
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

function NodeCapsule({
  x,
  y,
  w,
  h,
  label,
  theme,
  accent,
  progress,
  active,
  large,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  theme: ThemeConfig;
  accent: string;
  progress: number;
  active: boolean;
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
        borderRadius: large ? 36 : 28,
        border: `1px solid ${active ? accent : alpha(theme.textPrimary, 0.14)}`,
        background: active ? alpha(accent, large ? 0.18 : 0.13) : panelFill(theme, 0.66),
        boxShadow: active ? `0 20px 70px ${alpha(accent, 0.15)}` : "none",
        opacity: progress,
        transform: `scale(${0.84 + progress * 0.16})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 22,
      }}
    >
      <div style={{ fontSize: fitFont(label, large ? 34 : 24, large ? 23 : 17), lineHeight: 1.12, fontWeight: 900, ...clampLines(2) }}>
        {label}
      </div>
    </div>
  );
}

function MetricTile({
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
        borderRadius: 34,
        border: `1px solid ${active ? accent : alpha(theme.textPrimary, 0.14)}`,
        background: active ? alpha(accent, 0.13) : panelFill(theme, 0.64),
        padding: 34,
        opacity: progress,
        transform: `translateY(${(1 - progress) * 28}px)`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ fontSize: 25, color: theme.textSecondary, fontWeight: 820, ...clampLines(1) }}>{object.label}</div>
      <div style={{ marginTop: 24, fontSize: 74, lineHeight: 1, fontWeight: 950, color: active ? accent : theme.textPrimary }}>
        {Math.round(value)}%
      </div>
      <div style={{ position: "absolute", left: 34, right: 34, bottom: 34, height: 13, borderRadius: 999, background: alpha(theme.textPrimary, 0.12) }}>
        <div style={{ width: `${value}%`, height: "100%", borderRadius: 999, background: accent }} />
      </div>
    </div>
  );
}

function RecapTile({
  x,
  y,
  index,
  label,
  theme,
  accent,
  progress,
  active,
}: {
  x: number;
  y: number;
  index: number;
  label: string;
  theme: ThemeConfig;
  accent: string;
  progress: number;
  active: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 300,
        height: 190,
        borderRadius: 30,
        border: `1px solid ${active ? accent : alpha(theme.textPrimary, 0.14)}`,
        background: active ? alpha(accent, 0.13) : panelFill(theme, 0.62),
        padding: 28,
        opacity: progress,
        transform: `translateY(${(1 - progress) * 28}px)`,
      }}
    >
      <div style={{ fontSize: 23, color: accent, fontWeight: 900 }}>{String(index + 1).padStart(2, "0")}</div>
      <div style={{ marginTop: 38, fontSize: fitFont(label, 32, 22), lineHeight: 1.12, fontWeight: 900, ...clampLines(2) }}>{label}</div>
    </div>
  );
}

function ContinuityDock({
  objects,
  identity,
  theme,
  palette,
  activeBeat,
  frame,
  totalFrames,
}: {
  objects: string[];
  identity: StoryboardVisualIdentity;
  theme: ThemeConfig;
  palette: string[];
  activeBeat: number;
  frame: number;
  totalFrames: number;
}) {
  const list = objects.slice(0, 5);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 112,
        width: 620,
        height: 72,
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontSize: 16,
          color: theme.textMuted,
          fontWeight: 850,
          width: 48,
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        对象
      </div>
      {list.map((item, index) => {
        const p = reveal(frame, totalFrames, index, list.length);
        return (
          <div
            key={index}
            style={{
              minWidth: 92,
              maxWidth: 138,
              height: 54,
              borderRadius: 999,
              border: `1px solid ${index <= activeBeat ? palette[index % palette.length] : alpha(theme.textPrimary, 0.14)}`,
              background: index <= activeBeat ? alpha(palette[index % palette.length], 0.14) : panelFill(theme, 0.48),
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: p,
              fontSize: fitFont(item, 19, 14),
              lineHeight: 1,
              fontWeight: 850,
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
}

function BeatTimeline({
  beats,
  theme,
  palette,
  accent,
  frame,
  totalFrames,
  activeBeat,
}: {
  beats: RenderSceneBeat[];
  theme: ThemeConfig;
  palette: string[];
  accent: string;
  frame: number;
  totalFrames: number;
  activeBeat: number;
}) {
  return (
    <div style={{ position: "absolute", left: 0, bottom: 0, width: SAFE_W, height: 104 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 21, height: 1, background: alpha(theme.textPrimary, 0.13) }} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${beats.length}, 1fr)`, gap: 18 }}>
        {beats.map((beat, index) => {
          const p = reveal(frame, totalFrames, index, beats.length);
          const active = index <= activeBeat;
          return (
            <div key={index} style={{ opacity: 0.25 + p * 0.75, transform: `translateY(${(1 - p) * 16}px)`, minWidth: 0 }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  background: active ? palette[index % palette.length] : panelFill(theme, 0.4),
                  border: `2px solid ${active ? palette[index % palette.length] : alpha(theme.textPrimary, 0.2)}`,
                  boxShadow: active ? `0 0 20px ${alpha(accent, 0.45)}` : "none",
                  marginBottom: 12,
                }}
              />
              <div style={{ fontSize: 24, lineHeight: 1.1, fontWeight: active ? 900 : 700, ...clampLines(1) }}>
                {beat.label || beat.emphasis || `步骤 ${index + 1}`}
              </div>
              <div style={{ marginTop: 7, fontSize: 17, lineHeight: 1.22, color: theme.textMuted, ...clampLines(2) }}>
                {beat.intent}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FloatingLabels({
  labels,
  theme,
  palette,
  activeBeat,
  frame,
  totalFrames,
}: {
  labels: string[];
  theme: ThemeConfig;
  palette: string[];
  activeBeat: number;
  frame: number;
  totalFrames: number;
}) {
  return (
    <>
      {labels.slice(0, 4).map((label, index) => {
        const p = reveal(frame, totalFrames, index, labels.length);
        const active = index <= activeBeat;
        const pos = [
          { x: 708, y: 98 },
          { x: 746, y: 468 },
          { x: 110, y: 444 },
          { x: 550, y: 72 },
        ][index];
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: `${pos.x / 10}%`,
              top: `${pos.y / 6.2}%`,
              width: 190,
              minHeight: 58,
              borderRadius: 18,
              border: `1px solid ${active ? palette[index % palette.length] : alpha(theme.textPrimary, 0.14)}`,
              background: active ? alpha(palette[index % palette.length], 0.14) : panelFill(theme, 0.58),
              padding: "14px 17px",
              opacity: p,
              transform: `translateY(${(1 - p) * 18}px)`,
              fontSize: fitFont(label, 22, 16),
              lineHeight: 1.12,
              fontWeight: 850,
              ...clampLines(2),
            }}
          >
            {label}
          </div>
        );
      })}
    </>
  );
}

function MiniWorldIcon({ world, accent, theme }: { world: VisualWorld; accent: string; theme: ThemeConfig }) {
  return (
    <svg width="230" height="170" viewBox="0 0 230 170">
      {world === "amplifier_factory" ? (
        <>
          <circle cx="96" cy="86" r="44" fill={alpha(accent, 0.12)} stroke={accent} strokeWidth="5" />
          <path d="M130 74 L212 38 M130 100 L212 132" stroke={accent} strokeWidth="5" strokeLinecap="round" />
        </>
      ) : world === "classroom_studio" ? (
        <>
          <rect x="28" y="30" width="174" height="104" rx="18" fill="rgba(7,48,47,0.86)" stroke={accent} strokeWidth="4" />
          <path d="M54 72 C92 48 122 86 168 62" stroke="#fff" strokeWidth="5" opacity="0.55" fill="none" />
        </>
      ) : world === "concept_kitchen" ? (
        <>
          <ellipse cx="116" cy="94" rx="74" ry="38" fill={alpha(accent, 0.14)} stroke={accent} strokeWidth="4" />
          <path d="M58 94 C74 146 160 146 176 94" fill="none" stroke={accent} strokeWidth="4" />
        </>
      ) : world === "document_lab" ? (
        <>
          <rect x="42" y="32" width="112" height="86" rx="12" fill={solidPanelFill(theme)} stroke={accent} strokeWidth="4" />
          <circle cx="140" cy="106" r="28" fill="none" stroke={accent} strokeWidth="5" />
          <line x1="160" y1="126" x2="198" y2="156" stroke={accent} strokeWidth="7" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="116" cy="86" r="34" fill={alpha(accent, 0.13)} stroke={accent} strokeWidth="4" />
          {[0, 1, 2, 3].map((i) => {
            const pos = radial(116, 86, 62, i, 4);
            return <line key={i} x1="116" y1="86" x2={pos.x} y2={pos.y} stroke={accent} strokeWidth="3" />;
          })}
        </>
      )}
    </svg>
  );
}

function normalizeIdentity(identity?: StoryboardVisualIdentity): StoryboardVisualIdentity {
  return {
    world: identity?.world || "systems_map",
    art_direction: identity?.art_direction || "动态图解视觉系统",
    visual_motif: identity?.visual_motif || "核心对象",
    core_objects: identity?.core_objects?.length ? identity.core_objects : ["核心对象", "关系路径", "结论"],
    palette: normalizePalette(identity?.palette),
    camera_style: identity?.camera_style || "slow_push",
    asset_strategy: identity?.asset_strategy || "优先使用真实或生成式资产，缺失时使用合成图形。",
  };
}

function normalizePalette(palette?: string[]): string[] {
  const colors = (palette || []).filter((color) => /^#[0-9a-fA-F]{6}$/.test(color));
  return colors.length >= 3 ? colors.slice(0, 5) : DEFAULT_PALETTE;
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

function cameraTransform(movement: CameraMovement, progress: number, slideIndex: number) {
  switch (movement) {
    case "scan_pan":
      return { x: -34 + progress * 68, y: -8, scale: 1.025, rotate: 0, origin: "50% 50%" };
    case "tabletop_track":
      return { x: -18 + progress * 36, y: 12 - progress * 24, scale: 1.018, rotate: 0, origin: "50% 55%" };
    case "split_reveal":
      return { x: 0, y: 0, scale: 1.02 + Math.sin(progress * Math.PI) * 0.018, rotate: 0, origin: "50% 50%" };
    case "orbit":
      return { x: Math.sin(progress * Math.PI * 2 + slideIndex) * 18, y: Math.cos(progress * Math.PI * 2) * 10, scale: 1.015, rotate: Math.sin(progress * Math.PI * 2) * 0.3, origin: "50% 50%" };
    case "pullback":
      return { x: 0, y: 0, scale: 1.065 - progress * 0.065, rotate: 0, origin: "50% 50%" };
    case "slow_push":
    default:
      return { x: -progress * 20, y: -progress * 10, scale: 1 + progress * 0.045, rotate: 0, origin: "50% 50%" };
  }
}

function reveal(frame: number, totalFrames: number, index: number, total: number): number {
  const progress = clamp(frame / Math.max(1, totalFrames - 1), 0, 1);
  const count = Math.max(1, total);
  const safeIndex = clamp(index, 0, count - 1);
  const start = Math.min(0.9, 0.05 + (safeIndex / count) * 0.72);
  const end = Math.min(0.98, Math.max(start + 0.02, start + Math.max(0.08, 0.34 / count)));
  return interpolate(progress, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function revealAt(frame: number, fps: number, delaySeconds: number): number {
  return interpolate(frame, [delaySeconds * fps, delaySeconds * fps + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function mergeObjects(...groups: string[][]): string[] {
  const result: string[] = [];
  for (const group of groups) {
    for (const value of group) {
      const label = (value || "").trim();
      if (label && !result.includes(label)) {
        result.push(label);
      }
      if (result.length >= 8) {
        return result;
      }
    }
  }
  return result;
}

function pointOnPath(points: { x: number; y: number }[], progress: number) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const scaled = clamp(progress, 0, 1) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const from = points[index];
  const to = points[index + 1];
  return { x: from.x + (to.x - from.x) * local, y: from.y + (to.y - from.y) * local };
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

function worldBackground(world: VisualWorld, theme: ThemeConfig): string {
  const dark: Record<VisualWorld, string> = {
    document_lab: "linear-gradient(135deg, #07101c 0%, #0f172a 48%, #070b13 100%)",
    classroom_studio: "linear-gradient(135deg, #061616 0%, #0b1f24 48%, #081018 100%)",
    amplifier_factory: "linear-gradient(135deg, #120c08 0%, #171123 50%, #080a12 100%)",
    data_observatory: "linear-gradient(135deg, #070b16 0%, #0b1830 52%, #060b12 100%)",
    concept_kitchen: "linear-gradient(135deg, #09130d 0%, #142017 48%, #080d12 100%)",
    systems_map: "linear-gradient(135deg, #070b14 0%, #101426 52%, #080a12 100%)",
  };
  const bright: Record<VisualWorld, string> = {
    document_lab: "linear-gradient(135deg, #f8fbff 0%, #edf4ff 48%, #ffffff 100%)",
    classroom_studio: "linear-gradient(135deg, #f7fff9 0%, #eaf7f3 48%, #ffffff 100%)",
    amplifier_factory: "linear-gradient(135deg, #fffaf0 0%, #f5f0ff 50%, #ffffff 100%)",
    data_observatory: "linear-gradient(135deg, #f8fbff 0%, #eef5ff 52%, #ffffff 100%)",
    concept_kitchen: "linear-gradient(135deg, #f8fff6 0%, #fff7e9 48%, #ffffff 100%)",
    systems_map: "linear-gradient(135deg, #f9fbff 0%, #eef2ff 52%, #ffffff 100%)",
  };
  return theme.name === "clean-bright" ? bright[world] : dark[world];
}

function worldPattern(world: VisualWorld, lineColor: string): string {
  if (world === "document_lab") {
    return `linear-gradient(${lineColor} 1px, transparent 1px), linear-gradient(90deg, ${lineColor} 1px, transparent 1px)`;
  }
  if (world === "classroom_studio") {
    return `linear-gradient(${lineColor} 2px, transparent 2px), repeating-linear-gradient(0deg, transparent 0 34px, ${lineColor} 34px 35px)`;
  }
  if (world === "amplifier_factory") {
    return `repeating-linear-gradient(90deg, ${lineColor} 0 1px, transparent 1px 52px), repeating-linear-gradient(0deg, transparent 0 70px, ${lineColor} 70px 72px)`;
  }
  if (world === "concept_kitchen") {
    return `radial-gradient(circle at 30px 30px, ${lineColor} 2px, transparent 3px), linear-gradient(90deg, ${lineColor} 1px, transparent 1px)`;
  }
  return `linear-gradient(${lineColor} 1px, transparent 1px), linear-gradient(90deg, ${lineColor} 1px, transparent 1px)`;
}

function panelFill(theme: ThemeConfig, opacity = 0.72): string {
  return theme.name === "clean-bright" ? `rgba(255,255,255,${opacity})` : `rgba(11,17,31,${opacity})`;
}

function softPanelFill(theme: ThemeConfig): string {
  return theme.name === "clean-bright" ? "rgba(248,250,252,0.86)" : "rgba(255,255,255,0.045)";
}

function solidPanelFill(theme: ThemeConfig): string {
  return theme.name === "clean-bright" ? "#ffffff" : "#101827";
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

function alpha(color: string, opacity: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${opacity})`);
  }
  return color;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shortSvg(text: string | undefined, max: number): string {
  const value = text || "";
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1))}…`;
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

function formatWorld(world: VisualWorld): string {
  const labels: Record<VisualWorld, string> = {
    document_lab: "资料实验室",
    classroom_studio: "课堂演示场",
    amplifier_factory: "放大器工厂",
    data_observatory: "数据观测台",
    concept_kitchen: "概念配方台",
    systems_map: "系统关系图",
  };
  return labels[world];
}
