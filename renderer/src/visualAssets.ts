import type { SceneFamily, SlideData, VisualEvent } from "./types.js";

type SceneStageEvent = Extract<VisualEvent, { type: "scene-stage" }>;

const FAMILY_ACCENTS: Record<SceneFamily, { bg: string; accent: string; accent2: string; label: string }> = {
  "cinematic-hero": { bg: "#07111f", accent: "#06b6d4", accent2: "#6366f1", label: "OPENING SCENE" },
  "document-scan": { bg: "#0f172a", accent: "#f59e0b", accent2: "#06b6d4", label: "SOURCE SCAN" },
  "mechanism-map": { bg: "#08111f", accent: "#6366f1", accent2: "#10b981", label: "MECHANISM" },
  "process-board": { bg: "#07131f", accent: "#10b981", accent2: "#06b6d4", label: "PROCESS" },
  "data-dashboard": { bg: "#050b18", accent: "#06b6d4", accent2: "#f59e0b", label: "SIGNAL" },
  "split-compare": { bg: "#0f172a", accent: "#6366f1", accent2: "#f59e0b", label: "COMPARE" },
  "recap-map": { bg: "#07140f", accent: "#10b981", accent2: "#06b6d4", label: "RECAP" },
};

export function enrichSlidesWithVisualAssets(slides: SlideData[]): SlideData[] {
  return slides.map((slide) => {
    if (!slide.visual_events?.length) return slide;
    const visualEvents = slide.visual_events.map((event) => {
      if (event.type !== "scene-stage" || event.assetSrc) return event;
      const family = event.sceneFamily ?? defaultFamily(event);
      if (family === "document-scan") return event;
      return {
        ...event,
        assetSrc: makeProceduralAsset(event, family),
      };
    });
    return { ...slide, visual_events: visualEvents } as SlideData;
  });
}

export function countSceneAssets(slides: SlideData[]): number {
  let count = 0;
  for (const slide of slides) {
    for (const event of slide.visual_events ?? []) {
      if (event.type === "scene-stage" && event.assetSrc) count++;
    }
  }
  return count;
}

function makeProceduralAsset(event: SceneStageEvent, family = event.sceneFamily ?? defaultFamily(event)): string {
  const palette = FAMILY_ACCENTS[family];
  const labels = normalizeLabels(event.labels);
  const svg = buildSvg({ family, palette, labels });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function defaultFamily(event: SceneStageEvent): SceneFamily {
  if (event.stageKind === "hero") return "cinematic-hero";
  if (event.stageKind === "comparison") return "split-compare";
  if (event.stageKind === "recap") return "recap-map";
  if (event.stageKind === "metric" || event.assetKind === "dashboard" || event.assetKind === "signal") {
    return "data-dashboard";
  }
  if (event.stageKind === "process" || event.assetKind === "timeline") return "process-board";
  if (event.assetKind === "document") return "document-scan";
  return "mechanism-map";
}

function normalizeLabels(labels: string[] | undefined): string[] {
  const normalized = (labels ?? [])
    .map((label) => trimLabel(label, 12))
    .filter(Boolean);
  return (normalized.length ? normalized : ["对象", "结构", "变化", "结论"]).slice(0, 5);
}

function trimLabel(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function text(value: string, x: number, y: number, size: number, weight = 700, color = "#e5e7eb"): string {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Noto Sans SC, Inter, sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(value)}</text>`;
}

function buildSvg({
  family,
  palette,
  labels,
}: {
  family: SceneFamily;
  palette: { bg: string; accent: string; accent2: string; label: string };
  labels: string[];
}): string {
  const common = `
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="${palette.bg}"/>
        <stop offset="55%" stop-color="#111827"/>
        <stop offset="100%" stop-color="#020617"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" x2="1">
        <stop offset="0%" stop-color="${palette.accent}"/>
        <stop offset="100%" stop-color="${palette.accent2}"/>
      </linearGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000000" flood-opacity="0.32"/>
      </filter>
    </defs>
    <rect width="1280" height="720" fill="url(#bg)"/>
    <rect x="0" y="0" width="1280" height="720" fill="url(#grid)" opacity="0.18"/>
    <circle cx="1080" cy="140" r="260" fill="${palette.accent}" opacity="0.12"/>
    <circle cx="160" cy="620" r="250" fill="${palette.accent2}" opacity="0.10"/>
    ${text(palette.label, 70, 72, 24, 850, palette.accent)}
  `;

  const pattern = `
    <defs>
      <pattern id="grid" width="52" height="52" patternUnits="userSpaceOnUse">
        <path d="M 52 0 L 0 0 0 52" fill="none" stroke="#94a3b8" stroke-width="1"/>
      </pattern>
    </defs>
  `;

  const body = (() => {
    switch (family) {
      case "document-scan":
        return documentScan(labels, palette);
      case "process-board":
        return processBoard(labels, palette);
      case "data-dashboard":
        return dataDashboard(labels, palette);
      case "split-compare":
        return splitCompare(labels, palette);
      case "recap-map":
        return recapMap(labels, palette);
      case "mechanism-map":
        return mechanismMap(labels, palette);
      default:
        return cinematicHero(labels, palette);
    }
  })();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">${pattern}${common}${body}</svg>`;
}

function cinematicHero(labels: string[], palette: { accent: string; accent2: string }): string {
  const rings = [0, 1, 2].map((i) =>
    `<circle cx="870" cy="364" r="${118 + i * 72}" fill="none" stroke="${i % 2 ? palette.accent2 : palette.accent}" stroke-width="3" opacity="${0.34 - i * 0.08}"/>`
  ).join("");
  const cards = labels.slice(0, 4).map((label, i) => `
    <rect x="${92 + i * 188}" y="560" width="156" height="76" rx="10" fill="#020617" opacity="0.62" stroke="${i % 2 ? palette.accent2 : palette.accent}" stroke-opacity="0.46"/>
    ${text(`0${i + 1}`, 110 + i * 188, 588, 18, 850, i % 2 ? palette.accent2 : palette.accent)}
    ${text(label, 110 + i * 188, 618, 22, 760)}
  `).join("");
  return `
    <rect x="682" y="176" width="390" height="390" rx="195" fill="#0f172a" opacity="0.62" filter="url(#softShadow)"/>
    ${rings}
    <path d="M 726 380 C 802 286, 928 482, 1036 318" fill="none" stroke="url(#accent)" stroke-width="8" stroke-linecap="round" opacity="0.72"/>
    <circle cx="870" cy="364" r="54" fill="url(#accent)" opacity="0.88"/>
    ${cards}
  `;
}

function documentScan(labels: string[], palette: { accent: string; accent2: string }): string {
  const lines = Array.from({ length: 7 }, (_, i) => `
    <rect x="168" y="${246 + i * 48}" width="${560 - (i % 3) * 70}" height="15" rx="7" fill="${i === 2 ? palette.accent : "#cbd5e1"}" opacity="${i === 2 ? 0.72 : 0.24}"/>
    <rect x="168" y="${270 + i * 48}" width="${390 + (i % 2) * 84}" height="9" rx="5" fill="#94a3b8" opacity="0.18"/>
  `).join("");
  const markers = labels.slice(0, 3).map((_label, i) => `
    <rect x="840" y="${264 + i * 94}" width="132" height="16" rx="8" fill="${i % 2 ? palette.accent2 : palette.accent}" opacity="0.4"/>
    <rect x="840" y="${292 + i * 94}" width="220" height="10" rx="5" fill="#94a3b8" opacity="0.18"/>
  `).join("");
  return `
    <rect x="122" y="210" width="620" height="412" rx="16" fill="#f8fafc" opacity="0.10" stroke="#cbd5e1" stroke-opacity="0.24" filter="url(#softShadow)"/>
    <rect x="122" y="210" width="620" height="54" rx="16" fill="#f8fafc" opacity="0.13"/>
    ${lines}
    <circle cx="640" cy="386" r="74" fill="none" stroke="${palette.accent2}" stroke-width="7" opacity="0.64"/>
    <line x1="694" y1="440" x2="766" y2="512" stroke="${palette.accent2}" stroke-width="13" stroke-linecap="round" opacity="0.58"/>
    ${markers}
  `;
}

function mechanismMap(labels: string[], palette: { accent: string; accent2: string }): string {
  const center = labels[0] ?? "核心";
  const branches = labels.slice(1, 5);
  const branchSvg = branches.map((label, i) => {
    const coords = [
      [520, 276],
      [970, 282],
      [546, 538],
      [956, 524],
    ][i] ?? [700, 520];
    const [x, y] = coords;
    return `
      <line x1="760" y1="394" x2="${x}" y2="${y}" stroke="${i % 2 ? palette.accent2 : palette.accent}" stroke-width="4" opacity="0.48"/>
      <rect x="${x - 104}" y="${y - 42}" width="208" height="84" rx="14" fill="#020617" opacity="0.66" stroke="${i % 2 ? palette.accent2 : palette.accent}" stroke-opacity="0.48"/>
      ${text(label, x - 70, y + 8, 25, 800)}
    `;
  }).join("");
  return `
    <circle cx="760" cy="394" r="124" fill="${palette.accent}" opacity="0.12"/>
    <circle cx="760" cy="394" r="88" fill="#020617" opacity="0.72" stroke="${palette.accent}" stroke-width="5"/>
    ${text(center, 704, 404, 28, 880)}
    ${branchSvg}
  `;
}

function processBoard(labels: string[], palette: { accent: string; accent2: string }): string {
  const items = labels.slice(0, 4);
  return `
    <line x1="172" y1="418" x2="1108" y2="418" stroke="#94a3b8" stroke-width="8" stroke-linecap="round" opacity="0.22"/>
    <line x1="172" y1="418" x2="1058" y2="418" stroke="url(#accent)" stroke-width="8" stroke-linecap="round" opacity="0.78"/>
    ${items.map((label, i) => {
      const x = 190 + i * 292;
      const y = i % 2 ? 452 : 286;
      return `
        <circle cx="${x + 74}" cy="418" r="20" fill="${i % 2 ? palette.accent2 : palette.accent}" opacity="0.9"/>
        <rect x="${x}" y="${y}" width="210" height="106" rx="14" fill="#020617" opacity="0.64" stroke="${i % 2 ? palette.accent2 : palette.accent}" stroke-opacity="0.5"/>
        ${text(`STEP ${i + 1}`, x + 22, y + 34, 18, 850, i % 2 ? palette.accent2 : palette.accent)}
        ${text(label, x + 22, y + 72, 26, 820)}
      `;
    }).join("")}
  `;
}

function dataDashboard(labels: string[], palette: { accent: string; accent2: string }): string {
  const bars = [170, 244, 138, 292, 212];
  return `
    <rect x="118" y="230" width="700" height="380" rx="18" fill="#020617" opacity="0.64" stroke="#94a3b8" stroke-opacity="0.18" filter="url(#softShadow)"/>
    <path d="M 176 512 C 260 410, 326 548, 420 408 S 570 448, 676 300 S 760 282, 792 248" fill="none" stroke="${palette.accent}" stroke-width="8" stroke-linecap="round" opacity="0.82"/>
    ${bars.map((height, i) => `<rect x="${188 + i * 94}" y="${552 - height}" width="48" height="${height}" rx="9" fill="${i % 2 ? palette.accent2 : palette.accent}" opacity="0.52"/>`).join("")}
    ${labels.slice(0, 3).map((label, i) => `
      <rect x="880" y="${248 + i * 100}" width="270" height="76" rx="12" fill="#020617" opacity="0.66" stroke="${i % 2 ? palette.accent2 : palette.accent}" stroke-opacity="0.48"/>
      ${text(label, 902, 292 + i * 100, 24, 820)}
    `).join("")}
  `;
}

function splitCompare(labels: string[], palette: { accent: string; accent2: string }): string {
  const left = labels.slice(0, 3);
  const right = labels.slice(3, 6).length ? labels.slice(3, 6) : labels.slice(0, 3);
  return `
    <rect x="116" y="230" width="500" height="390" rx="18" fill="#020617" opacity="0.62" stroke="${palette.accent}" stroke-opacity="0.46"/>
    <rect x="664" y="230" width="500" height="390" rx="18" fill="#020617" opacity="0.62" stroke="${palette.accent2}" stroke-opacity="0.46"/>
    ${text("路径 A", 158, 282, 28, 880, palette.accent)}
    ${text("路径 B", 706, 282, 28, 880, palette.accent2)}
    ${left.map((label, i) => text(label, 158, 346 + i * 72, 26, 760)).join("")}
    ${right.map((label, i) => text(label, 706, 346 + i * 72, 26, 760)).join("")}
    <line x1="640" y1="240" x2="640" y2="610" stroke="#94a3b8" stroke-width="2" stroke-dasharray="10 14" opacity="0.38"/>
  `;
}

function recapMap(labels: string[], palette: { accent: string; accent2: string }): string {
  const items = labels.slice(0, 4);
  return `
    <circle cx="720" cy="406" r="176" fill="none" stroke="${palette.accent}" stroke-width="6" opacity="0.5"/>
    <path d="M 720 230 A 176 176 0 1 1 544 406" fill="none" stroke="${palette.accent2}" stroke-width="10" stroke-linecap="round" opacity="0.62"/>
    ${items.map((label, i) => {
      const coords = [
        [720, 230],
        [896, 406],
        [720, 582],
        [544, 406],
      ][i] ?? [720, 406];
      const [x, y] = coords;
      return `
        <circle cx="${x}" cy="${y}" r="34" fill="${i % 2 ? palette.accent2 : palette.accent}" opacity="0.86"/>
        <rect x="${x - 86}" y="${y + 48}" width="172" height="54" rx="12" fill="#020617" opacity="0.66" stroke="#94a3b8" stroke-opacity="0.18"/>
        ${text(label, x - 54, y + 82, 23, 780)}
      `;
    }).join("")}
  `;
}
