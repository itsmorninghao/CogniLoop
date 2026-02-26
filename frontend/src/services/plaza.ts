import api from './api';

export interface PlazaQuestionSetItem {
  id: number;
  title: string;
  description: string | null;
  teacher_name: string;
  course_name: string;
  shared_to_plaza_at: string;
  attempt_count: number;
  average_score: number | null;
  my_status: string | null; // null / "draft" / "completed"
  my_score: number | null;
  is_own: boolean;
}

export interface PlazaQuestionSetListResponse {
  items: PlazaQuestionSetItem[];
  total: number;
  skip: number;
  limit: number;
}

export interface LeaderboardEntry {
  rank: number;
  user_name: string;
  user_type: string;
  score: number;
  submitted_at: string;
}

export interface PlazaQuestionSetDetail {
  id: number;
  title: string;
  description: string | null;
  teacher_name: string;
  course_name: string;
  shared_to_plaza_at: string;
  attempt_count: number;
  completion_count: number;
  average_score: number | null;
  my_status: string | null;
  my_score: number | null;
  my_rank: number | null;
  is_own: boolean;
  created_at: string;
  leaderboard: LeaderboardEntry[];
}

export interface LeaderboardResponse {
  question_set_id: number;
  leaderboard: LeaderboardEntry[];
  my_rank: number | null;
  my_score: number | null;
}

export interface PlazaAttemptItem {
  answer_id: number;
  question_set_id: number;
  question_set_title: string;
  teacher_name: string;
  status: string;
  total_score: number | null;
  submitted_at: string | null;
}

export interface PlazaAttemptListResponse {
  items: PlazaAttemptItem[];
  total: number;
  skip: number;
  limit: number;
}

export interface PlazaSharedStatItem {
  question_set_id: number;
  title: string;
  shared_to_plaza_at: string;
  attempt_count: number;
  completion_count: number;
  average_score: number | null;
  highest_score: number | null;
  lowest_score: number | null;
}

export interface PlazaSharedStatsResponse {
  total_shared: number;
  total_attempts: number;
  items: PlazaSharedStatItem[];
}

export interface SharePlazaResponse {
  message: string;
  shared_to_plaza_at: string;
  share_url: string;
}


export const plazaApi = {
  // 广场列表（游客可访问）
  list: (params?: {
    skip?: number;
    limit?: number;
    keyword?: string;
    sort?: 'newest' | 'popular' | 'oldest';
  }) => api.get<PlazaQuestionSetListResponse>('/plaza/question-sets', { params }),

  // 广场详情（游客可访问）
  detail: (questionSetId: number) =>
    api.get<PlazaQuestionSetDetail>(`/plaza/question-sets/${questionSetId}`),

  // 排行榜
  leaderboard: (questionSetId: number, limit?: number) =>
    api.get<LeaderboardResponse>(`/plaza/question-sets/${questionSetId}/leaderboard`, {
      params: limit ? { limit } : {},
    }),

  // 题目内容（需登录）
  getContent: (questionSetId: number) =>
    api.get<{ id: number; title: string; json_content: string }>(
      `/plaza/question-sets/${questionSetId}/content`
    ),

  // 我的广场记录
  myAttempts: (params?: { skip?: number; limit?: number; status?: string }) =>
    api.get<PlazaAttemptListResponse>('/plaza/my-attempts', { params }),

  // 教师分享统计
  mySharedStats: () => api.get<PlazaSharedStatsResponse>('/plaza/my-shared-stats'),

  // 获取我的答案
  getMyAnswer: (questionSetId: number) =>
    api.get<{
      id: number;
      question_set_id: number;
      student_id: number | null;
      course_id: number;
      student_answers: Record<string, string | string[]> | null;
      grading_results: Record<string, unknown> | null;
      total_score: number | null;
      status: string;
      error_message: string | null;
      saved_at: string;
      submitted_at: string | null;
    } | null>(`/plaza/my-answer/${questionSetId}`),

  // 做题 - 保存草稿
  saveDraft: (data: { question_set_id: number; student_answers: Record<string, unknown> }) =>
    api.post('/plaza/answer/save-draft', data),

  // 做题 - 提交答案
  submitAnswer: (data: { question_set_id: number; student_answers: Record<string, unknown> }) =>
    api.post('/plaza/answer/submit', data),

  // 分享到广场（教师端，在 question API 下）
  sharePlaza: (questionSetId: number) =>
    api.post<SharePlazaResponse>(`/question/${questionSetId}/share-plaza`),

  // 从广场撤回（教师端）
  unsharePlaza: (questionSetId: number) =>
    api.post<{ message: string }>(`/question/${questionSetId}/unshare-plaza`),
};
