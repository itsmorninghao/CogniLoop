import { Link, useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, Globe, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';

export function PublicNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const linkClass = (path: string) => {
    const isActive = pathname === path;
    return `text-[15px] font-medium transition-all px-4 py-2 rounded-full ${
      isActive
        ? 'bg-primary/10 text-primary'
        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-500/8'
    }`;
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-xl">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
              <GraduationCap className="w-5 h-5 text-primary" />
            </div>
            <span className="text-lg font-semibold text-slate-800">CogniLoop</span>
          </Link>

          <div className="flex items-center gap-1">
            <Link to="/" className={linkClass('/')}>
              首页
            </Link>
            <Link to="/plaza" className={linkClass('/plaza')}>
              <span className="inline-flex items-center gap-1.5">
                <Globe className="w-4 h-4" />
                题目广场
              </span>
            </Link>
          </div>
        </div>

        {!isAuthenticated && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/login')}
            className="h-9 px-4 gap-2 rounded-full text-sm font-medium"
          >
            <LogIn className="w-4 h-4" />
            登录
          </Button>
        )}
      </div>
    </nav>
  );
}
