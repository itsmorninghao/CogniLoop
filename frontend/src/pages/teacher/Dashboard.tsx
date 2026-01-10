import { useEffect, useState } from 'react';
import {
  Users,
  FileText,
  ClipboardList,
  Plus,
  Copy,
  Trash2,
  Loader2,
  BookOpen,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { courseApi, type Course, type CourseDetail } from '@/services/course';
import {
  statisticsApi,
  type CourseOverview,
  type SubmissionTrend,
  type QuestionSetCompletionList,
  type ScoreTrend,
} from '@/services/statistics';

export function TeacherDashboard() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseDetail | null>(null);
  const [courseOverview, setCourseOverview] = useState<CourseOverview | null>(null);
  const [submissionTrend, setSubmissionTrend] = useState<SubmissionTrend | null>(null);
  const [questionSetCompletion, setQuestionSetCompletion] = useState<QuestionSetCompletionList | null>(null);
  const [scoreTrend, setScoreTrend] = useState<ScoreTrend | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');

  // 加载课程列表
  const loadCourses = async () => {
    try {
      setIsLoading(true);
      const response = await courseApi.list();
      setCourses(response.data.courses);
      
      // 自动选择第一个课程
      if (response.data.courses.length > 0 && !selectedCourse) {
        await selectCourse(response.data.courses[0].id);
      }
    } catch (error) {
      toast.error('加载课程失败');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // 选择课程
  const selectCourse = async (courseId: number) => {
    try {
      const [detailRes, overviewRes, trendRes, completionRes, scoreRes] = await Promise.all([
        courseApi.getDetail(courseId),
        statisticsApi.courseOverview(courseId),
        statisticsApi.submissionTrend(courseId, 7),
        statisticsApi.questionSetCompletion(courseId),
        statisticsApi.scoreTrend(courseId, 7),
      ]);
      setSelectedCourse(detailRes.data);
      setCourseOverview(overviewRes.data);
      setSubmissionTrend(trendRes.data);
      setQuestionSetCompletion(completionRes.data);
      setScoreTrend(scoreRes.data);
    } catch (error) {
      toast.error('加载课程详情失败');
      console.error(error);
    }
  };

  // 创建课程
  const handleCreateCourse = async () => {
    if (!newCourseName.trim() || !newCourseCode.trim()) {
      toast.error('请填写课程名称和代码');
      return;
    }

    try {
      setIsCreating(true);
      const response = await courseApi.create({
        name: newCourseName.trim(),
        code: newCourseCode.trim(),
      });
      toast.success('课程创建成功');
      setCreateDialogOpen(false);
      setNewCourseName('');
      setNewCourseCode('');
      await loadCourses();
      await selectCourse(response.data.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建失败');
    } finally {
      setIsCreating(false);
    }
  };

  // 删除课程
  const handleDeleteCourse = async (courseId: number) => {
    if (!confirm('确定要删除此课程吗？所有学生将被退出该课程。')) {
      return;
    }

    try {
      await courseApi.delete(courseId);
      toast.success('课程已删除');
      if (selectedCourse?.id === courseId) {
        setSelectedCourse(null);
        setCourseOverview(null);
      }
      await loadCourses();
    } catch (error) {
      toast.error('删除失败');
      console.error(error);
    }
  };

  // 复制邀请码
  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('邀请码已复制');
  };

  useEffect(() => {
    loadCourses();
  }, []);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">仪表盘</h1>
          <p className="text-muted-foreground">管理您的课程和查看统计数据</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4" />
              创建课程
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建新课程</DialogTitle>
              <DialogDescription>
                填写课程信息，创建后会自动生成邀请码
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="course-name">课程名称</Label>
                <Input
                  id="course-name"
                  placeholder="例如：Python 入门"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="course-code">课程代码</Label>
                <Input
                  id="course-code"
                  placeholder="例如：CS101"
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleCreateCourse} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    创建中...
                  </>
                ) : (
                  '创建'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Course List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">我的课程</CardTitle>
              <CardDescription>{courses.length} 个课程</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {courses.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  暂无课程，点击上方按钮创建
                </p>
              ) : (
                courses.map((course) => (
                  <div
                    key={course.id}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedCourse?.id === course.id
                        ? 'bg-primary/10 border border-primary/20'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => selectCourse(course.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{course.name}</p>
                        <p className="text-sm text-muted-foreground">{course.code}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Course Detail */}
        <div className="lg:col-span-2 space-y-6">
          {selectedCourse ? (
            <>
              {/* Course Info */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{selectedCourse.name}</CardTitle>
                      <CardDescription>课程代码：{selectedCourse.code}</CardDescription>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteCourse(selectedCourse.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                      删除
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground">邀请码：</span>
                    <code className="text-lg font-mono font-bold text-primary">
                      {selectedCourse.invite_code}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyInviteCode(selectedCourse.invite_code)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Stats */}
              {courseOverview && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Users className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{courseOverview.student_count}</p>
                          <p className="text-sm text-muted-foreground">学生人数</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{courseOverview.document_count}</p>
                          <p className="text-sm text-muted-foreground">文档数量</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                          <ClipboardList className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{courseOverview.question_set_count}</p>
                          <p className="text-sm text-muted-foreground">试题集数量</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Charts */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* 答题提交趋势 */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-blue-500" />
                      <CardTitle className="text-base">答题提交趋势</CardTitle>
                    </div>
                    <CardDescription>最近 7 天学生提交答案数量</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {submissionTrend && submissionTrend.data.length > 0 ? (
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={submissionTrend.data}>
                            <defs>
                              <linearGradient id="colorSubmit" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 12 }}
                              stroke="#9ca3af"
                            />
                            <YAxis
                              tick={{ fontSize: 12 }}
                              stroke="#9ca3af"
                              allowDecimals={false}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                              }}
                              formatter={(value: number) => [`${value} 份`, '提交数']}
                            />
                            <Area
                              type="monotone"
                              dataKey="count"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              fill="url(#colorSubmit)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                        暂无提交数据
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 平均分趋势 */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-green-500" />
                      <CardTitle className="text-base">平均分趋势</CardTitle>
                    </div>
                    <CardDescription>最近 7 天平均分变化</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {scoreTrend && scoreTrend.data.some(d => d.score !== null) ? (
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={scoreTrend.data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 12 }}
                              stroke="#9ca3af"
                            />
                            <YAxis
                              domain={[0, 100]}
                              tick={{ fontSize: 12 }}
                              stroke="#9ca3af"
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                              }}
                              formatter={(value) => [
                                value != null ? `${value} 分` : '无数据',
                                '平均分',
                              ]}
                            />
                            <Line
                              type="monotone"
                              dataKey="score"
                              stroke="#22c55e"
                              strokeWidth={2}
                              dot={{ fill: '#22c55e', strokeWidth: 2 }}
                              connectNulls
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                        暂无分数数据
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 试题集完成率 */}
                <Card className="xl:col-span-2">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-purple-500" />
                      <CardTitle className="text-base">试题集完成率</CardTitle>
                    </div>
                    <CardDescription>各试题集完成情况对比</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {questionSetCompletion && questionSetCompletion.items.length > 0 ? (
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={questionSetCompletion.items}
                            layout="vertical"
                            margin={{ left: 20, right: 20 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                              type="number"
                              domain={[0, 100]}
                              tick={{ fontSize: 12 }}
                              stroke="#9ca3af"
                              unit="%"
                            />
                            <YAxis
                              type="category"
                              dataKey="title"
                              tick={{ fontSize: 11 }}
                              stroke="#9ca3af"
                              width={100}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                              }}
                              formatter={(value: number, name: string) => {
                                if (name === 'completion_rate') {
                                  return [`${value}%`, '完成率'];
                                }
                                return [value, name];
                              }}
                            />
                            <Bar
                              dataKey="completion_rate"
                              fill="#8b5cf6"
                              radius={[0, 4, 4, 0]}
                              barSize={20}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-[220px] flex items-center justify-center text-muted-foreground">
                        暂无试题集数据
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">请选择或创建一个课程</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

