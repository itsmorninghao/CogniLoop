import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Settings,
  Loader2,
  Save,
  History,
  Brain,
  Database,
  Search,
  AlertTriangle,
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
  type AuditLogEntry,
} from '@/services/config';

// 分组元信息：图标和颜色
const GROUP_META: Record<string, { icon: typeof Brain; color: string; bg: string }> = {
  llm: { icon: Brain, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  embedding: { icon: Database, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  rag: { icon: Search, color: 'text-green-500', bg: 'bg-green-500/10' },
};

export function SystemSettingsPage() {
  // 配置数据
  const [groups, setGroups] = useState<Record<string, ConfigGroup>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 审计日志
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Embedding 变更确认弹窗
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, string>>({});

  const formValuesRef = useRef<Record<string, string>>({});

  // ==================== 数据加载 ====================

  const loadConfigs = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await configApi.getAll();
      const loadedGroups = response.data.groups;
      setGroups(loadedGroups);

      // 用当前值初始化表单
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

  /** 找出实际发生变化的配置项，接收当前表单值作为参数以避免陈旧闭包 */
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

  /** 检查变更中是否包含 Embedding 相关配置 */
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

    // 如果包含 Embedding 变更，先弹窗确认（因为会触发重新向量化）
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

      // 重新加载配置以刷新表单
      await loadConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setIsSaving(false);
      setConfirmDialogOpen(false);
      setPendingUpdates({});
    }
  };

  // ==================== 渲染辅助 ====================

  /** 渲染单个配置项的输入框 */
  const renderConfigInput = (item: ConfigItem) => {
    return (
      <div key={item.key} className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={item.key} className="text-sm font-medium">
            {item.label}
          </Label>
          <span className="text-xs text-muted-foreground">{item.key}</span>
        </div>
        <Input
          id={item.key}
          type={item.type === 'integer' ? 'number' : 'text'}
          value={formValues[item.key] ?? ''}
          onChange={(e) => handleInputChange(item.key, e.target.value)}
          placeholder={`请输入${item.label}`}
          min={item.type === 'integer' ? 0 : undefined}
        />
        <p className="text-xs text-muted-foreground">{item.description}</p>
      </div>
    );
  };

  /** 渲染一个配置分组卡片 */
  const renderGroupCard = (groupKey: string, group: ConfigGroup) => {
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

  /** 渲染审计日志表格 */
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
        <div className="py-12 text-center text-muted-foreground">
          暂无变更记录
        </div>
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
          <p className="text-muted-foreground">管理 LLM 模型、Embedding 模型和 RAG 检索参数</p>
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
            <CardContent>
              {renderAuditLogs()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
