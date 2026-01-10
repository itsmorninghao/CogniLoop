import { useEffect, useState } from 'react';
import {
  Users,
  GraduationCap,
  BookOpen,
  FileText,
  ClipboardList,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import { adminApi, type SystemStats } from '@/services/admin';

export function AdminDashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadStats = async () => {
    try {
      setIsLoading(true);
      const response = await adminApi.getStats();
      setStats(response.data);
    } catch (error) {
      toast.error('加载统计数据失败');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const statCards = [
    {
      title: '教师数量',
      value: stats?.teacher_count || 0,
      icon: GraduationCap,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      title: '学生数量',
      value: stats?.student_count || 0,
      icon: Users,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
    },
    {
      title: '课程数量',
      value: stats?.course_count || 0,
      icon: BookOpen,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
    {
      title: '文档数量',
      value: stats?.document_count || 0,
      icon: FileText,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
    {
      title: '试题集数量',
      value: stats?.question_set_count || 0,
      icon: ClipboardList,
      color: 'text-pink-500',
      bg: 'bg-pink-500/10',
    },
    {
      title: '答题记录',
      value: stats?.answer_count || 0,
      icon: CheckCircle,
      color: 'text-cyan-500',
      bg: 'bg-cyan-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">系统概览</h1>
        <p className="text-muted-foreground">查看系统整体运行状况</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl ${stat.bg} flex items-center justify-center`}>
                    <Icon className={`w-7 h-7 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{stat.value.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>快速操作</CardTitle>
          <CardDescription>常用管理功能入口</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a
              href="/admin/teachers"
              className="p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center"
            >
              <GraduationCap className="w-8 h-8 mx-auto mb-2 text-blue-500" />
              <p className="font-medium">教师管理</p>
            </a>
            <a
              href="/admin/students"
              className="p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center"
            >
              <Users className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p className="font-medium">学生管理</p>
            </a>
            <a
              href="/admin/courses"
              className="p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center"
            >
              <BookOpen className="w-8 h-8 mx-auto mb-2 text-purple-500" />
              <p className="font-medium">课程管理</p>
            </a>
            <a
              href="/admin/admins"
              className="p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center"
            >
              <Users className="w-8 h-8 mx-auto mb-2 text-amber-500" />
              <p className="font-medium">管理员</p>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

