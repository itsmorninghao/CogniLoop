import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  Clock,
  AlertTriangle,
  Medal,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { plazaApi, type PlazaQuestionSetItem, type LeaderboardEntry } from '@/services/plaza';
import { useAuthStore } from '@/stores/auth';

const HOT_THRESHOLD = 10;
const NEW_DAYS = 3;

function isNew(sharedAt: string): boolean {
  const diff = Date.now() - new Date(sharedAt).getTime();
  return diff < NEW_DAYS * 24 * 60 * 60 * 1000;
}

export function PlazaDiscover() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, userType } = useAuthStore();
  // 判断是否在 Layout 内（有路由前缀 /teacher 或 /student）
  const inLayout = location.pathname.startsWith('/teacher') || location.pathname.startsWith('/student');
  const [items, setItems] = useState<PlazaQuestionSetItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<'newest' | 'popular'>('newest');

  // 排行榜弹窗
  const [lbOpen, setLbOpen] = useState(false);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbData, setLbData] = useState<LeaderboardEntry[]>([]);
  const [lbMyRank, setLbMyRank] = useState<number | null>(null);
  const [lbMyScore, setLbMyScore] = useState<number | null>(null);
  const [lbTitle, setLbTitle] = useState('');

  const openLeaderboard = async (item: PlazaQuestionSetItem) => {
    setLbTitle(item.title);
    setLbOpen(true);
    setLbLoading(true);
    try {
      const res = await plazaApi.leaderboard(item.id);
      setLbData(res.data.leaderboard);
      setLbMyRank(res.data.my_rank);
      setLbMyScore(res.data.my_score);
    } catch {
      toast.error('加载排行榜失败');
    } finally {
      setLbLoading(false);
    }
  };
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

  const handleTakeExam = (item: PlazaQuestionSetItem) => {
    if (!isAuthenticated) {
      toast.info('请先登录后再做题');
      navigate('/login', { state: { from: `/plaza` } });
      return;
    }
    if (item.is_own) {
      toast.error('不能做自己出的题哦');
      return;
    }
    if (userType === 'teacher') {
      navigate(`/teacher/plaza/exam/${item.id}`);
    } else {
      navigate(`/student/exam/${item.id}?source=plaza`);
    }
  };

  return (
    <div className={inLayout ? 'space-y-6' : 'min-h-screen bg-slate-50/80 pt-16'}>
      {/* Header */}
      {inLayout && (
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
            </div>
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
      )}

      {/* Standalone toolbar — sticks right below PublicNav */}
      {!inLayout && (
        <div className="sticky top-16 z-10 bg-white/80 backdrop-blur-xl">
          <div className="container mx-auto px-6 h-14 flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索题目..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-9 h-9 bg-slate-100/80 border-0 focus-visible:ring-1 focus-visible:ring-primary/30"
              />
            </div>
            <div className="flex gap-0.5">
              <Button
                variant={sort === 'newest' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setSort('newest'); setSkip(0); }}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                最新
              </Button>
              <Button
                variant={sort === 'popular' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setSort('popular'); setSkip(0); }}
              >
                <Flame className="w-3.5 h-3.5 mr-1" />
                最热
              </Button>
            </div>
          </div>
        </div>
      )}

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
                  onClick={() => handleTakeExam(item)}
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
                      <div className="bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2 mb-3 text-sm text-green-700 dark:text-green-300 flex items-center justify-between">
                        <span>
                          <Trophy className="w-4 h-4 inline mr-1" />
                          我的得分: {item.my_score} 分
                        </span>
                        {isAuthenticated && (
                          <button
                            className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200 transition-colors"
                            onClick={(e) => { e.stopPropagation(); openLeaderboard(item); }}
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            排行榜
                          </button>
                        )}
                      </div>
                    )}
                    {item.my_status === 'submitted' && (
                      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2 mb-3 text-sm text-blue-700 dark:text-blue-300">
                        <Clock className="w-4 h-4 inline mr-1" />
                        已提交，批改中...
                      </div>
                    )}
                    {item.my_status === 'failed' && (
                      <div className="bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2 mb-3 text-sm text-red-700 dark:text-red-300">
                        <AlertTriangle className="w-4 h-4 inline mr-1" />
                        批改失败
                      </div>
                    )}
                    {item.my_status === 'draft' && (
                      <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 mb-3 text-sm text-amber-700 dark:text-amber-300">
                        有未完成的草稿
                      </div>
                    )}

                    {/* 登录用户且没有完成状态的也能看排行榜 */}
                    {isAuthenticated && item.my_status !== 'completed' && (
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mb-3 transition-colors"
                        onClick={(e) => { e.stopPropagation(); openLeaderboard(item); }}
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        查看排行榜
                      </button>
                    )}

                    {/* Spacer to push actions to bottom */}
                    <div className="flex-1" />

                    {/* Actions */}
                    <div className="flex gap-2 mt-auto">
                      {item.is_own ? (
                        <Badge variant="secondary" className="flex-1 justify-center py-1.5">
                          我出的题
                        </Badge>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1 gap-1"
                        >
                          {item.my_status === 'completed' ? '查看结果' : item.my_status === 'submitted' ? '查看状态' : item.my_status === 'draft' ? '继续答题' : '去做题'}
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      )}
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

      {/* 排行榜弹窗 */}
      <Dialog open={lbOpen} onOpenChange={setLbOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              排行榜
            </DialogTitle>
            <DialogDescription>{lbTitle}</DialogDescription>
          </DialogHeader>

          {lbLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : lbData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无排行数据
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {/* 我的排名 */}
              {(lbMyRank || lbMyScore !== null) && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium">我的排名</span>
                  <div className="flex items-center gap-3">
                    {lbMyScore !== null && (
                      <span className="text-sm">{lbMyScore} 分</span>
                    )}
                    {lbMyRank && (
                      <Badge variant="default">第 {lbMyRank} 名</Badge>
                    )}
                  </div>
                </div>
              )}

              {lbData.map((entry) => (
                <div
                  key={`${entry.rank}-${entry.user_name}`}
                  className={`flex items-center justify-between p-2.5 rounded-lg ${
                    entry.rank <= 3 ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 text-center font-bold text-sm">
                      {entry.rank <= 3 ? (
                        <Medal className={`w-5 h-5 inline ${
                          entry.rank === 1 ? 'text-amber-500' : entry.rank === 2 ? 'text-gray-400' : 'text-amber-700'
                        }`} />
                      ) : (
                        entry.rank
                      )}
                    </span>
                    <span className="font-medium text-sm">{entry.user_name}</span>
                    <Badge variant="outline" className="text-xs">
                      {entry.user_type === 'teacher' ? '教师' : '学生'}
                    </Badge>
                  </div>
                  <span className="font-bold text-sm">{entry.score} 分</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
