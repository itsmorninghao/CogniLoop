import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  FileJson,
  FolderOpen,
  Loader2,
  RefreshCw,
  Server,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { examPaperAdminApi, type ImportStats, type ImportStatus } from '@/services/examPaper';

// 各阶段显示文字
const PHASE_LABELS: Record<string, string> = {
  idle: '就绪',
  downloading: '正在下载…',
  extracting: '正在解压…',
  importing: '正在导入…',
  done: '完成',
};

export function ExamDataImportPage() {
  // ---------------------------------------------------------------- //
  // 已有数据统计
  // ---------------------------------------------------------------- //
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsExpanded, setStatsExpanded] = useState(false);

  // ---------------------------------------------------------------- //
  // 导入状态轮询
  // ---------------------------------------------------------------- //
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------- //
  // 一键从 GitHub 导入
  // ---------------------------------------------------------------- //
  const [isStartingGitHub, setIsStartingGitHub] = useState(false);

  // ---------------------------------------------------------------- //
  // 高级：服务器路径
  // ---------------------------------------------------------------- //
  const [serverPath, setServerPath] = useState('');
  const [isImportingPath, setIsImportingPath] = useState(false);

  // ---------------------------------------------------------------- //
  // 高级：文件上传
  // ---------------------------------------------------------------- //
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isImportingUpload, setIsImportingUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------- //
  // Embedding 预检
  // ---------------------------------------------------------------- //
  const [embCheckState, setEmbCheckState] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');
  const [embCheckMsg, setEmbCheckMsg] = useState('');

  const checkEmbeddingAndProceed = async (onProceed: () => Promise<void>) => {
    setEmbCheckState('checking');
    setEmbCheckMsg('');
    try {
      const resp = await examPaperAdminApi.checkEmbedding();
      if (resp.data.ok) {
        setEmbCheckState('ok');
        setEmbCheckMsg(resp.data.message);
        await onProceed();
      } else {
        setEmbCheckState('fail');
        setEmbCheckMsg(resp.data.message);
        toast.error(`向量化 API 不可用，请先在系统配置中设置 Embedding。\n${resp.data.message}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '预检请求失败';
      setEmbCheckState('fail');
      setEmbCheckMsg(msg);
      toast.error(`向量化 API 预检失败：${msg}`);
    }
  };

  // ---------------------------------------------------------------- //
  // 初始化
  // ---------------------------------------------------------------- //
  useEffect(() => {
    loadStats();
    checkRunningStatus();
    return () => stopPolling();
  }, []);

  const loadStats = async () => {
    setIsLoadingStats(true);
    try {
      const resp = await examPaperAdminApi.getImportStats();
      setStats(resp.data);
    } catch {
      // ignore
    } finally {
      setIsLoadingStats(false);
    }
  };

  const checkRunningStatus = async () => {
    try {
      const resp = await examPaperAdminApi.getImportStatus();
      setImportStatus(resp.data);
      if (resp.data.running) startPolling();
    } catch {
      // ignore
    }
  };

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const resp = await examPaperAdminApi.getImportStatus();
        setImportStatus(resp.data);
        if (!resp.data.running) {
          stopPolling();
          await loadStats();
          if (resp.data.error) {
            toast.error(`导入失败：${resp.data.error}`);
          } else {
            toast.success(`导入完成！共新增 ${resp.data.total_imported} 题`);
          }
        }
      } catch {
        // ignore
      }
    }, 1500);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // ---------------------------------------------------------------- //
  // 一键 GitHub 导入
  // ---------------------------------------------------------------- //
  const handleImportFromGitHub = async () => {
    setIsStartingGitHub(true);
    await checkEmbeddingAndProceed(async () => {
      try {
        const resp = await examPaperAdminApi.importFromGitHub();
        toast.success(resp.data.message);
        startPolling();
        const statusResp = await examPaperAdminApi.getImportStatus();
        setImportStatus(statusResp.data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '启动失败');
      }
    });
    setIsStartingGitHub(false);
  };

  // ---------------------------------------------------------------- //
  // 服务器路径导入
  // ---------------------------------------------------------------- //
  const handleImportFromPath = async () => {
    if (!serverPath.trim()) { toast.error('请输入服务器路径'); return; }
    setIsImportingPath(true);
    await checkEmbeddingAndProceed(async () => {
      try {
        const resp = await examPaperAdminApi.importFromPath(serverPath.trim());
        toast.success(resp.data.message);
        startPolling();
        const statusResp = await examPaperAdminApi.getImportStatus();
        setImportStatus(statusResp.data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '启动失败');
      }
    });
    setIsImportingPath(false);
  };

  // ---------------------------------------------------------------- //
  // 文件上传导入
  // ---------------------------------------------------------------- //
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.name.endsWith('.json'));
    setSelectedFiles(files);
    if (files.length === 0) toast.error('未找到 .json 文件');
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.json'));
    setSelectedFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...files.filter(f => !names.has(f.name))];
    });
  }, []);

  const handleImportFromUpload = async () => {
    if (selectedFiles.length === 0) { toast.error('请先选择 JSON 文件'); return; }
    setIsImportingUpload(true);
    await checkEmbeddingAndProceed(async () => {
      try {
        const resp = await examPaperAdminApi.importFromUpload(selectedFiles);
        toast.success(resp.data.message);
        setSelectedFiles([]);
        startPolling();
        const statusResp = await examPaperAdminApi.getImportStatus();
        setImportStatus(statusResp.data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '上传失败');
      }
    });
    setIsImportingUpload(false);
  };

  // ---------------------------------------------------------------- //
  // 进度计算
  // ---------------------------------------------------------------- //
  const isRunning = importStatus?.running ?? false;
  const phase = importStatus?.phase ?? 'idle';

  // 综合进度：下载阶段用 download_progress，导入阶段用文件进度
  const overallProgress = (() => {
    if (!importStatus) return 0;
    if (phase === 'downloading') return Math.round(importStatus.download_progress * 0.4); // 0–40%
    if (phase === 'extracting') return 42;
    if (phase === 'importing' && importStatus.total_files > 0) {
      return 45 + Math.round((importStatus.processed_files / importStatus.total_files) * 55); // 45–100%
    }
    if (phase === 'done') return 100;
    return 0;
  })();

  // ---------------------------------------------------------------- //
  // Render
  // ---------------------------------------------------------------- //
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Database className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">历年真题库导入</h1>
            <p className="text-sm text-muted-foreground">
              导入 GAOKAO-Bench 开源数据集，作为 AI 组卷的参考真题
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadStats} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          刷新统计
        </Button>
      </div>

      {/* 一键导入主操作卡 */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" />
            一键从 GitHub 导入
          </CardTitle>
          <CardDescription>
            点击按钮后系统自动下载{' '}
            <a
              href="https://github.com/itsmorninghao/GAOKAO-Bench"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary"
            >
              GAOKAO-Bench
            </a>
            {' '}并完成导入并且自动向量化。优先使用国内镜像，遇到网络问题自动重试其他镜像源。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Embedding 预检状态 */}
          {embCheckState !== 'idle' && (
            <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
              embCheckState === 'checking' ? 'bg-muted text-muted-foreground' :
              embCheckState === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' :
              'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {embCheckState === 'checking' && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
              {embCheckState === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {embCheckState === 'fail' && <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>
                {embCheckState === 'checking' && '正在检测向量化 API…'}
                {embCheckState === 'ok' && embCheckMsg}
                {embCheckState === 'fail' && embCheckMsg}
              </span>
            </div>
          )}

          <Button
            size="lg"
            onClick={handleImportFromGitHub}
            disabled={isRunning || isStartingGitHub || embCheckState === 'checking'}
            className="gap-2 w-full sm:w-auto"
          >
            {embCheckState === 'checking' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> 检测向量化 API…</>
            ) : isStartingGitHub || (isRunning && ['downloading', 'extracting', 'importing'].includes(phase)) ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {PHASE_LABELS[phase] ?? '处理中…'}</>
            ) : (
              <><Download className="w-4 h-4" /> 一键导入真题库</>
            )}
          </Button>

          <p className="text-xs text-muted-foreground">
            约 20 MB，包含 2010–2022 年全国卷全科目，首次导入约需 5–10 分钟。
            导入前将自动检测向量化 API 是否可用。
          </p>
        </CardContent>
      </Card>

      {/* 进度面板 */}
      {importStatus && (importStatus.running || importStatus.finished_at) && (
        <Card className={
          importStatus.running
            ? 'border-blue-200 bg-blue-50/50'
            : importStatus.error
              ? 'border-red-200 bg-red-50/50'
              : 'border-green-200 bg-green-50/50'
        }>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {importStatus.running ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  {PHASE_LABELS[phase] ?? '处理中…'}
                  {importStatus.download_url && phase === 'downloading' && (
                    <span className="text-xs font-normal text-muted-foreground truncate max-w-xs">
                      {importStatus.download_url}
                    </span>
                  )}
                </>
              ) : importStatus.error ? (
                <><AlertCircle className="w-4 h-4 text-red-600" /> 导入失败</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 text-green-600" /> 导入完成</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 综合进度条 */}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>
                  {phase === 'downloading' && `下载进度 ${importStatus.download_progress}%`}
                  {phase === 'extracting' && '正在解压…'}
                  {phase === 'importing' && (
                    importStatus.current_file
                      ? `${importStatus.current_file}`
                      : `${importStatus.processed_files} / ${importStatus.total_files} 个文件`
                  )}
                  {phase === 'done' && `共新增 ${importStatus.total_imported} 题`}
                </span>
                <span>{overallProgress}%</span>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>

            {/* 数量统计 */}
            {(importStatus.total_imported > 0 || importStatus.total_skipped > 0) && (
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">新增：</span>
                  <span className="font-semibold text-green-700">
                    {importStatus.total_imported.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">跳过（已存在）：</span>
                  <span className="font-mono">
                    {importStatus.total_skipped.toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {/* 错误信息 */}
            {importStatus.error && (
              <p className="text-sm text-red-700 bg-red-100 rounded px-3 py-2">
                {importStatus.error}
              </p>
            )}

            {/* 日志 */}
            {importStatus.log.length > 0 && (
              <ScrollArea className="h-32 border rounded bg-background">
                <div className="p-2 space-y-0.5">
                  {importStatus.log.map((line, i) => (
                    <p key={i} className="text-xs font-mono text-muted-foreground">{line}</p>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {/* 已有数据统计 */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none pb-3"
          onClick={() => setStatsExpanded(v => !v)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              当前数据库已有真题
              {stats && (
                <Badge variant="secondary" className="ml-2 font-mono">
                  {stats.total.toLocaleString()} 题
                </Badge>
              )}
            </CardTitle>
            {statsExpanded
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />
            }
          </div>
          {stats && !statsExpanded && (
            <p className="text-xs text-muted-foreground mt-1">
              {stats.by_subject.length} 个科目
              {stats.year_range.min ? ` · ${stats.year_range.min}–${stats.year_range.max} 年` : ''}
              {stats.by_region.slice(0, 3).map(r => ` · ${r.region}(${r.count})`).join('')}
            </p>
          )}
        </CardHeader>

        {statsExpanded && (
          <CardContent className="pt-0">
            {isLoadingStats ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
              </div>
            ) : stats && stats.total > 0 ? (
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">按科目</p>
                  <div className="space-y-2">
                    {stats.by_subject.map(s => (
                      <div key={s.subject} className="flex items-center gap-2">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-0.5">
                            <span>{s.subject}</span>
                            <span className="text-muted-foreground font-mono">{s.count}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.round((s.count / stats.total) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">按卷型</p>
                  <div className="space-y-1.5">
                    {stats.by_region.map(r => (
                      <div key={r.region} className="flex justify-between text-sm">
                        <span>{r.region}</span>
                        <span className="font-mono text-muted-foreground">{r.count}</span>
                      </div>
                    ))}
                  </div>
                  {stats.year_range.min && (
                    <p className="text-xs text-muted-foreground mt-4">
                      年份范围：{stats.year_range.min} — {stats.year_range.max}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">暂无历年真题数据，请先导入 GAOKAO-Bench 数据集。</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* 高级导入选项 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">高级导入选项</CardTitle>
          <CardDescription>
            当 GitHub 无法访问，或已在服务器上提前下载数据时，使用以下方式手动导入。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="upload">
            <TabsList className="mb-4">
              <TabsTrigger value="upload" className="gap-2">
                <Upload className="w-4 h-4" /> 上传文件
              </TabsTrigger>
              <TabsTrigger value="path" className="gap-2">
                <Server className="w-4 h-4" /> 服务器路径
              </TabsTrigger>
            </TabsList>

            {/* Tab: 文件上传 */}
            <TabsContent value="upload" className="space-y-4">
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="font-medium text-foreground">操作步骤</p>
                <p>1. 克隆或下载 GAOKAO-Bench 仓库到本地</p>
                <p>2. 打开 <code className="text-xs bg-muted rounded px-1">Data/Objective_Questions/</code> 和 <code className="text-xs bg-muted rounded px-1">Data/Subjective_Questions/</code> 目录</p>
                <p>3. 选择所需 JSON 文件上传（支持多选，可拖拽）</p>
              </div>

              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                  ${selectedFiles.length > 0
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/30'
                  }`}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
                {selectedFiles.length === 0 ? (
                  <>
                    <FileJson className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm font-medium">点击选择或拖拽 JSON 文件</p>
                    <p className="text-xs text-muted-foreground mt-1">支持多选，仅限 .json 文件</p>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-8 h-8 mx-auto text-primary mb-2" />
                    <p className="text-sm font-medium">已选择 {selectedFiles.length} 个文件</p>
                    <p className="text-xs text-muted-foreground mt-1">点击重新选择</p>
                  </>
                )}
              </div>

              {selectedFiles.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/30 text-xs text-muted-foreground font-medium">
                    <span>{selectedFiles.length} 个文件</span>
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedFiles([]); }}
                      className="hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <ScrollArea className="max-h-36">
                    {selectedFiles.map(f => (
                      <div key={f.name} className="flex items-center justify-between px-3 py-1.5 text-xs border-t hover:bg-muted/20">
                        <span className="font-mono">{f.name}</span>
                        <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                导入前将自动检测向量化 API 是否可用
              </div>

              <Button
                onClick={handleImportFromUpload}
                disabled={isImportingUpload || selectedFiles.length === 0 || isRunning || embCheckState === 'checking'}
                className="gap-2"
              >
                {embCheckState === 'checking' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 检测向量化 API…</>
                ) : isImportingUpload ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 上传中…</>
                ) : (
                  <><Upload className="w-4 h-4" /> 开始导入{selectedFiles.length > 0 ? ` (${selectedFiles.length} 个文件)` : ''}</>
                )}
              </Button>
            </TabsContent>

            {/* Tab: 服务器路径 */}
            <TabsContent value="path" className="space-y-4">
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="font-medium text-foreground">适用场景</p>
                <p>已通过 SSH / Docker volume 将 GAOKAO-Bench 数据放到服务器，直接指定目录路径。</p>
                <p className="mt-1">支持两种目录结构：</p>
                <p>• 标准结构：<code className="text-xs bg-muted rounded px-1">/data/GAOKAO-Bench/Data</code>（含 Objective_Questions/ 和 Subjective_Questions/ 子目录）</p>
                <p>• 扁平结构：<code className="text-xs bg-muted rounded px-1">/data/gaokao_json</code>（JSON 文件直接放在该目录下）</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="server-path">服务器目录路径</Label>
                <div className="relative">
                  <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="server-path"
                    value={serverPath}
                    onChange={e => setServerPath(e.target.value)}
                    placeholder="/data/GAOKAO-Bench/Data"
                    className="pl-9 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                导入前将自动检测向量化 API 是否可用
              </div>

              <Button
                onClick={handleImportFromPath}
                disabled={isImportingPath || !serverPath.trim() || isRunning || embCheckState === 'checking'}
                className="gap-2"
              >
                {embCheckState === 'checking' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 检测向量化 API…</>
                ) : isImportingPath ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 启动中…</>
                ) : (
                  <><Server className="w-4 h-4" /> 从服务器路径导入</>
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
