import { X, Loader2, AlertCircle } from 'lucide-react'

interface Props {
    open: boolean
    onClose: () => void
    type: 'llm' | 'embedding' | 'ocr'
    loading: boolean
    result: any | null
    error: string | null
}

const TITLES: Record<Props['type'], string> = {
    llm: 'LLM 连接测试',
    embedding: 'Embedding 连接测试',
    ocr: 'OCR 识别测试',
}

export function TestResultModal({ open, onClose, type, loading, result, error }: Props) {
    if (!open) return null

    const maxW = type === 'ocr'
        ? (result?.mode === 'ocr_plus_llm' ? 'max-w-4xl' : 'max-w-2xl')
        : 'max-w-lg'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className={`w-full ${maxW} rounded-xl border border-border bg-card shadow-xl`} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <h2 className="text-lg font-medium text-foreground">{TITLES[type]}</h2>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition">
                        <X className="size-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 className="size-8 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">正在测试连接...</p>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                            <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-red-500">连接失败</p>
                                <p className="mt-1 text-sm text-red-400 break-all">{error}</p>
                            </div>
                        </div>
                    )}

                    {result && !loading && !error && (
                        <>
                            {type === 'llm' && <LlmResult result={result} />}
                            {type === 'embedding' && <EmbeddingResult result={result} />}
                            {type === 'ocr' && <OcrResult result={result} />}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end border-t border-border px-6 py-4">
                    <button
                        onClick={onClose}
                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
    )
}

function LlmResult({ result }: { result: any }) {
    return (
        <div className="space-y-4">
            <div>
                <p className="mb-1.5 text-sm font-medium text-muted-foreground">发送内容</p>
                <div className="rounded-lg bg-muted p-3 font-mono text-sm text-foreground break-all">
                    {result.prompt || 'Hello world! Reply with \'OK\'.'}
                </div>
            </div>
            <div>
                <p className="mb-1.5 text-sm font-medium text-muted-foreground">模型回复</p>
                <div className="rounded-lg bg-muted p-3 font-mono text-sm text-foreground break-all whitespace-pre-wrap">
                    {result.message}
                </div>
            </div>
        </div>
    )
}

function EmbeddingResult({ result }: { result: any }) {
    return (
        <div className="space-y-4">
            <div>
                <p className="mb-1.5 text-sm font-medium text-muted-foreground">测试文本</p>
                <div className="rounded-lg bg-muted p-3 font-mono text-sm text-foreground break-all">
                    {result.test_text || 'Hello world!'}
                </div>
            </div>
            <div>
                <p className="mb-1.5 text-sm font-medium text-muted-foreground">返回维度</p>
                <div className="flex items-center gap-3 rounded-lg bg-muted p-4">
                    <span className="text-3xl font-medium text-primary">{result.dimensions_returned}</span>
                    <span className="text-sm text-muted-foreground">dimensions</span>
                </div>
            </div>
        </div>
    )
}

function OcrResult({ result }: { result: any }) {
    if (result.mode === 'ocr_plus_llm') {
        return (
            <div className="grid grid-cols-3 gap-4">
                <div>
                    <p className="mb-1.5 text-sm font-medium text-muted-foreground">测试图片</p>
                    <div className="rounded-lg border border-border bg-muted p-2">
                        {result.image_base64 ? (
                            <img
                                src={`data:image/png;base64,${result.image_base64}`}
                                alt="OCR test"
                                className="w-full rounded object-contain"
                            />
                        ) : (
                            <p className="py-8 text-center text-sm text-muted-foreground">图片未返回</p>
                        )}
                    </div>
                </div>
                <div>
                    <p className="mb-1.5 text-sm font-medium text-muted-foreground">Step 1 原始文字</p>
                    <div className="rounded-lg bg-muted p-3 font-mono text-sm text-foreground whitespace-pre-wrap break-all min-h-[120px] max-h-[400px] overflow-y-auto">
                        {result.raw_ocr_text || '（无输出）'}
                    </div>
                </div>
                <div>
                    <p className="mb-1.5 text-sm font-medium text-muted-foreground">Step 2 结构化结果</p>
                    <div className="rounded-lg bg-muted p-3 font-mono text-sm text-foreground whitespace-pre-wrap break-all min-h-[120px] max-h-[400px] overflow-y-auto">
                        {result.message}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-2 gap-4">
            <div>
                <p className="mb-1.5 text-sm font-medium text-muted-foreground">测试图片</p>
                <div className="rounded-lg border border-border bg-muted p-2">
                    {result.image_base64 ? (
                        <img
                            src={`data:image/png;base64,${result.image_base64}`}
                            alt="OCR test"
                            className="w-full rounded object-contain"
                        />
                    ) : (
                        <p className="py-8 text-center text-sm text-muted-foreground">图片未返回</p>
                    )}
                </div>
            </div>
            <div>
                <p className="mb-1.5 text-sm font-medium text-muted-foreground">识别结果</p>
                <div className="rounded-lg bg-muted p-3 font-mono text-sm text-foreground whitespace-pre-wrap break-all min-h-[120px]">
                    {result.message}
                </div>
            </div>
        </div>
    )
}
