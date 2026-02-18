import { useEffect, useState } from 'react';
import { Loader2, BarChart3, Users, Trophy, TrendingDown, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { plazaApi, type PlazaSharedStatsResponse } from '@/services/plaza';

export function PlazaMyShared() {
  const [data, setData] = useState<PlazaSharedStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unsharing, setUnsharing] = useState<number | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const res = await plazaApi.mySharedStats();
      setData(res.data);
    } catch {
      toast.error('加载统计数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUnshare = async (questionSetId: number) => {
    if (!confirm('确定要从广场撤回该试题集吗？撤回后其他用户将无法继续做题。')) {
      return;
    }
    try {
      setUnsharing(questionSetId);
      await plazaApi.unsharePlaza(questionSetId);
      toast.success('已从广场撤回');
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setUnsharing(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">我分享的广场题</h1>
        <p className="text-muted-foreground">查看你分享到广场的试题集数据</p>
      </div>

      {/* 统计摘要 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data?.total_shared ?? 0}</p>
              <p className="text-sm text-muted-foreground">已分享试题集</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data?.total_attempts ?? 0}</p>
              <p className="text-sm text-muted-foreground">总参与人次</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 试题列表 */}
      {!data || data.items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">暂未分享试题集到广场</p>
            <p className="text-sm text-muted-foreground mt-1">在「生成试题」页面发布试题后，即可分享到广场</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.items.map((item) => (
            <Card key={item.question_set_id} className="hover:shadow-md transition-all">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-base">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      上架: {new Date(item.shared_to_plaza_at).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleUnshare(item.question_set_id)}
                    disabled={unsharing === item.question_set_id}
                  >
                    {unsharing === item.question_set_id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      '从广场撤回'
                    )}
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span>参与: <strong>{item.attempt_count}</strong> 人</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-muted-foreground" />
                    <span>完成: <strong>{item.completion_count}</strong> 人</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    <span>均分: <strong>{item.average_score ?? '-'}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-muted-foreground" />
                    <span>
                      最高 <strong>{item.highest_score ?? '-'}</strong> / 最低 <strong>{item.lowest_score ?? '-'}</strong>
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
