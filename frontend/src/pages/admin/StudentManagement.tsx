import { useEffect, useState } from 'react';
import {
  Users,
  Loader2,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
  ChevronLeft,
  ChevronRight,
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
import { adminApi, type AdminUser } from '@/services/admin';
import { useAuthStore } from '@/stores/auth';

export function StudentManagementPage() {
  const { user } = useAuthStore();
  const [students, setStudents] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const limit = 20;

  const loadStudents = async () => {
    try {
      setIsLoading(true);
      const response = await adminApi.listStudents(skip, limit);
      setStudents(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      toast.error('加载学生列表失败');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (student: AdminUser) => {
    try {
      await adminApi.toggleStudentStatus(student.id);
      toast.success(`已${student.is_active ? '禁用' : '启用'}学生账户`);
      await loadStudents();
    } catch (error) {
      toast.error('操作失败');
      console.error(error);
    }
  };

  const handleDelete = async () => {
    if (!studentToDelete) return;
    try {
      setIsDeleting(true);
      await adminApi.deleteStudent(studentToDelete.id);
      toast.success('学生已删除');
      setDeleteDialogOpen(false);
      setStudentToDelete(null);
      await loadStudents();
    } catch (error) {
      toast.error('删除失败');
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredStudents = students.filter(
    (s) =>
      s.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  useEffect(() => {
    loadStudents();
  }, [skip]);

  const isSuperAdmin = user?.is_super_admin;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">学生管理</h1>
        <p className="text-muted-foreground">管理系统中的学生账户</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                学生列表
              </CardTitle>
              <CardDescription>共 {total} 位学生</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索学生..."
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
          ) : filteredStudents.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {students.length === 0 ? '暂无学生' : '没有匹配的学生'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <p className="font-medium">{student.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {student.username} · {student.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={student.is_active ? 'success' : 'destructive'}>
                      {student.is_active ? '正常' : '已禁用'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(student.created_at).toLocaleDateString('zh-CN')}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleStatus(student)}
                      title={student.is_active ? '禁用' : '启用'}
                    >
                      {student.is_active ? (
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
                          setStudentToDelete(student);
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
              确定要删除学生「{studentToDelete?.full_name}」吗？该操作不可恢复。
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

