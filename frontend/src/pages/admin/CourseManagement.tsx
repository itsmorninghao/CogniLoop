import { useEffect, useState } from 'react';
import {
  BookOpen,
  Loader2,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { adminApi, type AdminCourse } from '@/services/admin';
import { useAuthStore } from '@/stores/auth';

export function CourseManagementPage() {
  const { user } = useAuthStore();
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<AdminCourse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const limit = 20;

  const loadCourses = async () => {
    try {
      setIsLoading(true);
      const response = await adminApi.listCourses(skip, limit, true);
      setCourses(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      toast.error('加载课程列表失败');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (course: AdminCourse) => {
    try {
      await adminApi.toggleCourseStatus(course.id);
      toast.success(`已${course.is_active ? '禁用' : '启用'}课程`);
      await loadCourses();
    } catch (error) {
      toast.error('操作失败');
      console.error(error);
    }
  };

  const handleDelete = async () => {
    if (!courseToDelete) return;
    try {
      setIsDeleting(true);
      await adminApi.deleteCourse(courseToDelete.id);
      toast.success('课程已删除');
      setDeleteDialogOpen(false);
      setCourseToDelete(null);
      await loadCourses();
    } catch (error) {
      toast.error('删除失败');
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCourses = courses.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.teacher_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  useEffect(() => {
    loadCourses();
  }, [skip]);

  const isSuperAdmin = user?.is_super_admin;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">课程管理</h1>
        <p className="text-muted-foreground">管理系统中的所有课程</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                课程列表
              </CardTitle>
              <CardDescription>共 {total} 门课程</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索课程..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {courses.length === 0 ? '暂无课程' : '没有匹配的课程'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCourses.map((course) => (
                <div
                  key={course.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="font-medium">{course.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {course.code} · 教师：{course.teacher_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      {course.student_count}
                    </div>
                    <Badge variant="outline">{course.invite_code}</Badge>
                    <Badge variant={course.is_active ? 'success' : 'destructive'}>
                      {course.is_active ? '正常' : '已禁用'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(course.created_at).toLocaleDateString('zh-CN')}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleStatus(course)}
                      title={course.is_active ? '禁用' : '启用'}
                    >
                      {course.is_active ? (
                        <ToggleRight className="w-5 h-5 text-green-500" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                      )}
                    </Button>
                    {isSuperAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setCourseToDelete(course);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="w-5 h-5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                第 {currentPage} / {totalPages} 页
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={skip === 0}
                  onClick={() => setSkip(Math.max(0, skip - limit))}
                >
                  <ChevronLeft className="w-4 h-4" />
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={skip + limit >= total}
                  onClick={() => setSkip(skip + limit)}
                >
                  下一页
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除课程「{courseToDelete?.name}」吗？该操作将同时删除该课程的所有学生关联，且不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  删除中...
                </>
              ) : (
                '确认删除'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

