import api from './api';

// 类型定义
export interface AdminUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface AdminInfo extends AdminUser {
  is_super_admin: boolean;
}

export interface SystemStats {
  teacher_count: number;
  student_count: number;
  course_count: number;
  document_count: number;
  question_set_count: number;
  answer_count: number;
}

export interface AdminCourse {
  id: number;
  name: string;
  code: string;
  invite_code: string;
  teacher_id: number;
  teacher_name: string;
  is_active: boolean;
  student_count: number;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface CreateAdminRequest {
  username: string;
  email: string;
  password: string;
  full_name: string;
  is_super_admin: boolean;
}

export interface AdminLoginResponse {
  access_token: string;
  token_type: string;
  user_type: 'admin';
  user: AdminInfo;
}

// 管理员 API
export const adminApi = {
  // 登录
  login: (data: LoginRequest) =>
    api.post<AdminLoginResponse>('/admin/login', data),

  // 获取系统统计
  getStats: () =>
    api.get<SystemStats>('/admin/stats'),

  // 教师管理
  listTeachers: (skip = 0, limit = 50) =>
    api.get<PaginatedResponse<AdminUser>>('/admin/teachers', {
      params: { skip, limit },
    }),

  toggleTeacherStatus: (teacherId: number) =>
    api.patch<{ message: string; is_active: boolean }>(`/admin/teachers/${teacherId}/toggle-status`),

  deleteTeacher: (teacherId: number) =>
    api.delete(`/admin/teachers/${teacherId}`),

  // 学生管理
  listStudents: (skip = 0, limit = 50) =>
    api.get<PaginatedResponse<AdminUser>>('/admin/students', {
      params: { skip, limit },
    }),

  toggleStudentStatus: (studentId: number) =>
    api.patch<{ message: string; is_active: boolean }>(`/admin/students/${studentId}/toggle-status`),

  deleteStudent: (studentId: number) =>
    api.delete(`/admin/students/${studentId}`),

  // 课程管理
  listCourses: (skip = 0, limit = 50, includeInactive = true) =>
    api.get<PaginatedResponse<AdminCourse>>('/admin/courses', {
      params: { skip, limit, include_inactive: includeInactive },
    }),

  toggleCourseStatus: (courseId: number) =>
    api.patch<{ message: string; is_active: boolean }>(`/admin/courses/${courseId}/toggle-status`),

  deleteCourse: (courseId: number) =>
    api.delete(`/admin/courses/${courseId}`),

  // 管理员管理（仅超级管理员）
  listAdmins: () =>
    api.get<AdminInfo[]>('/admin/admins'),

  createAdmin: (data: CreateAdminRequest) =>
    api.post<AdminInfo>('/admin/admins', data),

  toggleAdminStatus: (adminId: number) =>
    api.patch<{ message: string; is_active: boolean }>(`/admin/admins/${adminId}/toggle-status`),

  deleteAdmin: (adminId: number) =>
    api.delete(`/admin/admins/${adminId}`),
};

