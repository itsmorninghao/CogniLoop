import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownWithLatexProps {
  children: string;
  className?: string;
  /** 使用精简样式（适合题目内容、选项等小段文字） */
  compact?: boolean;
  /** 使用试卷全文样式（适合完整试卷预览） */
  paperStyle?: boolean;
}

const PAPER_COMPONENTS = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-xl font-bold text-center pb-3 mb-4 border-b-2 border-border">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-sm font-bold mt-6 mb-2 flex items-center gap-2 text-primary">
      <span className="inline-block w-1 h-4 bg-primary rounded-sm shrink-0" />
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/60 rounded px-3 py-1.5 mt-6 mb-3 inline-block">
      {children}
    </h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed mb-1.5 text-foreground">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-4 border-amber-400 bg-amber-50/60 dark:bg-amber-900/20 pl-3 py-2 my-3 text-xs text-amber-800 dark:text-amber-300 rounded-r">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border/50" />,
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc pl-4 my-1 space-y-0.5 text-sm">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal pl-4 my-1 space-y-0.5 text-sm">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-sm leading-relaxed">{children}</li>
  ),
};

const COMPACT_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <span className="leading-relaxed">{children}</span>
  ),
  // 行内公式和块级公式都保持正常渲染，不额外包裹
};

export function MarkdownWithLatex({
  children,
  className,
  compact = false,
  paperStyle = false,
}: MarkdownWithLatexProps) {
  const components = paperStyle
    ? PAPER_COMPONENTS
    : compact
    ? COMPACT_COMPONENTS
    : undefined;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={components as never}
      className={className}
    >
      {children}
    </ReactMarkdown>
  );
}
