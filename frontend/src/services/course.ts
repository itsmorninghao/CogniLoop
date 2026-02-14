import api from './api';

// 类型定义
export interface Course {
  id: number;
  name: string;
  description?: string;
  code: string;
  invite_code: string;
  teacher_id: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CourseDetail extends Course {
  teacher_name: string;
  student_count: number;
  document_count: number;
  question_set_count: number;
}

export interface CourseCreateRequest {
  name: string;
  description?: string;
}

export interface CourseListResponse {
  courses: Course[];
  total: number;
}

export interface JoinCourseRequest {
  invite_code: string;
}

// 课程 API（教师端）
export const courseApi = {
  // 创建课程
  create: (data: CourseCreateRequest) =>
    api.post<Course>('/course/create', data),

  // 获取课程列表
  list: () =>
    api.get<CourseListResponse>('/course/list'),

  // 获取课程详情
  getDetail: (courseId: number) =>
    api.get<CourseDetail>(`/course/${courseId}`),

  // 删除课程
  delete: (courseId: number) =>
    api.delete(`/course/${courseId}`),
};

// 学生课程 API
export const studentCourseApi = {
  // 加入课程
  join: (data: JoinCourseRequest) =>
    api.post<Course>('/student-course/join', data),

  // 获取我的课程列表
  myCourses: () =>
    api.get<CourseListResponse>('/student-course/my-courses'),

  // 退出课程
  leave: (courseId: number) =>
    api.delete(`/student-course/${courseId}/leave`),
};

