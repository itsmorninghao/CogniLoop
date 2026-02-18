import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  Clock,
  AlertTriangle,
  User,
  FileText,
  Edit3,
  Eye,
  Save,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/sonner';
import { teacherAnswerApi, type TeacherAnswer } from '@/services/answer';
import { questionApi } from '@/services/question';

type AnswerStatus = 'draft' | 'submitted' | 'completed' | 'failed';

interface ParsedQuestion {
  id: string;
  type: string;
  content: string;
  options?: { key: string; value: string }[];
  answer?: string;
}

export function TeacherAnswersPage() {
  const { questionSetId } = useParams<{ questionSetId: string }>();
  const navigate = useNavigate();

  const [answers, setAnswers] = useState<TeacherAnswer[]>([]);
  const [questionSetTitle, setQuestionSetTitle] = useState('');
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 详情对话框
  const [selectedAnswer, setSelectedAnswer] = useState<TeacherAnswer | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // 修改分数对话框
  const [editOpen, setEditOpen] = useState(false);
  const [editingAnswer, setEditingAnswer] = useState<TeacherAnswer | null>(null);
  const [newScore, setNewScore] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 解析 Markdown 内容
  const parseQuestions = (content: string): ParsedQuestion[] => {
    if (!content) return [];
    const questions: ParsedQuestion[] = [];
    const questionBlocks = content.split(/^## /gm).filter(Boolean);

    questionBlocks.forEach((block) => {
      const lines = block.trim().split('\n');
      const titleLine = lines[0];

      // 匹配题目编号和类型：题目 N [type]
      const titleMatch = titleLine.match(/题目\s*(\d+)\s*\[(single_choice|multiple_choice|fill_blank|short_answer)\]/);
      if (!titleMatch) return;

      const questionNumber = titleMatch[1];
      const type = titleMatch[2];
      const id = `q${questionNumber}`;

      const contentMatch = block.match(/\*\*题目内容\*\*[：:]\s*(.+?)(?=\*\*|$)/s);
      const questionContent = contentMatch?.[1]?.trim() || '';

      const options: ParsedQuestion['options'] = [];
      const optionMatches = block.matchAll(/\*\*选项\s*([A-F])\*\*[：:]\s*(.+?)(?=\*\*|$)/gs);
      for (const match of optionMatches) {
        options.push({ key: match[1], value: match[2].trim() });
      }

      const answerMatch = block.match(/\*\*正确答案\*\*[：:]\s*(.+?)(?=\*\*|$)/s);
      const answer = answerMatch?.[1]?.trim();

      questions.push({
        id,
        type,
        content: questionContent,
        options: options.length > 0 ? options : undefined,
        answer,
      });
    });

    return questions;
  };

  // 加载数据
  const loadData = async () => {
    if (!questionSetId) return;

    try {
      setIsLoading(true);

      // 加载试题集信息和答案列表
      const [contentRes, answersRes] = await Promise.all([
        questionApi.getContent(Number(questionSetId)),
        teacherAnswerApi.getByQuestionSet(Number(questionSetId)),
      ]);

      setQuestionSetTitle(contentRes.data.title);
      setQuestions(parseQuestions(contentRes.data.markdown_content));
      setAnswers(answersRes.data);
    } catch (error) {
      toast.error('加载数据失败');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [questionSetId]);

  // 获取状态标签
  const getStatusBadge = (status: AnswerStatus) => {
    switch (status) {
      case 'draft':
        return (
          <Badge variant="secondary" className="gap-1">
            <FileText className="w-3 h-3" />
            草稿
          </Badge>
        );
      case 'submitted':
        return (
          <Badge variant="warning" className="gap-1">
            <Clock className="w-3 h-3" />
            批改中
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="success" className="gap-1">
            <CheckCircle className="w-3 h-3" />
            已完成
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="w-3 h-3" />
            批改失败
          </Badge>
        );
      default:
        return null;
    }
  };

  // 打开详情
  const openDetail = (answer: TeacherAnswer) => {
    setSelectedAnswer(answer);
    setDetailOpen(true);
  };

  // 打开修改分数对话框
  const openEdit = (answer: TeacherAnswer) => {
    setEditingAnswer(answer);
    setNewScore(answer.total_score?.toString() || '0');
    setEditOpen(true);
  };

  // 保存分数
  const handleSaveScore = async () => {
    if (!editingAnswer) return;

    const score = parseFloat(newScore);
    if (isNaN(score) || score < 0 || score > 100) {
      toast.error('请输入 0-100 之间的分数');
      return;
    }

    try {
      setIsSaving(true);
      await teacherAnswerApi.updateScore(editingAnswer.id, { total_score: score });
      toast.success('分数更新成功');
      setEditOpen(false);
      loadData();
    } catch (error) {
      toast.error('保存失败');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  // 统计
  const completedCount = answers.filter((a) => a.status === 'completed').length;
  const submittedCount = answers.filter((a) => a.status === 'submitted').length;
  const totalCount = answers.length;
  const averageScore =
    completedCount > 0
      ? answers
          .filter((a) => a.status === 'completed' && a.total_score !== null)
          .reduce((sum, a) => sum + (a.total_score || 0), 0) / completedCount
      : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">答题情况</h1>
          <p className="text-muted-foreground">{questionSetTitle}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold">{totalCount}</p>
              <p className="text-sm text-muted-foreground">总提交数</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-success">{completedCount}</p>
              <p className="text-sm text-muted-foreground">已完成</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-warning">{submittedCount}</p>
              <p className="text-sm text-muted-foreground">批改中</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{averageScore.toFixed(1)}</p>
              <p className="text-sm text-muted-foreground">平均分</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Answer List */}
      <Card>
        <CardHeader>
          <CardTitle>答卷列表</CardTitle>
          <CardDescription>包含学生和广场教师的答卷，点击查看详情或修改分数</CardDescription>
        </CardHeader>
        <CardContent>
          {answers.length === 0 ? (
            <div className="text-center py-12">
              <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">暂无答案提交</p>
            </div>
          ) : (
            <div className="space-y-3">
              {answers.map((answer) => (
                <div
                  key={answer.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{answer.student.full_name}</p>
                      <p className="text-sm text-muted-foreground">{answer.student.username}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {getStatusBadge(answer.status as AnswerStatus)}

                    {answer.status === 'completed' && answer.total_score !== null && (
                      <div className="flex items-baseline gap-0.5 min-w-[60px] justify-end">
                        <span className="text-2xl font-bold">{answer.total_score.toFixed(1)}</span>
                        <span className="text-xs text-muted-foreground">分</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDetail(answer)}
                      >
                        <Eye className="w-4 h-4" />
                        查看
                      </Button>
                      {answer.status === 'completed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(answer)}
                        >
                          <Edit3 className="w-4 h-4" />
                          改分
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedAnswer?.student.full_name} 的答卷
            </DialogTitle>
            <DialogDescription>
              {selectedAnswer?.submitted_at
                ? `提交时间：${new Date(selectedAnswer.submitted_at).toLocaleString()}`
                : '尚未提交'}
              {selectedAnswer?.total_score !== null && (
                <span className="ml-4">
                  得分：<strong>{selectedAnswer?.total_score?.toFixed(1)}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {questions.map((q, idx) => {
                const studentAnswer = selectedAnswer?.student_answers?.[q.id];
                const gradingResult = selectedAnswer?.grading_results?.[q.id];

                return (
                  <div key={q.id} className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="shrink-0">
                        {idx + 1}
                      </Badge>
                      <div className="flex-1">
                        <p className="font-medium mb-2">{q.content}</p>

                        {/* 选项 */}
                        {q.options && (
                          <div className="space-y-1 mb-2">
                            {q.options.map((opt) => (
                              <p
                                key={opt.key}
                                className={`text-sm ${
                                  opt.key === q.answer
                                    ? 'text-success font-medium'
                                    : ''
                                }`}
                              >
                                {opt.key}. {opt.value}
                                {opt.key === q.answer && ' ✓'}
                              </p>
                            ))}
                          </div>
                        )}

                        {/* 学生答案 */}
                        <div className="p-3 rounded-lg bg-muted">
                          <p className="text-sm text-muted-foreground mb-1">学生答案：</p>
                          <p className="font-medium">
                            {Array.isArray(studentAnswer)
                              ? studentAnswer.join(', ')
                              : studentAnswer || '(未作答)'}
                          </p>
                        </div>

                        {/* 批改结果 */}
                        {gradingResult && (
                          <div className="mt-2 p-3 rounded-lg border">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm">批改结果：</span>
                              <Badge
                                variant={
                                  gradingResult.score >= gradingResult.max_score
                                    ? 'success'
                                    : gradingResult.score > 0
                                    ? 'warning'
                                    : 'destructive'
                                }
                              >
                                {gradingResult.score.toFixed(1)} / {gradingResult.max_score.toFixed(1)}
                              </Badge>
                            </div>
                            {gradingResult.feedback && (
                              <p className="text-sm text-muted-foreground">
                                {gradingResult.feedback}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {idx < questions.length - 1 && <Separator />}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              关闭
            </Button>
            {selectedAnswer?.status === 'completed' && (
              <Button
                onClick={() => {
                  setDetailOpen(false);
                  openEdit(selectedAnswer);
                }}
              >
                <Edit3 className="w-4 h-4" />
                修改分数
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Score Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>修改分数</DialogTitle>
            <DialogDescription>
              学生：{editingAnswer?.student.full_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="score">总分（0-100）</Label>
              <Input
                id="score"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={newScore}
                onChange={(e) => setNewScore(e.target.value)}
                placeholder="请输入分数"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              原分数：{editingAnswer?.total_score?.toFixed(1) ?? '-'}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveScore} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

