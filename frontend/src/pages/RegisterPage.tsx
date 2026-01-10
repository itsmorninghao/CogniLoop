import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GraduationCap, Loader2, BookOpen, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { useAuthStore, type UserType } from '@/stores/auth';

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const initialRole = (searchParams.get('role') as UserType) || 'teacher';
  
  const [activeTab, setActiveTab] = useState<UserType>(initialRole);
  
  // Teacher form
  const [teacherUsername, setTeacherUsername] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherName, setTeacherName] = useState('');
  
  // Student form
  const [studentNumber, setStudentNumber] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [studentName, setStudentName] = useState('');
  
  const { register, isLoading, isAuthenticated, userType } = useAuthStore();
  const navigate = useNavigate();

  // 已登录则跳转
  useEffect(() => {
    if (isAuthenticated) {
      navigate(userType === 'teacher' ? '/teacher' : '/student');
    }
  }, [isAuthenticated, userType, navigate]);

  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!teacherUsername.trim() || !teacherEmail.trim() || !teacherPassword.trim() || !teacherName.trim()) {
      toast.error('请填写完整信息');
      return;
    }

    try {
      await register({
        username: teacherUsername.trim(),
        email: teacherEmail.trim(),
        password: teacherPassword,
        full_name: teacherName.trim(),
      }, 'teacher');
      toast.success('注册成功');
      navigate('/teacher');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '注册失败');
    }
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!studentNumber.trim() || !studentEmail.trim() || !studentPassword.trim() || !studentName.trim()) {
      toast.error('请填写完整信息');
      return;
    }

    try {
      await register({
        username: studentNumber.trim(),
        email: studentEmail.trim(),
        password: studentPassword,
        full_name: studentName.trim(),
        student_number: studentNumber.trim(),
      }, 'student');
      toast.success('注册成功');
      navigate('/student');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '注册失败');
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
            <CardTitle>注册账号</CardTitle>
            <CardDescription>选择您的身份并填写信息</CardDescription>
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
                <form onSubmit={handleTeacherSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="teacher-username">用户名</Label>
                    <Input
                      id="teacher-username"
                      type="text"
                      placeholder="请输入用户名"
                      value={teacherUsername}
                      onChange={(e) => setTeacherUsername(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="teacher-name">姓名</Label>
                    <Input
                      id="teacher-name"
                      type="text"
                      placeholder="请输入真实姓名"
                      value={teacherName}
                      onChange={(e) => setTeacherName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="teacher-email">邮箱</Label>
                    <Input
                      id="teacher-email"
                      type="email"
                      placeholder="请输入邮箱"
                      value={teacherEmail}
                      onChange={(e) => setTeacherEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="teacher-password">密码</Label>
                    <Input
                      id="teacher-password"
                      type="password"
                      placeholder="请设置密码（至少 6 位）"
                      value={teacherPassword}
                      onChange={(e) => setTeacherPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        注册中...
                      </>
                    ) : (
                      '注册'
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="student">
                <form onSubmit={handleStudentSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="student-number">学号</Label>
                    <Input
                      id="student-number"
                      type="text"
                      placeholder="请输入学号"
                      value={studentNumber}
                      onChange={(e) => setStudentNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="student-name">姓名</Label>
                    <Input
                      id="student-name"
                      type="text"
                      placeholder="请输入真实姓名"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="student-email">邮箱</Label>
                    <Input
                      id="student-email"
                      type="email"
                      placeholder="请输入邮箱"
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="student-password">密码</Label>
                    <Input
                      id="student-password"
                      type="password"
                      placeholder="请设置密码（至少 6 位）"
                      value={studentPassword}
                      onChange={(e) => setStudentPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        注册中...
                      </>
                    ) : (
                      '注册'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">已有账号？</span>
              <Link
                to={`/login?role=${activeTab}`}
                className="text-primary hover:underline ml-1"
              >
                立即登录
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
