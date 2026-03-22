import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import ConnectionTestButton from "./ConnectionTestButton";
import SkipWarning from "./SkipWarning";
import { adminApi } from "@/lib/api";

interface SetupEmbeddingStepProps {
  llmData: any;
  onComplete: (data: any) => void;
  onSkip: () => void;
}

export default function SetupEmbeddingStep({ llmData, onComplete, onSkip }: SetupEmbeddingStepProps) {
  const [useSameKey, setUseSameKey] = useState(false);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [formData, setFormData] = useState({
    apiKey: "",
    baseUrl: "",
    modelName: "text-embedding-3-small",
  });

  const effectiveKey = useSameKey && llmData ? llmData.apiKey : formData.apiKey;
  const effectiveUrl = useSameKey && llmData ? llmData.baseUrl : formData.baseUrl;

  const handleTest = async () => {
    await adminApi.setConfig("EMBEDDING_API_KEY", effectiveKey);
    await adminApi.setConfig("EMBEDDING_BASE_URL", effectiveUrl || "");
    await adminApi.setConfig("EMBEDDING_MODEL", formData.modelName);
    const result = await adminApi.testEmbedding({
      api_key: effectiveKey,
      base_url: effectiveUrl || undefined,
      model: formData.modelName,
      use_stored: false,
    });
    return {
      success: result.ok,
      message: result.ok ? "Embedding 模型连接成功" : "连接失败",
      details: result.ok ? { model: formData.modelName, dimension: result.dimensions_returned } : undefined,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminApi.setConfig("EMBEDDING_API_KEY", effectiveKey);
    await adminApi.setConfig("EMBEDDING_BASE_URL", effectiveUrl || "");
    await adminApi.setConfig("EMBEDDING_MODEL", formData.modelName);
    const data = useSameKey && llmData
      ? { ...llmData, modelName: formData.modelName }
      : formData;
    onComplete(data);
  };

  const handleUseSameKeyChange = (checked: boolean) => {
    setUseSameKey(checked);
    if (checked && llmData) {
      setFormData({
        apiKey: llmData.apiKey || "",
        baseUrl: llmData.baseUrl || "",
        modelName: "text-embedding-3-small",
      });
    }
  };

  const isFormValid = useSameKey || (formData.apiKey.trim() !== "" && formData.modelName.trim() !== "");

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-medium text-foreground mb-1">
          配置向量模型（Embedding）
        </h2>
        <p className="text-sm text-muted-foreground">
          如果服务商同时提供 Embedding，可复用同一 API Key
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {llmData && (
          <label
            htmlFor="useSameKey"
            className="flex items-center gap-3 p-3 bg-muted rounded-xl cursor-pointer hover:bg-muted/80 transition-all duration-200"
          >
            <Checkbox
              id="useSameKey"
              checked={useSameKey}
              onCheckedChange={handleUseSameKeyChange}
            />
            <div>
              <span className="text-sm font-medium text-foreground">
                与大模型使用相同的 API Key 和地址
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                OpenAI、DeepSeek 等服务商通常同时提供 LLM 和 Embedding
              </p>
            </div>
          </label>
        )}

        <div>
          <Label htmlFor="embApiKey">API Key *</Label>
          <Input
            id="embApiKey"
            type="password"
            value={effectiveKey}
            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
            placeholder="sk-..."
            required={!useSameKey}
            disabled={useSameKey}
            className="mt-1.5 font-mono disabled:opacity-50"
          />
        </div>

        <div>
          <Label htmlFor="embBaseUrl">API Base URL</Label>
          <Input
            id="embBaseUrl"
            type="text"
            value={effectiveUrl}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            disabled={useSameKey}
            className="mt-1.5 font-mono disabled:opacity-50"
          />
        </div>

        <div>
          <Label htmlFor="embModelName">模型名称 *</Label>
          <Input
            id="embModelName"
            type="text"
            value={formData.modelName}
            onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
            placeholder="text-embedding-3-small"
            required
            className="mt-1.5 font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            常用模型：text-embedding-3-small、text-embedding-ada-002
          </p>
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
          message="跳过后知识库智能检索和基于文档的出题功能将不可用。你可以稍后在系统设置中配置。"
          onConfirm={onSkip}
          onCancel={() => setShowSkipWarning(false)}
        />
      </form>
    </div>
  );
}
