import React from "react";
import type { TemplateType, ThemeConfig } from "../types";

/**
 * Returns the appropriate 3D background for a given slide template and theme.
 *
 * 3D backgrounds are currently disabled because headless Chromium in Docker
 * cannot create WebGL contexts reliably (even with GPU passthrough).
 *
 * To re-enable, dynamically import the Three.js components here.
 */
export function get3dBackground(
  _template: TemplateType,
  _theme: ThemeConfig,
): React.ReactNode | null {
  // 3D disabled — WebGL not available in headless Docker renderer
  return null;
}
