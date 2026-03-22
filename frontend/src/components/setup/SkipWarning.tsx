import { motion, AnimatePresence } from "motion/react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SkipWarningProps {
  show: boolean;
  message: string;
  severity?: "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SkipWarning({
  show,
  message,
  severity = "warning",
  onConfirm,
  onCancel,
}: SkipWarningProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginTop: 0 }}
          animate={{ opacity: 1, height: "auto", marginTop: 16 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden"
        >
          <div
            className={`p-4 rounded-lg border ${
              severity === "warning"
                ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
            }`}
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className={`w-5 h-5 mt-0.5 ${
                  severity === "warning"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-blue-600 dark:text-blue-400"
                }`}
              />
              <div className="flex-1">
                <p
                  className={`text-sm mb-3 ${
                    severity === "warning"
                      ? "text-amber-900 dark:text-amber-100"
                      : "text-blue-900 dark:text-blue-100"
                  }`}
                >
                  {message}
                </p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={onCancel} className="text-xs">
                    返回配置
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={onConfirm}
                    className={`text-xs ${
                      severity === "warning"
                        ? "bg-amber-600 hover:bg-amber-700 text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    确认跳过
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
