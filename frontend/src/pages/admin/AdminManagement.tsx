import { useEffect, useState } from 'react';
import {
  Shield,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Plus,
  Crown,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { adminApi, type AdminInfo } from '@/services/admin';
import { useAuthStore } from '@/stores/auth';

export function AdminManagementPage() {
  const { user } = useAuthStore();
  const [admins, setAdmins] = useState<AdminInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Create dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newIsSuperAdmin, setNewIsSuperAdmin] = useState(false);
  
  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [adminToDelete, setAdminToDelete] = useState<AdminInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadAdmins = async () => {
    try {
      setIsLoading(true);
      const response = await adminApi.listAdmins();
      setAdmins(response.data);
    } catch (error) {
      toast.error('加载管理员列表失败');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newUsername.trim() || !newEmail.trim() || !newPassword.trim() || !newFullName.trim()) {
      toast.error('请填写所有必填项');
      return;
    }
    
    try {
      setIsCreating(true);
      await adminApi.createAdmin({
        username: newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        full_name: newFullName.trim(),
        is_super_admin: newIsSuperAdmin,
      });
      toast.success('管理员创建成功');
      setCreateDialogOpen(false);
      resetCreateForm();
      await loadAdmins();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建失败');
    } finally {
      setIsCreating(false);
    }
  };

  const resetCreateForm = () => {
    setNewUsername('');
    setNewEmail('');
    setNewPassword('');
    setNewFullName('');
    setNewIsSuperAdmin(false);
  };

  const handleToggleStatus = async (admin: AdminInfo) => {
    if (admin.id === user?.id) {
      toast.error('不能禁用自己的账户');
      return;
    }
    try {
      await adminApi.toggleAdminStatus(admin.id);
      toast.success(`已${admin.is_active ? '禁用' : '启用'}管理员账户`);
      await loadAdmins();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    }
  };

  const handleDelete = async () => {
    if (!adminToDelete) return;
    if (adminToDelete.id === user?.id) {
      toast.error('不能删除自己的账户');
      return;
    }
    try {
      setIsDeleting(true);
      await adminApi.deleteAdmin(adminToDelete.id);
      toast.success('管理员已删除');
      setDeleteDialogOpen(false);
      setAdminToDelete(null);
      await loadAdmins();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  // 只有超级管理员才能访问此页面
  if (!user?.is_super_admin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">需要超级管理员权限</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">管理员管理</h1>
          <p className="text-muted-foreground">管理系统管理员账户</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          添加管理员
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            管理员列表
          </CardTitle>
          <CardDescription>共 {admins.length} 位管理员</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : admins.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              暂无管理员
            </div>
          ) : (
            <div className="space-y-3">
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                      {admin.is_super_admin ? (
                        <Crown className="w-5 h-5 text-amber-500" />
                      ) : (
                        <Shield className="w-5 h-5 text-amber-500" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{admin.full_name}</p>
                        {admin.id === user?.id && (
                          <Badge variant="outline" className="text-xs">
                            当前账户
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {admin.username} · {admin.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {admin.is_super_admin && (
                      <Badge className="bg-amber-500">超级管理员</Badge>
                    )}
                    <Badge variant={admin.is_active ? 'success' : 'destructive'}>
                      {admin.is_active ? '正常' : '已禁用'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(admin.created_at).toLocaleDateString('zh-CN')}
                    </span>
                    {admin.id !== user?.id && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleStatus(admin)}
                          title={admin.is_active ? '禁用' : '启用'}
                        >
                          {admin.is_active ? (
                            <ToggleRight className="w-5 h-5 text-green-500" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setAdminToDelete(admin);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-5 h-5 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加管理员</DialogTitle>
            <DialogDescription>创建新的管理员账户</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="请输入用户名"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="请输入邮箱"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入密码"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">姓名</Label>
              <Input
                id="fullName"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="请输入姓名"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isSuperAdmin"
                checked={newIsSuperAdmin}
                onCheckedChange={(checked) => setNewIsSuperAdmin(checked === true)}
              />
              <Label htmlFor="isSuperAdmin" className="text-sm font-normal">
                设为超级管理员
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  创建中...
                </>
              ) : (
                '创建'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除管理员「{adminToDelete?.full_name}」吗？该操作不可恢复。
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

