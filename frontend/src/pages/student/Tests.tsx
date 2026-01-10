import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Loader2,
  Edit,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/sonner';
import { studentQuestionApi, type StudentQuestionSet } from '@/services/question';

export function StudentTestsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [questionSets, setQuestionSets] = useState<StudentQuestionSet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // 加载试题集列表
  const loadQuestionSets = async () => {
    try {
      setIsLoading(true);
      const response = await studentQuestionApi.list(courseId ? Number(courseId) : undefined);
      setQuestionSets(response.data || []);
    } catch (error) {
      toast.error('加载试题集失败');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // 检查是否过期
  const isOverdue = (deadline: string | null) => {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  };

  // 格式化截止时间
  const formatDeadline = (deadline: string | null) => {
    if (!deadline) return '无截止时间';
    const date = new Date(deadline);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 获取状态标签
  const getStatusBadge = (qs: StudentQuestionSet) => {
    if (qs.is_completed) {
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle className="w-3 h-3" />
          已完成
        </Badge>
      );
    }
    if (qs.deadline && isOverdue(qs.deadline)) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="w-3 h-3" />
          已过期
        </Badge>
      );
    }
    if (qs.has_draft) {
      return (
        <Badge variant="warning" className="gap-1">
          <Edit className="w-3 h-3" />
          有草稿
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="w-3 h-3" />
        待完成
      </Badge>
    );
  };

  // 进入答题
  const enterExam = (questionSetId: number) => {
    navigate(`/student/exam/${questionSetId}`);
  };

  useEffect(() => {
    loadQuestionSets();
  }, [courseId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // 统计
  const completed = questionSets.filter((qs) => qs.is_completed).length;
  const total = questionSets.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/student">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">试题列表</h1>
          <p className="text-muted-foreground">完成分配给您的试题</p>
        </div>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">完成进度</span>
            <span className="text-sm font-medium">
              {completed} / {total}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Question Set List */}
      {questionSets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">暂无可用的试题集</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {questionSets.map((qs) => (
            <Card
              key={qs.id}
              className={`hover:shadow-md transition-all ${
                qs.is_completed ? 'opacity-75' : ''
              }`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{qs.title}</CardTitle>
                    <CardDescription>{qs.course_name}</CardDescription>
                  </div>
                  {getStatusBadge(qs)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {qs.deadline && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        截止：{formatDeadline(qs.deadline)}
                      </span>
                    )}
                    {qs.is_completed && qs.completed_at && (
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-success" />
                        完成于：{new Date(qs.completed_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={() => enterExam(qs.id)}
                    disabled={!qs.is_completed && (qs.deadline ? isOverdue(qs.deadline) : false)}
                  >
                    {qs.is_completed ? '查看结果' : qs.has_draft ? '继续答题' : '开始答题'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

