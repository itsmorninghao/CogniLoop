import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import ConnectionTestButton from "./ConnectionTestButton";
import SkipWarning from "./SkipWarning";
import { adminApi } from "@/lib/api";

interface SetupOCRStepProps {
  llmData: any;
  onComplete: (data: any) => void;
  onSkip: () => void;
}

export default function SetupOCRStep({ llmData, onComplete, onSkip }: SetupOCRStepProps) {
  const [ocrMode, setOcrMode] = useState<"multimodal" | "ocr-llm">("multimodal");
  const [useGlobalKey, setUseGlobalKey] = useState(false);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [formData, setFormData] = useState({
    apiKey: "",
    baseUrl: "",
    modelName: "gpt-4o",
    structureLLM: "gpt-4o-mini",
  });

  const effectiveKey = useGlobalKey && llmData ? llmData.apiKey : formData.apiKey;
  const effectiveUrl = useGlobalKey && llmData ? llmData.baseUrl : formData.baseUrl;

  const handleTest = async () => {
    await adminApi.setConfig("OCR_API_KEY", effectiveKey);
    await adminApi.setConfig("OCR_API_URL", effectiveUrl || "");
    await adminApi.setConfig("OCR_MODEL", formData.modelName);
    await adminApi.setConfig("OCR_MODE", ocrMode === "ocr-llm" ? "ocr_plus_llm" : "multimodal");
    if (ocrMode === "ocr-llm") {
      await adminApi.setConfig("OCR_LLM_MODEL", formData.structureLLM);
    }
    const result = await adminApi.testOcr();
    return {
      success: result.ok,
      message: result.ok ? "OCR 模型测试成功" : result.message,
      details: result.ok ? { mode: ocrMode, detected_text: result.raw_ocr_text || "识别成功" } : undefined,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminApi.setConfig("OCR_API_KEY", effectiveKey);
    await adminApi.setConfig("OCR_API_URL", effectiveUrl || "");
    await adminApi.setConfig("OCR_MODEL", formData.modelName);
    await adminApi.setConfig("OCR_MODE", ocrMode === "ocr-llm" ? "ocr_plus_llm" : "multimodal");
    if (ocrMode === "ocr-llm") {
      await adminApi.setConfig("OCR_LLM_MODEL", formData.structureLLM);
    }
    const data = useGlobalKey && llmData
      ? { ...llmData, mode: ocrMode, structureLLM: formData.structureLLM }
      : { ...formData, mode: ocrMode };
    onComplete(data);
  };

  const handleUseGlobalKeyChange = (checked: boolean) => {
    setUseGlobalKey(checked);
    if (checked && llmData) {
      setFormData({
        apiKey: llmData.apiKey || "",
        baseUrl: llmData.baseUrl || "",
        modelName: llmData.modelName || "gpt-4o",
        structureLLM: "gpt-4o-mini",
      });
    }
  };

  const isFormValid = useGlobalKey || (formData.apiKey.trim() !== "" && formData.modelName.trim() !== "");

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-medium text-foreground mb-1">
          配置 OCR 模型（可选）
        </h2>
        <p className="text-sm text-muted-foreground">如果不需要扫描纸质试卷，可以放心跳过</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <RadioGroup
          value={ocrMode}
          onValueChange={(v) => setOcrMode(v as any)}
          className="grid grid-cols-2 gap-2"
        >
          <label
            htmlFor="multimodal"
            className={`flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
              ocrMode === "multimodal"
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                : "border-border hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5"
            }`}
          >
            <RadioGroupItem value="multimodal" id="multimodal" className="mt-0.5" />
            <div>
              <span className="text-sm font-medium text-foreground">多模态直出</span>
              <p className="text-xs text-muted-foreground mt-0.5">GPT-4o 等直接识别（推荐）</p>
            </div>
          </label>

          <label
            htmlFor="ocr-llm"
            className={`flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
              ocrMode === "ocr-llm"
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                : "border-border hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5"
            }`}
          >
            <RadioGroupItem value="ocr-llm" id="ocr-llm" className="mt-0.5" />
            <div>
              <span className="text-sm font-medium text-foreground">OCR + LLM</span>
              <p className="text-xs text-muted-foreground mt-0.5">先 OCR 识别再 LLM 结构化</p>
            </div>
          </label>
        </RadioGroup>

        {llmData && (
          <label
            htmlFor="useGlobalKey"
            className="flex items-center gap-3 p-3 bg-muted rounded-xl cursor-pointer hover:bg-muted/80 transition-all duration-200"
          >
            <Checkbox
              id="useGlobalKey"
              checked={useGlobalKey}
              onCheckedChange={handleUseGlobalKeyChange}
            />
            <div>
              <span className="text-sm font-medium text-foreground">
                使用全局 LLM 配置
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">复用已配置的大语言模型 API Key</p>
            </div>
          </label>
        )}

        <div>
          <Label htmlFor="ocrApiKey">API Key *</Label>
          <Input
            id="ocrApiKey"
            type="password"
            value={effectiveKey}
            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
            placeholder="sk-..."
            required={!useGlobalKey}
            disabled={useGlobalKey}
            className="mt-1.5 font-mono disabled:opacity-50"
          />
        </div>

        <div>
          <Label htmlFor="ocrBaseUrl">API Base URL</Label>
          <Input
            id="ocrBaseUrl"
            type="text"
            value={effectiveUrl}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            disabled={useGlobalKey}
            className="mt-1.5 font-mono disabled:opacity-50"
          />
        </div>

        <div>
          <Label htmlFor="ocrModelName">
            {ocrMode === "multimodal" ? "多模态模型名称" : "OCR 模型名称"} *
          </Label>
          <Input
            id="ocrModelName"
            type="text"
            value={formData.modelName}
            onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
            placeholder={ocrMode === "multimodal" ? "gpt-4o" : "ocr-model"}
            required
            className="mt-1.5 font-mono"
          />
        </div>

        {ocrMode === "ocr-llm" && (
          <div>
            <Label htmlFor="structureLLM">结构化 LLM 模型名称</Label>
            <Input
              id="structureLLM"
              type="text"
              value={formData.structureLLM}
              onChange={(e) => setFormData({ ...formData, structureLLM: e.target.value })}
              placeholder="gpt-4o-mini"
              className="mt-1.5 font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">用于将 OCR 文本结构化为题目格式</p>
          </div>
        )}

        <ConnectionTestButton onTest={handleTest} disabled={!isFormValid} />

        <Button
          type="submit"
          disabled={!isFormValid}
          className="w-full h-10 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium shadow-lg shadow-indigo-500/25 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          下一步
        </Button>

        <button
          type="button"
          onClick={() => setShowSkipWarning(true)}
          className="w-full text-xs text-muted-foreground hover:text-primary hover:underline transition-colors duration-150"
        >
          跳过此步骤
        </button>

        <SkipWarning
          show={showSkipWarning}
          message="大多数用户并不需要 OCR，跳过不影响核心学习功能。如需识别纸质试卷，可稍后在系统设置中配置。"
          severity="info"
          onConfirm={onSkip}
          onCancel={() => setShowSkipWarning(false)}
        />
      </form>
    </div>
  );
}
