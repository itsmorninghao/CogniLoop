import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Loader2,
  Eye,
  EyeOff,
  Send,
  FileText,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  ListChecks,
  PenLine,
  MessageSquare,
  X,
  Users,
  Trash2,
  ArrowLeft,
  ClipboardList,
  Share2,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
// Select components removed - now using course card selection
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/sonner';
import { questionApi, type QuestionSet } from '@/services/question';
import { courseApi, type Course } from '@/services/course';
import { statisticsApi, type StudentInfo } from '@/services/statistics';
import { plazaApi } from '@/services/plaza';

export function QuestionGeneratorPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [questionSetCounts, setQuestionSetCounts] = useState<Record<number, number>>({});
  const [questionSets, setQuestionSets] = useState<QuestionSet[]>([]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [questionSetToDelete, setQuestionSetToDelete] = useState<QuestionSet | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);

  // 生成表单
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');

  // 预览
  const [previewContent, setPreviewContent] = useState('');
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedQuestionSet, setSelectedQuestionSet] = useState<QuestionSet | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showAnswers, setShowAnswers] = useState(false);

  // 题目类型映射
  const questionTypeMap: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
    single_choice: { label: '单选题', color: 'bg-blue-500', icon: Circle },
    multiple_choice: { label: '多选题', color: 'bg-purple-500', icon: ListChecks },
    fill_blank: { label: '填空题', color: 'bg-green-500', icon: PenLine },
    short_answer: { label: '简答题', color: 'bg-orange-500', icon: MessageSquare },
  };

  // 解析试题内容
  const parsedQuestions = useMemo(() => {
    if (!previewContent) return [];
    
    const questions: Array<{
      number: number;
      type: string;
      content: string;
      options: string[];
      answer: string;
      explanation: string;
      scoringPoints?: string;
    }> = [];

    // 按题目分割
    const questionBlocks = previewContent.split(/## 题目 \d+/).slice(1);
    
    questionBlocks.forEach((block, index) => {
      const typeMatch = block.match(/\[(\w+)\]/);
      const type = typeMatch ? typeMatch[1] : 'unknown';
      
      // 提取题目内容
      const contentMatch = block.match(/\*\*题目内容\*\*[：:]\s*([^\n]+)/);
      const content = contentMatch ? contentMatch[1].trim() : '';
      
      // 提取选项
      const options: string[] = [];
      const optionMatches = block.matchAll(/\*\*选项 ([A-E])\*\*[：:]\s*([^\n]+)/g);
      for (const match of optionMatches) {
        options.push(`${match[1]}. ${match[2].trim()}`);
      }
      
      // 提取答案
      const answerMatch = block.match(/\*\*(?:正确答案|参考答案)\*\*[：:]\s*([\s\S]*?)(?=\n\*\*|$)/);
      let answer = answerMatch ? answerMatch[1].trim() : '';
      
      // 提取解析
      const explanationMatch = block.match(/\*\*解析\*\*[：:]\s*([\s\S]*?)(?=\n\*\*评分要点|$)/);
      const explanation = explanationMatch ? explanationMatch[1].trim() : '';
      
      // 提取评分要点（简答题）
      const scoringMatch = block.match(/\*\*评分要点\*\*[：:]\s*([\s\S]*?)$/);
      const scoringPoints = scoringMatch ? scoringMatch[1].trim() : undefined;
      
      questions.push({
        number: index + 1,
        type,
        content,
        options,
        answer,
        explanation,
        scoringPoints,
      });
    });
    
    return questions;
  }, [previewContent]);

  // 获取试题标题
  const questionSetTitle = useMemo(() => {
    const match = previewContent.match(/^# (.+)$/m);
    return match ? match[1] : selectedQuestionSet?.title || '试题预览';
  }, [previewContent, selectedQuestionSet]);

  // 分发
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningQuestionSet, setAssigningQuestionSet] = useState<QuestionSet | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [deadline, setDeadline] = useState('');

  // 加载课程列表
  const loadCourses = async () => {
    try {
      setIsLoadingCourses(true);
      const response = await courseApi.list();
      setCourses(response.data.courses);
      
      // 加载每个课程的试题集数量
      const counts: Record<number, number> = {};
      await Promise.all(
        response.data.courses.map(async (course) => {
          try {
            const qsResponse = await questionApi.list(course.id);
            counts[course.id] = qsResponse.data.total;
          } catch {
            counts[course.id] = 0;
          }
        })
      );
      setQuestionSetCounts(counts);
    } catch (error) {
      toast.error('加载课程列表失败');
      console.error(error);
    } finally {
      setIsLoadingCourses(false);
    }
  };

  // 加载数据
  const loadData = async () => {
    if (!selectedCourse) return;
    try {
      setIsLoading(true);
      const [qsRes, studentsRes] = await Promise.all([
        questionApi.list(selectedCourse.id),
        statisticsApi.courseStudents(selectedCourse.id),
      ]);
      setQuestionSets(qsRes.data.question_sets);
      setStudents(studentsRes.data);
      // 更新试题集计数
      setQuestionSetCounts(prev => ({
        ...prev,
        [selectedCourse.id]: qsRes.data.total
      }));
    } catch (error) {
      toast.error('加载数据失败');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // 选择课程
  const handleSelectCourse = (course: Course) => {
    setSelectedCourse(course);
  };

  // 返回课程列表
  const handleBack = () => {
    setSelectedCourse(null);
    setQuestionSets([]);
    setStudents([]);
  };

  // 生成试题
  const handleGenerate = async () => {
    if (!prompt.trim() || !title.trim() || !selectedCourse) {
      toast.error('请填写试题标题和需求描述');
      return;
    }

    // 将标题和需求描述合并为自然语言请求
    const naturalLanguageRequest = `${title.trim()}\n\n${prompt.trim()}`;

    if (naturalLanguageRequest.length < 10) {
      toast.error('需求描述太短，请至少输入10个字符');
      return;
    }

    try {
      setIsGenerating(true);
      await questionApi.generate({
        course_id: selectedCourse.id,
        natural_language_request: naturalLanguageRequest,
      });
      toast.success('试题生成成功');
      setPrompt('');
      setTitle('');
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  // 预览试题
  const handlePreview = async (qs: QuestionSet) => {
    try {
      const response = await questionApi.getContent(qs.id);
      setPreviewContent(response.data.markdown_content);
      setSelectedQuestionSet(qs);
      setCurrentQuestionIndex(0);
      setShowAnswers(false);
      setPreviewDialogOpen(true);
    } catch (error) {
      toast.error('加载试题内容失败');
      console.error(error);
    }
  };

  // 打开分发对话框
  const openAssignDialog = (qs: QuestionSet) => {
    setAssigningQuestionSet(qs);
    setSelectedStudentIds([]);
    setDeadline('');
    setAssignDialogOpen(true);
  };

  // 分发试题
  const handleAssign = async () => {
    if (!assigningQuestionSet || selectedStudentIds.length === 0) {
      toast.error('请选择学生');
      return;
    }

    try {
      setIsAssigning(true);
      await questionApi.assign(assigningQuestionSet.id, {
        student_ids: selectedStudentIds,
        deadline: deadline || undefined,
      });
      toast.success('试题分发成功');
      setAssignDialogOpen(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '分发失败');
    } finally {
      setIsAssigning(false);
    }
  };

  // 打开删除确认对话框
  const openDeleteDialog = (qs: QuestionSet) => {
    setQuestionSetToDelete(qs);
    setDeleteDialogOpen(true);
  };

  // 删除试题集
  const handleDelete = async () => {
    if (!questionSetToDelete) return;

    try {
      setIsDeleting(true);
      await questionApi.delete(questionSetToDelete.id);
      toast.success('试题集已删除');
      setDeleteDialogOpen(false);
      setQuestionSetToDelete(null);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleShare = async (qs: QuestionSet) => {
    if (qs.shared_to_plaza_at) {
      if (!confirm('确定要从广场撤回该试题集吗？撤回后其他用户将无法继续做题。')) {
        return;
      }
    }
    try {
      setSharingId(qs.id);
      if (qs.shared_to_plaza_at) {
        await plazaApi.unsharePlaza(qs.id);
        toast.success('已从广场撤回');
      } else {
        await plazaApi.sharePlaza(qs.id);
        toast.success('已分享到广场');
      }
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setSharingId(null);
    }
  };

  // 全选学生
  const selectAllStudents = () => {
    setSelectedStudentIds(students.map((s) => s.id));
  };

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      loadData();
    }
  }, [selectedCourse]);

  if (isLoadingCourses) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">试题生成器</h1>
          <p className="text-muted-foreground">使用 AI 根据知识库内容生成试题</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">请先在仪表盘创建课程</p>
            <Button variant="outline" onClick={() => window.location.href = '/teacher'}>
              前往创建课程
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 课程详情页面 - 试题管理
  if (selectedCourse) {
    return (
      <div className="space-y-6">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{selectedCourse.name}</h1>
            <p className="text-muted-foreground">生成和管理该课程的试题</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Generator Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                生成新试题
              </CardTitle>
              <CardDescription>
                描述您想要生成的试题内容，AI 将根据知识库自动生成
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">试题标题</Label>
                <Input
                  id="title"
                  placeholder="例如：第一章 单元测试"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt">需求描述</Label>
                <Textarea
                  id="prompt"
                  placeholder="例如：请根据 Python 基础语法章节生成 10 道选择题和 5 道简答题，涵盖变量、数据类型和控制流程..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                />
              </div>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AI 正在生成...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    生成试题
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Question Sets List */}
          <Card>
            <CardHeader>
              <CardTitle>已生成的试题</CardTitle>
              <CardDescription>{questionSets.length} 套试题</CardDescription>
            </CardHeader>
            <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : questionSets.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">暂无试题，请使用左侧表单生成</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {questionSets.map((qs) => (
                    <div
                      key={qs.id}
                      className="p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium">{qs.title}</p>
                          <p className="text-sm text-muted-foreground">
                            创建于 {new Date(qs.created_at).toLocaleDateString('zh-CN')}
                          </p>
                        </div>
                        <Badge variant={qs.status === 'draft' ? 'secondary' : 'success'}>
                          {qs.status === 'draft' ? '草稿' : '已发布'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreview(qs)}
                        >
                          <Eye className="w-4 h-4" />
                          预览
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAssignDialog(qs)}
                        >
                          <Send className="w-4 h-4" />
                          分发
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/teacher/answers/${qs.id}`)}
                        >
                          <Users className="w-4 h-4" />
                          答题
                        </Button>
                        <Button
                          variant={qs.shared_to_plaza_at ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleToggleShare(qs)}
                          disabled={sharingId === qs.id}
                        >
                          {sharingId === qs.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : qs.shared_to_plaza_at ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Share2 className="w-4 h-4" />
                          )}
                          {qs.shared_to_plaza_at ? '已分享' : '分享'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => openDeleteDialog(qs)}
                        >
                          <Trash2 className="w-4 h-4" />
                          删除
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Preview Dialog - 全屏大气设计 */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent 
          className="flex flex-col w-[98vw] max-w-[1800px] h-[92vh] max-h-[92vh] p-0 gap-0 overflow-hidden"
          hideCloseButton
        >
          {/* 顶部标题栏 - 固定高度 */}
          <div className="flex-shrink-0 h-[72px] flex items-center justify-between px-6 border-b bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{questionSetTitle}</h2>
                <p className="text-sm text-muted-foreground">
                  共 {parsedQuestions.length} 道题目 · 创建于 {selectedQuestionSet && new Date(selectedQuestionSet.created_at).toLocaleDateString('zh-CN')}
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
              <Button variant="ghost" size="icon" onClick={() => setPreviewDialogOpen(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* 主体内容区 - 填充剩余高度 */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* 左侧题目导航 */}
            <div className="w-72 flex-shrink-0 border-r bg-muted/20 flex flex-col">
              <div className="flex-shrink-0 h-12 flex items-center px-4 border-b">
                <h3 className="font-medium text-sm text-muted-foreground">题目列表</h3>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {parsedQuestions.map((q, index) => {
                    const typeInfo = questionTypeMap[q.type] || { label: '未知', color: 'bg-gray-500', icon: Circle };
                    const TypeIcon = typeInfo.icon;
                    return (
                      <button
                        key={index}
                        onClick={() => setCurrentQuestionIndex(index)}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all ${
                          currentQuestionIndex === index
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-medium ${
                          currentQuestionIndex === index ? 'bg-white/20' : typeInfo.color
                        }`}>
                          {q.number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${
                            currentQuestionIndex === index ? '' : 'text-foreground'
                          }`}>
                            第 {q.number} 题
                          </p>
                          <p className={`text-xs truncate ${
                            currentQuestionIndex === index ? 'text-primary-foreground/70' : 'text-muted-foreground'
                          }`}>
                            {typeInfo.label}
                          </p>
                        </div>
                        <TypeIcon className={`w-4 h-4 flex-shrink-0 ${
                          currentQuestionIndex === index ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        }`} />
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* 右侧题目详情 */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {parsedQuestions.length > 0 && parsedQuestions[currentQuestionIndex] && (
                <>
                  <ScrollArea className="flex-1">
                    <div className="p-8 max-w-5xl mx-auto">
                      {/* 题目类型标签 */}
                      <div className="flex items-center gap-3 mb-6">
                        <Badge className={`${questionTypeMap[parsedQuestions[currentQuestionIndex].type]?.color || 'bg-gray-500'} text-white px-3 py-1`}>
                          {questionTypeMap[parsedQuestions[currentQuestionIndex].type]?.label || '未知题型'}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          第 {parsedQuestions[currentQuestionIndex].number} / {parsedQuestions.length} 题
                        </span>
                      </div>

                      {/* 题目内容 */}
                      <div className="mb-8">
                        <h3 className="text-lg font-semibold mb-4 leading-relaxed">
                          {parsedQuestions[currentQuestionIndex].content}
                        </h3>
                      </div>

                      {/* 选项列表 */}
                      {parsedQuestions[currentQuestionIndex].options.length > 0 && (
                        <div className="space-y-3 mb-8">
                          {parsedQuestions[currentQuestionIndex].options.map((option, idx) => {
                            const optionLetter = option.charAt(0);
                            const isCorrect = showAnswers && parsedQuestions[currentQuestionIndex].answer.includes(optionLetter);
                            return (
                              <div
                                key={idx}
                                className={`flex items-start gap-4 p-4 rounded-xl border-2 transition-all ${
                                  isCorrect
                                    ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
                                    : 'border-border hover:border-primary/30 hover:bg-muted/50'
                                }`}
                              >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${
                                  isCorrect
                                    ? 'bg-green-500 text-white'
                                    : 'bg-muted text-muted-foreground'
                                }`}>
                                  {optionLetter}
                                </div>
                                <div className="flex-1 pt-2">
                                  <p className={`${isCorrect ? 'text-green-700 dark:text-green-300 font-medium' : ''}`}>
                                    {option.slice(3)}
                                  </p>
                                </div>
                                {isCorrect && (
                                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-2" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 答案和解析区域 */}
                      {showAnswers && (
                        <div className="space-y-4 pt-6 border-t">
                          {/* 正确答案 */}
                          <div className="bg-green-50 dark:bg-green-950/30 rounded-xl p-5 border border-green-200 dark:border-green-800">
                            <div className="flex items-center gap-2 mb-3">
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                              <span className="font-semibold text-green-700 dark:text-green-300">正确答案</span>
                            </div>
                            <p className="text-green-800 dark:text-green-200 whitespace-pre-wrap leading-relaxed">
                              {parsedQuestions[currentQuestionIndex].answer}
                            </p>
                          </div>

                          {/* 解析 */}
                          {parsedQuestions[currentQuestionIndex].explanation && (
                            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-5 border border-blue-200 dark:border-blue-800">
                              <div className="flex items-center gap-2 mb-3">
                                <MessageSquare className="w-5 h-5 text-blue-600" />
                                <span className="font-semibold text-blue-700 dark:text-blue-300">解析</span>
                              </div>
                              <p className="text-blue-800 dark:text-blue-200 whitespace-pre-wrap leading-relaxed">
                                {parsedQuestions[currentQuestionIndex].explanation}
                              </p>
                            </div>
                          )}

                          {/* 评分要点（简答题） */}
                          {parsedQuestions[currentQuestionIndex].scoringPoints && (
                            <div className="bg-orange-50 dark:bg-orange-950/30 rounded-xl p-5 border border-orange-200 dark:border-orange-800">
                              <div className="flex items-center gap-2 mb-3">
                                <ListChecks className="w-5 h-5 text-orange-600" />
                                <span className="font-semibold text-orange-700 dark:text-orange-300">评分要点</span>
                              </div>
                              <p className="text-orange-800 dark:text-orange-200 whitespace-pre-wrap leading-relaxed">
                                {parsedQuestions[currentQuestionIndex].scoringPoints}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  {/* 底部导航栏 - 固定高度 */}
                  <div className="flex-shrink-0 h-[64px] flex items-center justify-between px-8 border-t bg-muted/20">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                      disabled={currentQuestionIndex === 0}
                      className="gap-2"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      上一题
                    </Button>
                    
                    {/* 快速跳转 */}
                    <div className="flex items-center gap-2">
                      {parsedQuestions.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentQuestionIndex(idx)}
                          className={`w-8 h-8 rounded-full text-sm font-medium transition-all ${
                            currentQuestionIndex === idx
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
                      onClick={() => setCurrentQuestionIndex(Math.min(parsedQuestions.length - 1, currentQuestionIndex + 1))}
                      disabled={currentQuestionIndex === parsedQuestions.length - 1}
                      className="gap-2"
                    >
                      下一题
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              )}

              {parsedQuestions.length === 0 && (
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

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>分发试题</DialogTitle>
            <DialogDescription>
              选择要分发「{assigningQuestionSet?.title}」的学生
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>选择学生</Label>
                <Button variant="link" size="sm" onClick={selectAllStudents}>
                  全选
                </Button>
              </div>
              {students.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  暂无学生加入此课程
                </p>
              ) : (
                <ScrollArea className="h-[240px] border rounded-lg">
                  <div className="p-2 space-y-1">
                    {students.map((student) => (
                      <label
                        key={student.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selectedStudentIds.includes(student.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedStudentIds([...selectedStudentIds, student.id]);
                            } else {
                              setSelectedStudentIds(
                                selectedStudentIds.filter((id) => id !== student.id)
                              );
                            }
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{student.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {student.username} · {student.email}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadline">截止时间（可选）</Label>
              <Input
                id="deadline"
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              取消
            </Button>
            <Button 
              onClick={handleAssign} 
              disabled={isAssigning || selectedStudentIds.length === 0}
              className="gap-2"
            >
              {isAssigning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  分发中...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  分发给 {selectedStudentIds.length} 人
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除试题集「{questionSetToDelete?.title}」吗？此操作将同时删除所有相关的学生答案记录，且不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDelete} 
              disabled={isDeleting}
              className="gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  删除中...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  确认删除
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    );
  }

  // 课程卡片墙
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">试题生成器</h1>
        <p className="text-muted-foreground">选择课程生成和管理试题</p>
      </div>

      {/* Course Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map((course) => (
          <Card
            key={course.id}
            className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
            onClick={() => handleSelectCourse(course)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ClipboardList className="w-6 h-6 text-primary" />
                </div>
                <Badge variant="outline">{course.invite_code}</Badge>
              </div>
              <CardTitle className="mt-4">{course.name}</CardTitle>
              <CardDescription className="line-clamp-2">
                {course.description || '暂无描述'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span>{questionSetCounts[course.id] || 0} 套试题</span>
                </div>
                <span className="text-muted-foreground">
                  {new Date(course.created_at).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
