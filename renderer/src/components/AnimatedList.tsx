import React from "react";
import { AnimatedText } from "./AnimatedText";
import type { ThemeName } from "../types";

interface AnimatedListProps {
  items: string[];
  baseDelay?: number; // start delay in frames
  staggerDelay?: number; // frames between each item
  theme: ThemeName;
  renderItem: (item: string, index: number) => React.ReactNode;
}

export const AnimatedList: React.FC<AnimatedListProps> = ({
  items,
  baseDelay = 8,
  staggerDelay = 5,
  theme,
  renderItem,
}) => {
  return (
    <>
      {items.map((item, i) => (
        <AnimatedText
          key={i}
          delay={baseDelay + i * staggerDelay}
          theme={theme}
          animation="fadeUp"
        >
          {renderItem(item, i)}
        </AnimatedText>
      ))}
    </>
  );
};
