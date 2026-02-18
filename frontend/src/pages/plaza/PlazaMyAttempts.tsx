import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, FileText, Trophy, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { plazaApi, type PlazaAttemptItem } from '@/services/plaza';
import { useAuthStore } from '@/stores/auth';

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: '草稿', variant: 'secondary' },
  submitted: { label: '批改中', variant: 'outline' },
  completed: { label: '已完成', variant: 'default' },
  failed: { label: '批改失败', variant: 'destructive' },
};

export function PlazaMyAttempts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userType } = useAuthStore();

  const handleGoExam = (item: PlazaAttemptItem) => {
    if (userType === 'teacher') {
      navigate(`/teacher/plaza/exam/${item.question_set_id}`);
    } else {
      navigate(`/student/exam/${item.question_set_id}?source=plaza`);
    }
  };

  const getActionLabel = (status: string) => {
    switch (status) {
      case 'draft': return '继续答题';
      case 'submitted': return '查看状态';
      case 'completed': return '查看结果';
      case 'failed': return '查看详情';
      default: return '查看';
    }
  };
  const [items, setItems] = useState<PlazaAttemptItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [skip, setSkip] = useState(0);
  const limit = 20;

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await plazaApi.myAttempts({ skip, limit });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch {
      toast.error('加载数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [skip]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">我的广场练习</h1>
        <p className="text-muted-foreground">查看在广场上的作答记录</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">暂无广场练习记录</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate(location.pathname.replace('/my-attempts', ''))}
            >
              去广场看看
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const st = statusMap[item.status] || { label: item.status, variant: 'outline' as const };
            return (
              <Card
                key={item.answer_id}
                className="hover:shadow-md transition-all cursor-pointer"
                onClick={() => handleGoExam(item)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{item.question_set_title}</p>
                      <p className="text-sm text-muted-foreground">
                        出题人: {item.teacher_name}
                        {item.submitted_at && (
                          <> · {new Date(item.submitted_at).toLocaleDateString('zh-CN')}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.total_score !== null && (
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <Trophy className="w-4 h-4 text-amber-500" />
                        {item.total_score} 分
                      </div>
                    )}
                    <Badge variant={st.variant}>{st.label}</Badge>
                    <Button variant="ghost" size="sm" className="gap-1">
                      {getActionLabel(item.status)}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {total > limit && (
            <div className="flex justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={skip === 0}
                onClick={() => setSkip(Math.max(0, skip - limit))}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={skip + limit >= total}
                onClick={() => setSkip(skip + limit)}
              >
                下一页
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
