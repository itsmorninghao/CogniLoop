/**
 * Course creation page — step 1: Select KB(s) + level + voice → generate outline.
 * This redirects to CourseOutlinePage after outline is ready.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
    ArrowLeft, BookOpen, Check, ChevronRight,
    Loader2, Mic, Sparkles,
} from 'lucide-react'
import { kbApi, courseGenApi, type KnowledgeBase } from '@/lib/api'
import { useAsync } from '@/hooks/useAsync'

const LEVEL_OPTIONS = [
    {
        value: 'beginner',
        label: '新手',
        desc: '零基础或入门阶段，多用类比和具体例子',
    },
    {
        value: 'advanced',
        label: '老手',
        desc: '已有基础，希望深入理解原理和高阶用法',
    },
]

// Default voices shown before admin configures custom ones
const DEFAULT_VOICES = [
    { id: 'openai_alloy', name: '标准配音' },
    { id: 'openai_nova', name: '温柔女声' },
    { id: 'openai_echo', name: '专业男声' },
]

export default function CourseCreatePage() {
    const navigate = useNavigate()

    const { data: kbsRaw, loading: kbsLoading } = useAsync(() => kbApi.list(), [])
    const kbs = kbsRaw ?? []

    const [selectedKbs, setSelectedKbs] = useState<Set<number>>(new Set())
    const [level, setLevel] = useState<'beginner' | 'advanced'>('beginner')
    const [voiceId, setVoiceId] = useState<string>('openai_alloy')
    const [generating, setGenerating] = useState(false)

    const toggleKb = (id: number) => {
        setSelectedKbs((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleGenerate = async () => {
        if (selectedKbs.size === 0) {
            toast.error('请至少选择一个知识库')
            return
        }
        setGenerating(true)
        try {
            const draft = await courseGenApi.generateOutline({
                kb_ids: Array.from(selectedKbs),
                level,
                voice_id: voiceId,
            })
            navigate(`/courses/outline/${draft.draft_id}`, {
                state: { draft, level, voiceId },
            })
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '大纲生成失败，请稍后重试')
        } finally {
            setGenerating(false)
        }
    }

    return (
        <div className="container mx-auto max-w-3xl p-6 space-y-8">
            <button
                onClick={() => navigate('/courses')}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ArrowLeft className="size-4" />
                返回我的课程
            </button>

            <div>
                <div className="flex items-center gap-3 mb-1">
                    <div className="relative">
                        <Sparkles className="size-6 text-primary animate-pulse" />
                        <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                    </div>
                    <h1 className="text-2xl font-medium">创建 AI 课程</h1>
                </div>
                <p className="text-sm text-muted-foreground ml-9">选择知识库，AI 将自动提炼大纲并生成完整视频课程</p>
            </div>

            {/* Step 1: Select KBs */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">1</span>
                    <h2 className="text-base font-medium">选择知识库</h2>
                </div>
                {kbsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        加载中...
                    </div>
                ) : kbs.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-6 text-center">
                        <BookOpen className="mx-auto size-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">还没有知识库</p>
                        <button
                            onClick={() => navigate('/knowledge')}
                            className="mt-2 text-xs text-primary hover:underline"
                        >
                            去创建知识库
                        </button>
                    </div>
                ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                        {kbs.map((kb: KnowledgeBase) => {
                            const selected = selectedKbs.has(kb.id)
                            return (
                                <button
                                    key={kb.id}
                                    onClick={() => toggleKb(kb.id)}
                                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 ${
                                        selected
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-primary/50 hover:bg-muted/50'
                                    }`}
                                >
                                    <div className={`mt-0.5 flex size-5 items-center justify-center rounded border transition-colors ${
                                        selected ? 'border-primary bg-primary' : 'border-border'
                                    }`}>
                                        {selected && <Check className="size-3 text-white" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-sm truncate">{kb.name}</p>
                                        {kb.description && (
                                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{kb.description}</p>
                                        )}
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {kb.document_count ?? 0} 个文档
                                        </p>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Step 2: Level */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">2</span>
                    <h2 className="text-base font-medium">学员水平</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    {LEVEL_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => setLevel(opt.value as 'beginner' | 'advanced')}
                            className={`rounded-xl border p-4 text-left transition-all duration-200 ${
                                level === opt.value
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/50'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">{opt.label}</span>
                                {level === opt.value && (
                                    <div className="size-4 rounded-full bg-primary flex items-center justify-center">
                                        <Check className="size-2.5 text-white" />
                                    </div>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground">{opt.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Step 3: Voice */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">3</span>
                    <h2 className="text-base font-medium">旁白音色</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                    {DEFAULT_VOICES.map((v) => (
                        <button
                            key={v.id}
                            onClick={() => setVoiceId(v.id)}
                            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-all duration-200 ${
                                voiceId === v.id
                                    ? 'border-primary bg-primary/5 text-primary font-medium'
                                    : 'border-border hover:border-primary/50'
                            }`}
                        >
                            <Mic className="size-3.5" />
                            {v.name}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">更多音色可在管理后台 → 系统配置中添加（COURSE_VOICES）</p>
            </div>

            <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                    {selectedKbs.size > 0 ? `已选 ${selectedKbs.size} 个知识库` : '请选择至少一个知识库'}
                </p>
                <button
                    onClick={handleGenerate}
                    disabled={generating || selectedKbs.size === 0}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-2.5 text-sm font-medium text-white hover:scale-105 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                    {generating ? (
                        <>
                            <Loader2 className="size-4 animate-spin" />
                            AI 生成大纲中...
                        </>
                    ) : (
                        <>
                            <Sparkles className="size-4" />
                            生成课程大纲
                            <ChevronRight className="size-4" />
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}
