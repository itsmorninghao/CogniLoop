import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

interface MathTextProps {
    children: string | null | undefined
    className?: string
    inline?: boolean
}

export function MathText({ children, className, inline = false }: MathTextProps) {
    if (!children) return null

    const content = (
        <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
                p: ({ children }) => <span className="leading-relaxed">{children}</span>,
            }}
        >
            {children}
        </ReactMarkdown>
    )

    return inline
        ? <span className={className}>{content}</span>
        : <div className={className}>{content}</div>
}
