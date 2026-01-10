import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import { useAuthStore } from '@/stores/auth';

export function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const { login, isLoading, isAuthenticated, userType, token } = useAuthStore();
  const navigate = useNavigate();
  const hasNavigated = useRef(false);

  // 已登录则跳转
  useEffect(() => {
    if (isAuthenticated && token && userType === 'admin' && !hasNavigated.current) {
      hasNavigated.current = true;
      navigate('/admin', { replace: true });
    }
  }, [isAuthenticated, userType, navigate, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      toast.error('请填写用户名和密码');
      return;
    }

    try {
      await login({ username: username.trim(), password }, 'admin');
      toast.success('登录成功');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录失败');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-amber-500" />
          </div>
          <CardTitle className="text-2xl text-white">管理员登录</CardTitle>
          <CardDescription className="text-slate-400">
            CogniLoop 系统管理后台
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-300">用户名</Label>
              <Input
                id="username"
                placeholder="请输入管理员用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-amber-600 hover:bg-amber-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  登录中...
                </>
              ) : (
                '登录'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

