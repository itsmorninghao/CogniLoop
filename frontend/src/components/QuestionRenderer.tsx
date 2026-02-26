/**
 * QuestionRenderer —— 用 JSON 数据驱动渲染单道题目（含选项、答案、解析）
 * 所有文本内容通过 MarkdownWithLatex 渲染，支持 LaTeX 公式。
 */
import { MarkdownWithLatex } from '@/components/MarkdownWithLatex';
import { Badge } from '@/components/ui/badge';
import { type ParsedQuestion, QUESTION_TYPE_LABELS } from '@/types/question';

interface QuestionRendererProps {
  question: ParsedQuestion;
  /** 是否展示答案与解析 */
  showAnswers?: boolean;
  /** 题目序号，不传则用 question.number */
  index?: number;
  /** 紧凑模式（用于列表预览） */
  compact?: boolean;
}

export function QuestionRenderer({
  question,
  showAnswers = false,
  index,
  compact = false,
}: QuestionRendererProps) {
  const num = index ?? question.number;
  const typeLabel = QUESTION_TYPE_LABELS[question.type] ?? question.type;

  const headerClass = compact
    ? 'text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/60 rounded px-2 py-1 inline-block'
    : 'text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/60 rounded px-3 py-1.5 inline-block';

  const contentClass = compact ? 'text-sm leading-relaxed mt-2' : 'text-base leading-relaxed mt-3';

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {/* 题型标签 + 编号 */}
      <div className="flex items-center gap-2">
        <span className={headerClass}>{typeLabel}</span>
        <span className="text-xs text-muted-foreground">第 {num} 题</span>
        {question.difficulty_coefficient != null && (
          <Badge variant="outline" className="text-xs">
            难度 {question.difficulty_coefficient.toFixed(2)}
          </Badge>
        )}
      </div>

      {/* 题目内容 */}
      <div className={contentClass}>
        <MarkdownWithLatex compact>{question.content}</MarkdownWithLatex>
      </div>

      {/* 选项（选择题） */}
      {question.options && question.options.length > 0 && (
        <div className={compact ? 'space-y-1 pl-2' : 'space-y-1.5 pl-3'}>
          {question.options.map((opt) => (
            <div key={opt.key} className="flex items-start gap-2 text-sm">
              <span className="font-medium shrink-0 text-muted-foreground w-5">{opt.key}.</span>
              <span className="flex-1">
                <MarkdownWithLatex compact>{opt.value}</MarkdownWithLatex>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 答案与解析 */}
      {showAnswers && (
        <div className={compact ? 'space-y-1.5 pt-1' : 'space-y-2 pt-2 border-t border-border/50'}>
          <div className="flex items-start gap-2">
            <span className="text-xs font-medium text-primary shrink-0">答案：</span>
            <span className="text-sm font-semibold text-primary">
              <MarkdownWithLatex compact>{question.answer || '—'}</MarkdownWithLatex>
            </span>
          </div>
          {question.explanation && (
            <div className="flex items-start gap-2">
              <span className="text-xs font-medium text-muted-foreground shrink-0">解析：</span>
              <span className="text-sm text-muted-foreground">
                <MarkdownWithLatex compact>{question.explanation}</MarkdownWithLatex>
              </span>
            </div>
          )}
          {question.scoring_points && (
            <div className="flex items-start gap-2">
              <span className="text-xs font-medium text-amber-600 shrink-0">评分要点：</span>
              <span className="text-sm text-amber-700">
                <MarkdownWithLatex compact>{question.scoring_points}</MarkdownWithLatex>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 分组渲染整套试卷（按题型分组，带章节标题） */
interface PaperViewerProps {
  data: {
    title: string;
    questions: ParsedQuestion[];
    subject?: string;
    target_region?: string;
    difficulty_label?: string;
    avg_difficulty_coefficient?: number;
  };
  showAnswers?: boolean;
}

const TYPE_ORDER: string[] = [
  'single_choice',
  'multiple_choice',
  'fill_blank',
  'short_answer',
];

export function PaperViewer({ data, showAnswers = true }: PaperViewerProps) {
  const { title, questions, subject, target_region, difficulty_label, avg_difficulty_coefficient } = data;

  // 按题型分组，保持原始顺序
  const groups: Map<string, ParsedQuestion[]> = new Map();
  for (const q of questions) {
    if (!groups.has(q.type)) groups.set(q.type, []);
    groups.get(q.type)!.push(q);
  }

  // 排序题型
  const sortedTypes = [...groups.keys()].sort(
    (a, b) => (TYPE_ORDER.indexOf(a) ?? 99) - (TYPE_ORDER.indexOf(b) ?? 99)
  );

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="text-center border-b-2 border-border pb-4">
        <h1 className="text-xl font-bold">{title}</h1>
        {(subject || target_region || difficulty_label) && (
          <p className="text-sm text-muted-foreground mt-1">
            {[subject, target_region, difficulty_label && `难度：${difficulty_label}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {avg_difficulty_coefficient != null && (
          <p className="text-xs text-muted-foreground mt-0.5">
            平均难度系数：{avg_difficulty_coefficient.toFixed(3)}
          </p>
        )}
      </div>

      {/* 按题型分组 */}
      {sortedTypes.map((type) => {
        const qs = groups.get(type)!;
        const label = QUESTION_TYPE_LABELS[type as keyof typeof QUESTION_TYPE_LABELS] ?? type;
        return (
          <div key={type} className="space-y-4">
            <h2 className="text-sm font-bold flex items-center gap-2 text-primary">
              <span className="inline-block w-1 h-4 bg-primary rounded-sm shrink-0" />
              {label}
            </h2>
            {qs.map((q) => (
              <div key={q.number} className="border rounded-lg p-4">
                <QuestionRenderer question={q} showAnswers={showAnswers} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
