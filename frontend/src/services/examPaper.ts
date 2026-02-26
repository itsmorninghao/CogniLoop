import api from './api';

const BASE = '/exam-paper';
const ADMIN_BASE = '/admin/exam-paper';

// ------------------------------------------------------------------ //
// Types
// ------------------------------------------------------------------ //

export interface QuestionTypeConfigInput {
  question_type: 'single_choice' | 'multiple_choice' | 'fill_blank' | 'short_answer';
  count: number;
  score_per_question: number;
}

export interface GenerateRequest {
  course_id: number;
  subject: string;
  target_region: string;
  question_distribution: QuestionTypeConfigInput[];
  target_difficulty: 'easy' | 'medium' | 'hard';
  use_hotspot: boolean;
  extra_note?: string;
}

export interface JobRequirement {
  subject: string;
  course_id: number;
  target_region: string;
  total_questions: number;
  target_difficulty: string;
  use_hotspot: boolean;
  question_distribution: Array<{
    question_type: string;
    count: number;
    score_per_question: number;
  }>;
}

export interface JobSummary {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'resuming';
  question_set_id: number | null;
  token_consumed: number;
  warnings: string[];
  created_at: string;
  completed_at: string | null;
  requirement: JobRequirement;
  course_id: number;
}

export interface JobDetail extends Omit<JobSummary, 'requirement'> {
  requirement: JobRequirement & Record<string, unknown>;
  progress: Record<string, unknown>;
  completed_questions_count: number;
  error_message: string | null;
  resume_count: number;
}

export interface EstimateResult {
  estimated_tokens: number;
  authorized: boolean;
  sufficient: boolean;
  monthly_quota: number | null;
  token_used: number;
  remaining: number | null;
  message: string;
}

export interface TeacherPermission {
  teacher_id: number;
  username: string;
  full_name: string;
  email: string;
  is_authorized: boolean;
  monthly_quota: number | null;
  token_used: number;
  granted_at: string | null;
  note: string | null;
}

// SSE 事件数据类型
export interface SSEEventData {
  event: string;
  data: Record<string, unknown>;
}

// LLM 调用追踪 Span
export interface TraceSpan {
  span_id: string;
  agent: string;
  model: string;
  system_prompt: string;
  user_prompt: string;
  position_index: number | null;
  attempt_index: number | null;
  output: string | null;
  error: string | null;
  status: 'running' | 'success' | 'error';
  started_at: number;
  elapsed_ms: number | null;
}

// ------------------------------------------------------------------ //
// Teacher API
// ------------------------------------------------------------------ //

export const examPaperApi = {
  /** 获取有真题记录的科目列表 */
  listSubjects: () =>
    api.get<{ subjects: string[] }>(`${BASE}/subjects`),

  /** 获取某科目的可用卷型 */
  listRegions: (subject: string) =>
    api.get<{ regions: Array<{ region: string; count: number }> }>(`${BASE}/regions`, {
      params: { subject },
    }),

  /** 配额预估 */
  estimateQuota: (totalQuestions: number, solveCount = 5) =>
    api.get<EstimateResult>(`${BASE}/estimate`, {
      params: { total_questions: totalQuestions, solve_count: solveCount },
    }),

  /** 发起组卷任务 */
  generate: (data: GenerateRequest) =>
    api.post<{ job_id: string; status: string; message: string }>(`${BASE}/generate`, data),

  /** 我的组卷任务列表 */
  listJobs: (courseId?: number) =>
    api.get<{ jobs: JobSummary[] }>(`${BASE}/jobs`, {
      params: courseId ? { course_id: courseId } : undefined,
    }),

  /** 单个任务详情 */
  getJob: (jobId: string) =>
    api.get<JobDetail>(`${BASE}/jobs/${jobId}`),

  /** 获取已完成试卷的 Markdown 内容 */
  getJobContent: (jobId: string) =>
    api.get<{ job_id: string; question_set_id: number; content: string }>(`${BASE}/jobs/${jobId}/content`),

  /** 续做失败任务 */
  resumeJob: (jobId: string) =>
    api.post<{ job_id: string; status: string }>(`${BASE}/jobs/${jobId}/resume`),

  /** 单题重生成（超时 120s：后端只做生成+质检，约 20-60s） */
  regenerateQuestion: (jobId: string, positionIndex: number, extraInstructions = '') =>
    api.post<{ position_index: number; question_type: string; question_json: Record<string, unknown>; message: string }>(
      `${BASE}/jobs/${jobId}/questions/${positionIndex}/regenerate`,
      { extra_instructions: extraInstructions },
      { timeout: 120000 },
    ),

  /** 删除组卷任务（含关联 QuestionSet） */
  deleteJob: (jobId: string) =>
    api.delete(`${BASE}/jobs/${jobId}`),

  /** 获取任务的 LLM 调用追踪日志（Trace spans） */
  getJobTrace: (jobId: string) =>
    api.get<{ job_id: string; spans: TraceSpan[] }>(`${BASE}/jobs/${jobId}/trace`),

  /** 连接 SSE 进度流（返回 EventSource） */
  connectSSE: (jobId: string, token: string): EventSource => {
    const url = `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}${BASE}/jobs/${jobId}/stream`;
    // EventSource 不支持自定义 header，通过 URL 参数传 token（后端需配合）
    // 实际部署时建议使用 cookie 或通过 query 参数 ?token=xxx
    return new EventSource(`${url}?token=${encodeURIComponent(token)}`);
  },
};

// ------------------------------------------------------------------ //
// Admin API
// ------------------------------------------------------------------ //

export interface ImportStatus {
  running: boolean;
  phase: 'idle' | 'downloading' | 'extracting' | 'importing' | 'done';
  download_progress: number;  // 0-100
  download_url: string | null;
  started_at: string | null;
  finished_at: string | null;
  total_files: number;
  processed_files: number;
  total_imported: number;
  total_skipped: number;
  current_file: string | null;
  error: string | null;
  log: string[];
  stats: Record<string, number>;
}

export interface ImportStats {
  total: number;
  by_subject: Array<{ subject: string; count: number }>;
  by_region: Array<{ region: string; count: number }>;
  year_range: { min: number | null; max: number | null };
}

export const examPaperAdminApi = {
  /** 教师授权列表 */
  listPermissions: (page = 1, pageSize = 20) =>
    api.get<{ total: number; items: TeacherPermission[] }>(`${ADMIN_BASE}/permissions`, {
      params: { page, page_size: pageSize },
    }),

  /** 授权教师 */
  grantPermission: (teacherId: number, monthlyQuota?: number | null, note?: string) =>
    api.post(`${ADMIN_BASE}/permissions/${teacherId}/grant`, {
      monthly_quota: monthlyQuota ?? null,
      note: note ?? null,
    }),

  /** 撤销授权 */
  revokePermission: (teacherId: number) =>
    api.delete(`${ADMIN_BASE}/permissions/${teacherId}/revoke`),

  /** 测试 Embedding API 是否可用（导入前预检） */
  checkEmbedding: () =>
    api.get<{ ok: boolean; message: string }>(`${ADMIN_BASE}/import/check-embedding`),

  /** 一键从 GitHub 下载并导入（自动尝试国内镜像） */
  importFromGitHub: () =>
    api.post<{ message: string }>(`${ADMIN_BASE}/import/from-github`, {
      skip_embedding: false,
    }),

  /** 从服务器本地路径导入 */
  importFromPath: (dataDir: string) =>
    api.post<{ message: string; data_dir: string }>(`${ADMIN_BASE}/import/from-path`, {
      data_dir: dataDir,
      skip_embedding: false,
    }),

  /** 上传 JSON 文件并导入 */
  importFromUpload: (files: File[]) => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    formData.append('skip_embedding', 'false');
    return api.post<{ message: string }>(`${ADMIN_BASE}/import/from-upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },

  /** 查询当前导入进度 */
  getImportStatus: () =>
    api.get<ImportStatus>(`${ADMIN_BASE}/import/status`),

  /** 查询数据库中已有真题统计 */
  getImportStats: () =>
    api.get<ImportStats>(`${ADMIN_BASE}/import/stats`),
};
