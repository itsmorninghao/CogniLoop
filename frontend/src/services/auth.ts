import api from './api';

// 类型定义
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  full_name: string;
  student_number?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user_type: 'teacher' | 'student';
  user: {
    id: number;
    username: string;
    email: string;
    full_name: string;
    is_active: boolean;
  };
}

// 认证 API
export const authApi = {
  // 教师注册
  registerTeacher: (data: RegisterRequest) =>
    api.post<AuthResponse>('/auth/register/teacher', data),

  // 学生注册
  registerStudent: (data: RegisterRequest) =>
    api.post<AuthResponse>('/auth/register/student', data),

  // 教师登录
  loginTeacher: (data: LoginRequest) =>
    api.post<AuthResponse>('/auth/login/teacher', data),

  // 学生登录
  loginStudent: (data: LoginRequest) =>
    api.post<AuthResponse>('/auth/login/student', data),
};

