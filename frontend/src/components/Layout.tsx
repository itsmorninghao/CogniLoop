import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  GraduationCap,
  Menu,
  X,
  Library,
  User,
  FileText,
  Sparkles,
  ClipboardList,
  Clock,
  Globe,
  BookMarked,
  FolderOpen,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
}

const teacherNavItems: NavItem[] = [
  { to: '/teacher', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/teacher/knowledge', label: '知识库', icon: FileText },
  { to: '/teacher/questions', label: '生成试题', icon: Sparkles },
  { to: '/teacher/exam-paper', label: '高考组卷', icon: BookMarked },
  { to: '/teacher/my-papers', label: '我的试卷', icon: FolderOpen },
  { to: '/teacher/plaza', label: '题目广场', icon: Globe },
];

const studentNavItems: NavItem[] = [
  { to: '/student', label: '我的课程', icon: Library, end: true },
  { to: '/student/tests', label: '待做试题', icon: ClipboardList },
  { to: '/student/plaza', label: '题目广场', icon: Globe },
];

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const { user, userType, logout } = useAuthStore();
  const navigate = useNavigate();

  // 实时更新时间
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekday = weekdays[date.getDay()];
    return `${month}月${day}日 ${weekday}`;
  };

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const navItems = userType === 'teacher' ? teacherNavItems : studentNavItems;
  const portalLabel = userType === 'teacher' ? '教师端' : '学生端';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'bg-sidebar text-sidebar-foreground transition-all duration-300 flex flex-col overflow-hidden',
          sidebarOpen ? 'w-64' : 'w-0'
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">CogniLoop</h1>
              <p className="text-xs text-white/60">{portalLabel}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all',
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                  )
                }
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{user?.full_name}</p>
              <p className="text-xs text-white/60 truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-white/70 hover:text-white transition-colors"
              title="退出登录"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            {sidebarOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/10">
              <Clock className="w-4 h-4 text-primary/70" />
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{formatDate(currentTime)}</span>
                <span className="text-primary/30">|</span>
                <span className="text-sm font-mono font-medium tracking-wider text-foreground">
                  {formatTime(currentTime)}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

