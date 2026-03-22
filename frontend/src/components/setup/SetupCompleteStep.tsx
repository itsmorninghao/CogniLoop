import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Check, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import confetti from "canvas-confetti";
import { useNavigate } from "react-router";
import { adminApi } from "@/lib/api";

interface SetupCompleteStepProps {
  adminData: any;
  llmData: any;
  embeddingData: any;
  ocrData: any;
}

export default function SetupCompleteStep({
  adminData,
  llmData,
  embeddingData,
  ocrData,
}: SetupCompleteStepProps) {
  const navigate = useNavigate();
  const confettiTriggered = useRef(false);

  useEffect(() => {
    if (!confettiTriggered.current) {
      confettiTriggered.current = true;
      const duration = 3000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

      function randomInRange(min: number, max: number) {
        return Math.random() * (max - min) + min;
      }

      const interval = setInterval(function () {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);
        const particleCount = 50 * (timeLeft / duration);
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
          colors: ["#6366f1", "#8b5cf6", "#ec4899", "#10b981", "#fbbf24"],
        });
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
          colors: ["#6366f1", "#8b5cf6", "#ec4899", "#10b981", "#fbbf24"],
        });
      }, 250);
      return () => clearInterval(interval);
    }
  }, []);

  const handleFinish = async () => {
    try {
      await adminApi.setConfig("ONBOARDING_COMPLETE", "true", "Onboarding wizard completed");
    } catch { /* best effort */ }
    navigate("/login", { replace: true });
  };

  const configSummary = [
    { label: "管理员账号", value: adminData?.username || "admin", configured: !!adminData },
    { label: "大语言模型", value: llmData?.modelName || "未配置", configured: !!llmData },
    { label: "向量模型", value: embeddingData?.modelName || "未配置", configured: !!embeddingData },
    { label: "OCR 模型", value: ocrData?.modelName || "未配置（可后续补充）", configured: !!ocrData },
  ];

  return (
    <div>
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", duration: 0.8, delay: 0.2 }}
          className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-2xl shadow-indigo-500/40"
        >
          <Check className="w-10 h-10 text-white" strokeWidth={3} />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-2xl font-medium text-foreground mb-2"
        >
          一切准备就绪！
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-sm text-muted-foreground"
        >
          CogniLoop 已完成首次部署
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="mb-6"
      >
        <h3 className="text-sm font-medium text-muted-foreground mb-3">配置总结</h3>
        <div className="space-y-2">
          {configSummary.map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 + index * 0.08 }}
              className="flex items-center justify-between py-2.5 px-3 bg-muted rounded-xl"
            >
              <div className="flex items-center gap-2.5">
                {item.configured ? (
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                ) : (
                  <div className="w-5 h-5 bg-muted rounded-full flex items-center justify-center">
                    <X className="w-3 h-3 text-muted-foreground" />
                  </div>
                )}
                <span className="text-sm font-medium text-foreground">
                  {item.label}
                </span>
              </div>
              <span className="text-sm text-muted-foreground font-mono">{item.value}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
      >
        <Button
          onClick={handleFinish}
          className="w-full h-12 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white font-medium shadow-xl shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all duration-200 group relative overflow-hidden"
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
          <span className="relative flex items-center justify-center">
            开始使用 CogniLoop
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
          </span>
        </Button>
        <p className="text-center text-xs text-muted-foreground mt-3">
          未配置的功能可随时在系统设置中补充
        </p>
      </motion.div>
    </div>
  );
}
