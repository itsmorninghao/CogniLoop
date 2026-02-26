import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PaperViewer } from '@/components/QuestionRenderer';
import { parseQuestionSetData, type QuestionSetData } from '@/types/question';
import {
  Activity,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { useAuthStore } from '@/stores/auth';
import { courseApi, type Course } from '@/services/course';
import {
  examPaperApi,
  type GenerateRequest,
  type JobDetail,
  type JobSummary,
  type QuestionTypeConfigInput,
  type TraceSpan,
} from '@/services/examPaper';

// ------------------------------------------------------------------ //
// 常量
// ------------------------------------------------------------------ //

const QUESTION_TYPES = [
  { value: 'single_choice', label: '单选题' },
  { value: 'multiple_choice', label: '多选题' },
  { value: 'fill_blank', label: '填空题' },
  { value: 'short_answer', label: '简答题/材料分析' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
];

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  running: '生成中',
  completed: '已完成',
  failed: '失败',
  resuming: '续做中',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  resuming: 'bg-purple-100 text-purple-800',
};

// Agent 显示名和颜色配置
const AGENT_DISPLAY: Record<string, { icon: string; color: string; label: string }> = {
  QuestionAgent:       { icon: '✏️', color: 'text-blue-600 bg-blue-50',    label: '出题' },
  QualityCheckAgent:   { icon: '🔍', color: 'text-orange-600 bg-orange-50', label: '质检' },
  DispatchAgent:       { icon: '📋', color: 'text-purple-600 bg-purple-50', label: '调度' },
  HotspotAgent:        { icon: '🌐', color: 'text-teal-600 bg-teal-50',     label: '热点' },
  GradeAgent:          { icon: '📊', color: 'text-rose-600 bg-rose-50',     label: '评分' },
};

function getAgentDisplay(agentName: string) {
  // SolveAgent[xxx] 模糊匹配
  if (agentName.startsWith('SolveAgent')) {
    return { icon: '🎓', color: 'text-green-600 bg-green-50', label: '模拟考生' };
  }
  return AGENT_DISPLAY[agentName] ?? { icon: '🤖', color: 'text-gray-600 bg-gray-50', label: agentName };
}

// ------------------------------------------------------------------ //
// 主组件
// ------------------------------------------------------------------ //

export function ExamPaperGeneratorPage() {
  const { token } = useAuthStore();
  const [searchParams] = useSearchParams();

  // 步骤：选课程 → 配置 → 进度 → 完成
  const [step, setStep] = useState<'select_course' | 'config' | 'progress' | 'done'>('select_course');

  // 课程
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);

  // 组卷配置
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [regions, setRegions] = useState<Array<{ region: string; count: number }>>([]);
  const [selectedRegion, setSelectedRegion] = useState('全国甲卷');
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [useHotspot, setUseHotspot] = useState(false);
  const [questionDistribution, setQuestionDistribution] = useState<QuestionTypeConfigInput[]>([
    { question_type: 'single_choice', count: 12, score_per_question: 4 },
  ]);
  const [extraNote] = useState('');

  // 配额预估
  const [estimateResult, setEstimateResult] = useState<{
    estimated_tokens: number;
    authorized: boolean;
    sufficient: boolean;
    message: string;
    remaining: number | null;
  } | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);

  // 进度
  const [, setCurrentJobId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [finalJobDetail, setFinalJobDetail] = useState<JobDetail | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 历史任务
  const [jobHistory, setJobHistory] = useState<JobSummary[]>([]);
  const [, setIsLoadingHistory] = useState(false);

  // 单题重生成
  const [regenPosInput, setRegenPosInput] = useState('');
  const [regenDialog, setRegenDialog] = useState<{
    open: boolean;
    jobId: string;
    position: number;
    instructions: string;
  }>({ open: false, jobId: '', position: 0, instructions: '' });
  const [isRegenerating, setIsRegenerating] = useState(false);

  // 试卷内容预览（JSON 解析后的结构化数据）
  const [paperData, setPaperData] = useState<QuestionSetData | null>(null);
  const [paperContent, setPaperContent] = useState<string | null>(null); // 原始 JSON 字符串（供复制）
  const [isLoadingPaper, setIsLoadingPaper] = useState(false);

  // Trace 追踪面板
  const [traceSpans, setTraceSpans] = useState<TraceSpan[]>([]);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());
  const [traceDialogOpen, setTraceDialogOpen] = useState(false);
  const [isLoadingTrace, setIsLoadingTrace] = useState(false);

  // ---------------------------------------------------------------- //
  // 初始化
  // ---------------------------------------------------------------- //

  useEffect(() => {
    loadCourses();
  }, []);

  // 若 URL 携带 ?job=xxx，直接跳到已完成视图
  useEffect(() => {
    const jobId = searchParams.get('job');
    if (!jobId) return;
    examPaperApi.getJob(jobId).then((r) => {
      setFinalJobDetail(r.data);
      setStep('done');
    }).catch(() => {
      // job 不存在则忽略，停留在默认页
    });
  }, [searchParams]);

  // 进入完成步骤时自动加载试卷内容
  useEffect(() => {
    if (step === 'done' && finalJobDetail && !paperData) {
      handleViewPaper(finalJobDetail.job_id);
    }
  }, [step, finalJobDetail]);

  useEffect(() => {
    if (selectedCourse) {
      loadHistory();
    }
  }, [selectedCourse]);

  useEffect(() => {
    if (selectedSubject) {
      loadRegions(selectedSubject);
    }
  }, [selectedSubject]);

  useEffect(() => {
    if (selectedSubject && questionDistribution.length > 0) {
      estimateQuota();
    }
  }, [selectedSubject, questionDistribution]);

  // ---------------------------------------------------------------- //
  // 数据加载
  // ---------------------------------------------------------------- //

  const loadCourses = async () => {
    try {
      setIsLoadingCourses(true);
      const resp = await courseApi.list();
      setCourses(resp.data.courses);
    } catch {
      toast.error('加载课程失败');
    } finally {
      setIsLoadingCourses(false);
    }
  };

  const loadHistory = async () => {
    if (!selectedCourse) return;
    setIsLoadingHistory(true);
    try {
      const resp = await examPaperApi.listJobs(selectedCourse.id);
      setJobHistory(resp.data.jobs);
    } catch {
      // ignore
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadSubjects = async () => {
    try {
      const resp = await examPaperApi.listSubjects();
      setSubjects(resp.data.subjects);
      if (resp.data.subjects.length > 0 && !selectedSubject) {
        setSelectedSubject(resp.data.subjects[0]);
      }
    } catch {
      toast.error('加载科目列表失败');
    }
  };

  const loadRegions = async (subject: string) => {
    try {
      const resp = await examPaperApi.listRegions(subject);
      setRegions(resp.data.regions);
      if (resp.data.regions.length > 0) {
        setSelectedRegion(resp.data.regions[0].region);
      }
    } catch {
      // ignore
    }
  };

  const estimateQuota = async () => {
    const total = questionDistribution.reduce((s, c) => s + c.count, 0);
    if (total === 0) return;
    setIsEstimating(true);
    try {
      const resp = await examPaperApi.estimateQuota(total);
      setEstimateResult(resp.data);
    } catch {
      // ignore
    } finally {
      setIsEstimating(false);
    }
  };

  // ---------------------------------------------------------------- //
  // 进入配置步骤
  // ---------------------------------------------------------------- //

  const handleSelectCourse = async (course: Course) => {
    setSelectedCourse(course);
    setStep('config');
    await loadSubjects();
  };

  // ---------------------------------------------------------------- //
  // 题型配置
  // ---------------------------------------------------------------- //

  const addQuestionType = () => {
    setQuestionDistribution([...questionDistribution, {
      question_type: 'short_answer',
      count: 2,
      score_per_question: 12,
    }]);
  };

  const removeQuestionType = (idx: number) => {
    setQuestionDistribution(questionDistribution.filter((_, i) => i !== idx));
  };

  const updateQuestionType = (idx: number, key: keyof QuestionTypeConfigInput, value: unknown) => {
    setQuestionDistribution(
      questionDistribution.map((item, i) =>
        i === idx ? { ...item, [key]: value } : item
      )
    );
  };

  const totalQuestions = questionDistribution.reduce((s, c) => s + c.count, 0);

  // ---------------------------------------------------------------- //
  // 发起组卷
  // ---------------------------------------------------------------- //

  const handleGenerate = async () => {
    if (!selectedCourse || !selectedSubject) {
      toast.error('请选择科目');
      return;
    }
    if (questionDistribution.length === 0 || totalQuestions === 0) {
      toast.error('请至少配置一种题型');
      return;
    }
    if (!estimateResult?.authorized) {
      toast.error('您尚未获得仿高考组卷权限，请联系管理员');
      return;
    }
    if (!estimateResult?.sufficient) {
      toast.error(estimateResult?.message || 'Token 配额不足');
      return;
    }

    const request: GenerateRequest = {
      course_id: selectedCourse.id,
      subject: selectedSubject,
      target_region: selectedRegion,
      question_distribution: questionDistribution,
      target_difficulty: selectedDifficulty,
      use_hotspot: useHotspot,
      extra_note: extraNote || undefined,
    };

    try {
      setIsGenerating(true);
      const resp = await examPaperApi.generate(request);
      const jobId = resp.data.job_id;
      setCurrentJobId(jobId);
      setTotalCount(totalQuestions);
      setCompletedCount(0);
      setProgressPercent(0);
      setStep('progress');

      // 连接 SSE
      connectSSE(jobId, totalQuestions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发起组卷失败');
    } finally {
      setIsGenerating(false);
    }
  };

  // ---------------------------------------------------------------- //
  // SSE 进度
  // ---------------------------------------------------------------- //

  const stopAndGoBack = (target: 'select_course' | 'config') => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setPaperContent(null);
    setFinalJobDetail(null);
    setTraceSpans([]);
    setSelectedSpanId(null);
    setExpandedPositions(new Set());
    setStep(target);
  };

  const connectSSE = (jobId: string, total: number) => {
    if (sseRef.current) {
      sseRef.current.close();
    }

    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    // 使用 fetch-based polling 作为 SSE fallback（EventSource 不支持自定义 header）
    // 改用轮询方式获取进度，每 2 秒查询一次
    const pollInterval = setInterval(async () => {
      try {
        const resp = await examPaperApi.getJob(jobId);
        const job = resp.data;
        const done = job.completed_questions_count;
        setCompletedCount(done);
        setProgressPercent(total > 0 ? Math.round((done / total) * 100) : 0);

        if (job.status === 'completed') {
          clearInterval(pollInterval);
          pollIntervalRef.current = null;
          setFinalJobDetail(job);
          setStep('done');
          await loadHistory();
          toast.success('试卷生成完成！');
        } else if (job.status === 'failed') {
          clearInterval(pollInterval);
          pollIntervalRef.current = null;
          toast.error(`生成失败：${job.error_message || '未知错误'}`);
          setStep('config');
          await loadHistory();
        }
      } catch {
        // ignore
      }
    }, 2000);
    pollIntervalRef.current = pollInterval;

    // 同时尝试 SSE
    try {
      const sse = new EventSource(
        `${apiBase}/exam-paper/jobs/${jobId}/stream?token=${encodeURIComponent(token || '')}`
      );
      sseRef.current = sse;

      // 追踪事件：直接更新 traceSpans state
      sse.addEventListener('trace_span_start', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as TraceSpan & { started_at: number };
          setTraceSpans(prev => {
            const exists = prev.find(s => s.span_id === data.span_id);
            if (exists) return prev;
            return [...prev, { ...data, status: 'running', output: null, error: null, elapsed_ms: null }];
          });
          // 自动展开当前出题位置
          if (data.position_index != null) {
            setExpandedPositions(prev => new Set([...prev, String(data.position_index)]));
          }
        } catch { /* ignore */ }
      });

      sse.addEventListener('trace_span_end', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { span_id: string; status: string; output: string | null; error: string | null; elapsed_ms: number };
          setTraceSpans(prev => prev.map(s =>
            s.span_id === data.span_id
              ? { ...s, status: data.status as 'running' | 'success' | 'error', output: data.output, error: data.error, elapsed_ms: data.elapsed_ms }
              : s
          ));
        } catch { /* ignore */ }
      });

      const sseEvents = [
        'hotspot_start', 'hotspot_done', 'hotspot_failed',
        'dispatch_start', 'dispatch_done',
        'question_start', 'question_approved', 'question_skipped', 'question_error',
        'quality_check', 'quality_check_failed',
        'solving', 'difficulty_result', 'difficulty_retry',
        'assemble_start', 'assemble_done',
        'job_completed', 'job_failed',
      ];

      sseEvents.forEach(evt => {
        sse.addEventListener(evt, (e) => {
          try {
            const data = JSON.parse((e as MessageEvent).data);
            if (evt === 'question_approved') {
              setCompletedCount(c => {
                const newCount = c + 1;
                setProgressPercent(total > 0 ? Math.round((newCount / total) * 100) : 0);
                return newCount;
              });
            }
            if (evt === 'job_completed') {
              if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
              examPaperApi.getJob(jobId).then(r => {
                setFinalJobDetail(r.data);
                setStep('done');
                loadHistory();
              });
              toast.success('试卷生成完成！');
            }
            if (evt === 'job_failed') {
              if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
              toast.error(`生成失败：${(data as Record<string, string>).error || '未知错误'}`);
              setStep('config');
              loadHistory();
            }
          } catch {
            // ignore
          }
        });
      });

      sse.onerror = () => {
        sse.close();
      };
    } catch {
      // SSE 不可用，依赖轮询
    }
  };

  // ---------------------------------------------------------------- //
  // 续做
  // ---------------------------------------------------------------- //

  const handleResume = async (jobId: string) => {
    try {
      await examPaperApi.resumeJob(jobId);
      const jobResp = await examPaperApi.getJob(jobId);
      const total = jobResp.data.requirement?.total_questions ?? 0;
      setTotalCount(total);
      setCompletedCount(jobResp.data.completed_questions_count ?? 0);
      setCurrentJobId(jobId);
      setTraceSpans([]);
      setSelectedSpanId(null);
      setStep('progress');
      connectSSE(jobId, total);
      toast.success('已恢复组卷，请等待完成');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '续做失败');
    }
  };

  // ---------------------------------------------------------------- //
  // 单题重生成
  // ---------------------------------------------------------------- //

  const handleRegenerateQuestion = async () => {
    setIsRegenerating(true);
    try {
      const resp = await examPaperApi.regenerateQuestion(
        regenDialog.jobId,
        regenDialog.position,
        regenDialog.instructions,
      );
      toast.success(`第 ${resp.data.position_index} 题已重新生成`);
      setRegenDialog(d => ({ ...d, open: false }));
      setRegenPosInput('');
      // 自动重载最新试卷内容
      await handleViewPaper(regenDialog.jobId, true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '重生成失败，请稍后再试';
      toast.error(msg);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleViewPaper = async (jobId: string, forceReload = false) => {
    if (paperData && !forceReload) return; // 已缓存
    setIsLoadingPaper(true);
    try {
      const resp = await examPaperApi.getJobContent(jobId);
      const raw = resp.data.content;
      const parsed = parseQuestionSetData(raw); // 先解析，成功后再更新状态
      setPaperContent(raw);
      setPaperData(parsed);
    } catch (e) {
      toast.error('无法加载试卷内容');
      console.error(e);
    } finally {
      setIsLoadingPaper(false);
    }
  };

  const handleOpenTrace = async (jobId: string) => {
    setTraceDialogOpen(true);
    // 若已有 trace 数据（生成过程中收集的）则直接用
    if (traceSpans.length > 0) return;
    setIsLoadingTrace(true);
    try {
      const resp = await examPaperApi.getJobTrace(jobId);
      setTraceSpans(resp.data.spans);
    } catch {
      toast.error('无法加载追踪日志');
    } finally {
      setIsLoadingTrace(false);
    }
  };

  // ---------------------------------------------------------------- //
  // 渲染：选择课程
  // ---------------------------------------------------------------- //

  if (step === 'select_course') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">仿高考组卷</h1>
          <p className="text-muted-foreground">AI 多 Agent 自动生成高考风格试卷，选择一门课程开始</p>
        </div>

        {isLoadingCourses ? (
          <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            加载课程中…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map(course => (
              <Card
                key={course.id}
                className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
                onClick={() => handleSelectCourse(course)}
              >
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-orange-600" />
                  </div>
                  <CardTitle className="mt-3">{course.name}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {course.description || '暂无描述'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>点击开始配置</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- //
  // 渲染：配置面板
  // ---------------------------------------------------------------- //

  if (step === 'config') {
    const totalScore = questionDistribution.reduce((s, c) => s + c.count * c.score_per_question, 0);
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setStep('select_course')}>
            ← 返回
          </Button>
          <div>
            <h1 className="text-xl font-semibold">仿高考组卷配置</h1>
            <p className="text-sm text-muted-foreground">课程：{selectedCourse?.name}</p>
          </div>
        </div>

        {/* 双栏布局 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左栏：配置表单 */}
          <div className="lg:col-span-2 space-y-5">
            {/* 科目与卷型 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> 考试配置
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>科目</Label>
                    <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择科目…" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>卷型风格</Label>
                    <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {regions.map(r => (
                          <SelectItem key={r.region} value={r.region}>
                            {r.region}（{r.count} 题）
                          </SelectItem>
                        ))}
                        {regions.length === 0 && (
                          <SelectItem value="全国甲卷">全国甲卷</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>目标难度</Label>
                  <div className="flex gap-2">
                    {DIFFICULTY_OPTIONS.map(d => (
                      <Button
                        key={d.value}
                        variant={selectedDifficulty === d.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedDifficulty(d.value as 'easy' | 'medium' | 'hard')}
                      >
                        {d.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setUseHotspot(v => !v)}
                  className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                    useHotspot
                      ? 'border-primary bg-primary/8 text-primary'
                      : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  <Checkbox
                    id="hotspot"
                    checked={useHotspot}
                    onCheckedChange={v => setUseHotspot(!!v)}
                    className="pointer-events-none shrink-0 border-foreground/40"
                  />
                  <div>
                    <p className={`text-sm font-medium ${useHotspot ? 'text-primary' : 'text-foreground'}`}>
                      融入时事热点
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      自动抓取最近 30 天官媒热点作为命题素材
                    </p>
                  </div>
                </button>
              </CardContent>
            </Card>

            {/* 题型分布 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" /> 题型分布
                </CardTitle>
                <CardDescription>
                  共 {totalQuestions} 题 · 满分 {totalScore} 分
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {questionDistribution.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                    <Select
                      value={item.question_type}
                      onValueChange={v => updateQuestionType(idx, 'question_type', v)}
                    >
                      <SelectTrigger className="w-44 bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUESTION_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={item.count}
                        onChange={e => updateQuestionType(idx, 'count', Number(e.target.value))}
                        className="w-16 bg-background"
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">题</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={item.score_per_question}
                        onChange={e => updateQuestionType(idx, 'score_per_question', Number(e.target.value))}
                        className="w-16 bg-background"
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">分/题</span>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        小计 {item.count * item.score_per_question} 分
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeQuestionType(idx)}
                        disabled={questionDistribution.length <= 1}
                        className="h-8 w-8"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addQuestionType} className="gap-2 mt-1">
                  <Plus className="w-4 h-4" /> 添加题型
                </Button>
              </CardContent>
            </Card>

            {/* 操作按钮 */}
            <Button
              onClick={handleGenerate}
              size="lg"
              disabled={isGenerating || !selectedSubject || totalQuestions === 0 || !estimateResult?.authorized}
              className="gap-2 w-full sm:w-auto"
            >
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 提交中…</>
              ) : (
                <><Sparkles className="w-4 h-4" /> 开始生成试卷</>
              )}
            </Button>
          </div>

          {/* 右栏：摘要 + 配额 + 历史 */}
          <div className="space-y-5">
            {/* 配额预估 */}
            <Card className={
              !estimateResult ? '' :
              estimateResult.sufficient ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'
            }>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4" /> 配额预估
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isEstimating ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> 计算中…
                  </div>
                ) : estimateResult ? (
                  <>
                    <p className={`font-medium text-sm ${estimateResult.sufficient ? 'text-green-800' : 'text-red-700'}`}>
                      {estimateResult.message}
                    </p>
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>预估消耗</span>
                        <span className="font-mono">{estimateResult.estimated_tokens.toLocaleString()} Tokens</span>
                      </div>
                      {estimateResult.remaining != null && (
                        <div className="flex justify-between">
                          <span>剩余配额</span>
                          <span className="font-mono">{estimateResult.remaining.toLocaleString()} Tokens</span>
                        </div>
                      )}
                      {!estimateResult.authorized && (
                        <p className="text-amber-600 mt-2">请联系管理员开通权限后再使用</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">选择科目和题型后自动计算</p>
                )}
              </CardContent>
            </Card>

            {/* 本次出卷摘要 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-4 h-4" /> 出卷摘要
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>科目</span>
                  <span className="font-medium text-foreground">{selectedSubject || '—'}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>卷型</span>
                  <span className="font-medium text-foreground">{selectedRegion}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>难度</span>
                  <span className="font-medium text-foreground">
                    {DIFFICULTY_OPTIONS.find(d => d.value === selectedDifficulty)?.label}
                  </span>
                </div>
                <Separator className="my-1" />
                {questionDistribution.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-muted-foreground">
                    <span>{QUESTION_TYPES.find(t => t.value === item.question_type)?.label}</span>
                    <span className="font-medium text-foreground">{item.count} 题 × {item.score_per_question} 分</span>
                  </div>
                ))}
                <Separator className="my-1" />
                <div className="flex justify-between font-medium">
                  <span>合计</span>
                  <span>{totalQuestions} 题 / {totalScore} 分</span>
                </div>
              </CardContent>
            </Card>

            {/* 历史任务 */}
            {jobHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-muted-foreground">历史任务</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {jobHistory.slice(0, 5).map(job => (
                    <div key={job.job_id} className="flex items-center justify-between p-2 rounded-lg border bg-card text-sm">
                      <div className="space-y-0.5">
                        <Badge className={`text-xs ${STATUS_COLORS[job.status]}`}>
                          {STATUS_LABELS[job.status]}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(job.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        {job.status === 'failed' && (
                          <Button size="sm" variant="outline" onClick={() => handleResume(job.job_id)} className="h-7 px-2 gap-1 text-xs">
                            <RotateCcw className="w-3 h-3" /> 续做
                          </Button>
                        )}
                        {job.status === 'completed' && job.question_set_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              examPaperApi.getJob(job.job_id).then(r => {
                                setFinalJobDetail(r.data);
                                setStep('done');
                              });
                            }}
                            className="h-7 px-2 gap-1 text-xs"
                          >
                            <FileText className="w-3 h-3" /> 查看
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- //
  // 渲染：进度页（Trace 可视化）
  // ---------------------------------------------------------------- //

  if (step === 'progress') {
    // 按 position_index 分组 trace spans
    const globalSpans = traceSpans.filter(s => s.position_index === null);
    const questionGroups = traceSpans.reduce<Record<number, TraceSpan[]>>((acc, s) => {
      if (s.position_index !== null) {
        acc[s.position_index] = acc[s.position_index] || [];
        acc[s.position_index].push(s);
      }
      return acc;
    }, {});
    const sortedPositions = Object.keys(questionGroups).map(Number).sort((a, b) => a - b);
    const selectedSpan = traceSpans.find(s => s.span_id === selectedSpanId);

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => stopAndGoBack('config')}>← 返回</Button>
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Cpu className="w-4 h-4 text-primary animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">正在生成试卷</h1>
            <p className="text-xs text-muted-foreground">{selectedCourse?.name} · {selectedSubject} · {DIFFICULTY_OPTIONS.find(d => d.value === selectedDifficulty)?.label}</p>
          </div>
          {/* 进度指示 */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-xl font-bold tabular-nums">
                {completedCount}<span className="text-sm text-muted-foreground font-normal"> / {totalCount}</span>
              </p>
              <p className="text-xs text-muted-foreground">已完成</p>
            </div>
            <div className="w-28">
              <Progress value={progressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground text-right mt-0.5">{progressPercent}%</p>
            </div>
          </div>
        </div>

        {/* 主内容三栏：进度摘要 + Trace树 + 详情 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* 左：Trace 树 */}
          <div className="lg:col-span-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-primary" /> Agent 执行追踪
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{traceSpans.length} 次调用</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-260px)]">
                  <div className="px-3 pb-3 space-y-0.5">
                    {/* 全局 Spans（HotspotAgent / DispatchAgent） */}
                    {globalSpans.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1">全局</p>
                        {globalSpans.map(span => (
                          <TraceSpanRow
                            key={span.span_id}
                            span={span}
                            selected={selectedSpanId === span.span_id}
                            onClick={() => setSelectedSpanId(span.span_id)}
                          />
                        ))}
                      </div>
                    )}

                    {/* 无数据时的占位 */}
                    {traceSpans.length === 0 && (
                      <div className="flex flex-col items-center gap-3 py-14 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <p className="text-xs">等待 Agent 启动…</p>
                      </div>
                    )}

                    {/* 按题目分组 */}
                    {sortedPositions.map(pos => {
                      const spans = questionGroups[pos];
                      const isExpanded = expandedPositions.has(String(pos));
                      const hasRunning = spans.some(s => s.status === 'running');
                      const allDone = spans.every(s => s.status !== 'running');
                      const hasError = spans.some(s => s.status === 'error');
                      return (
                        <div key={pos} className="border border-border/50 rounded-lg overflow-hidden mb-1.5">
                          <button
                            className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                            onClick={() => setExpandedPositions(prev => {
                              const next = new Set(prev);
                              if (next.has(String(pos))) next.delete(String(pos));
                              else next.add(String(pos));
                              return next;
                            })}
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                            <span className="text-xs font-medium">第 {pos} 题</span>
                            <span className="text-[10px] text-muted-foreground">{spans.length} 次调用</span>
                            <span className="ml-auto">
                              {hasRunning ? (
                                <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                              ) : hasError ? (
                                <span className="text-[10px] text-red-500">✗</span>
                              ) : allDone ? (
                                <span className="text-[10px] text-green-500">✓</span>
                              ) : null}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="px-2 py-1 space-y-0.5 bg-background">
                              {spans.map(span => (
                                <TraceSpanRow
                                  key={span.span_id}
                                  span={span}
                                  selected={selectedSpanId === span.span_id}
                                  onClick={() => setSelectedSpanId(span.span_id)}
                                  indent
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* 右：Span 详情 */}
          <div className="lg:col-span-7">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {selectedSpan ? (
                    <span className="flex items-center gap-2">
                      <span>{getAgentDisplay(selectedSpan.agent).icon}</span>
                      <span>{selectedSpan.agent}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">{selectedSpan.model}</Badge>
                      {selectedSpan.elapsed_ms != null && (
                        <span className="text-xs text-muted-foreground ml-auto font-normal">
                          {selectedSpan.elapsed_ms > 1000 ? `${(selectedSpan.elapsed_ms / 1000).toFixed(1)}s` : `${selectedSpan.elapsed_ms}ms`}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground font-normal">← 点击左侧选择一次调用查看详情</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {selectedSpan ? (
                  <ScrollArea className="h-[calc(100vh-260px)]">
                    <div className="px-4 pb-4 space-y-3">
                      <SpanDetailSection title="System Prompt" content={selectedSpan.system_prompt} />
                      <SpanDetailSection title="User Prompt" content={selectedSpan.user_prompt} />
                      {selectedSpan.output && (
                        <SpanDetailSection title="输出" content={selectedSpan.output} defaultOpen />
                      )}
                      {selectedSpan.error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                          <p className="text-xs font-semibold text-red-700 mb-1">错误</p>
                          <pre className="text-xs text-red-600 whitespace-pre-wrap">{selectedSpan.error}</pre>
                        </div>
                      )}
                      {selectedSpan.status === 'running' && (
                        <div className="flex items-center gap-2 text-muted-foreground text-xs py-4 justify-center">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> 等待模型响应…
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex flex-col items-center gap-3 h-[calc(100vh-260px)] justify-center text-muted-foreground">
                    <Activity className="w-10 h-10 opacity-20" />
                    <p className="text-sm">选择一次 Agent 调用查看提示词和输出</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- //
  // 渲染：完成页
  // ---------------------------------------------------------------- //

  if (step === 'done' && finalJobDetail) {
    const req = finalJobDetail.requirement as Record<string, unknown>;
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => stopAndGoBack('config')}
            >
              ← 返回
            </Button>
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">试卷已生成</h1>
              <p className="text-sm text-muted-foreground">
                {String(req.subject)} · {String(req.target_region)}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => handleOpenTrace(finalJobDetail.job_id)}
            >
              <Activity className="w-3.5 h-3.5" /> 执行追踪
            </Button>
            <Button
              variant="outline"
              onClick={() => stopAndGoBack('config')}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" /> 再次出题
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-3xl font-bold">{finalJobDetail.completed_questions_count}</p>
              <p className="text-xs text-muted-foreground mt-1">题目总数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-3xl font-bold">{(finalJobDetail.token_consumed || 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">消耗 Token</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className={`text-3xl font-bold ${finalJobDetail.warnings.length > 0 ? 'text-amber-600' : ''}`}>
                {finalJobDetail.warnings.length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">警告</p>
            </CardContent>
          </Card>
        </div>

        {/* 主内容双栏 */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* 左：试卷预览 */}
          <div className="lg:col-span-3">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4" /> 试卷内容
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8"
                      onClick={() => {
                        if (paperContent) {
                          navigator.clipboard.writeText(paperContent);
                          toast.success('已复制到剪贴板');
                        }
                      }}
                      disabled={!paperContent || isLoadingPaper}
                    >
                      <Copy className="w-3.5 h-3.5" /> 复制 JSON
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleViewPaper(finalJobDetail.job_id, true)}
                      disabled={isLoadingPaper}
                      title="刷新试卷"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPaper ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingPaper ? (
                  <div className="flex items-center justify-center h-80 gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    加载中…
                  </div>
                ) : paperData ? (
                  <ScrollArea className="h-[580px]">
                    <div className="p-5">
                      <PaperViewer data={paperData} showAnswers={true} />
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex flex-col items-center justify-center h-80 gap-4 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin opacity-40" />
                    <p className="text-sm">正在加载试卷内容…</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 右：操作区 */}
          <div className="lg:col-span-2 space-y-5">
            {/* 警告列表 */}
            {finalJobDetail.warnings.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-amber-800">生成说明</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {finalJobDetail.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-700 flex gap-2">
                        <span className="shrink-0">•</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* 单题重生成 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5" /> 单题重生成
                </CardTitle>
                <CardDescription className="text-xs">
                  对某道题不满意？输入题目序号（1-{finalJobDetail.completed_questions_count}）单独重新生成
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={finalJobDetail.completed_questions_count}
                    placeholder={`1–${finalJobDetail.completed_questions_count}`}
                    value={regenPosInput}
                    onChange={e => setRegenPosInput(e.target.value)}
                    className="w-28"
                  />
                  <Button
                    variant="outline"
                    className="gap-1.5 flex-1"
                    onClick={() => {
                      const pos = parseInt(regenPosInput);
                      if (!pos || pos < 1 || pos > finalJobDetail.completed_questions_count) {
                        toast.error('请输入有效的题目序号');
                        return;
                      }
                      setRegenDialog({
                        open: true,
                        jobId: finalJobDetail.job_id,
                        position: pos,
                        instructions: '',
                      });
                    }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> 重新生成此题
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 出卷信息 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">出卷信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">科目</span>
                  <span className="font-medium">{String(req.subject)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">卷型</span>
                  <span className="font-medium">{String(req.target_region)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">难度</span>
                  <span className="font-medium">{DIFFICULTY_OPTIONS.find(d => d.value === String(req.target_difficulty))?.label || String(req.target_difficulty)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">时事热点</span>
                  <span className="font-medium">{req.use_hotspot ? '已融入' : '未使用'}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 单题重生成 Dialog */}
        <Dialog open={regenDialog.open} onOpenChange={v => setRegenDialog(d => ({ ...d, open: v }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>重新生成第 {regenDialog.position} 题</DialogTitle>
              <DialogDescription>
                将消耗一次 Token 配额。可输入额外指示引导出题方向。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label>额外指示（可选）</Label>
              <Input
                placeholder="如：换用新能源汽车为情境，增加计算环节…"
                value={regenDialog.instructions}
                onChange={e => setRegenDialog(d => ({ ...d, instructions: e.target.value }))}
                disabled={isRegenerating}
              />
              {isRegenerating && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                  <span>AI 正在生成题目，预计需要 20–60 秒，请耐心等待…</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRegenDialog(d => ({ ...d, open: false }))} disabled={isRegenerating}>
                取消
              </Button>
              <Button onClick={handleRegenerateQuestion} disabled={isRegenerating} className="gap-2">
                {isRegenerating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 生成中…</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> 确认重新生成</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Trace 查看 Dialog */}
        <TraceViewDialog
          open={traceDialogOpen}
          onClose={() => setTraceDialogOpen(false)}
          spans={traceSpans}
          isLoading={isLoadingTrace}
        />
      </div>
    );
  }

  return null;
}

// ------------------------------------------------------------------ //
// 辅助子组件：TraceSpanRow / SpanDetailSection / TraceViewDialog
// ------------------------------------------------------------------ //

function TraceSpanRow({
  span,
  selected,
  onClick,
  indent = false,
}: {
  span: TraceSpan;
  selected: boolean;
  onClick: () => void;
  indent?: boolean;
}) {
  const disp = getAgentDisplay(span.agent);
  const timeStr = span.elapsed_ms != null
    ? span.elapsed_ms > 1000 ? `${(span.elapsed_ms / 1000).toFixed(1)}s` : `${span.elapsed_ms}ms`
    : '…';

  return (
    <button
      className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors text-xs ${
        selected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'
      } ${indent ? 'ml-2' : ''}`}
      onClick={onClick}
    >
      <span className="shrink-0">{disp.icon}</span>
      <span className="truncate flex-1 font-medium text-foreground">{span.agent}</span>
      {span.attempt_index != null && (
        <span className="text-[10px] text-muted-foreground shrink-0">#{span.attempt_index}</span>
      )}
      <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{timeStr}</span>
      <span className="shrink-0">
        {span.status === 'running' ? (
          <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
        ) : span.status === 'error' ? (
          <span className="text-red-500">✗</span>
        ) : (
          <span className="text-green-500">✓</span>
        )}
      </span>
    </button>
  );
}

function SpanDetailSection({
  title,
  content,
  defaultOpen = false,
}: {
  title: string;
  content: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/60 text-xs font-semibold text-left"
        onClick={() => setOpen(v => !v)}
      >
        <span>{title}</span>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap px-3 py-2.5 bg-background max-h-64 overflow-auto leading-relaxed">
          {content || '（空）'}
        </pre>
      )}
    </div>
  );
}

function TraceViewDialog({
  open,
  onClose,
  spans,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  spans: TraceSpan[];
  isLoading: boolean;
}) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());

  const globalSpans = spans.filter(s => s.position_index === null);
  const questionGroups = spans.reduce<Record<number, TraceSpan[]>>((acc, s) => {
    if (s.position_index !== null) {
      acc[s.position_index] = acc[s.position_index] || [];
      acc[s.position_index].push(s);
    }
    return acc;
  }, {});
  const sortedPositions = Object.keys(questionGroups).map(Number).sort((a, b) => a - b);
  const selectedSpan = spans.find(s => s.span_id === selectedSpanId);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl w-full h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4 text-primary" />
            Agent 执行追踪
            <span className="text-sm font-normal text-muted-foreground ml-1">{spans.length} 次 LLM 调用</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>加载中…</span>
          </div>
        ) : spans.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Activity className="w-10 h-10 opacity-20" />
            <p className="text-sm">暂无追踪数据（试卷生成后可查看）</p>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 gap-0">
            {/* 左：树 */}
            <div className="w-72 shrink-0 border-r flex flex-col">
              <div className="px-3 py-2 border-b bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground">调用列表</p>
              </div>
              <ScrollArea className="flex-1">
                <div className="px-2 py-2 space-y-0.5">
                  {globalSpans.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1">全局</p>
                      {globalSpans.map(s => (
                        <TraceSpanRow key={s.span_id} span={s} selected={selectedSpanId === s.span_id} onClick={() => setSelectedSpanId(s.span_id)} />
                      ))}
                    </div>
                  )}
                  {sortedPositions.map(pos => {
                    const spansInPos = questionGroups[pos];
                    const isExpanded = expandedPositions.has(String(pos));
                    return (
                      <div key={pos} className="border border-border/50 rounded-lg overflow-hidden mb-1">
                        <button
                          className="w-full flex items-center gap-2 px-2 py-1.5 bg-muted/30 hover:bg-muted/50 text-left"
                          onClick={() => setExpandedPositions(prev => {
                            const next = new Set(prev);
                            if (next.has(String(pos))) next.delete(String(pos));
                            else next.add(String(pos));
                            return next;
                          })}
                        >
                          {isExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                          <span className="text-xs font-medium">第 {pos} 题</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">{spansInPos.length} 次</span>
                        </button>
                        {isExpanded && (
                          <div className="px-1 py-1 space-y-0.5 bg-background">
                            {spansInPos.map(s => (
                              <TraceSpanRow key={s.span_id} span={s} selected={selectedSpanId === s.span_id} onClick={() => setSelectedSpanId(s.span_id)} indent />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* 右：详情 */}
            <div className="flex-1 min-w-0 flex flex-col">
              {selectedSpan ? (
                <>
                  <div className="px-4 py-2.5 border-b bg-muted/20 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{getAgentDisplay(selectedSpan.agent).icon}</span>
                      <span className="font-medium text-sm">{selectedSpan.agent}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">{selectedSpan.model}</Badge>
                      {selectedSpan.attempt_index != null && (
                        <Badge variant="secondary" className="text-[10px]">attempt #{selectedSpan.attempt_index}</Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {selectedSpan.status === 'running' ? (
                          <span className="flex items-center gap-1 text-blue-500"><Loader2 className="w-3 h-3 animate-spin" /> 执行中</span>
                        ) : selectedSpan.status === 'error' ? (
                          <span className="text-red-500">失败</span>
                        ) : (
                          <span className="text-green-600">
                            ✓ {selectedSpan.elapsed_ms != null ? (selectedSpan.elapsed_ms > 1000 ? `${(selectedSpan.elapsed_ms / 1000).toFixed(1)}s` : `${selectedSpan.elapsed_ms}ms`) : ''}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-3">
                      <SpanDetailSection title="System Prompt" content={selectedSpan.system_prompt} />
                      <SpanDetailSection title="User Prompt" content={selectedSpan.user_prompt} />
                      {selectedSpan.output && (
                        <SpanDetailSection title="输出" content={selectedSpan.output} defaultOpen />
                      )}
                      {selectedSpan.error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                          <p className="text-xs font-semibold text-red-700 mb-1">错误信息</p>
                          <pre className="text-xs text-red-600 whitespace-pre-wrap">{selectedSpan.error}</pre>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <Activity className="w-10 h-10 opacity-20" />
                  <p className="text-sm">← 点击左侧选择一次调用查看提示词和输出</p>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
