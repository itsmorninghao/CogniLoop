/**
 * Courses list page — shows user's courses with status and progress.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
    GraduationCap, Plus, Play, Globe, Lock,
    Loader2, Sparkles, CheckCircle2, Clock, AlertCircle,
    Trash2, MoreHorizontal,
} from 'lucide-react'
import { courseApi, type CourseListItem } from '@/lib/api'
import { useAsync } from '@/hooks/useAsync'

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    draft: { label: '草稿', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400', icon: <Clock className="size-3" /> },
    generating: { label: '生成中', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400', icon: <Sparkles className="size-3 animate-pulse" /> },
    ready: { label: '已完成', color: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400', icon: <CheckCircle2 className="size-3" /> },
    partial_failed: { label: '部分失败', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400', icon: <AlertCircle className="size-3" /> },
}

const LEVEL_LABELS: Record<string, string> = {
    beginner: '新手',
    advanced: '老手',
}

export default function CoursesPage() {
    const navigate = useNavigate()

    const { data: coursesRaw, loading, refetch } = useAsync(() => courseApi.list(), [])
    const courses = coursesRaw ?? []

    const [deleting, setDeleting] = useState<number | null>(null)
    const [activeMenu, setActiveMenu] = useState<number | null>(null)

    const handleDelete = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm('确定要删除这门课程吗？此操作不可撤销。')) return
        setDeleting(id)
        try {
            await courseApi.delete(id)
            toast.success('课程已删除')
            refetch()
        } catch {
            toast.error('删除失败')
        } finally {
            setDeleting(null)
            setActiveMenu(null)
        }
    }

    const handleTogglePublish = async (course: CourseListItem, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            await courseApi.togglePublish(course.id)
            toast.success(course.visibility === 'private' ? '已发布到广场' : '已设为私有')
            refetch()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : '操作失败')
        } finally {
            setActiveMenu(null)
        }
    }

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="size-6 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="container mx-auto max-w-6xl p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-medium">我的课程</h1>
                    <p className="mt-1 text-sm text-muted-foreground">基于知识库 AI 自动生成的视频课程</p>
                </div>
                <button
                    onClick={() => navigate('/courses/create')}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:scale-105 transition-transform active:scale-95"
                >
                    <Plus className="size-4" />
                    创建课程
                </button>
            </div>

            {courses.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                    <GraduationCap className="size-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-medium">还没有课程</h3>
                    <p className="mt-1 text-sm text-muted-foreground">选择一个知识库，让 AI 为你生成完整课程</p>
                    <button
                        onClick={() => navigate('/courses/create')}
                        className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:scale-105 transition-transform"
                    >
                        <Sparkles className="size-4" />
                        创建第一门课程
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {courses.map((course) => {
                        const statusInfo = STATUS_LABELS[course.status] || STATUS_LABELS.draft
                        return (
                            <div
                                key={course.id}
                                onClick={() => navigate(`/courses/${course.id}`)}
                                className="relative cursor-pointer rounded-xl border border-border bg-card p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 hover:border-primary/50"
                            >
                                {/* Cover / Placeholder */}
                                <div className="relative mb-4 h-32 w-full overflow-hidden rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center">
                                    {course.cover_url ? (
                                        <img
                                            src={course.cover_url}
                                            alt={course.title}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <GraduationCap className="size-12 text-primary/40" />
                                    )}
                                    <div className="absolute top-2 left-2">
                                        <span className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
                                            {course.visibility === 'public' ? <Globe className="size-3" /> : <Lock className="size-3" />}
                                            {course.visibility === 'public' ? '公开' : '私有'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <h3 className="font-medium leading-snug line-clamp-2 flex-1">{course.title}</h3>
                                    <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => setActiveMenu(activeMenu === course.id ? null : course.id)}
                                            className="rounded-lg p-1 hover:bg-muted transition-colors"
                                        >
                                            <MoreHorizontal className="size-4 text-muted-foreground" />
                                        </button>
                                        {activeMenu === course.id && (
                                            <div className="absolute right-0 top-7 z-10 w-36 rounded-xl border border-border bg-card shadow-lg">
                                                <button
                                                    onClick={(e) => handleTogglePublish(course, e)}
                                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors rounded-t-xl"
                                                >
                                                    {course.visibility === 'private' ? <Globe className="size-4" /> : <Lock className="size-4" />}
                                                    {course.visibility === 'private' ? '发布到广场' : '设为私有'}
                                                </button>
                                                <button
                                                    onClick={(e) => handleDelete(course.id, e)}
                                                    disabled={deleting === course.id}
                                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors rounded-b-xl"
                                                >
                                                    {deleting === course.id ? (
                                                        <Loader2 className="size-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="size-4" />
                                                    )}
                                                    删除课程
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}>
                                        {statusInfo.icon}
                                        {statusInfo.label}
                                    </span>
                                    <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-0.5 text-xs font-medium">
                                        {LEVEL_LABELS[course.level] || course.level}
                                    </span>
                                    {course.total_leaf_nodes > 0 && (
                                        <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs">
                                            {course.total_leaf_nodes} 节
                                        </span>
                                    )}
                                </div>

                                {course.status === 'ready' && course.total_leaf_nodes > 0 && (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span>学习进度</span>
                                            <span>{course.progress_pct}%</span>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-muted">
                                            <div
                                                className="h-2 rounded-full bg-primary transition-all duration-300"
                                                style={{ width: `${course.progress_pct}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {course.status === 'ready' && (
                                    <div className="mt-3 flex items-center gap-1 text-xs text-primary font-medium">
                                        <Play className="size-3" />
                                        {course.progress_pct > 0 ? '继续学习' : '开始学习'}
                                    </div>
                                )}
                                {course.status === 'generating' && (
                                    <div className="mt-3 flex items-center gap-1 text-xs text-purple-500 font-medium">
                                        <Sparkles className="size-3 animate-pulse" />
                                        AI 正在生成课程内容...
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
