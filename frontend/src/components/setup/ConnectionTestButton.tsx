import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConnectionTestButtonProps {
  onTest: () => Promise<{ success: boolean; message?: string; details?: any }>;
  disabled?: boolean;
}

export default function ConnectionTestButton({ onTest, disabled }: ConnectionTestButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<any>(null);

  const handleTest = async () => {
    setStatus("loading");
    setResult(null);

    try {
      const response = await onTest();
      setStatus(response.success ? "success" : "error");
      setResult(response);
    } catch (error: any) {
      setStatus("error");
      setResult({ success: false, message: error?.message || "连接测试失败" });
    }
  };

  return (
    <div>
      <Button
        type="button"
        onClick={handleTest}
        disabled={disabled || status === "loading"}
        variant="outline"
        className={`
          relative overflow-hidden w-full
          ${status === "success" ? "border-green-500 text-green-600 dark:text-green-400" : ""}
          ${status === "error" ? "border-red-500 text-red-600 dark:text-red-400" : ""}
        `}
      >
        {status === "loading" && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        )}

        <span className="relative flex items-center justify-center gap-2">
          {status === "loading" && <Loader2 className="w-4 h-4 animate-spin" />}
          {status === "success" && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
              <Check className="w-4 h-4" />
            </motion.span>
          )}
          {status === "error" && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring" }}
            >
              <X className="w-4 h-4" />
            </motion.span>
          )}
          {status === "idle" && "测试连接"}
          {status === "loading" && "测试中..."}
          {status === "success" && "连接成功"}
          {status === "error" && "连接失败"}
        </span>
      </Button>

      <AnimatePresence>
        {status === "success" && result && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="mt-4 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg"
          >
            <div className="flex items-start gap-2">
              <Check className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  {result.message || "连接成功"}
                </p>
                {result.details && (
                  <pre className="mt-2 text-xs text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 p-2 rounded overflow-auto">
                    {JSON.stringify(result.details, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {status === "error" && result && (
          <motion.div
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -5 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="mt-4 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg"
          >
            <motion.div
              animate={{ x: [0, -5, 5, -5, 5, 0] }}
              transition={{ duration: 0.4 }}
              className="flex items-start gap-2"
            >
              <X className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900 dark:text-red-100">
                  {result.message || "连接失败，请检查配置"}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
