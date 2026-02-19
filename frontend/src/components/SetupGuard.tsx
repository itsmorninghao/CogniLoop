import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { adminApi } from '@/services/admin';

/**
 * 全局守卫：若系统中尚未创建超级管理员，则重定向到 /admin/setup；
 * 仅 /admin/setup 路由不经过此守卫。
 */
export function SetupGuard() {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminApi.getSetupRequired();
        if (!cancelled) setSetupRequired(res.data.setup_required);
      } catch {
        if (!cancelled) setSetupRequired(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (setupRequired === null) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  if (setupRequired) {
    return <Navigate to="/admin/setup" replace />;
  }

  return <Outlet />;
}
