import api from './api';

// 答案状态类型
export type AnswerStatus = 'draft' | 'submitted' | 'completed' | 'failed';

// 类型定义
export interface Answer {
  id: number;
  question_set_id: number;
  student_id: number;
  course_id: number;
  student_answers: Record<string, string | string[]> | null;
  grading_results: GradingResults | null;
  total_score: number | null;
  status: AnswerStatus;
  error_message: string | null;
  saved_at: string;
  submitted_at: string | null;
}

export interface GradingResults {
  [key: string]: QuestionGradingResult;
}

export interface QuestionGradingResult {
  question_id: string;
  question_type: string;
  score: number;
  max_score: number;
  feedback: string;
  correct_answer?: string | null;
  analysis?: string;
}

export interface SaveDraftRequest {
  question_set_id: number;
  student_answers: Record<string, string | string[]>;
}

export interface SubmitAnswerRequest {
  question_set_id: number;
  student_answers: Record<string, string | string[]>;
}

// 教师端类型
export interface AnswerStudentInfo {
  id: number;
  username: string;
  full_name: string;
  email: string;
}

export interface TeacherAnswer extends Answer {
  student: AnswerStudentInfo;
}

export interface TeacherScoreUpdate {
  total_score: number;
  question_scores?: Record<string, number>;
}

// 学生端答案 API
export const answerApi = {
  // 保存草稿
  saveDraft: (data: SaveDraftRequest) =>
    api.post<Answer>('/answer/save-draft', data),

  // 提交答案
  submit: (data: SubmitAnswerRequest) =>
    api.post<Answer>('/answer/submit', data),

  // 获取答案详情
  getById: (answerId: number) =>
    api.get<Answer>(`/answer/${answerId}`),

  // 获取学生对某试题集的答案
  getByQuestionSet: (questionSetId: number) =>
    api.get<Answer | null>(`/answer/question-set/${questionSetId}`),
};

// 教师端答案 API
export const teacherAnswerApi = {
  // 获取试题集的所有学生答案
  getByQuestionSet: (questionSetId: number) =>
    api.get<TeacherAnswer[]>(`/answer/teacher/question-set/${questionSetId}`),

  // 获取单份答案详情
  getById: (answerId: number) =>
    api.get<TeacherAnswer>(`/answer/teacher/${answerId}`),

  // 修改分数
  updateScore: (answerId: number, data: TeacherScoreUpdate) =>
    api.patch(`/answer/teacher/${answerId}/score`, data),
};

