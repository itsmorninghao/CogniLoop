/**
 * ExamTemplatePage — manage exam templates for Pro mode.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Plus, FileText, Trash2, Globe, GlobeLock, Loader2, ScanLine, PenTool } from 'lucide-react'
import { examTemplateApi, type ExamTemplateListItem } from '@/lib/api'
import OcrScanModal from '@/components/exam-template/OcrScanModal'

export default function ExamTemplatePage() {
    const navigate = useNavigate()
    const [templates, setTemplates] = useState<ExamTemplateListItem[]>([])
    const [loading, setLoading] = useState(true)
    const [deleting, setDeleting] = useState<number | null>(null)
    const [showCreateChoice, setShowCreateChoice] = useState(false)
    const [showOcrModal, setShowOcrModal] = useState(false)

    useEffect(() => {
        loadTemplates()
    }, [])

    const loadTemplates = async () => {
        try {
            setLoading(true)
            const data = await examTemplateApi.list()
            setTemplates(data)
        } catch {
            toast.error('加载模板列表失败')
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm('确定删除此模板？')) return
        setDeleting(id)
        try {
            await examTemplateApi.delete(id)
            setTemplates(prev => prev.filter(t => t.id !== id))
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
            loadTemplates()
        } catch {
            toast.error('操作失败')
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
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                >
                    <Plus className="size-4" />
                    新建模板
                </button>
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
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {templates.map(t => (
                        <div
                            key={t.id}
                            onClick={() => navigate(`/exam-templates/${t.id}`)}
                            className="group cursor-pointer rounded-xl border border-border bg-card p-5 transition-all hover:shadow-lg hover:-translate-y-0.5"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-start gap-3">
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
            )}

            {/* Create choice modal */}
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
