/** 统一的题目 JSON 数据类型，前后端共用 */

export interface QuestionOption {
  key: string;
  value: string;
}

export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'fill_blank'
  | 'short_answer';

export interface ParsedQuestion {
  number: number;
  type: QuestionType;
  content: string;
  options: QuestionOption[] | null;
  answer: string;
  explanation: string;
  scoring_points: string | null;
  /** 仅高考组卷题目有此字段 */
  difficulty_coefficient?: number | null;
}

export interface QuestionSetData {
  title: string;
  questions: ParsedQuestion[];
  /** 以下字段仅高考组卷试卷有 */
  subject?: string;
  target_region?: string;
  target_difficulty?: string;
  difficulty_label?: string;
  avg_difficulty_coefficient?: number;
  total?: number;
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  fill_blank: '填空题',
  short_answer: '简答题',
};

/** 解析 JSON 字符串为 QuestionSetData，抛出异常则上层处理 */
export function parseQuestionSetData(jsonContent: string): QuestionSetData {
  const data = JSON.parse(jsonContent) as QuestionSetData;
  if (!Array.isArray(data.questions)) {
    throw new Error('questions 字段缺失或格式错误');
  }
  return data;
}
