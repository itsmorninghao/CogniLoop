/**
 * OcrScanner — core multi-file, multi-round OCR scanning engine.
 * Supports selecting multiple files, sequential SSE processing, and cross-round accumulation.
 */

import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Upload, Loader2, AlertTriangle, Plus, Check, X } from 'lucide-react'
import type { OcrQuestion, SlotDraft } from './types'
import { buildSlotsFromQuestions } from './buildSlots'

interface OcrScannerProps {
    onScanComplete: (slots: SlotDraft[]) => void
    onCancel?: () => void
}

export default function OcrScanner({ onScanComplete, onCancel }: OcrScannerProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const abortRef = useRef<AbortController | null>(null)

    const [scanning, setScanning] = useState(false)
    const [allQuestions, setAllQuestions] = useState<OcrQuestion[]>([])

    // File-level progress
    const [currentFileIdx, setCurrentFileIdx] = useState(0)
    const [totalFiles, setTotalFiles] = useState(0)
    const [currentFileName, setCurrentFileName] = useState('')

    // Page-level progress (within current file)
    const [currentPage, setCurrentPage] = useState(0)
    const [totalPages, setTotalPages] = useState(0)

    const [batchComplete, setBatchComplete] = useState(false)
    const [missingCount, setMissingCount] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const scanSingleFile = useCallback(async (file: File, signal: AbortSignal): Promise<OcrQuestion[]> => {
        const form = new FormData()
        form.append('file', file)

        const token = localStorage.getItem('token')
        const res = await fetch('/api/v2/exam-templates/ocr-scan', {
            method: 'POST',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            body: form,
            signal,
        })

        if (!res.ok) {
            const body = await res.json().catch(() => ({ detail: '扫描失败' }))
            throw new Error(body.detail || '扫描失败')
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error('无法读取响应流')

        const decoder = new TextDecoder()
        let buffer = ''
        const fileQuestions: OcrQuestion[] = []

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
                        if (data.questions?.length > 0) {
                            fileQuestions.push(...data.questions)
                        }
                        if (data.error) {
                            toast.error(`第 ${data.page} 页识别出错: ${data.error}`)
                        }
                    } else if (data.type === 'scan_complete') {
                        setMissingCount(prev => prev + (data.missing_count || 0))
                    } else if (data.type === 'error') {
                        throw new Error(data.message || '扫描失败')
                    }
                } catch (e) {
                    if (e instanceof Error && e.message !== '扫描失败') {
                        // skip malformed JSON lines, but re-throw real errors
                        if (e.message.includes('识别') || e.message.includes('扫描')) throw e
                    } else {
                        throw e
                    }
                }
            }
        }

        return fileQuestions
    }, [])

    const processFiles = useCallback(async (files: File[]) => {
        setScanning(true)
        setBatchComplete(false)
        setError(null)
        setTotalFiles(files.length)
        setMissingCount(0)

        const controller = new AbortController()
        abortRef.current = controller

        try {
            for (let i = 0; i < files.length; i++) {
                if (controller.signal.aborted) break

                setCurrentFileIdx(i + 1)
                setCurrentFileName(files[i].name)
                setCurrentPage(0)
                setTotalPages(0)

                const fileQuestions = await scanSingleFile(files[i], controller.signal)
                setAllQuestions(prev => [...prev, ...fileQuestions])
            }
            setBatchComplete(true)
        } catch (err: unknown) {
            if ((err as Error).name === 'AbortError') return
            setError(err instanceof Error ? err.message : '扫描失败')
        } finally {
            setScanning(false)
            abortRef.current = null
        }
    }, [scanSingleFile])

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files
        if (!fileList || fileList.length === 0) return

        const validFiles: File[] = []
        for (let i = 0; i < fileList.length; i++) {
            const f = fileList[i]
            if (!f.type.startsWith('image/') && f.type !== 'application/pdf') {
                toast.error(`跳过不支持的文件: ${f.name}`)
                continue
            }
            if (f.size > 20 * 1024 * 1024) {
                toast.error(`文件过大 (>20MB): ${f.name}`)
                continue
            }
            validFiles.push(f)
        }

        // Reset file input so same files can be re-selected
        e.target.value = ''

        if (validFiles.length === 0) return
        processFiles(validFiles)
    }, [processFiles])

    const handleContinueScan = useCallback(() => {
        setBatchComplete(false)
        fileInputRef.current?.click()
    }, [])

    const handleFinish = useCallback(() => {
        const slots = buildSlotsFromQuestions(allQuestions)
        onScanComplete(slots)
    }, [allQuestions, onScanComplete])

    const handleCancel = useCallback(() => {
        abortRef.current?.abort()
        onCancel?.()
    }, [onCancel])

    const hasStarted = allQuestions.length > 0 || scanning || error
    const pageProgress = totalPages > 0 ? currentPage / totalPages : 0

    return (
        <div className="space-y-4">
            {/* Upload area — shown when idle (no scan started or between rounds) */}
            {!scanning && !hasStarted && (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                    <Upload className="size-12 text-muted-foreground mb-4" />
                    <p className="text-sm font-medium text-foreground">点击选择试卷文件</p>
                    <p className="text-xs text-muted-foreground mt-1">支持多选图片（JPG/PNG）和 PDF 格式，最大 20MB</p>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={handleFileSelect}
                className="hidden"
            />

            {/* Progress & results */}
            {hasStarted && (
                <div className="space-y-4">
                    {/* Progress bar */}
                    <div>
                        <div className="flex items-center justify-between text-sm mb-2">
                            <span className="text-muted-foreground">
                                {scanning ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="size-4 animate-spin text-primary" />
                                        <span>
                                            文件 {currentFileIdx}/{totalFiles}
                                            {currentFileName && <span className="text-xs ml-1 opacity-70">({currentFileName})</span>}
                                            {totalPages > 0 && <span className="ml-2">- 第 {currentPage}/{totalPages} 页</span>}
                                        </span>
                                    </span>
                                ) : batchComplete ? (
                                    `扫描完成，累计 ${allQuestions.length} 道题目`
                                ) : error ? (
                                    '扫描出错'
                                ) : '准备中...'}
                            </span>
                            {missingCount > 0 && !scanning && (
                                <span className="flex items-center gap-1 text-amber-500 text-xs">
                                    <AlertTriangle className="size-3" />
                                    {missingCount} 道题目有缺失字段
                                </span>
                            )}
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500"
                                style={{
                                    width: scanning
                                        ? `${Math.round(((currentFileIdx - 1 + pageProgress) / totalFiles) * 100)}%`
                                        : batchComplete ? '100%' : '0%',
                                }}
                            />
                        </div>
                    </div>

                    {/* Question cards */}
                    {allQuestions.length > 0 && (
                        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                            {allQuestions.map((q, idx) => {
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
                    )}

                    {/* Error */}
                    {error && (
                        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-600 dark:text-red-400">
                            {error}
                        </div>
                    )}
                </div>
            )}

            {/* Action buttons */}
            {(batchComplete || error) && (
                <div className="flex items-center gap-3 pt-2">
                    <button
                        onClick={handleContinueScan}
                        className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                    >
                        <Plus className="size-4" />
                        继续扫描
                    </button>
                    {allQuestions.length > 0 && (
                        <button
                            onClick={handleFinish}
                            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 flex-1 justify-center"
                        >
                            <Check className="size-4" />
                            完成 ({allQuestions.length} 题)
                        </button>
                    )}
                </div>
            )}

            {/* Cancel while scanning */}
            {scanning && (
                <div className="flex justify-end pt-2">
                    <button
                        onClick={handleCancel}
                        className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
                    >
                        <X className="size-4" />
                        取消扫描
                    </button>
                </div>
            )}
        </div>
    )
}
