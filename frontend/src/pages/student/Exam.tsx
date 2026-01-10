import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Save,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/sonner';
import { studentQuestionApi } from '@/services/question';
import { answerApi, type Answer } from '@/services/answer';

interface ParsedQuestion {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'fill_blank' | 'short_answer';
  content: string;
  options?: { key: string; value: string }[];
  answer?: string;
  explanation?: string;
}

type ExamStatus = 'not_started' | 'in_progress' | 'submitted' | 'completed' | 'failed';

export function StudentExamPage() {
  const { questionSetId } = useParams<{ questionSetId: string }>();

  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingAnswer, setExistingAnswer] = useState<Answer | null>(null);
  const [examStatus, setExamStatus] = useState<ExamStatus>('not_started');

  // 根据答案状态确定考试状态
  const getExamStatus = (answer: Answer | null): ExamStatus => {
    if (!answer) return 'not_started';
    switch (answer.status) {
      case 'draft':
        return 'in_progress';
      case 'submitted':
        return 'submitted';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      default:
        return 'not_started';
    }
  };

  // 解析 Markdown 内容
  const parseQuestions = (content: string | undefined): ParsedQuestion[] => {
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
      const type = titleMatch[2] as ParsedQuestion['type'];
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

      const explanationMatch = block.match(/\*\*解析\*\*[：:]\s*(.+?)(?=\*\*|$)/s);
      const explanation = explanationMatch?.[1]?.trim();

      questions.push({
        id,
        type,
        content: questionContent,
        options: options.length > 0 ? options : undefined,
        answer,
        explanation,
      });
    });

    return questions;
  };

  // 加载试题和已有答案
  const loadData = async () => {
    if (!questionSetId) return;

    try {
      setIsLoading(true);

      const contentRes = await studentQuestionApi.getContent(Number(questionSetId));
      const parsed = parseQuestions(contentRes.data.markdown_content);
      setQuestions(parsed);

      try {
        const answerRes = await answerApi.getByQuestionSet(Number(questionSetId));
        if (answerRes.data) {
          setExistingAnswer(answerRes.data);
          if (answerRes.data.student_answers) {
            setAnswers(answerRes.data.student_answers);
          }
          setExamStatus(getExamStatus(answerRes.data));
        }
      } catch {
        // 没有已有答案
      }
    } catch (error) {
      toast.error('加载试题失败');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // 刷新状态
  const refreshStatus = async () => {
    if (!questionSetId) return;

    try {
      const answerRes = await answerApi.getByQuestionSet(Number(questionSetId));
      if (answerRes.data) {
        setExistingAnswer(answerRes.data);
        setExamStatus(getExamStatus(answerRes.data));
        if (answerRes.data.status === 'completed') {
          toast.success('批改完成！');
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  // 保存草稿
  const saveDraft = useCallback(async () => {
    if (!questionSetId || Object.keys(answers).length === 0) return;
    if (examStatus !== 'not_started' && examStatus !== 'in_progress') return;

    try {
      setIsSaving(true);
      const response = await answerApi.saveDraft({
        question_set_id: Number(questionSetId),
        student_answers: answers,
      });
      setExistingAnswer(response.data);
      setExamStatus('in_progress');
      toast.success('草稿已保存');
    } catch (error) {
      toast.error('保存失败');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }, [questionSetId, answers, examStatus]);

  // 提交答案
  const handleSubmit = async () => {
    if (!questionSetId) return;
    if (examStatus !== 'not_started' && examStatus !== 'in_progress') {
      toast.error('该试题集已提交，不能重复提交');
      return;
    }

    const unanswered = questions.filter((q) => !answers[q.id]);
    if (unanswered.length > 0) {
      if (!confirm(`还有 ${unanswered.length} 道题未作答，确定要提交吗？`)) {
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const response = await answerApi.submit({
        question_set_id: Number(questionSetId),
        student_answers: answers,
      });
      setExistingAnswer(response.data);
      setExamStatus('submitted');
      toast.success('提交成功，正在批改中...');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 更新答案
  const updateAnswer = (questionId: string, value: string | string[]) => {
    if (examStatus !== 'not_started' && examStatus !== 'in_progress') return;
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  // 自动保存
  useEffect(() => {
    if ((examStatus === 'not_started' || examStatus === 'in_progress') && Object.keys(answers).length > 0) {
      const timer = setTimeout(() => {
        saveDraft();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [answers, examStatus, saveDraft]);

  useEffect(() => {
    loadData();
  }, [questionSetId]);

  // 判断是否可编辑
  const isEditable = examStatus === 'not_started' || examStatus === 'in_progress';
  const showResults = examStatus === 'completed';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentQuestion = questions[currentIndex] || null;
  const answeredCount = Object.keys(answers).filter((k) => answers[k]).length;
  const progress = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

  if (!isLoading && questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-muted-foreground">暂无试题内容</p>
        <Link to="/student">
          <Button variant="outline">返回</Button>
        </Link>
      </div>
    );
  }

  // 状态卡片
  const renderStatusCard = () => {
    if (examStatus === 'submitted') {
      return (
        <Card className="border-warning bg-warning/5">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">批改中</h3>
                  <p className="text-muted-foreground">
                    您的答案已提交，系统正在批改中，请稍后刷新查看结果
                  </p>
                </div>
              </div>
              <Button onClick={refreshStatus} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                刷新状态
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (examStatus === 'failed') {
      return (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">批改失败</h3>
                <p className="text-muted-foreground">
                  {existingAnswer?.error_message || '批改过程中出现错误，请联系教师'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (examStatus === 'completed' && existingAnswer) {
      return (
        <Card className="border-success bg-success/5">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-success" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">批改完成</h3>
                  <p className="text-muted-foreground">
                    提交时间：{existingAnswer.submitted_at ? new Date(existingAnswer.submitted_at).toLocaleString() : '-'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">总分</p>
                <p className="text-4xl font-bold text-success">
                  {existingAnswer.total_score?.toFixed(1) ?? '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  // 渲染单选题
  const renderSingleChoice = (q: ParsedQuestion) => {
    const studentAnswer = answers[q.id] as string || '';
    const gradingResult = existingAnswer?.grading_results?.[q.id];

    return (
      <RadioGroup
        value={studentAnswer}
        onValueChange={(v) => updateAnswer(q.id, v)}
        disabled={!isEditable}
      >
        {q.options?.map((opt) => {
          let optionClass = 'hover:bg-muted';
          if (showResults && gradingResult) {
            if (opt.key === gradingResult.correct_answer) {
              optionClass = 'bg-success/10 border-success';
            } else if (studentAnswer === opt.key && opt.key !== gradingResult.correct_answer) {
              optionClass = 'bg-destructive/10 border-destructive';
            }
          } else if (studentAnswer === opt.key) {
            optionClass = 'bg-primary/10 border-primary';
          }

          return (
            <div key={opt.key} className="flex items-center space-x-2">
              <RadioGroupItem value={opt.key} id={`${q.id}-${opt.key}`} />
              <Label
                htmlFor={`${q.id}-${opt.key}`}
                className={`flex-1 cursor-pointer p-3 rounded-lg border transition-colors ${optionClass}`}
              >
                <span className="font-medium mr-2">{opt.key}.</span>
                {opt.value}
                {showResults && gradingResult && opt.key === gradingResult.correct_answer && (
                  <CheckCircle className="w-4 h-4 text-success inline ml-2" />
                )}
                {showResults && gradingResult && studentAnswer === opt.key && opt.key !== gradingResult.correct_answer && (
                  <XCircle className="w-4 h-4 text-destructive inline ml-2" />
                )}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    );
  };

  // 渲染多选题
  const renderMultipleChoice = (q: ParsedQuestion) => {
    const selectedValues = (answers[q.id] as string[]) || [];
    const gradingResult = existingAnswer?.grading_results?.[q.id];
    const correctAnswers = gradingResult?.correct_answer?.split(',') || [];

    return (
      <div className="space-y-2">
        {q.options?.map((opt) => {
          let optionClass = 'hover:bg-muted';
          if (showResults && gradingResult) {
            if (correctAnswers.includes(opt.key)) {
              optionClass = 'bg-success/10 border-success';
            } else if (selectedValues.includes(opt.key)) {
              optionClass = 'bg-destructive/10 border-destructive';
            }
          } else if (selectedValues.includes(opt.key)) {
            optionClass = 'bg-primary/10 border-primary';
          }

          return (
            <Label
              key={opt.key}
              className={`flex items-center space-x-2 cursor-pointer p-3 rounded-lg border transition-colors ${optionClass}`}
            >
              <Checkbox
                checked={selectedValues.includes(opt.key)}
                onCheckedChange={(checked) => {
                  if (!isEditable) return;
                  if (checked) {
                    updateAnswer(q.id, [...selectedValues, opt.key]);
                  } else {
                    updateAnswer(q.id, selectedValues.filter((v) => v !== opt.key));
                  }
                }}
                disabled={!isEditable}
              />
              <span className="font-medium mr-2">{opt.key}.</span>
              <span className="flex-1">{opt.value}</span>
            </Label>
          );
        })}
      </div>
    );
  };

  // 渲染填空题
  const renderFillBlank = (q: ParsedQuestion) => {
    const gradingResult = existingAnswer?.grading_results?.[q.id];

    return (
      <div className="space-y-4">
        <Input
          placeholder="请输入答案"
          value={(answers[q.id] as string) || ''}
          onChange={(e) => updateAnswer(q.id, e.target.value)}
          disabled={!isEditable}
          className="text-lg"
        />
        {showResults && gradingResult && (
          <div className={`p-3 rounded-lg ${gradingResult.score > 0 ? 'bg-success/10 border border-success' : 'bg-destructive/10 border border-destructive'}`}>
            <span className="text-sm font-medium">正确答案：</span>
            <span>{gradingResult.correct_answer}</span>
          </div>
        )}
      </div>
    );
  };

  // 渲染简答题
  const renderShortAnswer = (q: ParsedQuestion) => {
    const gradingResult = existingAnswer?.grading_results?.[q.id];

    return (
      <div className="space-y-4">
        <Textarea
          placeholder="请输入您的答案"
          value={(answers[q.id] as string) || ''}
          onChange={(e) => updateAnswer(q.id, e.target.value)}
          disabled={!isEditable}
          rows={6}
        />
        {showResults && gradingResult && (
          <div className="p-4 rounded-lg bg-muted space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">得分</span>
              <Badge variant={gradingResult.score >= gradingResult.max_score * 0.6 ? 'success' : 'destructive'}>
                {gradingResult.score.toFixed(1)} / {gradingResult.max_score.toFixed(1)}
              </Badge>
            </div>
            {gradingResult.feedback && (
              <p className="text-sm text-muted-foreground">{gradingResult.feedback}</p>
            )}
            {gradingResult.analysis && (
              <p className="text-sm text-muted-foreground">{gradingResult.analysis}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  // 渲染题目
  const renderQuestion = (q: ParsedQuestion) => {
    switch (q.type) {
      case 'single_choice':
        return renderSingleChoice(q);
      case 'multiple_choice':
        return renderMultipleChoice(q);
      case 'fill_blank':
        return renderFillBlank(q);
      case 'short_answer':
        return renderShortAnswer(q);
      default:
        return null;
    }
  };

  const getTypeLabel = (type: ParsedQuestion['type']) => {
    const labels = {
      single_choice: '单选题',
      multiple_choice: '多选题',
      fill_blank: '填空题',
      short_answer: '简答题',
    };
    return labels[type];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/student">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">
              {examStatus === 'completed' ? '查看结果' : examStatus === 'submitted' ? '批改中' : '答题中'}
            </h1>
            <p className="text-muted-foreground">
              {answeredCount} / {questions.length} 题已作答
            </p>
          </div>
        </div>
      </div>

      {/* Status Card */}
      {renderStatusCard()}

      {/* Progress */}
      <Progress value={progress} className="h-2" />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Question Navigation */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">题目导航</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, i) => {
                let variant: 'default' | 'secondary' | 'outline' | 'destructive' = 'outline';
                if (currentIndex === i) {
                  variant = 'default';
                } else if (answers[q.id]) {
                  variant = 'secondary';
                }

                // 批改完成后显示对错
                if (showResults && existingAnswer?.grading_results?.[q.id]) {
                  const result = existingAnswer.grading_results[q.id];
                  if (result.score >= result.max_score) {
                    variant = currentIndex === i ? 'default' : 'secondary';
                  } else if (result.score === 0) {
                    variant = 'destructive';
                  }
                }

                return (
                  <Button
                    key={q.id}
                    variant={variant}
                    size="sm"
                    onClick={() => setCurrentIndex(i)}
                    className="w-full"
                  >
                    {i + 1}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Question Content */}
        <Card className="lg:col-span-3">
          {currentQuestion && (
            <>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{getTypeLabel(currentQuestion.type)}</Badge>
                  <span className="text-sm text-muted-foreground">
                    第 {currentIndex + 1} 题 / 共 {questions.length} 题
                  </span>
                </div>
                <CardTitle className="mt-4 text-lg leading-relaxed">
                  {currentQuestion.content}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {renderQuestion(currentQuestion)}

                {/* 显示解析 */}
                {showResults && currentQuestion.explanation && (
                  <div className="p-4 rounded-lg bg-muted border-l-4 border-primary">
                    <p className="font-medium mb-1">解析</p>
                    <p className="text-sm text-muted-foreground">{currentQuestion.explanation}</p>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                    disabled={currentIndex === 0}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    上一题
                  </Button>

                  <div className="flex gap-2">
                    {isEditable && (
                      <>
                        <Button variant="outline" onClick={saveDraft} disabled={isSaving}>
                          {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          保存草稿
                        </Button>
                        <Button onClick={handleSubmit} disabled={isSubmitting}>
                          {isSubmitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                          提交答案
                        </Button>
                      </>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                    disabled={currentIndex === questions.length - 1}
                  >
                    下一题
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
