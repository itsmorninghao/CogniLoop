/**
 * Asset loader utility for bundled Lottie animations.
 * Reads manifest.json and resolves asset IDs to URLs.
 */
import { staticFile } from "remotion";
import type { AssetManifest, AssetMeta } from "../types";

let manifestCache: AssetManifest | null = null;

/** Load and cache the asset manifest */
function getManifest(): AssetManifest {
  if (manifestCache) return manifestCache;

  // In Remotion bundle, staticFile() resolves to /public/ directory
  // We load manifest synchronously via a pre-loaded global (set in index.tsx)
  // Fallback: return empty manifest
  if (typeof window !== "undefined" && (window as any).__assetManifest) {
    manifestCache = (window as any).__assetManifest;
    return manifestCache!;
  }

  // Return empty manifest if not loaded yet
  return { version: 1, assets: {} };
}

/** Set the manifest (called during bundle initialization) */
export function setManifest(manifest: AssetManifest): void {
  manifestCache = manifest;
  if (typeof window !== "undefined") {
    (window as any).__assetManifest = manifest;
  }
}

/** Get the static file URL for an asset */
export function getAssetUrl(assetId: string): string | null {
  const manifest = getManifest();
  const meta = manifest.assets[assetId];
  if (!meta) return null;
  return staticFile(`assets/${meta.path}`);
}

/** Get asset metadata */
export function getAssetMeta(assetId: string): AssetMeta | null {
  const manifest = getManifest();
  return manifest.assets[assetId] ?? null;
}

/** Get all asset IDs for a category */
export function getAssetsByCategory(category: AssetMeta["category"]): string[] {
  const manifest = getManifest();
  return Object.entries(manifest.assets)
    .filter(([, meta]) => meta.category === category)
    .map(([id]) => id);
}

/** Get all asset IDs matching any of the given tags */
export function getAssetsByTag(tags: string[]): string[] {
  const manifest = getManifest();
  return Object.entries(manifest.assets)
    .filter(([, meta]) => tags.some((t) => meta.tags.includes(t)))
    .map(([id]) => id);
}

/** Check if an asset ID exists in the manifest */
export function hasAsset(assetId: string): boolean {
  const manifest = getManifest();
  return assetId in manifest.assets;
}
