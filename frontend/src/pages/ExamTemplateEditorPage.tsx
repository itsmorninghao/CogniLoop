/**
 * ExamTemplateEditorPage — visual slot editor for exam templates.
 */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router'
import { toast } from 'sonner'
import {
    ArrowLeft, Plus, Trash2, Save, ChevronDown, ChevronUp,
    Loader2, AlertTriangle, ScanLine, X, Globe, GlobeLock
} from 'lucide-react'
import { examTemplateApi } from '@/lib/api'
import type { SlotDraft, QuestionDraft } from '@/components/exam-template/types'
import OcrScanner from '@/components/exam-template/OcrScanner'
import { mergeSlots } from '@/components/exam-template/mergeSlots'
import { useAsync } from '@/hooks/useAsync'

const QUESTION_TYPE_OPTIONS = [
    { value: 'single_choice', label: '单选题' },
    { value: 'multiple_choice', label: '多选题' },
    { value: 'true_false', label: '判断题' },
    { value: 'fill_blank', label: '填空题' },
    { value: 'short_answer', label: '简答题' },
]

function emptyQuestion(): QuestionDraft {
    return { content: '', answer: '', analysis: '', difficulty: 'medium', knowledge_points: [], source_label: '' }
}

export default function ExamTemplateEditorPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const location = useLocation()
    const isNew = id === 'new'

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [subject, setSubject] = useState('')
    const [slots, setSlots] = useState<SlotDraft[]>([])
    const [expandedSlots, setExpandedSlots] = useState<Set<number>>(new Set())
    const [saving, setSaving] = useState(false)
    const [showScanDialog, setShowScanDialog] = useState(false)
    const [isPublic, setIsPublic] = useState(false)

    const templateId = isNew ? null : (id ? parseInt(id) : null)
    const { loading } = useAsync(
        async () => {
            if (templateId === null) return null
            try {
                const tmpl = await examTemplateApi.get(templateId)
                setName(tmpl.name)
                setDescription(tmpl.description || '')
                setSubject(tmpl.subject || '')
                setIsPublic(tmpl.is_public)
                setSlots(
                    tmpl.slots
                        .sort((a, b) => a.position - b.position)
                        .map(s => ({
                            position: s.position,
                            question_type: s.question_type,
                            label: s.label || '',
                            difficulty_hint: s.difficulty_hint || '',
                            questions: s.questions.map(q => ({
                                id: q.id,
                                content: q.content,
                                answer: q.answer || '',
                                analysis: q.analysis || '',
                                difficulty: q.difficulty || 'medium',
                                knowledge_points: q.knowledge_points || [],
                                source_label: q.source_label || '',
                            })),
                        }))
                )
                setExpandedSlots(new Set(tmpl.slots.map((_, i) => i)))
                return tmpl
            } catch {
                toast.error('加载模板失败')
                navigate('/exam-templates')
                return null
            }
        },
        [templateId]
    )

    const handleMergeScannedSlots = useCallback((incoming: SlotDraft[]) => {
        setSlots(prev => {
            const merged = mergeSlots(prev, incoming)
            setExpandedSlots(es => {
                const next = new Set(es)
                merged.forEach((_, i) => next.add(i))
                return next
            })
            return merged
        })
        setShowScanDialog(false)
        toast.success(`已导入 ${incoming.reduce((n, s) => n + s.questions.length, 0)} 道题目`)
    }, [])

    useEffect(() => {
        if (isNew && location.state?.ocrSlots) {
            const ocrSlots = location.state.ocrSlots as SlotDraft[]
            setSlots(ocrSlots)
            setExpandedSlots(new Set(ocrSlots.map((_, i) => i)))
        }
    }, [isNew, location.state])

    const addSlot = () => {
        const maxPos = slots.length > 0 ? Math.max(...slots.map(s => s.position)) : 0
        setSlots(prev => [...prev, {
            position: maxPos + 1,
            question_type: 'single_choice',
            label: '',
            difficulty_hint: '',
            questions: [],
        }])
    }

    const removeSlot = (idx: number) => {
        setSlots(prev => prev.filter((_, i) => i !== idx))
    }

    const updateSlot = (idx: number, field: keyof SlotDraft, value: unknown) => {
        setSlots(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
    }

    const addQuestion = (slotIdx: number) => {
        setSlots(prev => prev.map((s, i) =>
            i === slotIdx ? { ...s, questions: [...s.questions, emptyQuestion()] } : s
        ))
    }

    const removeQuestion = (slotIdx: number, qIdx: number) => {
        setSlots(prev => prev.map((s, i) =>
            i === slotIdx ? { ...s, questions: s.questions.filter((_, qi) => qi !== qIdx) } : s
        ))
    }

    const updateQuestion = (slotIdx: number, qIdx: number, field: keyof QuestionDraft, value: unknown) => {
        setSlots(prev => prev.map((s, i) =>
            i === slotIdx ? {
                ...s,
                questions: s.questions.map((q, qi) =>
                    qi === qIdx ? { ...q, [field]: value } : q
                ),
            } : s
        ))
    }

    const toggleSlot = (idx: number) => {
        setExpandedSlots(prev => {
            const next = new Set(prev)
            if (next.has(idx)) next.delete(idx)
            else next.add(idx)
            return next
        })
    }

    const missingCount = slots.reduce((acc, s) => {
        return acc + s.questions.filter(q => !q.content.trim()).length
    }, 0)

    const handleSave = useCallback(async () => {
        if (!name.trim()) {
            toast.error('请输入模板名称')
            return
        }
        setSaving(true)
        try {
            const slotsData = slots.map(s => ({
                position: s.position,
                question_type: s.question_type,
                label: s.label || undefined,
                difficulty_hint: s.difficulty_hint || undefined,
                questions: s.questions.filter(q => q.content.trim()).map(q => ({
                    content: q.content,
                    answer: q.answer || undefined,
                    analysis: q.analysis || undefined,
                    difficulty: q.difficulty || undefined,
                    knowledge_points: q.knowledge_points.length > 0 ? q.knowledge_points : undefined,
                    source_label: q.source_label || undefined,
                })),
            }))

            if (isNew) {
                const tmpl = await examTemplateApi.create({
                    name: name.trim(),
                    description: description.trim() || undefined,
                    subject: subject.trim() || undefined,
                    slots: slotsData,
                })
                toast.success('模板创建成功')
                navigate(`/exam-templates/${tmpl.id}`, { replace: true })
            } else {
                await examTemplateApi.update(parseInt(id!), {
                    name: name.trim(),
                    description: description.trim() || undefined,
                    subject: subject.trim() || undefined,
                })
                await examTemplateApi.replaceSlots(parseInt(id!), slotsData)
                toast.success('模板保存成功')
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '保存失败')
        } finally {
            setSaving(false)
        }
    }, [name, description, subject, slots, isNew, id, navigate])

    const handleTogglePublish = async () => {
        const templateId = parseInt(id!)
        try {
            if (isPublic) {
                await examTemplateApi.unpublish(templateId)
                setIsPublic(false)
                toast.success('已从广场下架')
            } else {
                await examTemplateApi.publish(templateId)
                setIsPublic(true)
                toast.success('已发布到广场')
            }
        } catch {
            toast.error('操作失败')
        }
    }

    const handleDelete = async () => {
        if (!confirm('确定删除此模板？此操作不可撤销。')) return
        try {
            await examTemplateApi.delete(parseInt(id!))
            toast.success('模板已删除')
            navigate('/exam-templates')
        } catch {
            toast.error('删除失败')
        }
    }

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        )
    }

    // Group slots by question_type
    const typeGroups = new Map<string, { label: string; indices: number[] }>()
    slots.forEach((s, idx) => {
        const existing = typeGroups.get(s.question_type)
        if (existing) {
            existing.indices.push(idx)
        } else {
            const typeLabel = QUESTION_TYPE_OPTIONS.find(o => o.value === s.question_type)?.label || s.question_type
            typeGroups.set(s.question_type, { label: typeLabel, indices: [idx] })
        }
    })

    return (
        <div className="container mx-auto space-y-6 p-6 animate-fade-in">
            <div className="flex items-center gap-3">
                <button onClick={() => navigate('/exam-templates')} className="rounded-lg p-2 hover:bg-accent transition-colors">
                    <ArrowLeft className="size-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-foreground">{isNew ? '新建模板' : '编辑模板'}</h1>
                </div>
                <button
                    onClick={() => setShowScanDialog(true)}
                    className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                    <ScanLine className="size-4" />
                    扫描导入
                </button>
                {!isNew && (
                    <>
                        <button
                            onClick={handleTogglePublish}
                            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                        >
                            {isPublic ? <Globe className="size-4 text-emerald-500" /> : <GlobeLock className="size-4" />}
                            {isPublic ? '已发布' : '未发布'}
                        </button>
                        <button
                            onClick={handleDelete}
                            className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                            <Trash2 className="size-4" />
                            删除
                        </button>
                    </>
                )}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    保存
                </button>
            </div>

            {missingCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <AlertTriangle className="size-4 shrink-0" />
                    共 {missingCount} 道题目缺少内容，已高亮显示
                </div>
            )}

            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                    <div>
                        <label className="text-sm font-medium text-foreground">模板名称 *</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="如: 2024高考数学全国卷I"
                            className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-foreground">学科</label>
                        <input
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            placeholder="如: 高中数学"
                            className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-foreground">描述</label>
                        <input
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="可选描述"
                            className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                </div>
            </div>

            {Array.from(typeGroups.entries()).map(([qtype, group]) => (
                <div key={qtype} className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 bg-muted/30 border-b border-border">
                        <h3 className="text-sm font-medium text-foreground">{group.label} ({group.indices.length}题)</h3>
                    </div>
                    <div className="divide-y divide-border">
                        {group.indices.map(idx => {
                            const slot = slots[idx]
                            const isExpanded = expandedSlots.has(idx)
                            const emptyQuestions = slot.questions.filter(q => !q.content.trim()).length
                            return (
                                <div key={idx}>
                                    <div
                                        className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
                                        onClick={() => toggleSlot(idx)}
                                    >
                                        <span className="text-sm font-mono text-muted-foreground w-8">[{slot.position}]</span>
                                        <span className="text-sm text-foreground flex-1">
                                            {slot.label || '未标注'}
                                        </span>
                                        <span className="text-xs text-muted-foreground">{slot.questions.length}道真题</span>
                                        {emptyQuestions > 0 && (
                                            <span className="text-xs text-amber-500">⚠{emptyQuestions}待填</span>
                                        )}
                                        <button
                                            onClick={e => { e.stopPropagation(); removeSlot(idx) }}
                                            className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                        {isExpanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                                    </div>

                                    {isExpanded && (
                                        <div className="px-5 pb-4 space-y-4 bg-muted/10">
                                            <div className="grid gap-3 md:grid-cols-4 pt-3">
                                                <div>
                                                    <label className="text-xs text-muted-foreground">题号位置</label>
                                                    <input
                                                        type="number"
                                                        value={slot.position}
                                                        onChange={e => updateSlot(idx, 'position', parseInt(e.target.value) || 1)}
                                                        className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                                                        min={1}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-muted-foreground">题型</label>
                                                    <select
                                                        value={slot.question_type}
                                                        onChange={e => updateSlot(idx, 'question_type', e.target.value)}
                                                        className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                                                    >
                                                        {QUESTION_TYPE_OPTIONS.map(o => (
                                                            <option key={o.value} value={o.value}>{o.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-muted-foreground">标签</label>
                                                    <input
                                                        value={slot.label}
                                                        onChange={e => updateSlot(idx, 'label', e.target.value)}
                                                        placeholder="如: 函数与导数"
                                                        className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-muted-foreground">难度提示</label>
                                                    <select
                                                        value={slot.difficulty_hint}
                                                        onChange={e => updateSlot(idx, 'difficulty_hint', e.target.value)}
                                                        className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                                                    >
                                                        <option value="">不指定</option>
                                                        <option value="easy">简单</option>
                                                        <option value="medium">中等</option>
                                                        <option value="hard">困难</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                {slot.questions.map((q, qIdx) => (
                                                    <div
                                                        key={qIdx}
                                                        className={`rounded-lg border p-4 space-y-3 ${!q.content.trim() ? 'border-red-400 bg-red-50 dark:bg-red-950/20' : 'border-border bg-card'}`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                {q.source_label && (
                                                                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                                                        {q.source_label}
                                                                    </span>
                                                                )}
                                                                {!q.content.trim() && (
                                                                    <span className="text-xs text-red-500 font-medium">待填写</span>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => removeQuestion(idx, qIdx)}
                                                                className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                                                            >
                                                                <Trash2 className="size-3.5" />
                                                            </button>
                                                        </div>
                                                        <div>
                                                            <label className="text-xs text-muted-foreground">题目内容</label>
                                                            <textarea
                                                                value={q.content}
                                                                onChange={e => updateQuestion(idx, qIdx, 'content', e.target.value)}
                                                                placeholder="题目正文（支持 LaTeX）"
                                                                rows={3}
                                                                className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
                                                            />
                                                        </div>
                                                        <div className="grid gap-3 md:grid-cols-3">
                                                            <div>
                                                                <label className="text-xs text-muted-foreground">答案</label>
                                                                <input
                                                                    value={q.answer}
                                                                    onChange={e => updateQuestion(idx, qIdx, 'answer', e.target.value)}
                                                                    className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-xs text-muted-foreground">难度</label>
                                                                <select
                                                                    value={q.difficulty}
                                                                    onChange={e => updateQuestion(idx, qIdx, 'difficulty', e.target.value)}
                                                                    className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                                                                >
                                                                    <option value="easy">简单</option>
                                                                    <option value="medium">中等</option>
                                                                    <option value="hard">困难</option>
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="text-xs text-muted-foreground">来源</label>
                                                                <input
                                                                    value={q.source_label}
                                                                    onChange={e => updateQuestion(idx, qIdx, 'source_label', e.target.value)}
                                                                    placeholder="如: 2024全国卷I"
                                                                    className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-xs text-muted-foreground">解析</label>
                                                            <textarea
                                                                value={q.analysis}
                                                                onChange={e => updateQuestion(idx, qIdx, 'analysis', e.target.value)}
                                                                rows={2}
                                                                className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={() => addQuestion(idx)}
                                                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                                                >
                                                    <Plus className="size-3.5" />
                                                    添加题目
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}

            <button
                onClick={addSlot}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-4 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
                <Plus className="size-4" />
                添加题位
            </button>

            {showScanDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
                    <div className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                            <h2 className="text-lg font-semibold text-foreground">扫描导入题目</h2>
                            <button onClick={() => setShowScanDialog(false)} className="rounded-lg p-1.5 hover:bg-accent transition-colors">
                                <X className="size-5 text-muted-foreground" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            <OcrScanner
                                onScanComplete={handleMergeScannedSlots}
                                onCancel={() => setShowScanDialog(false)}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
