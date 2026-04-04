import type { ThemeConfig, ThemeName } from "../types";
import { techDark } from "./tech-dark";
import { cleanBright } from "./clean-bright";

const themes: Record<ThemeName, ThemeConfig> = {
  "tech-dark": techDark,
  "clean-bright": cleanBright,
};

export function getTheme(name?: ThemeName): ThemeConfig {
  return themes[name ?? "tech-dark"] ?? techDark;
}

export { techDark, cleanBright };
