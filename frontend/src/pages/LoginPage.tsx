import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GraduationCap, Loader2, BookOpen, Users, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { useAuthStore, type UserType } from '@/stores/auth';
import { authApi } from '@/services/auth';

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const initialRole = (searchParams.get('role') as UserType) || 'teacher';
  
  const [activeTab, setActiveTab] = useState<UserType>(initialRole);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaValue, setCaptchaValue] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  
  const { login, isLoading, isAuthenticated, userType, token } = useAuthStore();
  const navigate = useNavigate();
  const hasNavigated = useRef(false);

  const fetchCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      const response = await authApi.getCaptcha();
      setCaptchaId(response.data.captcha_id);
      setCaptchaImage(response.data.image_base64);
      setCaptchaValue('');
    } catch {
      toast.error('获取验证码失败，请稍后重试');
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  // 初始化获取验证码
  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

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

    if (!captchaValue.trim()) {
      toast.error('请输入验证码');
      return;
    }

    try {
      await login(
        { username: username.trim(), password, captcha_id: captchaId, captcha_value: captchaValue.trim() },
        activeTab,
      );
      toast.success('登录成功');
      navigate(activeTab === 'teacher' ? '/teacher' : '/student');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录失败');
      // 登录失败后刷新验证码
      fetchCaptcha();
    }
  };

  const captchaBlock = (
    <div className="space-y-2">
      <Label>验证码</Label>
      <div className="flex items-center gap-3">
        <Input
          type="text"
          placeholder="请输入验证码"
          value={captchaValue}
          onChange={(e) => setCaptchaValue(e.target.value)}
          maxLength={6}
          className="flex-1"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={fetchCaptcha}
          className="shrink-0 h-9 rounded-md overflow-hidden border border-input bg-muted cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center"
          title="点击刷新验证码"
          disabled={captchaLoading}
        >
          {captchaLoading ? (
            <RefreshCw className="w-5 h-5 animate-spin mx-4 text-muted-foreground" />
          ) : captchaImage ? (
            <img src={captchaImage} alt="验证码" className="h-full w-auto" />
          ) : (
            <RefreshCw className="w-5 h-5 mx-4 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );

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
                  {captchaBlock}
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
                  {captchaBlock}
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
