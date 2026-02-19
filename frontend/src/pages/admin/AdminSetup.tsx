import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import { useAuthStore } from '@/stores/auth';
import { adminApi } from '@/services/admin';
import type { AxiosError } from 'axios';

export function AdminSetupPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const { setAdminSession } = useAuthStore();
  const navigate = useNavigate();

  // 已存在管理员则跳转登录页（防止直接访问 /admin/setup）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminApi.getSetupRequired();
        if (cancelled) return;
        if (!res.data.setup_required) {
          navigate('/admin/login', { replace: true });
          return;
        }
      } catch {
        if (!cancelled) toast.error('无法获取初始化状态');
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('两次输入的密码不一致');
      return;
    }
    if (!username.trim() || !email.trim() || !password || !fullName.trim()) {
      toast.error('请填写全部字段');
      return;
    }
    setSubmitting(true);
    try {
      const res = await adminApi.createSetup({
        username: username.trim(),
        email: email.trim(),
        password,
        full_name: fullName.trim(),
      });
      setAdminSession(res.data);
      toast.success('超级管理员创建成功');
      navigate('/admin', { replace: true });
    } catch (err) {
      const axiosError = err as AxiosError<{ detail?: string }>;
      const detail = axiosError.response?.data?.detail;
      const status = axiosError.response?.status;
      if (status === 403) {
        toast.error(detail || '系统已初始化，请使用登录页');
        navigate('/admin/login', { replace: true });
      } else {
        toast.error(detail || '创建失败，请重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span>正在检查...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-amber-500" />
          </div>
          <CardTitle className="text-2xl text-white">创建超级管理员</CardTitle>
          <CardDescription className="text-slate-400">
            首次部署请创建超级管理员账户
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-300">用户名</Label>
              <Input
                id="username"
                placeholder="请输入用户名（至少 3 位）"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">邮箱</Label>
              <Input
                id="email"
                type="email"
                placeholder="请输入邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-slate-300">姓名</Label>
              <Input
                id="full_name"
                placeholder="请输入姓名"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="请输入密码（至少 6 位）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-300">确认密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="请再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                autoComplete="new-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-amber-600 hover:bg-amber-700"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  创建中...
                </>
              ) : (
                '创建超级管理员'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
