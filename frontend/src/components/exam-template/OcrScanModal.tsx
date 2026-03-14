/**
 * OcrScanModal — upload exam paper image/PDF, stream OCR results.
 */

import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Upload, Loader2, FileText, AlertTriangle, ArrowRight, X } from 'lucide-react'

interface OcrQuestion {
    position?: number
    question_type?: string
    content?: string
    answer?: string
}

interface OcrScanModalProps {
    open: boolean
    onClose: () => void
}

export default function OcrScanModal({ open, onClose }: OcrScanModalProps) {
    const navigate = useNavigate()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [scanning, setScanning] = useState(false)
    const [currentPage, setCurrentPage] = useState(0)
    const [totalPages, setTotalPages] = useState(0)
    const [questions, setQuestions] = useState<OcrQuestion[]>([])
    const [scanComplete, setScanComplete] = useState(false)
    const [missingCount, setMissingCount] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            toast.error('仅支持图片或 PDF 文件')
            return
        }
        if (file.size > 20 * 1024 * 1024) {
            toast.error('文件大小不能超过 20MB')
            return
        }

        setScanning(true)
        setCurrentPage(0)
        setTotalPages(0)
        setQuestions([])
        setScanComplete(false)
        setMissingCount(0)
        setError(null)

        // Upload and stream SSE
        const form = new FormData()
        form.append('file', file)

        const token = localStorage.getItem('token')
        try {
            const res = await fetch('/api/v2/exam-templates/ocr-scan', {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                body: form,
            })

            if (!res.ok) {
                const body = await res.json().catch(() => ({ detail: '扫描失败' }))
                throw new Error(body.detail || '扫描失败')
            }

            const reader = res.body?.getReader()
            if (!reader) throw new Error('无法读取响应流')

            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue
                    try {
                        const data = JSON.parse(line.slice(6))

                        if (data.type === 'page_start') {
                            setCurrentPage(data.page)
                            setTotalPages(data.total_pages)
                        } else if (data.type === 'page_complete') {
                            if (data.questions && data.questions.length > 0) {
                                setQuestions(prev => [...prev, ...data.questions])
                            }
                            if (data.error) {
                                toast.error(`第 ${data.page} 页识别出错: ${data.error}`)
                            }
                        } else if (data.type === 'scan_complete') {
                            setScanComplete(true)
                            setMissingCount(data.missing_count || 0)
                        } else if (data.type === 'error') {
                            setError(data.message || '扫描失败')
                        }
                    } catch { /* skip malformed lines */ }
                }
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '扫描失败')
        } finally {
            setScanning(false)
        }
    }, [])

    const handleEnterEditor = useCallback(() => {
        // Build slots from scanned questions, grouped by position
        const slotMap = new Map<number, { position: number; question_type: string; questions: OcrQuestion[] }>()
        for (const q of questions) {
            const pos = q.position || (slotMap.size + 1)
            const existing = slotMap.get(pos)
            if (existing) {
                existing.questions.push(q)
            } else {
                slotMap.set(pos, {
                    position: pos,
                    question_type: q.question_type || 'short_answer',
                    questions: [q],
                })
            }
        }

        const slots = Array.from(slotMap.values())
            .sort((a, b) => a.position - b.position)
            .map(s => ({
                position: s.position,
                question_type: s.question_type,
                label: '',
                difficulty_hint: '',
                questions: s.questions.map(q => ({
                    content: q.content || '',
                    answer: q.answer || '',
                    analysis: '',
                    difficulty: 'medium',
                    knowledge_points: [] as string[],
                    source_label: '',
                })),
            }))

        // Navigate to editor with pre-filled data via state
        navigate('/exam-templates/new', { state: { ocrSlots: slots } })
        onClose()
    }, [questions, navigate, onClose])

    if (!open) return null

    const progress = totalPages > 0 ? currentPage / totalPages : 0

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
            <div className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-foreground">扫描试卷导入</h2>
                    <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent transition-colors">
                        <X className="size-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {!scanning && !scanComplete && !error && questions.length === 0 && (
                        /* Upload area */
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                        >
                            <Upload className="size-12 text-muted-foreground mb-4" />
                            <p className="text-sm font-medium text-foreground">点击选择试卷文件</p>
                            <p className="text-xs text-muted-foreground mt-1">支持图片（JPG/PNG）和 PDF 格式，最大 20MB</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                        </div>
                    )}

                    {/* Progress */}
                    {(scanning || questions.length > 0) && (
                        <div className="space-y-4">
                            {/* Progress bar */}
                            <div>
                                <div className="flex items-center justify-between text-sm mb-2">
                                    <span className="text-muted-foreground">
                                        {scanning ? (
                                            <span className="flex items-center gap-2">
                                                <Loader2 className="size-4 animate-spin text-primary" />
                                                正在识别第 {currentPage} 页 / 共 {totalPages} 页
                                            </span>
                                        ) : scanComplete ? (
                                            `识别完成，共 ${questions.length} 道题目`
                                        ) : '准备中...'}
                                    </span>
                                    {missingCount > 0 && scanComplete && (
                                        <span className="flex items-center gap-1 text-amber-500 text-xs">
                                            <AlertTriangle className="size-3" />
                                            {missingCount} 道题目有缺失字段
                                        </span>
                                    )}
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500"
                                        style={{ width: `${scanComplete ? 100 : Math.round(progress * 100)}%` }}
                                    />
                                </div>
                            </div>

                            {/* Question cards */}
                            <div className="space-y-2">
                                {questions.map((q, idx) => {
                                    const isMissing = !q.content || !q.position
                                    return (
                                        <div
                                            key={idx}
                                            className={`rounded-lg border p-3 text-sm ${isMissing ? 'border-red-400 bg-red-50 dark:bg-red-950/20' : 'border-border bg-muted/30'}`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    [{q.position || '?'}]
                                                </span>
                                                <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                                    {q.question_type || '未识别'}
                                                </span>
                                                {q.answer && (
                                                    <span className="text-xs text-muted-foreground">答案: {q.answer}</span>
                                                )}
                                                {isMissing && (
                                                    <span className="text-xs text-red-500 font-medium">待填写</span>
                                                )}
                                            </div>
                                            <p className="text-foreground line-clamp-2">{q.content || '[内容缺失]'}</p>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-600 dark:text-red-400">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {scanComplete && questions.length > 0 && (
                    <div className="px-6 py-4 border-t border-border bg-muted/30">
                        <button
                            onClick={handleEnterEditor}
                            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 w-full justify-center"
                        >
                            <FileText className="size-4" />
                            进入编辑器
                            <ArrowRight className="size-4" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
