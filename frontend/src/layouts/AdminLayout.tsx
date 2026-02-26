import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  GraduationCap,
  Users,
  BookOpen,
  LogOut,
  Crown,
  Settings,
  BookMarked,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/sonner';

export function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('已退出登录');
    navigate('/admin/login', { replace: true });
  };

  const navItems = [
    { to: '/admin', icon: LayoutDashboard, label: '系统概览', exact: true },
    { to: '/admin/teachers', icon: GraduationCap, label: '教师管理' },
    { to: '/admin/students', icon: Users, label: '学生管理' },
    { to: '/admin/courses', icon: BookOpen, label: '课程管理' },
    { to: '/admin/exam-permissions', icon: BookMarked, label: '组卷授权' },
    { to: '/admin/exam-import', icon: Database, label: '真题库导入' },
    { to: '/admin/settings', icon: Settings, label: '系统配置' },
    ...(user?.is_super_admin
      ? [{ to: '/admin/admins', icon: Crown, label: '管理员' }]
      : []),
  ];

  return (
    <div className="h-screen bg-slate-50 dark:bg-slate-900 flex overflow-hidden">
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Shield className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h1 className="font-semibold">CogniLoop</h1>
              <p className="text-xs text-slate-400">管理后台</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-500'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 shrink-0">
          <div className="px-4 py-2 mb-2">
            <p className="text-sm font-medium truncate">{user?.full_name}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            {user?.is_super_admin && (
              <p className="text-xs text-amber-500 mt-1">超级管理员</p>
            )}
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-800"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5 mr-3" />
            退出登录
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

