import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  AlertCircle,
  Loader2,
  Edit,
  BookOpen,
  CalendarClock,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { studentQuestionApi, type StudentQuestionSet } from '@/services/question';

export function PendingTestsPage() {
  const [questionSets, setQuestionSets] = useState<StudentQuestionSet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // 加载所有试题集
  const loadQuestionSets = async () => {
    try {
      setIsLoading(true);
      const response = await studentQuestionApi.list();
      // 筛选未完成的试题（不包括已完成的）
      const pendingTests = (response.data || []).filter(qs => !qs.is_completed);
      setQuestionSets(pendingTests);
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
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMs < 0) {
      return '已过期';
    } else if (diffDays > 0) {
      return `剩余 ${diffDays} 天`;
    } else if (diffHours > 0) {
      return `剩余 ${diffHours} 小时`;
    } else {
      return '即将截止';
    }
  };

  // 获取截止时间显示
  const getDeadlineDisplay = (deadline: string | null) => {
    if (!deadline) return null;
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
          进行中
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="w-3 h-3" />
        未开始
      </Badge>
    );
  };

  // 获取紧急程度样式
  const getUrgencyStyle = (deadline: string | null) => {
    if (!deadline) return '';
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffHours = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (diffHours < 0) return 'border-destructive/50 bg-destructive/5';
    if (diffHours < 24) return 'border-orange-500/50 bg-orange-50 dark:bg-orange-950/20';
    if (diffHours < 72) return 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20';
    return '';
  };

  // 进入答题
  const enterExam = (questionSetId: number) => {
    navigate(`/student/exam/${questionSetId}`);
  };

  useEffect(() => {
    loadQuestionSets();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // 分组统计
  const withDraft = questionSets.filter(qs => qs.has_draft).length;
  const notStarted = questionSets.filter(qs => !qs.has_draft && !isOverdue(qs.deadline)).length;
  const overdue = questionSets.filter(qs => qs.deadline && isOverdue(qs.deadline)).length;

  // 排序：有草稿的优先，然后按截止时间排序
  const sortedQuestionSets = [...questionSets].sort((a, b) => {
    // 有草稿的优先
    if (a.has_draft && !b.has_draft) return -1;
    if (!a.has_draft && b.has_draft) return 1;
    
    // 然后按截止时间排序（早的优先，无截止时间的放最后）
    if (a.deadline && b.deadline) {
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    }
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">待做试题</h1>
        <p className="text-muted-foreground">查看所有课程的未完成试题</p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Edit className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{withDraft}</p>
                <p className="text-sm text-muted-foreground">进行中</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{notStarted}</p>
                <p className="text-sm text-muted-foreground">未开始</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overdue}</p>
                <p className="text-sm text-muted-foreground">已过期</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Question Set List */}
      {questionSets.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold mb-2">太棒了！</h3>
            <p className="text-muted-foreground">您已完成所有试题，暂无待做试题</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedQuestionSets.map((qs) => (
            <Card
              key={qs.id}
              className={`hover:shadow-md transition-all ${getUrgencyStyle(qs.deadline)}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{qs.title}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      {qs.course_name}
                    </CardDescription>
                  </div>
                  {getStatusBadge(qs)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {qs.deadline && (
                      <div className="flex items-center gap-2">
                        <CalendarClock className="w-4 h-4" />
                        <span>截止：{getDeadlineDisplay(qs.deadline)}</span>
                        <Badge 
                          variant={isOverdue(qs.deadline) ? 'destructive' : 'outline'}
                          className="ml-2"
                        >
                          {formatDeadline(qs.deadline)}
                        </Badge>
                      </div>
                    )}
                    {!qs.deadline && (
                      <span className="text-muted-foreground">无截止时间</span>
                    )}
                  </div>
                  <Button
                    onClick={() => enterExam(qs.id)}
                    disabled={qs.deadline ? isOverdue(qs.deadline) : false}
                    className="min-w-[100px]"
                  >
                    {qs.has_draft ? '继续答题' : '开始答题'}
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

