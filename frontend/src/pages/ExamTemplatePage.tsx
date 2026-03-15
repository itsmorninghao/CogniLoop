/**
 * ExamTemplatePage — manage exam templates for Pro mode.
 */

import { useState, useRef } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Plus, FileText, Trash2, Globe, GlobeLock, Loader2, ScanLine, PenTool, Download, Upload, CheckSquare, X } from 'lucide-react'
import { examTemplateApi, type ExamTemplateListItem } from '@/lib/api'
import OcrScanModal from '@/components/exam-template/OcrScanModal'
import { useAsync } from '@/hooks/useAsync'

export default function ExamTemplatePage() {
    const navigate = useNavigate()
    const { data: templatesRaw, loading, refetch: refetchTemplates } = useAsync(() => examTemplateApi.list(), [])
    const templates = templatesRaw ?? []
    const [deleting, setDeleting] = useState<number | null>(null)
    const [showCreateChoice, setShowCreateChoice] = useState(false)
    const [showOcrModal, setShowOcrModal] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
    const [selectMode, setSelectMode] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [importing, setImporting] = useState(false)
    const [batchDeleting, setBatchDeleting] = useState(false)
    const importFileRef = useRef<HTMLInputElement>(null)

    const handleDelete = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm('确定删除此模板？')) return
        setDeleting(id)
        try {
            await examTemplateApi.delete(id)
            refetchTemplates()
            toast.success('模板已删除')
        } catch {
            toast.error('删除失败')
        } finally {
            setDeleting(null)
        }
    }

    const handleTogglePublish = async (t: ExamTemplateListItem, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            if (t.is_public) {
                await examTemplateApi.unpublish(t.id)
                toast.success('已从广场下架')
            } else {
                await examTemplateApi.publish(t.id)
                toast.success('已发布到广场')
            }
            refetchTemplates()
        } catch {
            toast.error('操作失败')
        }
    }

    const enterSelectMode = () => {
        setSelectedIds(new Set())
        setSelectMode(true)
    }

    const exitSelectMode = () => {
        setSelectedIds(new Set())
        setSelectMode(false)
    }

    const toggleSelect = (id: number, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === templates.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(templates.map(t => t.id)))
        }
    }

    const handleExport = async () => {
        if (selectedIds.size === 0) return
        setExporting(true)
        try {
            const fullTemplates = await Promise.all(
                Array.from(selectedIds).map(id => examTemplateApi.get(id))
            )
            const exportData = fullTemplates.map(t => ({
                name: t.name,
                description: t.description,
                subject: t.subject,
                slots: t.slots
                    .sort((a, b) => a.position - b.position)
                    .map(s => ({
                        position: s.position,
                        question_type: s.question_type,
                        label: s.label,
                        difficulty_hint: s.difficulty_hint,
                        questions: s.questions.map(q => ({
                            content: q.content,
                            answer: q.answer,
                            analysis: q.analysis,
                            difficulty: q.difficulty,
                            knowledge_points: q.knowledge_points,
                            source_label: q.source_label,
                        })),
                    })),
            }))
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `exam-templates-${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(url)
            toast.success(`已导出 ${fullTemplates.length} 个模板`)
        } catch {
            toast.error('导出失败')
        } finally {
            setExporting(false)
        }
    }

    const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ''
        setImporting(true)
        try {
            const text = await file.text()
            const data = JSON.parse(text)
            if (!Array.isArray(data)) throw new Error('JSON 格式错误：必须是数组')
            for (const item of data) {
                if (!item.name || !item.slots) throw new Error(`模板缺少 name 或 slots 字段`)
            }
            let created = 0
            for (const item of data) {
                await examTemplateApi.create({
                    name: item.name,
                    description: item.description || undefined,
                    subject: item.subject || undefined,
                    slots: item.slots,
                })
                created++
            }
            toast.success(`成功导入 ${created} 个模板`)
            refetchTemplates()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '导入失败')
        } finally {
            setImporting(false)
        }
    }

    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return
        if (!confirm(`确定删除选中的 ${selectedIds.size} 个模板？此操作不可撤销。`)) return
        setBatchDeleting(true)
        try {
            await Promise.all(Array.from(selectedIds).map(id => examTemplateApi.delete(id)))
            toast.success(`已删除 ${selectedIds.size} 个模板`)
            refetchTemplates()
        } catch {
            toast.error('部分模板删除失败')
            refetchTemplates()
        } finally {
            setBatchDeleting(false)
        }
    }

    const handleCreate = () => {
        setShowCreateChoice(true)
    }

    return (
        <div className="container mx-auto space-y-6 p-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">试卷模板</h1>
                    <p className="mt-1 text-sm text-muted-foreground">管理您的试卷结构模板，用于 Pro 模式出题</p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        ref={importFileRef}
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleImportFileSelect}
                    />
                    {!selectMode ? (
                        <>
                            <button
                                onClick={() => importFileRef.current?.click()}
                                disabled={importing}
                                className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                            >
                                {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                                导入 JSON
                            </button>
                            {templates.length > 0 && (
                                <button
                                    onClick={enterSelectMode}
                                    className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                                >
                                    <CheckSquare className="size-4" />
                                    选择
                                </button>
                            )}
                            <button
                                onClick={handleCreate}
                                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                            >
                                <Plus className="size-4" />
                                新建模板
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={exitSelectMode}
                            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                        >
                            <X className="size-4" />
                            取消选择
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex h-40 items-center justify-center">
                    <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
            ) : templates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
                    <FileText className="mx-auto size-10 text-muted-foreground mb-3" />
                    <p className="text-sm font-medium text-foreground">暂无试卷模板</p>
                    <p className="mt-1 text-sm text-muted-foreground">创建您的第一个试卷模板，捕获真实考试结构</p>
                    <button
                        onClick={handleCreate}
                        className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                    >
                        新建模板
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {selectMode && (
                        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm animate-fade-in">
                            <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-foreground">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.size === templates.length && templates.length > 0}
                                    onChange={toggleSelectAll}
                                    className="size-4 rounded border-border accent-primary"
                                />
                                全选
                            </label>
                            <span className="text-muted-foreground">
                                已选 {selectedIds.size} / {templates.length} 项
                            </span>
                            <div className="flex-1" />
                            <button
                                onClick={handleExport}
                                disabled={exporting || selectedIds.size === 0}
                                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                                导出 JSON
                            </button>
                            <button
                                onClick={handleBatchDelete}
                                disabled={batchDeleting || selectedIds.size === 0}
                                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-card px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {batchDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                                批量删除
                            </button>
                        </div>
                    )}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {templates.map(t => (
                        <div
                            key={t.id}
                            onClick={(e) => {
                                if (selectMode) { toggleSelect(t.id, e); return }
                                navigate(`/exam-templates/${t.id}`)
                            }}
                            className={`group cursor-pointer rounded-xl border bg-card p-5 transition-all hover:shadow-lg hover:-translate-y-0.5 ${
                                selectMode && selectedIds.has(t.id)
                                    ? 'border-primary/50 ring-2 ring-primary/20'
                                    : 'border-border'
                            }`}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-start gap-3">
                                    {selectMode && (
                                        <div className="relative mt-1 shrink-0">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(t.id)}
                                                onChange={() => {}}
                                                className="size-4 rounded border-border accent-primary cursor-pointer"
                                            />
                                        </div>
                                    )}
                                    <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 shrink-0">
                                        <FileText className="size-5 text-white" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-foreground">{t.name}</h4>
                                        {t.subject && (
                                            <p className="text-xs text-muted-foreground mt-0.5">{t.subject}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {t.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{t.description}</p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                                <span>{t.slot_count} 题位</span>
                                <span>{t.question_count} 道真题</span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                                <span>{new Date(t.created_at).toLocaleDateString('zh-CN')}</span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={(e) => handleTogglePublish(t, e)}
                                        className="p-1.5 rounded-md hover:bg-accent transition-colors"
                                        title={t.is_public ? '从广场下架' : '发布到广场'}
                                    >
                                        {t.is_public ? <Globe className="size-3.5 text-emerald-500" /> : <GlobeLock className="size-3.5" />}
                                    </button>
                                    <button
                                        onClick={(e) => handleDelete(t.id, e)}
                                        disabled={deleting === t.id}
                                        className="p-1.5 rounded-md hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-500 disabled:opacity-50"
                                    >
                                        {deleting === t.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    </div>
                </div>
            )}

            {showCreateChoice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
                        <h3 className="text-lg font-semibold text-foreground mb-4">新建模板</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => { setShowCreateChoice(false); navigate('/exam-templates/new') }}
                                className="flex flex-col items-center gap-3 rounded-xl border border-border p-6 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                            >
                                <PenTool className="size-8 text-primary" />
                                <div className="text-center">
                                    <p className="text-sm font-medium text-foreground">手动创建</p>
                                    <p className="text-xs text-muted-foreground mt-1">逐题填写</p>
                                </div>
                            </button>
                            <button
                                onClick={() => { setShowCreateChoice(false); setShowOcrModal(true) }}
                                className="flex flex-col items-center gap-3 rounded-xl border border-border p-6 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                            >
                                <ScanLine className="size-8 text-primary" />
                                <div className="text-center">
                                    <p className="text-sm font-medium text-foreground">扫描试卷导入</p>
                                    <p className="text-xs text-muted-foreground mt-1">上传图片或 PDF</p>
                                </div>
                            </button>
                        </div>
                        <button
                            onClick={() => setShowCreateChoice(false)}
                            className="mt-4 w-full rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
                        >
                            取消
                        </button>
                    </div>
                </div>
            )}

            <OcrScanModal open={showOcrModal} onClose={() => setShowOcrModal(false)} />
        </div>
    )
}
