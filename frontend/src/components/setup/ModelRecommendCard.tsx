import { motion } from "motion/react";
import { Check } from "lucide-react";

interface ModelRecommendCardProps {
  name: string;
  provider: string;
  description: string;
  badge?: string;
  selected: boolean;
  onClick: () => void;
}

export default function ModelRecommendCard({
  name,
  provider,
  description,
  badge,
  selected,
  onClick,
}: ModelRecommendCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`
        relative p-3 rounded-xl border text-left transition-all duration-200 w-full
        ${
          selected
            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 shadow-lg shadow-indigo-500/15"
            : "border-border bg-card hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5"
        }
      `}
      whileTap={{ scale: 0.98 }}
    >
      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center"
        >
          <Check className="w-3 h-3 text-white" />
        </motion.div>
      )}

      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium text-foreground">{name}</h4>
        {badge && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full">
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">
        {provider} · {description}
      </p>
    </motion.button>
  );
}
