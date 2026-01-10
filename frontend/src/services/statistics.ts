import api from './api';

// 类型定义
export interface CourseOverview {
  course_id: number;
  course_name: string;
  student_count: number;
  document_count: number;
  question_set_count: number;
}

export interface QuestionSetStatistics {
  question_set_id: number;
  title: string;
  total_assigned: number;
  completed_count: number;
  completion_rate: number;
  average_score: number | null;
  failed_count: number;
  failed_reasons: string[];
}

export interface StudentInfo {
  id: number;
  username: string;
  email: string;
  full_name: string;
  joined_at: string;
  is_active: boolean;
}

export interface StudentStatistics {
  total_courses: number;
  total_question_sets: number;
  completed_count: number;
  average_score: number | null;
}

// 趋势统计类型
export interface DailySubmission {
  date: string;
  count: number;
}

export interface SubmissionTrend {
  data: DailySubmission[];
  total: number;
}

export interface QuestionSetCompletion {
  id: number;
  title: string;
  total_assigned: number;
  completed_count: number;
  completion_rate: number;
  average_score: number | null;
}

export interface QuestionSetCompletionList {
  items: QuestionSetCompletion[];
}

export interface DailyScore {
  date: string;
  score: number | null;
  count: number;
}

export interface ScoreTrend {
  data: DailyScore[];
}

// 统计 API
export const statisticsApi = {
  // 课程概览
  courseOverview: (courseId: number) =>
    api.get<CourseOverview>(`/statistics/course/${courseId}/overview`),

  // 试题集统计
  questionSetStats: (questionSetId: number) =>
    api.get<QuestionSetStatistics>(`/statistics/question-set/${questionSetId}`),

  // 课程学生列表
  courseStudents: (courseId: number) =>
    api.get<StudentInfo[]>(`/statistics/course/${courseId}/students`),

  // 学生个人统计
  myStatistics: () =>
    api.get<StudentStatistics>('/statistics/my-statistics'),

  // 答题提交趋势
  submissionTrend: (courseId: number, days: number = 7) =>
    api.get<SubmissionTrend>(`/statistics/course/${courseId}/submission-trend`, {
      params: { days },
    }),

  // 试题集完成情况
  questionSetCompletion: (courseId: number) =>
    api.get<QuestionSetCompletionList>(`/statistics/course/${courseId}/question-set-completion`),

  // 平均分趋势
  scoreTrend: (courseId: number, days: number = 7) =>
    api.get<ScoreTrend>(`/statistics/course/${courseId}/score-trend`, {
      params: { days },
    }),
};

