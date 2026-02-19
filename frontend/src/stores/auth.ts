import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, type AuthResponse, type LoginRequest, type RegisterRequest } from '@/services/auth';
import { adminApi, type AdminLoginResponse } from '@/services/admin';

export type UserType = 'teacher' | 'student' | 'admin';

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_super_admin?: boolean;
}

interface AuthState {
  token: string | null;
  user: User | null;
  userType: UserType | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (data: LoginRequest, userType: UserType) => Promise<void>;
  register: (data: RegisterRequest, userType: 'teacher' | 'student') => Promise<void>;
  setAdminSession: (data: AdminLoginResponse) => void;
  logout: () => void;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      userType: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (data: LoginRequest, userType: UserType) => {
        set({ isLoading: true, error: null });
        try {
          let authData: AuthResponse | AdminLoginResponse;
          
          if (userType === 'admin') {
            const response = await adminApi.login(data);
            authData = response.data;
          } else if (userType === 'teacher') {
            const response = await authApi.loginTeacher(data);
            authData = response.data;
          } else {
            const response = await authApi.loginStudent(data);
            authData = response.data;
          }
          
          localStorage.setItem('token', authData.access_token);
          
          set({
            token: authData.access_token,
            user: authData.user,
            userType: authData.user_type as UserType,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : '登录失败';
          set({ isLoading: false, error: message });
          throw error;
        }
      },

      register: async (data: RegisterRequest, userType: UserType) => {
        set({ isLoading: true, error: null });
        try {
          const response = userType === 'teacher'
            ? await authApi.registerTeacher(data)
            : await authApi.registerStudent(data);
          
          const authData: AuthResponse = response.data;
          
          localStorage.setItem('token', authData.access_token);
          
          set({
            token: authData.access_token,
            user: authData.user,
            userType: authData.user_type,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : '注册失败';
          set({ isLoading: false, error: message });
          throw error;
        }
      },

      setAdminSession: (data: AdminLoginResponse) => {
        localStorage.setItem('token', data.access_token);
        set({
          token: data.access_token,
          user: data.user,
          userType: 'admin',
          isAuthenticated: true,
          error: null,
        });
      },

      logout: () => {
        // 清除 localStorage 中的 token（zustand persist 会自动清除持久化状态）
        localStorage.removeItem('token');
        set({
          token: null,
          user: null,
          userType: null,
          isAuthenticated: false,
          error: null,
        });
      },

      clearError: () => set({ error: null }),
      
      setLoading: (loading: boolean) => set({ isLoading: loading }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        userType: state.userType,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

