import api from './api';

// 类型定义
export interface QuestionSet {
  id: number;
  title: string;
  description: string | null;
  course_id: number;
  teacher_id: number;
  is_public: boolean;
  status: 'draft' | 'published';
  shared_to_plaza_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerateQuestionRequest {
  course_id: number;
  natural_language_request: string;
  subject?: string | null;
  chapter_id?: number | null;
  difficulty?: 'easy' | 'medium' | 'hard' | null;
}

export interface ModifyQuestionRequest {
  natural_language_request: string;
}

export interface AssignQuestionRequest {
  student_ids: number[];
  deadline?: string; // ISO 8601 格式
  assign_to_all?: boolean;
}

export interface QuestionSetListResponse {
  question_sets: QuestionSet[];
  total: number;
}

export interface StudentQuestionSet {
  id: number;
  title: string;
  description: string | null;
  course_name: string;
  is_assigned: boolean;
  is_completed: boolean;
  deadline: string | null;
  completed_at: string | null;
  has_draft: boolean;
}

export interface StudentQuestionSetListResponse {
  question_sets: StudentQuestionSet[];
  total: number;
}

// 试题集 API（教师端）
export const questionApi = {
  // 生成试题集
  generate: (data: GenerateQuestionRequest) =>
    api.post<QuestionSet>('/question/generate', data),

  // 修改试题集
  modify: (questionSetId: number, data: ModifyQuestionRequest) =>
    api.post<QuestionSet>(`/question/${questionSetId}/modify`, data),

  // 获取试题集内容
  getContent: (questionSetId: number) =>
    api.get<{ id: number; title: string; markdown_content: string }>(`/question/${questionSetId}/content`),

  // 分配试题集
  assign: (questionSetId: number, data: AssignQuestionRequest) =>
    api.post(`/question/${questionSetId}/assign`, data),

  // 获取试题集列表
  list: (courseId: number) =>
    api.get<QuestionSetListResponse>('/question/list', {
      params: { course_id: courseId },
    }),

  // 发布试题集
  publish: (questionSetId: number) =>
    api.post(`/question/${questionSetId}/publish`),

  // 删除试题集
  delete: (questionSetId: number) =>
    api.delete(`/question/${questionSetId}`),
};

// 学生试题集 API
export const studentQuestionApi = {
  // 获取可访问的试题集列表（后端直接返回数组）
  list: (courseId?: number) =>
    api.get<StudentQuestionSet[]>('/student-question/list', {
      params: courseId ? { course_id: courseId } : {},
    }),

  // 获取试题集内容（学生端）
  getContent: (questionSetId: number) =>
    api.get<{ id: number; title: string; markdown_content: string }>(`/student-question/${questionSetId}/content`),
};

