import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, type UserType } from '@/stores/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedUserTypes?: UserType[];
}

export function ProtectedRoute({ children, allowedUserTypes }: ProtectedRouteProps) {
  const { isAuthenticated, userType } = useAuthStore();
  const location = useLocation();

  // 未登录，重定向到登录页
  if (!isAuthenticated) {
    // 管理员未登录重定向到管理员登录页
    if (allowedUserTypes?.includes('admin')) {
      return <Navigate to="/admin/login" state={{ from: location }} replace />;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 检查用户类型权限
  if (allowedUserTypes && userType && !allowedUserTypes.includes(userType)) {
    // 根据用户类型重定向到对应的主页
    let redirectPath = '/';
    if (userType === 'teacher') {
      redirectPath = '/teacher';
    } else if (userType === 'student') {
      redirectPath = '/student';
    } else if (userType === 'admin') {
      redirectPath = '/admin';
    }
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
}

