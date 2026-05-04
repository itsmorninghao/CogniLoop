import { staticFile } from "remotion";
import type { AssetManifest, AssetMeta } from "../types";

let manifestCache: AssetManifest | null = null;

function getManifest(): AssetManifest {
  if (manifestCache) return manifestCache;

  if (typeof window !== "undefined" && (window as any).__assetManifest) {
    manifestCache = (window as any).__assetManifest;
    return manifestCache!;
  }

  return { version: 1, assets: {} };
}

export function setManifest(manifest: AssetManifest): void {
  manifestCache = manifest;
  if (typeof window !== "undefined") {
    (window as any).__assetManifest = manifest;
  }
}

export function getAssetUrl(assetId: string): string | null {
  const manifest = getManifest();
  const meta = manifest.assets[assetId];
  if (!meta) return null;
  return staticFile(`assets/${meta.path}`);
}

export function getAssetMeta(assetId: string): AssetMeta | null {
  const manifest = getManifest();
  return manifest.assets[assetId] ?? null;
}

export function getAssetsByCategory(category: AssetMeta["category"]): string[] {
  const manifest = getManifest();
  return Object.entries(manifest.assets)
    .filter(([, meta]) => meta.category === category)
    .map(([id]) => id);
}

export function getAssetsByTag(tags: string[]): string[] {
  const manifest = getManifest();
  return Object.entries(manifest.assets)
    .filter(([, meta]) => tags.some((t) => meta.tags.includes(t)))
    .map(([id]) => id);
}

export function hasAsset(assetId: string): boolean {
  const manifest = getManifest();
  return assetId in manifest.assets;
}
