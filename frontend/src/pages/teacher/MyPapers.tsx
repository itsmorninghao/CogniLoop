import { useEffect, useMemo, useState } from 'react';
import { MarkdownWithLatex } from '@/components/MarkdownWithLatex';
import { parseQuestionSetData, type ParsedQuestion as JsonParsedQuestion } from '@/types/question';
import { useNavigate } from 'react-router-dom';
import {
  BookMarked,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Loader2,
  ListChecks,
  MessageSquare,
  PenLine,
  RefreshCw,
  RotateCcw,
  Send,
  Share2,
  Check,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/sonner';
import { questionApi, type QuestionSetWithCourse } from '@/services/question';
import { examPaperApi, type JobSummary } from '@/services/examPaper';
import { plazaApi } from '@/services/plaza';
import { statisticsApi, type StudentInfo } from '@/services/statistics';

// ------------------------------------------------------------------ //
// Constants
// ------------------------------------------------------------------ //

type PaperItem =
  | { type: 'gaokao'; job: JobSummary }
  | { type: 'regular'; qs: QuestionSetWithCourse };

type FilterType = 'all' | 'gaokao' | 'regular';

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '容易',
  medium: '中等',
  hard: '困难',
};

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  completed: { label: '已完成', variant: 'default' },
  running: { label: '生成中', variant: 'secondary' },
  pending: { label: '等待中', variant: 'secondary' },
  resuming: { label: '续做中', variant: 'secondary' },
  failed: { label: '失败', variant: 'destructive' },
  draft: { label: '草稿', variant: 'outline' },
  published: { label: '已发布', variant: 'default' },
};

const QUESTION_TYPE_MAP: Record<
  string,
  { label: string; color: string; icon: typeof Circle }
> = {
  single_choice: { label: '单选题', color: 'bg-blue-500', icon: Circle },
  multiple_choice: { label: '多选题', color: 'bg-purple-500', icon: ListChecks },
  fill_blank: { label: '填空题', color: 'bg-green-500', icon: PenLine },
  short_answer: { label: '简答题', color: 'bg-orange-500', icon: MessageSquare },
};

// ------------------------------------------------------------------ //
// Preview Dialog (identical style to QuestionGenerator)
// ------------------------------------------------------------------ //

type ParsedQuestion = JsonParsedQuestion;

function parseJsonContent(content: string): ParsedQuestion[] {
  try {
    return parseQuestionSetData(content).questions;
  } catch (e) {
    console.error('试题 JSON 解析失败', e);
    return [];
  }
}

function PreviewDialog({
  open,
  onClose,
  content,
  title,
  createdAt,
}: {
  open: boolean;
  onClose: () => void;
  content: string;
  title: string;
  createdAt: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswers, setShowAnswers] = useState(false);

  const parsedQuestions = useMemo(() => parseJsonContent(content), [content]);
  const displayTitle = useMemo(() => {
    try {
      const d = parseQuestionSetData(content);
      return d.title || title;
    } catch {
      return title;
    }
  }, [content, title]);

  // reset on open
  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setShowAnswers(false);
    }
  }, [open]);

  const current = parsedQuestions[currentIndex];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="flex flex-col w-[98vw] max-w-[1800px] h-[92vh] max-h-[92vh] p-0 gap-0 overflow-hidden"
        hideCloseButton
      >
        {/* 顶部标题栏 */}
        <div className="flex-shrink-0 h-[72px] flex items-center justify-between px-6 border-b bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{displayTitle}</h2>
              <p className="text-sm text-muted-foreground">
                共 {parsedQuestions.length} 道题目 · 创建于{' '}
                {new Date(createdAt).toLocaleDateString('zh-CN')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant={showAnswers ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowAnswers(!showAnswers)}
              className="gap-2"
            >
              {showAnswers ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showAnswers ? '隐藏答案' : '显示答案'}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* 主体内容区 */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* 左侧题目导航 */}
          <div className="w-72 flex-shrink-0 border-r bg-muted/20 flex flex-col">
            <div className="flex-shrink-0 h-12 flex items-center px-4 border-b">
              <h3 className="font-medium text-sm text-muted-foreground">题目列表</h3>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {parsedQuestions.map((q, idx) => {
                  const typeInfo = QUESTION_TYPE_MAP[q.type] ?? {
                    label: '未知',
                    color: 'bg-gray-500',
                    icon: Circle,
                  };
                  const TypeIcon = typeInfo.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentIndex(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all ${
                        currentIndex === idx
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-medium ${
                          currentIndex === idx ? 'bg-white/20' : typeInfo.color
                        }`}
                      >
                        {q.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">第 {q.number} 题</p>
                        <p
                          className={`text-xs truncate ${
                            currentIndex === idx
                              ? 'text-primary-foreground/70'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {typeInfo.label}
                        </p>
                      </div>
                      <TypeIcon
                        className={`w-4 h-4 flex-shrink-0 ${
                          currentIndex === idx
                            ? 'text-primary-foreground/70'
                            : 'text-muted-foreground'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* 右侧题目详情 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {current ? (
              <>
                <ScrollArea className="flex-1">
                  <div className="p-8 max-w-5xl mx-auto">
                    {/* 题型 badge */}
                    <div className="flex items-center gap-3 mb-6">
                      <Badge
                        className={`${
                          QUESTION_TYPE_MAP[current.type]?.color ?? 'bg-gray-500'
                        } text-white px-3 py-1`}
                      >
                        {QUESTION_TYPE_MAP[current.type]?.label ?? '未知题型'}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        第 {current.number} / {parsedQuestions.length} 题
                      </span>
                    </div>

                    {/* 题目内容 */}
                    <div className="mb-8">
                      <div className="text-lg font-semibold mb-4 leading-relaxed">
                        <MarkdownWithLatex compact>{current.content}</MarkdownWithLatex>
                      </div>
                    </div>

                    {/* 选项列表 */}
                    {current.options && current.options.length > 0 && (
                      <div className="space-y-3 mb-8">
                        {current.options.map((opt) => {
                          const isCorrect =
                            showAnswers && current.answer.includes(opt.key);
                          return (
                            <div
                              key={opt.key}
                              className={`flex items-start gap-4 p-4 rounded-xl border-2 transition-all ${
                                isCorrect
                                  ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
                                  : 'border-border hover:border-primary/30 hover:bg-muted/50'
                              }`}
                            >
                              <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${
                                  isCorrect
                                    ? 'bg-green-500 text-white'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {opt.key}
                              </div>
                              <div className="flex-1 pt-2">
                                <div
                                  className={
                                    isCorrect
                                      ? 'text-green-700 dark:text-green-300 font-medium'
                                      : ''
                                  }
                                >
                                  <MarkdownWithLatex compact>{opt.value}</MarkdownWithLatex>
                                </div>
                              </div>
                              {isCorrect && (
                                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-2" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 答案 / 解析 */}
                    {showAnswers && (
                      <div className="space-y-4 pt-6 border-t">
                        <div className="bg-green-50 dark:bg-green-950/30 rounded-xl p-5 border border-green-200 dark:border-green-800">
                          <div className="flex items-center gap-2 mb-3">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            <span className="font-semibold text-green-700 dark:text-green-300">
                              正确答案
                            </span>
                          </div>
                          <div className="text-green-800 dark:text-green-200 leading-relaxed">
                            <MarkdownWithLatex compact>{current.answer}</MarkdownWithLatex>
                          </div>
                        </div>
                        {current.explanation && (
                          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-5 border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-2 mb-3">
                              <MessageSquare className="w-5 h-5 text-blue-600" />
                              <span className="font-semibold text-blue-700 dark:text-blue-300">
                                解析
                              </span>
                            </div>
                            <div className="text-blue-800 dark:text-blue-200 leading-relaxed">
                              <MarkdownWithLatex compact>{current.explanation}</MarkdownWithLatex>
                            </div>
                          </div>
                        )}
                        {current.scoring_points && (
                          <div className="bg-orange-50 dark:bg-orange-950/30 rounded-xl p-5 border border-orange-200 dark:border-orange-800">
                            <div className="flex items-center gap-2 mb-3">
                              <ListChecks className="w-5 h-5 text-orange-600" />
                              <span className="font-semibold text-orange-700 dark:text-orange-300">
                                评分要点
                              </span>
                            </div>
                            <div className="text-orange-800 dark:text-orange-200 leading-relaxed">
                              <MarkdownWithLatex compact>{current.scoring_points}</MarkdownWithLatex>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* 底部导航栏 */}
                <div className="flex-shrink-0 h-[64px] flex items-center justify-between px-8 border-t bg-muted/20">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                    disabled={currentIndex === 0}
                    className="gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    上一题
                  </Button>
                  <div className="flex items-center gap-2">
                    {parsedQuestions.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentIndex(idx)}
                        className={`w-8 h-8 rounded-full text-sm font-medium transition-all ${
                          currentIndex === idx
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setCurrentIndex(
                        Math.min(parsedQuestions.length - 1, currentIndex + 1)
                      )
                    }
                    disabled={currentIndex === parsedQuestions.length - 1}
                    className="gap-2"
                  >
                    下一题
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <FileText className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">暂无题目内容</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ //
// AssignDialog
// ------------------------------------------------------------------ //

function AssignDialog({
  open,
  onClose,
  questionSetId,
  courseId,
}: {
  open: boolean;
  onClose: () => void;
  questionSetId: number;
  courseId: number;
}) {
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [assignToAll, setAssignToAll] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    statisticsApi
      .courseStudents(courseId)
      .then((res) => setStudents(res.data))
      .catch(() => toast.error('加载学生列表失败'))
      .finally(() => setIsLoading(false));
    setSelectedIds([]);
    setAssignToAll(false);
  }, [open, courseId]);

  const handleAssign = async () => {
    setIsAssigning(true);
    try {
      await questionApi.assign(questionSetId, {
        assign_to_all: assignToAll,
        student_ids: assignToAll ? [] : selectedIds,
      });
      toast.success('已成功布置作业');
      onClose();
    } catch {
      toast.error('布置作业失败');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>布置作业</DialogTitle>
          <DialogDescription>选择要分配作业的学生</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={assignToAll}
                onCheckedChange={(v) => setAssignToAll(Boolean(v))}
              />
              <span className="text-sm font-medium">分配给全部学生</span>
            </label>
            {!assignToAll && (
              <ScrollArea className="h-48 border rounded-md p-2">
                {students.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    该课程暂无学生
                  </p>
                ) : (
                  students.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedIds.includes(s.id)}
                        onCheckedChange={(v) =>
                          setSelectedIds((prev) =>
                            v ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                          )
                        }
                      />
                      <span className="text-sm">{s.full_name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {s.email}
                      </span>
                    </label>
                  ))
                )}
              </ScrollArea>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={handleAssign}
            disabled={isAssigning || (!assignToAll && selectedIds.length === 0)}
          >
            {isAssigning && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            <Send className="w-4 h-4 mr-2" />
            布置作业
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ //
// DeleteConfirmDialog
// ------------------------------------------------------------------ //

function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  isDeleting,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  isDeleting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            确定要删除「{title}」吗？此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            取消
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            <Trash2 className="w-4 h-4 mr-2" />
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ //
// PaperCard
// ------------------------------------------------------------------ //

function PaperCard({
  item,
  onRefresh,
}: {
  item: PaperItem;
  onRefresh: () => void;
}) {
  const navigate = useNavigate();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);

  const isGaokao = item.type === 'gaokao';
  const job = isGaokao ? item.job : null;
  const qs = isGaokao ? null : item.qs;

  const questionSetId = isGaokao ? job!.question_set_id : qs!.id;
  const courseId = isGaokao ? job!.course_id : qs!.course_id;
  const title = isGaokao
    ? `${job!.requirement?.subject ?? '未知科目'} · ${job!.requirement?.target_region ?? ''}`
    : qs!.title;
  const status = isGaokao ? job!.status : qs!.status;
  const createdAt = isGaokao ? job!.created_at : qs!.created_at;

  // 可执行操作：高考组卷需已完成且有关联 QS；普通试题始终可操作
  const canOperate = isGaokao
    ? job!.status === 'completed' && !!job!.question_set_id
    : true;

  const isShared = isGaokao
    ? false  // 高考组卷的分享状态不从列表数据中获取，按需查询时会刷新
    : !!qs!.shared_to_plaza_at;

  // ---- 预览 ----
  const handlePreview = async () => {
    if (!canOperate) return;
    setLoadingPreview(true);
    try {
      if (isGaokao && job!.question_set_id) {
        const res = await examPaperApi.getJobContent(job!.job_id);
        setPreviewContent(res.data.content);
      } else if (!isGaokao) {
        const res = await questionApi.getContent(qs!.id);
        setPreviewContent(res.data.json_content);
      } else {
        toast.error('试卷内容尚未生成');
        return;
      }
      setPreviewOpen(true);
    } catch {
      toast.error('加载试卷内容失败');
    } finally {
      setLoadingPreview(false);
    }
  };

  // ---- 布置作业 ----
  const openAssign = () => setAssignOpen(true);

  // ---- 广场分享 ----
  const handleShare = async () => {
    if (!questionSetId) return;
    setSharing(true);
    try {
      if (isShared) {
        await plazaApi.unsharePlaza(questionSetId);
        toast.success('已从广场撤回');
      } else {
        await plazaApi.sharePlaza(questionSetId);
        toast.success('已分享到广场');
      }
      onRefresh();
    } catch {
      toast.error(isShared ? '撤回失败' : '分享失败');
    } finally {
      setSharing(false);
    }
  };

  // ---- 续做 ----
  const handleResume = async () => {
    if (!job) return;
    try {
      await examPaperApi.resumeJob(job.job_id);
      toast.success('已重新发起任务，请前往高考组卷页查看进度');
      navigate('/teacher/exam-paper');
    } catch {
      toast.error('续做失败');
    }
  };

  // ---- 删除 ----
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      if (isGaokao) {
        await examPaperApi.deleteJob(job!.job_id);
      } else {
        await questionApi.delete(qs!.id);
      }
      toast.success('删除成功');
      setDeleteOpen(false);
      onRefresh();
    } catch {
      toast.error('删除失败');
    } finally {
      setIsDeleting(false);
    }
  };

  // ---- 详情跳转（仅高考组卷） ----
  const handleGoDetail = () => {
    navigate(`/teacher/exam-paper?job=${job!.job_id}`);
  };

  const statusCfg = STATUS_CONFIG[status] ?? { label: status, variant: 'outline' as const };

  return (
    <>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            {/* 左：图标 + 标题 + 元信息 */}
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  isGaokao
                    ? 'bg-orange-100 text-orange-600'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {isGaokao ? (
                  <BookMarked className="w-5 h-5" />
                ) : (
                  <FileText className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base leading-tight truncate max-w-[280px]">
                    {title}
                  </CardTitle>
                  {isGaokao && (
                    <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-xs shrink-0">
                      高考组卷
                    </Badge>
                  )}
                  <Badge variant={statusCfg.variant} className="text-xs shrink-0">
                    {statusCfg.label}
                  </Badge>
                  {!isGaokao && isShared && (
                    <Badge
                      variant="outline"
                      className="text-xs shrink-0 text-green-600 border-green-300"
                    >
                      广场已分享
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  {isGaokao && job!.requirement && (
                    <>
                      <span>科目：{job!.requirement.subject}</span>
                      <span>·</span>
                      <span>
                        难度：
                        {DIFFICULTY_LABEL[job!.requirement.target_difficulty] ??
                          job!.requirement.target_difficulty}
                      </span>
                      <span>·</span>
                      <span>题数：{job!.requirement.total_questions}</span>
                      <span>·</span>
                      <span>Token：{job!.token_consumed.toLocaleString()}</span>
                    </>
                  )}
                  {!isGaokao && <span>课程：{qs!.course_name}</span>}
                  <span>·</span>
                  <span>{new Date(createdAt).toLocaleString('zh-CN')}</span>
                </div>
              </div>
            </div>

            {/* 右：操作按钮 */}
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              {/* 预览 */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={handlePreview}
                disabled={loadingPreview || !canOperate}
                title="预览试卷内容"
              >
                {loadingPreview ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <Eye className="w-3 h-3 mr-1" />
                )}
                预览
              </Button>

              {/* 布置作业 */}
              {canOperate && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={openAssign}
                >
                  <Users className="w-3 h-3 mr-1" />
                  布置
                </Button>
              )}

              {/* 广场分享（需要有 questionSetId） */}
              {canOperate && questionSetId && (
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 px-2 text-xs ${
                    isShared
                      ? 'text-green-600 border-green-300 hover:border-green-400'
                      : ''
                  }`}
                  onClick={handleShare}
                  disabled={sharing}
                >
                  {sharing ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : isShared ? (
                    <Check className="w-3 h-3 mr-1" />
                  ) : (
                    <Share2 className="w-3 h-3 mr-1" />
                  )}
                  {isShared ? '已分享' : '广场'}
                </Button>
              )}

              {/* 续做（仅高考组卷失败/等待状态） */}
              {isGaokao &&
                (job!.status === 'failed' || job!.status === 'pending') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs text-amber-600 border-amber-300"
                    onClick={handleResume}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    续做
                  </Button>
                )}

              {/* 详情（仅高考组卷） */}
              {isGaokao && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={handleGoDetail}
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  详情
                </Button>
              )}

              {/* 删除 */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 预览弹窗 */}
      {previewOpen && (
        <PreviewDialog
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          content={previewContent}
          title={title}
          createdAt={createdAt}
        />
      )}

      {/* 布置作业弹窗 */}
      {assignOpen && questionSetId && (
        <AssignDialog
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          questionSetId={questionSetId}
          courseId={courseId}
        />
      )}

      {/* 删除确认弹窗 */}
      <DeleteConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={title}
        isDeleting={isDeleting}
      />
    </>
  );
}

// ------------------------------------------------------------------ //
// Main Page
// ------------------------------------------------------------------ //

export function MyPapersPage() {
  const [items, setItems] = useState<PaperItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const [qsRes, jobsRes] = await Promise.all([
        questionApi.listAll(),
        examPaperApi.listJobs(),
      ]);

      const allQs = qsRes.data.question_sets;
      const allJobs = jobsRes.data.jobs;

      // 已被高考 job 关联的 QS 不再重复展示
      const linkedQsIds = new Set(
        allJobs
          .filter((j) => j.question_set_id !== null)
          .map((j) => j.question_set_id as number)
      );

      const merged: PaperItem[] = [
        ...allJobs.map((job): PaperItem => ({ type: 'gaokao', job })),
        ...allQs
          .filter((qs) => !linkedQsIds.has(qs.id))
          .map((qs): PaperItem => ({ type: 'regular', qs })),
      ];

      // 按创建时间降序
      merged.sort((a, b) => {
        const ta = a.type === 'gaokao' ? a.job.created_at : a.qs.created_at;
        const tb = b.type === 'gaokao' ? b.job.created_at : b.qs.created_at;
        return tb.localeCompare(ta);
      });

      setItems(merged);
    } catch {
      toast.error('加载试卷列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = items.filter((item) => {
    if (filter === 'gaokao') return item.type === 'gaokao';
    if (filter === 'regular') return item.type === 'regular';
    return true;
  });

  const gaokaoCount = items.filter((i) => i.type === 'gaokao').length;
  const regularCount = items.filter((i) => i.type === 'regular').length;

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">我的试卷</h1>
          <p className="text-muted-foreground text-sm mt-1">
            管理全部生成试卷（普通生成 {regularCount} 份 · 高考组卷 {gaokaoCount} 份）
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 过滤 tabs */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {(['all', 'gaokao', 'regular'] as FilterType[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            className="h-8"
            onClick={() => setFilter(f)}
          >
            {f === 'all'
              ? `全部 (${items.length})`
              : f === 'gaokao'
              ? `高考组卷 (${gaokaoCount})`
              : `普通生成 (${regularCount})`}
          </Button>
        ))}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无试卷</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <PaperCard
              key={
                item.type === 'gaokao'
                  ? `job-${item.job.job_id}`
                  : `qs-${item.qs.id}`
              }
              item={item}
              onRefresh={loadData}
            />
          ))}
        </div>
      )}
    </div>
  );
}
