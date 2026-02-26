import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Settings,
  Loader2,
  Save,
  History,
  Brain,
  Database,
  Search,
  AlertTriangle,
  Copy,
  Plus,
  Trash2,
  Bot,
  FileQuestion,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Pencil,
  ShieldCheck,
  User,
  CheckCircle,
  TrendingUp,
  GitBranch,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import {
  configApi,
  type ConfigGroup,
  type ConfigItem,
  type AgentInfo,
  type AuditLogEntry,
} from '@/services/config';

// 分组元信息：图标和颜色
const GROUP_META: Record<string, { icon: typeof Brain; color: string; bg: string }> = {
  llm: { icon: Brain, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  embedding: { icon: Database, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  rag: { icon: Search, color: 'text-green-500', bg: 'bg-green-500/10' },
  exam_agent: { icon: FileQuestion, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  exam_agent_llm: { icon: Bot, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
};

const AGENT_ICONS: Record<string, typeof Brain> = {
  question: Pencil,
  qc: ShieldCheck,
  solve: User,
  grade: CheckCircle,
  hotspot: TrendingUp,
  dispatch: GitBranch,
};

const AGENT_ORDER = ['question', 'qc', 'solve', 'grade', 'hotspot', 'dispatch'];

interface SolveModelEntry {
  label: string;
  api_key: string;
  base_url: string;
  model: string;
  temperature: number;
}

function parseSolveModels(json: string): SolveModelEntry[] {
  try {
    const arr = JSON.parse(json || '[]');
    if (!Array.isArray(arr)) return [];
    return arr.map((m: Record<string, unknown>) => ({
      label: String(m.label || ''),
      api_key: String(m.api_key || ''),
      base_url: String(m.base_url || ''),
      model: String(m.model || ''),
      temperature: Number(m.temperature ?? 0.9),
    }));
  } catch {
    return [];
  }
}

export function SystemSettingsPage() {
  const [groups, setGroups] = useState<Record<string, ConfigGroup>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, string>>({});

  // Password visibility toggles
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  // Collapsed agent sections — 默认全部折叠
  const [collapsedAgents, setCollapsedAgents] = useState<Set<string>>(new Set(AGENT_ORDER));

  // 同步确认弹窗
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [syncTarget, setSyncTarget] = useState<{ mode: 'all' } | { mode: 'single'; prefix: string; name: string } | null>(null);

  const formValuesRef = useRef<Record<string, string>>({});

  // ==================== 数据加载 ====================

  const loadConfigs = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await configApi.getAll();
      const loadedGroups = response.data.groups;
      setGroups(loadedGroups);

      const initialValues: Record<string, string> = {};
      for (const group of Object.values(loadedGroups)) {
        for (const item of group.items) {
          initialValues[item.key] = item.value;
        }
      }
      setFormValues(initialValues);
      formValuesRef.current = initialValues;
    } catch (error) {
      toast.error('加载配置失败');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    try {
      setIsLoadingLogs(true);
      const response = await configApi.getAuditLogs(0, 50);
      setAuditLogs(response.data.items);
      setAuditTotal(response.data.total);
    } catch (error) {
      toast.error('加载审计日志失败');
      console.error(error);
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  // ==================== 表单操作 ====================

  const handleInputChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    formValuesRef.current = { ...formValuesRef.current, [key]: value };
  };

  const getChangedConfigs = (currentFormValues: Record<string, string>): Record<string, string> => {
    const changed: Record<string, string> = {};
    for (const group of Object.values(groups)) {
      for (const item of group.items) {
        const currentValue = currentFormValues[item.key];
        if (currentValue !== undefined && currentValue !== item.value) {
          changed[item.key] = currentValue;
        }
      }
    }
    return changed;
  };

  const hasEmbeddingChanges = (changes: Record<string, string>): boolean => {
    const embeddingKeys = new Set([
      'embedding_api_key',
      'embedding_base_url',
      'embedding_model',
      'embedding_dims',
    ]);
    return Object.keys(changes).some((key) => embeddingKeys.has(key));
  };

  const handleSave = () => {
    const changes = getChangedConfigs(formValuesRef.current);
    if (Object.keys(changes).length === 0) {
      toast.info('没有需要保存的变更');
      return;
    }
    if (hasEmbeddingChanges(changes)) {
      setPendingUpdates(changes);
      setConfirmDialogOpen(true);
      return;
    }
    doSave(changes);
  };

  const doSave = async (updates: Record<string, string>) => {
    try {
      setIsSaving(true);
      const response = await configApi.update(updates);
      const result = response.data;
      if (result.revectorize_triggered) {
        toast.success('配置已更新，正在后台重新向量化所有文档...');
      } else {
        toast.success('配置已更新');
      }
      await loadConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setIsSaving(false);
      setConfirmDialogOpen(false);
      setPendingUpdates({});
    }
  };

  // ==================== 一键同步全局 LLM ====================

  const requestSyncAll = () => {
    setSyncTarget({ mode: 'all' });
    setSyncConfirmOpen(true);
  };

  const requestSyncAgent = (prefix: string, name: string) => {
    setSyncTarget({ mode: 'single', prefix, name });
    setSyncConfirmOpen(true);
  };

  const executeSyncConfirmed = () => {
    if (!syncTarget) return;
    const globalKey = formValuesRef.current['openai_api_key'] || '';
    const globalUrl = formValuesRef.current['openai_base_url'] || '';
    const globalModel = formValuesRef.current['openai_model'] || '';

    if (syncTarget.mode === 'all') {
      const updates: Record<string, string> = {};
      for (const prefix of AGENT_ORDER) {
        updates[`exam_agent_${prefix}_api_key`] = globalKey;
        updates[`exam_agent_${prefix}_base_url`] = globalUrl;
        updates[`exam_agent_${prefix}_model`] = globalModel;
      }
      setFormValues((prev) => ({ ...prev, ...updates }));
      formValuesRef.current = { ...formValuesRef.current, ...updates };
      toast.success('已将全局 LLM 配置同步到所有 Agent');
    } else {
      const { prefix, name } = syncTarget;
      const updates: Record<string, string> = {
        [`exam_agent_${prefix}_api_key`]: globalKey,
        [`exam_agent_${prefix}_base_url`]: globalUrl,
        [`exam_agent_${prefix}_model`]: globalModel,
      };
      setFormValues((prev) => ({ ...prev, ...updates }));
      formValuesRef.current = { ...formValuesRef.current, ...updates };
      toast.success(`已同步全局配置到 ${name}`);
    }

    setSyncConfirmOpen(false);
    setSyncTarget(null);
  };

  // ==================== Password toggle ====================

  const togglePasswordVisibility = (key: string) => {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ==================== Agent section collapse ====================

  const toggleAgentCollapse = (prefix: string) => {
    setCollapsedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  };

  // ==================== Solve Models Editor ====================

  const solveModels = useMemo(
    () => parseSolveModels(formValues['exam_agent_solve_models'] || '[]'),
    [formValues['exam_agent_solve_models']],
  );

  const updateSolveModels = (models: SolveModelEntry[]) => {
    const json = JSON.stringify(models, null, 2);
    handleInputChange('exam_agent_solve_models', json);
  };

  const addSolveModel = () => {
    updateSolveModels([
      ...solveModels,
      { label: `考生模型 ${solveModels.length + 1}`, api_key: '', base_url: '', model: '', temperature: 0.9 },
    ]);
  };

  const removeSolveModel = (index: number) => {
    updateSolveModels(solveModels.filter((_, i) => i !== index));
  };

  const updateSolveModelField = (index: number, field: keyof SolveModelEntry, value: string | number) => {
    const updated = [...solveModels];
    updated[index] = { ...updated[index], [field]: value };
    updateSolveModels(updated);
  };

  // ==================== 渲染辅助 ====================

  const renderConfigInput = (item: ConfigItem) => {
    const isPassword = item.type === 'password';
    const isVisible = visiblePasswords.has(item.key);

    return (
      <div key={item.key} className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={item.key} className="text-sm font-medium">
            {item.label}
          </Label>
          <span className="text-[11px] text-muted-foreground font-mono">{item.key}</span>
        </div>
        <div className="relative">
          <Input
            id={item.key}
            type={item.type === 'integer' ? 'number' : isPassword && !isVisible ? 'password' : 'text'}
            value={formValues[item.key] ?? ''}
            onChange={(e) => handleInputChange(item.key, e.target.value)}
            placeholder={isPassword ? '留空则使用全局配置' : `请输入${item.label}`}
            min={item.type === 'integer' ? 0 : undefined}
            className={isPassword ? 'pr-10' : ''}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => togglePasswordVisibility(item.key)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{item.description}</p>
      </div>
    );
  };

  const renderGroupCard = (groupKey: string, group: ConfigGroup) => {
    if (groupKey === 'exam_agent_llm') {
      return renderExamAgentLlmGroup(group);
    }

    const meta = GROUP_META[groupKey] || {
      icon: Settings,
      color: 'text-gray-500',
      bg: 'bg-gray-500/10',
    };
    const Icon = meta.icon;

    return (
      <Card key={groupKey}>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${meta.bg} flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${meta.color}`} />
            </div>
            {group.label}
          </CardTitle>
          {group.description && (
            <CardDescription>{group.description}</CardDescription>
          )}
          {groupKey === 'embedding' && (
            <CardDescription className="flex items-center gap-1.5 text-amber-600">
              <AlertTriangle className="w-4 h-4" />
              修改 Embedding 配置将触发所有文档的重新向量化
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {group.items.map(renderConfigInput)}
          </div>
        </CardContent>
      </Card>
    );
  };

  // ==================== Agent LLM 独立配置分组渲染 ====================

  const renderExamAgentLlmGroup = (group: ConfigGroup) => {
    const meta = GROUP_META['exam_agent_llm'];
    const Icon = meta.icon;
    const agentInfo = group.agent_info || {};

    // 按 agent prefix 分组 items（排除 solve_models，单独处理）
    const agentItemGroups: Record<string, ConfigItem[]> = {};
    for (const item of group.items) {
      if (item.key === 'exam_agent_solve_models') continue;
      const match = item.key.match(/^exam_agent_(\w+?)_(api_key|base_url|model)$/);
      if (match) {
        const prefix = match[1];
        if (!agentItemGroups[prefix]) agentItemGroups[prefix] = [];
        agentItemGroups[prefix].push(item);
      }
    }

    return (
      <Card key="exam_agent_llm">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${meta.bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${meta.color}`} />
              </div>
              {group.label}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={requestSyncAll}
              className="gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              一键同步全局 LLM 配置
            </Button>
          </div>
          {group.description && (
            <CardDescription className="flex items-center gap-1.5 mt-1">
              <Info className="w-4 h-4 shrink-0" />
              {group.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {AGENT_ORDER.map((prefix) => {
            const items = agentItemGroups[prefix];
            if (!items) return null;

            const info: AgentInfo | undefined = agentInfo[prefix];
            const AgentIcon = AGENT_ICONS[prefix] || Bot;
            const isCollapsed = collapsedAgents.has(prefix);

            return (
              <div
                key={prefix}
                className="border rounded-lg overflow-hidden"
              >
                {/* Agent 头部 */}
                <div
                  className="flex items-center justify-between px-4 py-3 bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors"
                  onClick={() => toggleAgentCollapse(prefix)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <AgentIcon className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold">
                        {info?.name || prefix}
                      </h4>
                      {info?.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {info.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestSyncAgent(prefix, info?.name || prefix);
                      }}
                      className="h-7 text-xs gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      同步
                    </Button>
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Agent 配置项 */}
                {!isCollapsed && (
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {items.map(renderConfigInput)}
                    </div>

                    {/* SolveAgent 多模型编辑器 */}
                    {prefix === 'solve' && renderSolveModelsEditor()}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  // ==================== Solve 多模型编辑器 ====================

  const renderSolveModelsEditor = () => {
    return (
      <div className="mt-4 pt-4 border-t space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h5 className="text-sm font-medium">多模型并行试做</h5>
            <p className="text-xs text-muted-foreground mt-0.5">
              配置多个不同模型实例模拟不同水平的考生。留空则仅使用上方单一模型。
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={addSolveModel} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            添加模型
          </Button>
        </div>

        {solveModels.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
            未配置多模型，将使用上方单一模型进行所有试做。点击「添加模型」开始配置。
          </div>
        )}

        {solveModels.map((m, idx) => (
          <div key={idx} className="border rounded-lg p-4 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <Input
                  value={m.label}
                  onChange={(e) => updateSolveModelField(idx, 'label', e.target.value)}
                  placeholder="模型名称"
                  className="h-8 w-48 text-sm font-medium"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeSolveModel(idx)}
                className="h-7 text-destructive hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">API Key</Label>
                <Input
                  type="password"
                  value={m.api_key}
                  onChange={(e) => updateSolveModelField(idx, 'api_key', e.target.value)}
                  placeholder="留空用默认"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Base URL</Label>
                <Input
                  value={m.base_url}
                  onChange={(e) => updateSolveModelField(idx, 'base_url', e.target.value)}
                  placeholder="留空用默认"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">模型名称</Label>
                <Input
                  value={m.model}
                  onChange={(e) => updateSolveModelField(idx, 'model', e.target.value)}
                  placeholder="必填，如 gpt-4o-mini"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Temperature</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={m.temperature}
                  onChange={(e) => updateSolveModelField(idx, 'temperature', parseFloat(e.target.value) || 0.9)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ==================== 审计日志 ====================

  const renderAuditLogs = () => {
    if (isLoadingLogs) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }

    if (auditLogs.length === 0) {
      return (
        <div className="py-12 text-center text-muted-foreground">暂无变更记录</div>
      );
    }

    return (
      <div className="space-y-3">
        {auditLogs.map((log) => (
          <div
            key={log.id}
            className="flex items-start justify-between p-4 rounded-lg border"
          >
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs font-mono">
                  {log.config_key}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  由 <strong>{log.admin_username}</strong> 修改
                </span>
              </div>
              <div className="text-sm space-x-2">
                <span className="text-muted-foreground line-through">
                  {log.old_value || '(空)'}
                </span>
                <span>→</span>
                <span className="font-medium">{log.new_value}</span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
              {new Date(log.created_at).toLocaleString('zh-CN')}
            </span>
          </div>
        ))}
        {auditTotal > auditLogs.length && (
          <p className="text-center text-sm text-muted-foreground py-2">
            共 {auditTotal} 条记录，仅显示最近 {auditLogs.length} 条
          </p>
        )}
      </div>
    );
  };

  // ==================== 主渲染 ====================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const groupKeys = Object.keys(groups);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">系统配置</h1>
          <p className="text-muted-foreground">管理 LLM 模型、Embedding 模型、RAG 和组卷 Agent 参数</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              保存中...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              保存配置
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-1.5" />
            配置管理
          </TabsTrigger>
          <TabsTrigger value="audit" onClick={() => loadAuditLogs()}>
            <History className="w-4 h-4 mr-1.5" />
            变更记录
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6 mt-4">
          {groupKeys.map((key) => renderGroupCard(key, groups[key]))}
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                配置变更审计日志
              </CardTitle>
              <CardDescription>
                记录每一次配置变更的操作人、时间和变更内容
              </CardDescription>
            </CardHeader>
            <CardContent>{renderAuditLogs()}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 同步全局 LLM 确认弹窗 */}
      <Dialog open={syncConfirmOpen} onOpenChange={(open) => { if (!open) { setSyncConfirmOpen(false); setSyncTarget(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-indigo-500" />
              确认同步全局 LLM 配置
            </DialogTitle>
            <DialogDescription>
              {syncTarget?.mode === 'all'
                ? '此操作将用当前「全局 LLM 配置」覆盖所有 Agent 的 API Key、Base URL 和模型设置。已有的独立配置将被替换。'
                : `此操作将用当前「全局 LLM 配置」覆盖「${syncTarget?.mode === 'single' ? syncTarget.name : ''}」的 API Key、Base URL 和模型设置。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setSyncConfirmOpen(false); setSyncTarget(null); }}
            >
              取消
            </Button>
            <Button onClick={executeSyncConfirmed}>
              确认同步
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Embedding 变更确认弹窗 */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              确认更新 Embedding 配置
            </DialogTitle>
            <DialogDescription>
              您修改了 Embedding 相关配置，保存后系统将自动在后台重新向量化所有已处理的文档。
              此过程可能需要较长时间，期间文档检索功能可能受到影响。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDialogOpen(false);
                setPendingUpdates({});
              }}
            >
              取消
            </Button>
            <Button
              onClick={() => doSave(pendingUpdates)}
              disabled={isSaving}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  保存中...
                </>
              ) : (
                '确认更新并重新向量化'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
