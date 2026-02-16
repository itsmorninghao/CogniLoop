import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Loader2,
  Users,
  Star,
  Flame,
  Sparkles,
  Trophy,
  ArrowRight,
  GraduationCap,
  LogIn,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { plazaApi, type PlazaQuestionSetItem } from '@/services/plaza';
import { useAuthStore } from '@/stores/auth';

const HOT_THRESHOLD = 10;
const NEW_DAYS = 3;

function isNew(sharedAt: string): boolean {
  const diff = Date.now() - new Date(sharedAt).getTime();
  return diff < NEW_DAYS * 24 * 60 * 60 * 1000;
}

export function PlazaDiscover() {
  const navigate = useNavigate();
  const { isAuthenticated, userType } = useAuthStore();
  const [items, setItems] = useState<PlazaQuestionSetItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<'newest' | 'popular'>('newest');
  const [skip, setSkip] = useState(0);
  const limit = 20;

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await plazaApi.list({
        skip,
        limit,
        keyword: keyword || undefined,
        sort,
      });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch {
      toast.error('加载广场数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [skip, keyword, sort]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = () => {
    setSkip(0);
    loadData();
  };

  const handleTakeExam = (questionSetId: number) => {
    if (!isAuthenticated) {
      toast.info('请先登录后再做题');
      navigate('/login', { state: { from: `/plaza` } });
      return;
    }
    if (userType === 'teacher') {
      navigate(`/teacher/plaza/exam/${questionSetId}`);
    } else {
      navigate(`/student/exam/${questionSetId}?source=plaza`);
    }
  };

  const handleViewDetail = (questionSetId: number) => {
    navigate(`/plaza/${questionSetId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">题目广场</h1>
                <p className="text-sm text-muted-foreground">发现优质试题，挑战自我</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isAuthenticated && (
                <Button size="sm" onClick={() => navigate('/login')} className="gap-2">
                  <LogIn className="w-4 h-4" />
                  登录
                </Button>
              )}
            </div>
          </div>

          {/* Search & Sort */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索题目..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <div className="flex gap-1">
              <Button
                variant={sort === 'newest' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => { setSort('newest'); setSkip(0); }}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                最新
              </Button>
              <Button
                variant={sort === 'popular' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => { setSort('popular'); setSkip(0); }}
              >
                <Flame className="w-4 h-4 mr-1" />
                最热
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <GraduationCap className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-lg text-muted-foreground">暂无广场试题</p>
            <p className="text-sm text-muted-foreground mt-1">等待教师分享优质试题到广场</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {items.map((item) => (
                <Card
                  key={item.id}
                  className="hover:shadow-lg transition-all duration-300 hover:border-primary/30 cursor-pointer group flex flex-col"
                  onClick={() => handleViewDetail(item.id)}
                >
                  <CardContent className="p-5 flex flex-col h-full">
                    {/* Title & Tags */}
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-base line-clamp-2 group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <div className="flex gap-1 ml-2 flex-shrink-0">
                        {item.attempt_count >= HOT_THRESHOLD && (
                          <Badge variant="destructive" className="text-xs px-1.5 py-0">
                            <Flame className="w-3 h-3 mr-0.5" />
                            热门
                          </Badge>
                        )}
                        {isNew(item.shared_to_plaza_at) && (
                          <Badge className="bg-emerald-500 text-xs px-1.5 py-0">
                            <Sparkles className="w-3 h-3 mr-0.5" />
                            新题
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    {item.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {item.description}
                      </p>
                    )}

                    {/* Teacher & Course */}
                    <p className="text-sm text-muted-foreground mb-3">
                      {item.teacher_name} · {item.course_name}
                    </p>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {item.attempt_count} 人参与
                      </span>
                      {item.average_score !== null && (
                        <span className="flex items-center gap-1">
                          <Star className="w-4 h-4" />
                          均分 {item.average_score}
                        </span>
                      )}
                    </div>

                    {/* My Status */}
                    {item.my_status === 'completed' && (
                      <div className="bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2 mb-3 text-sm text-green-700 dark:text-green-300">
                        <Trophy className="w-4 h-4 inline mr-1" />
                        我的得分: {item.my_score} 分
                      </div>
                    )}
                    {item.my_status === 'draft' && (
                      <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 mb-3 text-sm text-amber-700 dark:text-amber-300">
                        有未完成的草稿
                      </div>
                    )}

                    {/* Spacer to push actions to bottom */}
                    <div className="flex-1" />

                    {/* Actions */}
                    <div className="flex gap-2 mt-auto">
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTakeExam(item.id);
                        }}
                      >
                        {item.my_status === 'completed' ? '查看详情' : item.my_status === 'draft' ? '继续答题' : '去做题'}
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {total > limit && (
              <div className="flex justify-center mt-8 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={skip === 0}
                  onClick={() => setSkip(Math.max(0, skip - limit))}
                >
                  上一页
                </Button>
                <span className="flex items-center text-sm text-muted-foreground px-3">
                  第 {Math.floor(skip / limit) + 1} / {Math.ceil(total / limit)} 页
                </span>
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
          </>
        )}
      </div>
    </div>
  );
}
