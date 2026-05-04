/** Slide template types matching the backend content_generator output */
export type TemplateType =
  | "TITLE_SLIDE"
  | "BULLET_POINTS"
  | "CONCEPT_EXPLAIN"
  | "COMPARISON"
  | "QUOTE_HIGHLIGHT"
  | "SUMMARY"
  | "DIAGRAM_TEXT";

export type ThemeName = "tech-dark" | "clean-bright";

/** Base slide data — every slide has these */
export interface SlideBase {
  template: TemplateType;
  narration?: string;
  duration_ms: number;
  /** Storyboard pipeline: director-level planning generated before rendering. */
  storyboard?: StoryboardSlide;
  /** Storyboard pipeline: renderer-ready scene contract. Takes priority over visual_events. */
  render_scene?: RenderScene;
  /** V2: Timeline-driven visual events. When present, AnimatedSlide renders instead of static template. */
  visual_events?: VisualEvent[];
  /** V2: Layout hint for element positioning */
  layout?: SlideLayout;
  /** V2: Background override */
  background?: SlideBackground;
}

export interface TitleSlideData extends SlideBase {
  template: "TITLE_SLIDE";
  title: string;
  subtitle?: string;
  badge?: string;
}

export interface BulletPointsData extends SlideBase {
  template: "BULLET_POINTS";
  heading: string;
  points: string[];
}

export interface ConceptExplainData extends SlideBase {
  template: "CONCEPT_EXPLAIN";
  heading: string;
  definition: string;
  analogy?: string;
}

export interface ComparisonData extends SlideBase {
  template: "COMPARISON";
  heading: string;
  left_label: string;
  left_items: string[];
  right_label: string;
  right_items: string[];
}

export interface QuoteHighlightData extends SlideBase {
  template: "QUOTE_HIGHLIGHT";
  quote: string;
  emphasis?: string;
}

export interface SummaryData extends SlideBase {
  template: "SUMMARY";
  heading: string;
  points: string[];
}

export interface DiagramTextData extends SlideBase {
  template: "DIAGRAM_TEXT";
  heading: string;
  description: string;
}

export type SlideData =
  | TitleSlideData
  | BulletPointsData
  | ConceptExplainData
  | ComparisonData
  | QuoteHighlightData
  | SummaryData
  | DiagramTextData;

/** Render request from the backend */
export interface RenderRequest {
  task_id: string;
  node_id: number;
  course_id: number;
  theme?: ThemeName;
  script_json: {
    section_title?: string;
    slides: SlideData[];
  };
}

/** Render response back to backend */
export interface RenderResponse {
  status: "done" | "failed";
  video_path?: string;
  error?: string;
  duration_ms?: number;
}

/** Theme configuration */
export interface ThemeConfig {
  name: ThemeName;
  // Background
  bg: string;
  bgGradient: string;
  // Cards
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Brand colors
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;
  accentGlow: string;
  // Semantic
  success: string;
  warning: string;
  // Accent bar gradient
  accentBarGradient: string;
  // Decorative
  decorCircle1: string;
  decorCircle2: string;
  // 3D config
  enable3d: boolean;
  particleColor: string;
  glowColor: string;
}

/** FPS and resolution constants */
export const VIDEO_FPS = 24;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const FADE_DURATION_FRAMES = 12; // 0.5s at 24fps

// ─── Storyboard Render Scene System ─────────────────────────────────

export type StoryboardSceneType =
  | "concept_opening"
  | "mechanism_build"
  | "contrastive_explainer"
  | "evidence_scan"
  | "process_walkthrough"
  | "system_map"
  | "metric_inspection"
  | "mistake_reveal"
  | "analogy_bridge"
  | "recap_synthesis";

export type RenderSceneLayout =
  | "world_hook"
  | "concept_lab"
  | "split_world"
  | "evidence_wall"
  | "spatial_process"
  | "system_landscape"
  | "metric_story"
  | "object_bridge"
  | "recap_constellation"
  | "hook_focus"
  | "mechanism_map"
  | "contrast_lanes"
  | "evidence_scan"
  | "process_path"
  | "system_map"
  | "metric_panel"
  | "bridge_map"
  | "recap_grid";

export interface StoryboardBeat {
  intent: string;
  narration_anchor?: string;
  visual_action: string;
  emphasis?: string;
}

export type VisualWorld =
  | "document_lab"
  | "classroom_studio"
  | "amplifier_factory"
  | "data_observatory"
  | "concept_kitchen"
  | "systems_map";

export type CameraMovement =
  | "slow_push"
  | "scan_pan"
  | "tabletop_track"
  | "split_reveal"
  | "orbit"
  | "pullback";

export interface StoryboardVisualIdentity {
  world: VisualWorld;
  art_direction?: string;
  visual_motif?: string;
  core_objects?: string[];
  palette?: string[];
  camera_style?: CameraMovement;
  asset_strategy?: string;
}

export interface StoryboardCamera {
  movement?: CameraMovement;
  start_focus?: string;
  end_focus?: string;
}

export interface StoryboardConstraints {
  density?: "low" | "medium" | "high";
  motion_level?: "low" | "medium" | "high";
  max_on_screen_text?: number;
  avoid?: string[];
}

export interface StoryboardSlide {
  slide_id?: string;
  source_index?: number;
  scene_type: StoryboardSceneType;
  scene_space?: string;
  composition?: string;
  camera?: StoryboardCamera;
  continuity_objects?: string[];
  asset_prompt?: string;
  teaching_intent: string;
  learner_obstacle?: string;
  visual_metaphor?: string;
  beats: StoryboardBeat[];
  constraints?: StoryboardConstraints;
}

export interface RenderSceneBeat extends StoryboardBeat {
  index?: number;
  label?: string;
}

export interface RenderSceneObject {
  kind: "node" | "lane" | "metric" | "evidence" | "connector" | "asset";
  label: string;
  detail?: string;
  role?: "focus" | "support";
  tone?: "muted" | "accent";
  value?: number;
  items?: string[];
}

export interface RenderSceneAsset {
  id: string;
  role?: "primary" | "texture" | "reference" | "background";
  kind?: string;
  label?: string;
  prompt?: string;
  src?: string | null;
  public_src?: string | null;
  provider?: "http_bitmap" | "synthetic_bitmap" | "kb_reference_bitmap" | string;
  cache_key?: string;
  metadata?: Record<string, unknown>;
  fallback?: "synthetic" | "blank";
}

export interface RenderScene {
  version?: "render_scene.v1" | string;
  scene_type: StoryboardSceneType;
  layout: RenderSceneLayout;
  variant?: string;
  visual_kind?: string;
  visual_identity?: StoryboardVisualIdentity;
  scene_space?: string;
  composition?: string;
  camera?: StoryboardCamera;
  continuity_objects?: string[];
  assets?: RenderSceneAsset[];
  title: string;
  subtitle?: string;
  intent?: string;
  obstacle?: string;
  metaphor?: string;
  accent?: string;
  keywords?: string[];
  beats: RenderSceneBeat[];
  objects?: RenderSceneObject[];
  constraints?: StoryboardConstraints;
}

// ─── Visual Event System (V2 animated slides) ───────────────────────

/** Position on the 1920×1080 canvas */
export interface CanvasPosition {
  x: number;
  y: number;
  w?: number;
  h?: number;
  anchor?: "top-left" | "center" | "bottom-right" | "bottom-left" | "top-right";
}

/** Text animation styles */
export type TextAnimation =
  | "typewriter"
  | "word-reveal"
  | "highlight"
  | "glow-pulse"
  | "underline-draw"
  | "fade-up"
  | "scale-in";

/** Text visual style presets */
export type TextStyle = "heading" | "subheading" | "body" | "caption" | "label" | "emphasis" | "stat";

// ─── Visual Event Subtypes ──────────────────────────────────────────

interface VisualEventBase {
  /** Seconds from slide start when this event triggers */
  at: number;
  /** Animation duration in seconds (default varies by type) */
  duration?: number;
  /** Optional ID for ClearEvent to reference */
  id?: string;
}

export interface TextEvent extends VisualEventBase {
  type: "text";
  text: string;
  animation: TextAnimation;
  position: CanvasPosition;
  style?: TextStyle;
  color?: string;
  fontSize?: number;
}

export interface LottieEvent extends VisualEventBase {
  type: "lottie";
  assetId: string;
  position: CanvasPosition;
  loop?: boolean;
  playbackRate?: number;
}

export interface SVGDrawEvent extends VisualEventBase {
  type: "svg-draw";
  shape: "arrow" | "circle" | "underline" | "bracket" | "line" | "box" | "curved-arrow";
  from: { x: number; y: number };
  to: { x: number; y: number };
  strokeColor?: string;
  strokeWidth?: number;
}

export interface ChartEvent extends VisualEventBase {
  type: "chart";
  chartType: "bar" | "line" | "pie" | "progress-ring";
  position: CanvasPosition;
  data: {
    labels: string[];
    values: number[];
    colors?: string[];
  };
  title?: string;
}

export interface DiagramEvent extends VisualEventBase {
  type: "diagram";
  diagramType: "flowchart" | "mindmap" | "timeline-steps" | "cycle";
  position: CanvasPosition;
  nodes: {
    id: string;
    label: string;
    children?: string[];
  }[];
}

export interface NumberEvent extends VisualEventBase {
  type: "number";
  from: number;
  to: number;
  position: CanvasPosition;
  suffix?: string;
  prefix?: string;
  fontSize?: number;
}

export interface IconGridEvent extends VisualEventBase {
  type: "icon-grid";
  position: CanvasPosition;
  icons: { assetId: string; label: string }[];
  columns?: number;
}

export interface CalloutCardEvent extends VisualEventBase {
  type: "callout-card";
  position: CanvasPosition;
  title: string;
  body?: string;
  index?: number;
  tone?: "primary" | "accent" | "success" | "warning";
}

export interface SpotlightEvent extends VisualEventBase {
  type: "spotlight";
  position: CanvasPosition;
  title: string;
  subtitle?: string;
  labels?: string[];
  variant?: "orbit" | "stack" | "signal";
}

export interface SceneAssetEvent extends VisualEventBase {
  type: "scene-asset";
  position: CanvasPosition;
  assetKind: "dashboard" | "lab" | "code" | "network" | "document" | "timeline" | "signal";
  title?: string;
  labels?: string[];
}

export type SceneFamily =
  | "cinematic-hero"
  | "document-scan"
  | "mechanism-map"
  | "process-board"
  | "data-dashboard"
  | "split-compare"
  | "recap-map";

export interface ConceptBuildEvent extends VisualEventBase {
  type: "concept-build";
  position: CanvasPosition;
  mode: "concept" | "process" | "metric" | "comparison" | "summary";
  title: string;
  labels: string[];
  caption?: string;
}

export interface SceneStageEvent extends VisualEventBase {
  type: "scene-stage";
  position: CanvasPosition;
  stageKind: "hero" | "deep-dive" | "process" | "metric" | "comparison" | "recap";
  sceneFamily?: SceneFamily;
  title: string;
  subtitle?: string;
  labels?: string[];
  focus?: string;
  assetKind?: "dashboard" | "lab" | "code" | "network" | "document" | "timeline" | "signal";
  assetSrc?: string;
  assetPrompt?: string;
}

export interface TransitionEvent extends VisualEventBase {
  type: "transition";
  effect: "wipe-left" | "wipe-right" | "fade" | "slide-up" | "zoom";
}

export interface ClearEvent extends VisualEventBase {
  type: "clear";
  targetId?: string;
  animation?: "fade-out" | "slide-out" | "instant";
}

export interface ImageEvent extends VisualEventBase {
  type: "image";
  src: string;
  position: CanvasPosition;
  animation?: "fade-in" | "scale-in" | "slide-left" | "slide-right" | "ken-burns";
}

/** Union of all visual event types */
export type VisualEvent =
  | TextEvent
  | LottieEvent
  | SVGDrawEvent
  | ChartEvent
  | DiagramEvent
  | NumberEvent
  | IconGridEvent
  | CalloutCardEvent
  | SpotlightEvent
  | SceneAssetEvent
  | ConceptBuildEvent
  | SceneStageEvent
  | TransitionEvent
  | ClearEvent
  | ImageEvent;

/** Slide layout variants */
export type SlideLayout = "full" | "split-left" | "split-right" | "centered" | "two-column";

/** Background variants */
export type SlideBackground = "default" | "gradient-warm" | "gradient-cool" | "dark-emphasis" | "light-emphasis";

// ─── Asset Manifest Types ───────────────────────────────────────────

export interface AssetMeta {
  path: string;
  category: "character" | "icon" | "decoration";
  tags: string[];
  defaultSize: { w: number; h: number };
  loopable: boolean;
}

export interface AssetManifest {
  version: number;
  assets: Record<string, AssetMeta>;
}
