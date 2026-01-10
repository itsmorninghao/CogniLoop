import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GraduationCap, Loader2, BookOpen, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { useAuthStore, type UserType } from '@/stores/auth';

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const initialRole = (searchParams.get('role') as UserType) || 'teacher';
  
  const [activeTab, setActiveTab] = useState<UserType>(initialRole);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const { login, isLoading, isAuthenticated, userType, token } = useAuthStore();
  const navigate = useNavigate();
  const hasNavigated = useRef(false);

  // 已登录且有有效 token 则跳转（防止重复跳转）
  useEffect(() => {
    if (isAuthenticated && token && !hasNavigated.current) {
      hasNavigated.current = true;
      navigate(userType === 'teacher' ? '/teacher' : '/student', { replace: true });
    }
  }, [isAuthenticated, userType, token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      toast.error('请填写用户名和密码');
      return;
    }

    try {
      await login({ username: username.trim(), password }, activeTab);
      toast.success('登录成功');
      navigate(activeTab === 'teacher' ? '/teacher' : '/student');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录失败');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-2xl font-bold">
            <GraduationCap className="w-8 h-8 text-primary" />
            <span>
              <span className="text-primary">Cogni</span>Loop
            </span>
          </Link>
          <p className="text-muted-foreground mt-2">智能教育系统</p>
        </div>

        <Card>
          <CardHeader className="text-center pb-2">
            <CardTitle>登录</CardTitle>
            <CardDescription>选择您的身份并登录</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as UserType)}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="teacher" className="gap-2">
                  <BookOpen className="w-4 h-4" />
                  教师
                </TabsTrigger>
                <TabsTrigger value="student" className="gap-2">
                  <Users className="w-4 h-4" />
                  学生
                </TabsTrigger>
              </TabsList>

              <TabsContent value="teacher">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="teacher-username">用户名</Label>
                    <Input
                      id="teacher-username"
                      type="text"
                      placeholder="请输入用户名"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="teacher-password">密码</Label>
                    <Input
                      id="teacher-password"
                      type="password"
                      placeholder="请输入密码"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        登录中...
                      </>
                    ) : (
                      '登录'
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="student">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="student-username">学号</Label>
                    <Input
                      id="student-username"
                      type="text"
                      placeholder="请输入学号"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="student-password">密码</Label>
                    <Input
                      id="student-password"
                      type="password"
                      placeholder="请输入密码"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        登录中...
                      </>
                    ) : (
                      '登录'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">还没有账号？</span>
              <Link
                to={`/register?role=${activeTab}`}
                className="text-primary hover:underline ml-1"
              >
                立即注册
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
