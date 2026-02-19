import { useEffect, useState, useCallback, useMemo } from 'react';
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
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  Circle,
  ListChecks,
  PenLine,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/sonner';
import { plazaApi, type PlazaQuestionSetItem, type PlazaQuestionSetDetail } from '@/services/plaza';
import { useAuthStore } from '@/stores/auth';

const questionTypeMap: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  single_choice: { label: '单选题', color: 'bg-blue-500', icon: Circle },
  multiple_choice: { label: '多选题', color: 'bg-purple-500', icon: ListChecks },
  fill_blank: { label: '填空题', color: 'bg-green-500', icon: PenLine },
  short_answer: { label: '简答题', color: 'bg-orange-500', icon: MessageSquare },
};

function parseMarkdownQuestions(markdown: string) {
  const questions: Array<{
    number: number;
    type: string;
    content: string;
    options: string[];
    answer: string;
    explanation: string;
    scoringPoints?: string;
  }> = [];

  const questionBlocks = markdown.split(/## 题目 \d+/).slice(1);
  questionBlocks.forEach((block, index) => {
    const typeMatch = block.match(/\[(\w+)\]/);
    const type = typeMatch ? typeMatch[1] : 'unknown';
    const contentMatch = block.match(/\*\*题目内容\*\*[：:]\s*([^\n]+)/);
    const content = contentMatch ? contentMatch[1].trim() : '';
    const options: string[] = [];
    const optionMatches = block.matchAll(/\*\*选项 ([A-E])\*\*[：:]\s*([^\n]+)/g);
    for (const match of optionMatches) {
      options.push(`${match[1]}. ${match[2].trim()}`);
    }
    const answerMatch = block.match(/\*\*(?:正确答案|参考答案)\*\*[：:]\s*([\s\S]*?)(?=\n\*\*|$)/);
    const answer = answerMatch ? answerMatch[1].trim() : '';
    const explanationMatch = block.match(/\*\*解析\*\*[：:]\s*([\s\S]*?)(?=\n\*\*评分要点|$)/);
    const explanation = explanationMatch ? explanationMatch[1].trim() : '';
    const scoringMatch = block.match(/\*\*评分要点\*\*[：:]\s*([\s\S]*?)$/);
    const scoringPoints = scoringMatch ? scoringMatch[1].trim() : undefined;

    questions.push({ number: index + 1, type, content, options, answer, explanation, scoringPoints });
  });
  return questions;
}

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

  // 预览弹窗
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<PlazaQuestionSetItem | null>(null);
  const [previewDetail, setPreviewDetail] = useState<PlazaQuestionSetDetail | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewContentLoading, setPreviewContentLoading] = useState(false);
  const [previewDetailLoading, setPreviewDetailLoading] = useState(false);
  const [previewTab, setPreviewTab] = useState<'questions' | 'leaderboard'>('questions');
  const [currentQIdx, setCurrentQIdx] = useState(0);

  const parsedQuestions = useMemo(() => parseMarkdownQuestions(previewContent), [previewContent]);

  const openPreview = async (item: PlazaQuestionSetItem) => {
    setPreviewItem(item);
    setPreviewOpen(true);
    setPreviewTab('questions');
    setCurrentQIdx(0);
    setPreviewContent('');
    setPreviewDetail(null);

    setPreviewDetailLoading(true);
    plazaApi.detail(item.id)
      .then(res => setPreviewDetail(res.data))
      .catch(() => {})
      .finally(() => setPreviewDetailLoading(false));

    setPreviewContentLoading(true);
    plazaApi.getContent(item.id)
      .then(res => setPreviewContent(res.data.markdown_content))
      .catch(() => setPreviewContent(''))
      .finally(() => setPreviewContentLoading(false));
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
                  onClick={() => openPreview(item)}
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
                        <button
                          className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200 transition-colors"
                          onClick={(e) => { e.stopPropagation(); openPreview(item); }}
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          排行榜
                        </button>
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

                    {/* 所有用户都能查看排行榜 */}
                    {item.my_status !== 'completed' && (
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mb-3 transition-colors"
                        onClick={(e) => { e.stopPropagation(); openPreview(item); }}
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
                          onClick={(e) => { e.stopPropagation(); handleTakeExam(item); }}
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

      {/* 题目预览弹窗 */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          className="flex flex-col w-[98vw] max-w-[1800px] h-[92vh] max-h-[92vh] p-0 gap-0 overflow-hidden"
          hideCloseButton
        >
          {/* 顶部栏 */}
          <div className="flex-shrink-0 h-[72px] flex items-center justify-between px-6 border-b bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{previewItem?.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {previewItem?.teacher_name} · {previewItem?.course_name}
                  {previewDetail && ` · ${previewDetail.attempt_count} 人参与`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Tab 切换 */}
              <div className="flex bg-muted rounded-lg p-1 mr-2">
                <button
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    previewTab === 'questions' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setPreviewTab('questions')}
                >
                  <FileText className="w-4 h-4 inline mr-1.5" />
                  题目预览
                </button>
                <button
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    previewTab === 'leaderboard' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setPreviewTab('leaderboard')}
                >
                  <Trophy className="w-4 h-4 inline mr-1.5" />
                  排行榜
                </button>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPreviewOpen(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* 题目预览 Tab */}
          {previewTab === 'questions' && (
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {previewContentLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : parsedQuestions.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <FileText className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground">暂无题目内容</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* 左侧题目导航 */}
                  <div className="w-72 flex-shrink-0 border-r bg-muted/20 flex flex-col">
                    <div className="flex-shrink-0 h-12 flex items-center px-4 border-b">
                      <h3 className="font-medium text-sm text-muted-foreground">
                        题目列表 ({parsedQuestions.length})
                      </h3>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-2 space-y-1">
                        {parsedQuestions.map((q, index) => {
                          const typeInfo = questionTypeMap[q.type] || { label: '未知', color: 'bg-gray-500', icon: Circle };
                          const TypeIcon = typeInfo.icon;
                          return (
                            <button
                              key={index}
                              onClick={() => setCurrentQIdx(index)}
                              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all ${
                                currentQIdx === index
                                  ? 'bg-primary text-primary-foreground shadow-sm'
                                  : 'hover:bg-muted'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-medium ${
                                currentQIdx === index ? 'bg-white/20' : typeInfo.color
                              }`}>
                                {q.number}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${currentQIdx === index ? '' : 'text-foreground'}`}>
                                  第 {q.number} 题
                                </p>
                                <p className={`text-xs truncate ${currentQIdx === index ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                  {typeInfo.label}
                                </p>
                              </div>
                              <TypeIcon className={`w-4 h-4 flex-shrink-0 ${currentQIdx === index ? 'text-primary-foreground/70' : 'text-muted-foreground'}`} />
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* 右侧题目详情 */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {parsedQuestions[currentQIdx] && (
                      <>
                        <ScrollArea className="flex-1">
                          <div className="p-8 max-w-5xl mx-auto">
                            <div className="flex items-center gap-3 mb-6">
                              <Badge className={`${questionTypeMap[parsedQuestions[currentQIdx].type]?.color || 'bg-gray-500'} text-white px-3 py-1`}>
                                {questionTypeMap[parsedQuestions[currentQIdx].type]?.label || '未知题型'}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                第 {parsedQuestions[currentQIdx].number} / {parsedQuestions.length} 题
                              </span>
                            </div>

                            <div className="mb-8">
                              <h3 className="text-lg font-semibold mb-4 leading-relaxed">
                                {parsedQuestions[currentQIdx].content}
                              </h3>
                            </div>

                            {parsedQuestions[currentQIdx].options.length > 0 && (
                              <div className="space-y-3 mb-8">
                                {parsedQuestions[currentQIdx].options.map((option, idx) => {
                                  const optionLetter = option.charAt(0);
                                  return (
                                    <div
                                      key={idx}
                                      className="flex items-start gap-4 p-4 rounded-xl border-2 border-border hover:border-primary/30 hover:bg-muted/50 transition-all"
                                    >
                                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 bg-muted text-muted-foreground">
                                        {optionLetter}
                                      </div>
                                      <div className="flex-1 pt-2">
                                        <p>{option.slice(3)}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </ScrollArea>

                        {/* 底部导航 */}
                        <div className="flex-shrink-0 h-[64px] flex items-center justify-between px-8 border-t bg-muted/20">
                          <Button
                            variant="outline"
                            onClick={() => setCurrentQIdx(Math.max(0, currentQIdx - 1))}
                            disabled={currentQIdx === 0}
                            className="gap-2"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            上一题
                          </Button>
                          <div className="flex items-center gap-2">
                            {parsedQuestions.map((_, idx) => (
                              <button
                                key={idx}
                                onClick={() => setCurrentQIdx(idx)}
                                className={`w-8 h-8 rounded-full text-sm font-medium transition-all ${
                                  currentQIdx === idx
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
                            onClick={() => setCurrentQIdx(Math.min(parsedQuestions.length - 1, currentQIdx + 1))}
                            disabled={currentQIdx === parsedQuestions.length - 1}
                            className="gap-2"
                          >
                            下一题
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 排行榜 Tab */}
          {previewTab === 'leaderboard' && (
            <div className="flex-1 overflow-hidden">
              {previewDetailLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : !previewDetail || previewDetail.leaderboard.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Trophy className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-lg text-muted-foreground">暂无排行数据</p>
                    <p className="text-sm text-muted-foreground mt-1">还没有人完成这套题</p>
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-full">
                  <div className="max-w-2xl mx-auto p-8">
                    {/* 统计概览 */}
                    <div className="grid grid-cols-3 gap-4 mb-8">
                      <div className="bg-muted/50 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">{previewDetail.attempt_count}</p>
                        <p className="text-xs text-muted-foreground mt-1">参与人数</p>
                      </div>
                      <div className="bg-muted/50 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">{previewDetail.completion_count}</p>
                        <p className="text-xs text-muted-foreground mt-1">完成人数</p>
                      </div>
                      <div className="bg-muted/50 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">
                          {previewDetail.average_score !== null ? previewDetail.average_score : '-'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">平均分</p>
                      </div>
                    </div>

                    {/* 我的排名 */}
                    {previewDetail.my_rank && (
                      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Trophy className="w-5 h-5 text-primary" />
                          </div>
                          <span className="font-medium">我的排名</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {previewDetail.my_score !== null && (
                            <span className="text-sm font-medium">{previewDetail.my_score} 分</span>
                          )}
                          <Badge variant="default" className="text-sm px-3">第 {previewDetail.my_rank} 名</Badge>
                        </div>
                      </div>
                    )}

                    {/* 排行榜列表 */}
                    <div className="space-y-2">
                      {previewDetail.leaderboard.map((entry) => (
                        <div
                          key={`${entry.rank}-${entry.user_name}`}
                          className={`flex items-center justify-between p-4 rounded-xl transition-colors ${
                            entry.rank <= 3 ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-muted/30 hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <span className="w-8 text-center font-bold">
                              {entry.rank <= 3 ? (
                                <Medal className={`w-6 h-6 inline ${
                                  entry.rank === 1 ? 'text-amber-500' : entry.rank === 2 ? 'text-gray-400' : 'text-amber-700'
                                }`} />
                              ) : (
                                <span className="text-muted-foreground">{entry.rank}</span>
                              )}
                            </span>
                            <div>
                              <span className="font-medium">{entry.user_name}</span>
                              <Badge variant="outline" className="text-xs ml-2">
                                {entry.user_type === 'teacher' ? '教师' : '学生'}
                              </Badge>
                            </div>
                          </div>
                          <span className="font-bold text-lg">{entry.score} <span className="text-sm font-normal text-muted-foreground">分</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          {/* 底部操作栏 */}
          {previewItem && !previewItem.is_own && (
            <div className="flex-shrink-0 h-[64px] flex items-center justify-end px-6 border-t bg-muted/20">
              <Button
                onClick={() => { setPreviewOpen(false); handleTakeExam(previewItem); }}
                className="gap-2 px-6"
              >
                {previewItem.my_status === 'completed' ? '查看结果' : previewItem.my_status === 'draft' ? '继续答题' : '去做题'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
