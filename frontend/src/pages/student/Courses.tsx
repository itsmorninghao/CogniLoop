import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Plus,
  LogOut,
  Loader2,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { studentCourseApi, type Course } from '@/services/course';

export function StudentCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const navigate = useNavigate();

  // 加载课程列表
  const loadCourses = async () => {
    try {
      setIsLoading(true);
      const response = await studentCourseApi.myCourses();
      setCourses(response.data.courses);
    } catch (error) {
      toast.error('加载课程失败');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // 加入课程
  const handleJoin = async () => {
    if (!inviteCode.trim()) {
      toast.error('请输入邀请码');
      return;
    }

    try {
      setIsJoining(true);
      await studentCourseApi.join({ invite_code: inviteCode.trim().toUpperCase() });
      toast.success('加入课程成功');
      setJoinDialogOpen(false);
      setInviteCode('');
      await loadCourses();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加入失败');
    } finally {
      setIsJoining(false);
    }
  };

  // 退出课程
  const handleLeave = async (courseId: number, courseName: string) => {
    if (!confirm(`确定要退出课程「${courseName}」吗？`)) {
      return;
    }

    try {
      await studentCourseApi.leave(courseId);
      toast.success('已退出课程');
      await loadCourses();
    } catch (error) {
      toast.error('退出失败');
      console.error(error);
    }
  };

  // 进入课程（查看试题）
  const enterCourse = (courseId: number) => {
    navigate(`/student/course/${courseId}/tests`);
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
          <h1 className="text-2xl font-semibold">我的课程</h1>
          <p className="text-muted-foreground">查看已加入的课程并完成试题</p>
        </div>
        <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4" />
              加入课程
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>加入课程</DialogTitle>
              <DialogDescription>输入教师提供的 6 位邀请码</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-code">邀请码</Label>
                <Input
                  id="invite-code"
                  placeholder="例如：A1B2C3"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="text-center text-xl font-mono tracking-widest"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setJoinDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleJoin} disabled={isJoining}>
                {isJoining ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    加入中...
                  </>
                ) : (
                  '加入'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Course List */}
      {courses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">您还没有加入任何课程</p>
            <Button onClick={() => setJoinDialogOpen(true)}>
              <Plus className="w-4 h-4" />
              加入课程
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <Card
              key={course.id}
              className="group hover:shadow-lg transition-all cursor-pointer"
              onClick={() => enterCourse(course.id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <BookOpen className="w-6 h-6 text-primary" />
                  </div>
                  <Badge variant={course.is_active ? 'success' : 'secondary'}>
                    {course.is_active ? '进行中' : '已结束'}
                  </Badge>
                </div>
                <CardTitle className="mt-4">{course.name}</CardTitle>
                <CardDescription>课程代码：{course.code}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLeave(course.id, course.name);
                    }}
                  >
                    <LogOut className="w-4 h-4" />
                    退出
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    点击查看试题 →
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

