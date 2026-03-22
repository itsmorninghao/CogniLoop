/** SetupWizardPage — first-run onboarding wizard. */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { Check, AlertCircle, Brain, BookOpen, ScanText, Rocket, KeyRound } from "lucide-react";
import { setupApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import SetupAdminStep from "@/components/setup/SetupAdminStep";
import SetupLLMStep from "@/components/setup/SetupLLMStep";
import SetupEmbeddingStep from "@/components/setup/SetupEmbeddingStep";
import SetupOCRStep from "@/components/setup/SetupOCRStep";
import SetupCompleteStep from "@/components/setup/SetupCompleteStep";

export type StepStatus = "pending" | "current" | "completed" | "skipped";

export interface StepData {
  id: number;
  status: StepStatus;
  data?: any;
}

const stepMeta = [
  { id: 1, title: "管理员账号", icon: KeyRound },
  { id: 2, title: "大语言模型", icon: Brain },
  { id: 3, title: "向量模型", icon: BookOpen },
  { id: 4, title: "OCR 模型", icon: ScanText },
  { id: 5, title: "完成部署", icon: Rocket },
];

const stepDescriptions: Record<number, { title: string; subtitle: string }> = {
  1: { title: "欢迎使用 CogniLoop", subtitle: "创建你的管理员账号，开始部署之旅" },
  2: { title: "配置 AI 大脑", subtitle: "智能出题、自动批改、学习路径分析的核心引擎" },
  3: { title: "配置知识引擎", subtitle: "为知识库语义检索与 RAG 提供向量支持" },
  4: { title: "配置试卷识别", subtitle: "OCR 用于识别上传的纸质试卷图片或 PDF" },
  5: { title: "一切准备就绪", subtitle: "CogniLoop 已完成首次部署配置" },
};

const orbColors: Record<number, string[]> = {
  1: ["#6366f1", "#8b5cf6", "#a78bfa"],
  2: ["#8b5cf6", "#7c3aed", "#6366f1"],
  3: ["#10b981", "#06b6d4", "#6366f1"],
  4: ["#f59e0b", "#ef4444", "#ec4899"],
  5: ["#ec4899", "#8b5cf6", "#6366f1"],
};

export default function SetupWizardPage() {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [steps, setSteps] = useState<StepData[]>([
    { id: 1, status: "current" },
    { id: 2, status: "pending" },
    { id: 3, status: "pending" },
    { id: 4, status: "pending" },
    { id: 5, status: "pending" },
  ]);

  const [adminData, setAdminData] = useState<any>(null);
  const [llmData, setLlmData] = useState<any>(null);
  const [embeddingData, setEmbeddingData] = useState<any>(null);
  const [ocrData, setOcrData] = useState<any>(null);

  // Route guard
  useEffect(() => {
    setupApi.check().then(({ needs_setup, onboarding_complete }) => {
      if (onboarding_complete) {
        navigate("/", { replace: true });
        return;
      }
      if (!needs_setup && !token) {
        navigate("/login", { replace: true });
        return;
      }
      if (!needs_setup && token) {
        // Admin already exists and we're logged in — skip to step 2
        setSteps((prev) =>
          prev.map((s) => (s.id === 1 ? { ...s, status: "completed" } : s.id === 2 ? { ...s, status: "current" } : s))
        );
        setCurrentStep(2);
      }
      setLoading(false);
    }).catch(() => {
      navigate("/login", { replace: true });
    });
  }, [navigate, token]);

  const handleStepComplete = (stepId: number, data?: any) => {
    if (stepId === 1) setAdminData(data);
    if (stepId === 2) setLlmData(data);
    if (stepId === 3) setEmbeddingData(data);
    if (stepId === 4) setOcrData(data);

    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === stepId) return { ...step, status: "completed" as StepStatus, data };
        if (step.id === stepId + 1 && step.status === "pending") return { ...step, status: "current" as StepStatus };
        return step;
      })
    );
    setCurrentStep(stepId + 1);
  };

  const handleStepSkip = (stepId: number) => {
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === stepId) return { ...step, status: "skipped" as StepStatus };
        if (step.id === stepId + 1 && step.status === "pending") return { ...step, status: "current" as StepStatus };
        return step;
      })
    );
    setCurrentStep(stepId + 1);
  };

  const handleStepClick = (stepId: number) => {
    const target = steps.find((s) => s.id === stepId);
    if (!target || target.status === "pending" || stepId === 5) return;
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === stepId) return { ...step, status: "current" as StepStatus };
        return step;
      })
    );
    setCurrentStep(stepId);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <SetupAdminStep onComplete={(data) => handleStepComplete(1, data)} />;
      case 2:
        return (
          <SetupLLMStep
            onComplete={(data) => handleStepComplete(2, data)}
            onSkip={() => handleStepSkip(2)}
          />
        );
      case 3:
        return (
          <SetupEmbeddingStep
            llmData={llmData}
            onComplete={(data) => handleStepComplete(3, data)}
            onSkip={() => handleStepSkip(3)}
          />
        );
      case 4:
        return (
          <SetupOCRStep
            llmData={llmData}
            onComplete={(data) => handleStepComplete(4, data)}
            onSkip={() => handleStepSkip(4)}
          />
        );
      case 5:
        return (
          <SetupCompleteStep
            adminData={adminData}
            llmData={llmData}
            embeddingData={embeddingData}
            ocrData={ocrData}
          />
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const colors = orbColors[currentStep] || orbColors[1];
  const desc = stepDescriptions[currentStep];

  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center p-3 sm:p-5 lg:p-8">
      {/* Page background glow blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-48 -top-48 size-[480px] rounded-full bg-indigo-500/8 blur-3xl" />
        <div className="absolute -bottom-48 -right-48 size-[480px] rounded-full bg-purple-500/8 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/5 blur-3xl" />
      </div>

      {/* Main card */}
      <div className="w-full max-w-[1300px] min-h-[calc(100vh-6rem)] sm:min-h-[calc(100vh-5rem)] lg:min-h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-border shadow-2xl shadow-black/8 dark:shadow-black/25 lg:flex">

        {/* Left panel — dark visual + progress stepper */}
        <div className="hidden lg:flex lg:w-[42%] relative bg-slate-950 flex-col overflow-hidden min-h-[calc(100vh-4rem)]">
          {/* Animated gradient mesh background */}
          <div className="absolute inset-0">
            <motion.div
              key={`orb1-${currentStep}`}
              className="absolute w-[500px] h-[500px] rounded-full opacity-30 blur-[100px]"
              style={{ background: colors[0] }}
              initial={{ x: "-30%", y: "-20%", scale: 0.8 }}
              animate={{ x: ["-30%", "-10%", "-30%"], y: ["-20%", "10%", "-20%"], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              key={`orb2-${currentStep}`}
              className="absolute w-[400px] h-[400px] rounded-full opacity-25 blur-[80px]"
              style={{ background: colors[1], right: "-20%", bottom: "-10%" }}
              animate={{ x: ["0%", "-15%", "0%"], y: ["0%", "-20%", "0%"], scale: [1, 1.3, 1] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            />
            <motion.div
              key={`orb3-${currentStep}`}
              className="absolute w-[300px] h-[300px] rounded-full opacity-20 blur-[60px]"
              style={{ background: colors[2], left: "30%", top: "40%" }}
              animate={{ x: ["0%", "20%", "0%"], y: ["0%", "-15%", "0%"], scale: [0.9, 1.1, 0.9] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            />
            {/* Grid overlay */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
          </div>

          {/* Content overlay */}
          <div className="relative z-10 flex flex-col h-full p-8 lg:p-10">
            {/* Logo */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-bold text-white tracking-tight">CogniLoop</h1>
              <p className="text-xs text-white/40 mt-0.5">AI-Powered Learning System</p>
            </motion.div>

            {/* Center: step description with large animated icon */}
            <div className="flex-1 flex flex-col items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.9 }}
                  transition={{ duration: 0.4 }}
                  className="text-center"
                >
                  <motion.div
                    className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
                      boxShadow: `0 20px 60px -10px ${colors[0]}66`,
                    }}
                    animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    {(() => {
                      const Icon = stepMeta[currentStep - 1].icon;
                      return <Icon className="w-9 h-9 text-white" />;
                    })()}
                  </motion.div>

                  <h2 className="text-2xl font-semibold text-white mb-2">{desc.title}</h2>
                  <p className="text-sm text-white/50 max-w-[280px] mx-auto">{desc.subtitle}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Bottom: horizontal progress stepper */}
            <div className="flex items-center gap-1">
              {steps.map((step, index) => {
                const info = stepMeta[index];
                const Icon = info.icon;
                const isCompleted = step.status === "completed";
                const isCurrent = step.status === "current";
                const isSkipped = step.status === "skipped";
                const isPending = step.status === "pending";
                const isClickable = !isPending && step.id !== 5 && !isCurrent;

                return (
                  <div key={step.id} className="flex items-center flex-1">
                    <motion.button
                      type="button"
                      onClick={() => isClickable && handleStepClick(step.id)}
                      className={`
                        w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200
                        ${isCompleted ? "bg-white/20" : isCurrent ? "bg-white/10 ring-2 ring-white/50" : isSkipped ? "bg-amber-500/30" : "bg-white/5"}
                        ${isClickable ? "cursor-pointer hover:scale-110 hover:bg-white/30" : isPending ? "cursor-default" : "cursor-default"}
                      `}
                      animate={
                        isCurrent
                          ? { boxShadow: ["0 0 0 0 rgba(255,255,255,0.3)", "0 0 0 8px rgba(255,255,255,0)"] }
                          : {}
                      }
                      transition={{ duration: 1.5, repeat: isCurrent ? Infinity : 0 }}
                      whileTap={isClickable ? { scale: 0.9 } : {}}
                    >
                      {isCompleted ? (
                        <Check className="w-3.5 h-3.5 text-white" />
                      ) : isSkipped ? (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Icon className={`w-3.5 h-3.5 ${isCurrent ? "text-white" : "text-white/30"}`} />
                      )}
                    </motion.button>

                    {index < steps.length - 1 && (
                      <div className="flex-1 h-[2px] mx-1 bg-white/10 rounded-full overflow-hidden">
                        {(isCompleted || isSkipped) && (
                          <motion.div
                            className="h-full bg-white/40 rounded-full"
                            initial={{ width: "0%" }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 0.4 }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-1 mt-2">
              {steps.map((step, index) => {
                const info = stepMeta[index];
                const isCurrent = step.status === "current";
                const isPending = step.status === "pending";
                const isClickable = !isPending && step.id !== 5 && !isCurrent;
                return (
                  <div key={step.id} className="flex-1 flex items-center">
                    <button
                      type="button"
                      onClick={() => isClickable && handleStepClick(step.id)}
                      className={`text-[10px] truncate transition-colors duration-150 ${
                        isCurrent ? "text-white/70" : "text-white/25"
                      } ${isClickable ? "cursor-pointer hover:text-white/60" : "cursor-default"}`}
                    >
                      {info.title}
                    </button>
                    {index < steps.length - 1 && <div className="flex-1" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right panel — form content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {/* Mobile header */}
          <div className="lg:hidden p-4 border-b border-border flex items-center justify-between">
            <h1 className="text-lg font-medium bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
              CogniLoop
            </h1>
            <span className="text-xs text-muted-foreground">步骤 {currentStep} / 5</span>
          </div>

          {/* Scrollable form area */}
          <div className="flex-1 overflow-y-auto">
            <div className="min-h-full flex items-start lg:items-center justify-center p-6 lg:p-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 30, filter: "blur(4px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, x: -30, filter: "blur(4px)" }}
                  transition={{ duration: 0.3 }}
                  className="w-full max-w-lg"
                >
                  {renderStep()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
