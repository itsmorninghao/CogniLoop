import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ModelRecommendCard from "./ModelRecommendCard";
import ConnectionTestButton from "./ConnectionTestButton";
import SkipWarning from "./SkipWarning";
import { adminApi } from "@/lib/api";

interface SetupLLMStepProps {
  onComplete: (data: any) => void;
  onSkip: () => void;
}

const modelPresets = [
  {
    id: "gpt4o",
    name: "GPT-4o",
    provider: "OpenAI 官方",
    description: "最强大的多模态模型",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    modelName: "gpt-4o",
  },
  {
    id: "deepseek",
    name: "DeepSeek-V3",
    provider: "DeepSeek",
    description: "高性价比国产模型",
    badge: "性价比",
    apiKey: "",
    baseUrl: "https://api.deepseek.com/v1",
    modelName: "deepseek-chat",
  },
  {
    id: "qwen",
    name: "Qwen-Max",
    provider: "阿里云通义千问",
    description: "阿里云大语言模型",
    apiKey: "",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelName: "qwen-max",
  },
  {
    id: "custom",
    name: "自部署模型",
    provider: "兼容 OpenAI API",
    description: "Ollama、vLLM 等",
    apiKey: "sk-placeholder",
    baseUrl: "http://localhost:11434/v1",
    modelName: "llama3",
  },
];

export default function SetupLLMStep({ onComplete, onSkip }: SetupLLMStepProps) {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [formData, setFormData] = useState({
    apiKey: "",
    baseUrl: "",
    modelName: "",
  });

  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId);
    const preset = modelPresets.find((m) => m.id === modelId);
    if (preset) {
      setFormData({ apiKey: preset.apiKey, baseUrl: preset.baseUrl, modelName: preset.modelName });
    }
  };

  const handleTest = async () => {
    await adminApi.setConfig("OPENAI_API_KEY", formData.apiKey, "LLM API Key");
    await adminApi.setConfig("OPENAI_BASE_URL", formData.baseUrl || "", "LLM Base URL");
    await adminApi.setConfig("OPENAI_MODEL", formData.modelName, "LLM Model");
    const result = await adminApi.testLlm({
      api_key: formData.apiKey,
      base_url: formData.baseUrl || undefined,
      model: formData.modelName,
      use_stored: false,
    });
    return {
      success: result.ok,
      message: result.ok ? "模型响应正常" : result.message,
      details: result.ok ? { model: formData.modelName, response: result.message } : undefined,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminApi.setConfig("OPENAI_API_KEY", formData.apiKey, "LLM API Key");
    await adminApi.setConfig("OPENAI_BASE_URL", formData.baseUrl || "", "LLM Base URL");
    await adminApi.setConfig("OPENAI_MODEL", formData.modelName, "LLM Model");
    onComplete(formData);
  };

  const isFormValid = formData.apiKey.trim() !== "" && formData.modelName.trim() !== "";

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-medium text-foreground mb-1">
          配置大语言模型（LLM）
        </h2>
        <p className="text-sm text-muted-foreground">需要兼容 OpenAI API 格式的模型服务</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {modelPresets.map((model) => (
          <ModelRecommendCard
            key={model.id}
            name={model.name}
            provider={model.provider}
            description={model.description}
            badge={model.badge}
            selected={selectedModel === model.id}
            onClick={() => handleModelSelect(model.id)}
          />
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="apiKey">API Key *</Label>
          <Input
            id="apiKey"
            type="password"
            value={formData.apiKey}
            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
            placeholder="sk-..."
            required
            className="mt-1.5 font-mono"
          />
        </div>

        <div>
          <Label htmlFor="baseUrl">API Base URL</Label>
          <Input
            id="baseUrl"
            type="text"
            value={formData.baseUrl}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            className="mt-1.5 font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">OpenAI 官方可留空，使用默认地址</p>
        </div>

        <div>
          <Label htmlFor="modelName">模型名称 *</Label>
          <Input
            id="modelName"
            type="text"
            value={formData.modelName}
            onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
            placeholder="gpt-4o"
            required
            className="mt-1.5 font-mono"
          />
        </div>

        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>获取 Key：</span>
          {[
            { label: "OpenAI", url: "https://platform.openai.com/api-keys" },
            { label: "DeepSeek", url: "https://platform.deepseek.com/api-keys" },
            { label: "阿里云", url: "https://dashscope.console.aliyun.com/apiKey" },
          ].map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-indigo-500 hover:text-indigo-600 hover:underline transition-colors duration-150"
            >
              <ExternalLink className="w-3 h-3" />
              {link.label}
            </a>
          ))}
        </div>

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
          message="跳过后 AI 出题、自动批改、学习路径分析等功能将不可用。你可以稍后在系统设置中配置。"
          onConfirm={onSkip}
          onCancel={() => setShowSkipWarning(false)}
        />
      </form>
    </div>
  );
}
