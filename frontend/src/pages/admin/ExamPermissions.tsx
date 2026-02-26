import { useEffect, useState } from 'react';
import {
  BookMarked,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Zap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { examPaperAdminApi, type TeacherPermission } from '@/services/examPaper';

export function ExamPermissionsPage() {
  const [permissions, setPermissions] = useState<TeacherPermission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // 授权 Dialog
  const [grantDialog, setGrantDialog] = useState<{
    open: boolean;
    teacher: TeacherPermission | null;
    monthlyQuota: string;
    note: string;
  }>({ open: false, teacher: null, monthlyQuota: '', note: '' });
  const [isGranting, setIsGranting] = useState(false);

  // 撤权确认
  const [revokeDialog, setRevokeDialog] = useState<{
    open: boolean;
    teacher: TeacherPermission | null;
  }>({ open: false, teacher: null });
  const [isRevoking, setIsRevoking] = useState(false);

  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const resp = await examPaperAdminApi.listPermissions(page, PAGE_SIZE);
      setPermissions(resp.data.items);
      setTotal(resp.data.total);
    } catch {
      toast.error('加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page]);

  const handleGrant = async () => {
    if (!grantDialog.teacher) return;
    setIsGranting(true);
    try {
      const quota = grantDialog.monthlyQuota
        ? parseInt(grantDialog.monthlyQuota)
        : null;
      await examPaperAdminApi.grantPermission(
        grantDialog.teacher.teacher_id,
        quota,
        grantDialog.note || undefined,
      );
      toast.success(`已授权教师「${grantDialog.teacher.full_name || grantDialog.teacher.username}」`);
      setGrantDialog(d => ({ ...d, open: false }));
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '授权失败');
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeDialog.teacher) return;
    setIsRevoking(true);
    try {
      await examPaperAdminApi.revokePermission(revokeDialog.teacher.teacher_id);
      toast.success('权限已撤销');
      setRevokeDialog(d => ({ ...d, open: false }));
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '撤权失败');
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
            <BookMarked className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">仿高考组卷授权管理</h1>
            <p className="text-sm text-muted-foreground">
              控制哪些教师可以使用高 Token 消耗的仿高考组卷功能
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-muted-foreground">
          共 {total} 位教师
        </Badge>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              加载中…
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">教师</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">状态</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">已用 Token</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">月配额</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">授权时间</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">备注</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {permissions.map(perm => (
                  <tr key={perm.teacher_id} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{perm.full_name || perm.username}</p>
                        <p className="text-xs text-muted-foreground">{perm.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {perm.is_authorized ? (
                        <Badge className="bg-green-100 text-green-800 border-0">已授权</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">未授权</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono">{(perm.token_used || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3">
                      {perm.monthly_quota != null ? (
                        <div className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-500" />
                          <span>{perm.monthly_quota.toLocaleString()}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">无限制</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {perm.granted_at
                        ? new Date(perm.granted_at).toLocaleDateString('zh-CN')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {perm.note || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => setGrantDialog({
                            open: true,
                            teacher: perm,
                            monthlyQuota: perm.monthly_quota?.toString() || '',
                            note: perm.note || '',
                          })}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          {perm.is_authorized ? '修改' : '授权'}
                        </Button>
                        {perm.is_authorized && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1 text-red-600 hover:text-red-700"
                            onClick={() => setRevokeDialog({ open: true, teacher: perm })}
                          >
                            <ShieldOff className="w-3 h-3" />
                            撤权
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Grant Dialog */}
      <Dialog open={grantDialog.open} onOpenChange={v => setGrantDialog(d => ({ ...d, open: v }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {grantDialog.teacher?.is_authorized ? '修改授权' : '授权组卷功能'}
            </DialogTitle>
            <DialogDescription>
              教师：{grantDialog.teacher?.full_name || grantDialog.teacher?.username}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>月 Token 配额（留空 = 不限制）</Label>
              <Input
                type="number"
                min={0}
                placeholder="如：500000"
                value={grantDialog.monthlyQuota}
                onChange={e => setGrantDialog(d => ({ ...d, monthlyQuota: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                单次组卷约消耗 15,000–200,000 Tokens（取决于题目数量和 K 值）
              </p>
            </div>
            <div className="space-y-2">
              <Label>备注（可选）</Label>
              <Input
                placeholder="如：2026 年高三押题课授权"
                value={grantDialog.note}
                onChange={e => setGrantDialog(d => ({ ...d, note: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantDialog(d => ({ ...d, open: false }))}>
              取消
            </Button>
            <Button onClick={handleGrant} disabled={isGranting} className="gap-2">
              {isGranting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              确认授权
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Dialog */}
      <Dialog open={revokeDialog.open} onOpenChange={v => setRevokeDialog(d => ({ ...d, open: v }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认撤销权限</DialogTitle>
            <DialogDescription>
              确定要撤销教师「{revokeDialog.teacher?.full_name || revokeDialog.teacher?.username}」
              的仿高考组卷权限吗？撤销后该教师将无法发起新的组卷任务。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeDialog(d => ({ ...d, open: false }))}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={isRevoking} className="gap-2">
              {isRevoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
              撤销权限
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
