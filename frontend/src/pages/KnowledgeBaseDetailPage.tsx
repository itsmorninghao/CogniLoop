/**
 * Knowledge Base detail page — full-page view of a single KB.
 * Question banks: full-width layout with search/filter/pagination.
 * Document KBs: centered max-w-5xl layout.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
    ArrowLeft, Database, BookMarked, Upload, Trash2, Share2, Copy,
    Link2Off, FileText, Loader2, Package, CheckSquare, Square, Globe,
    X, Hash, CalendarDays, FileStack, AlertCircle, HelpCircle,
    Search, ChevronDown, RotateCcw, ChevronRight, GlobeLock,
} from 'lucide-react'
import { kbApi, type KnowledgeBase, type KBDocument, type ScanResult, type BankQuestion } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

const PAGE_SIZE = 50
const LOAD_BATCH = 500

export default function KnowledgeBaseDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { user } = useAuthStore()

    const [kb, setKb] = useState<KnowledgeBase | null>(null)
    const [loading, setLoading] = useState(true)
    const [documents, setDocuments] = useState<KBDocument[]>([])
    const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([])
    const [totalOnServer, setTotalOnServer] = useState(0)
    const [loadedOffset, setLoadedOffset] = useState(0)
    const [docsLoading, setDocsLoading] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [sharingCode, setSharingCode] = useState(false)
    const [revokingCode, setRevokingCode] = useState(false)
    const [publishingPlaza, setPublishingPlaza] = useState(false)
    const [deletingKb, setDeletingKb] = useState(false)

    // Question filters
    const [searchText, setSearchText] = useState('')
    const [filterSubject, setFilterSubject] = useState('')
    const [filterType, setFilterType] = useState('')
    const [filterDifficulty, setFilterDifficulty] = useState('')
    const [displayCount, setDisplayCount] = useState(PAGE_SIZE)

    // Help modal
    const [showHelp, setShowHelp] = useState(false)

    // Batch import modal
    const [showBatchImport, setShowBatchImport] = useState(false)
    const [importUrl, setImportUrl] = useState('')
    const [importZipFile, setImportZipFile] = useState<File | null>(null)
    const [scanning, setScanning] = useState(false)
    const [scanResult, setScanResult] = useState<ScanResult | null>(null)
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
    const [importing, setImporting] = useState(false)
    const zipInputRef = useRef<HTMLInputElement>(null)

    const kbId = parseInt(id ?? '0')
    const isOwner = kb != null && user != null && kb.owner_id === user.id

    const loadKb = useCallback(async () => {
        if (!kbId) return
        setLoading(true)
        try {
            const data = await kbApi.get(kbId)
            setKb(data)
        } catch {
            toast.error('知识库不存在或无权限')
            navigate('/knowledge')
        } finally {
            setLoading(false)
        }
    }, [kbId, navigate])

    const loadDocs = useCallback(async (kbData: KnowledgeBase, reset = true) => {
        if (kbData.kb_type === 'question_bank') {
            const offset = reset ? 0 : loadedOffset
            if (reset) setDocsLoading(true); else setLoadingMore(true)
            try {
                const res = await kbApi.listBankQuestions(kbData.id, LOAD_BATCH, offset)
                setTotalOnServer(res.total)
                setBankQuestions(prev => reset ? res.items : [...prev, ...res.items])
                setLoadedOffset(offset + res.items.length)
                if (reset) {
                    setSearchText('')
                    setFilterSubject('')
                    setFilterType('')
                    setFilterDifficulty('')
                    setDisplayCount(PAGE_SIZE)
                }
            } catch {
                toast.error('加载题目失败')
            } finally {
                if (reset) setDocsLoading(false); else setLoadingMore(false)
            }
        } else {
            setDocsLoading(true)
            try {
                const docs = await kbApi.listDocs(kbData.id)
                setDocuments(docs)
            } catch {
                toast.error('加载文档失败')
            } finally {
                setDocsLoading(false)
            }
        }
    }, [loadedOffset])

    useEffect(() => { loadKb() }, [loadKb])
    useEffect(() => { if (kb) loadDocs(kb, true) }, [kb]) // eslint-disable-line react-hooks/exhaustive-deps

    // Derived filter options from loaded questions
    const subjects = useMemo(() => [...new Set(bankQuestions.map(q => q.subject).filter(Boolean))].sort(), [bankQuestions])
    const types = useMemo(() => [...new Set(bankQuestions.map(q => q.question_type).filter(Boolean))].sort(), [bankQuestions])
    const difficulties = useMemo(() => [...new Set(bankQuestions.map(q => q.difficulty).filter(Boolean))].sort(), [bankQuestions])

    const filteredQuestions = useMemo(() => {
        const txt = searchText.toLowerCase()
        return bankQuestions.filter(q => {
            if (txt && !q.content?.toLowerCase().includes(txt) && !q.answer?.toLowerCase().includes(txt)) return false
            if (filterSubject && q.subject !== filterSubject) return false
            if (filterType && q.question_type !== filterType) return false
            if (filterDifficulty && q.difficulty !== filterDifficulty) return false
            return true
        })
    }, [bankQuestions, searchText, filterSubject, filterType, filterDifficulty])

    const visibleQuestions = filteredQuestions.slice(0, displayCount)
    const hasActiveFilter = searchText || filterSubject || filterType || filterDifficulty

    const handleUpload = async (files: FileList) => {
        if (!kb) return
        setUploading(true)
        let success = 0
        if (kb.kb_type === 'question_bank') {
            for (const file of Array.from(files)) {
                try {
                    const res = await kbApi.uploadBank(kb.id, file)
                    toast.success(`${file.name}: 导入 ${res.result.imported} 题，跳过 ${res.result.skipped} 题`)
                    if (res.result.errors.length) toast.error(`部分错误: ${res.result.errors.join(', ')}`)
                    success++
                } catch (err: unknown) {
                    toast.error(`上传 ${file.name} 失败: ${err instanceof Error ? err.message : '未知错误'}`)
                }
            }
        } else {
            for (const file of Array.from(files)) {
                try {
                    await kbApi.uploadDoc(kb.id, file)
                    toast.success(`${file.name} 上传成功，正在解析...`)
                    success++
                } catch (err: unknown) {
                    toast.error(`上传 ${file.name} 失败: ${err instanceof Error ? err.message : '未知错误'}`)
                }
            }
        }
        if (success > 0) { await loadKb(); if (kb) loadDocs(kb, true) }
        setUploading(false)
    }

    const handleDeleteDoc = async (docId: number) => {
        if (!kb) return
        try {
            await kbApi.deleteDoc(kb.id, docId)
            toast.success('文档已删除')
            loadDocs(kb, true)
            loadKb()
        } catch { toast.error('删除失败') }
    }

    const handleGenerateShareCode = async () => {
        if (!kb) return
        setSharingCode(true)
        try {
            const updated = await kbApi.generateShareCode(kb.id)
            setKb(updated)
            if (updated.share_code) {
                await navigator.clipboard.writeText(updated.share_code)
                toast.success(`分享码已生成并复制: ${updated.share_code}`)
            }
        } catch { toast.error('生成分享码失败') }
        finally { setSharingCode(false) }
    }

    const handleRevokeShareCode = async () => {
        if (!kb || !confirm('确定吊销分享码？已分享的链接将失效。')) return
        setRevokingCode(true)
        try {
            const updated = await kbApi.revokeShareCode(kb.id)
            setKb(updated)
            toast.success('分享码已吊销')
        } catch { toast.error('吊销失败') }
        finally { setRevokingCode(false) }
    }

    const handlePublishToPlaza = async () => {
        if (!kb) return
        setPublishingPlaza(true)
        try {
            const updated = await kbApi.publishToPlaza(kb.id)
            setKb(updated)
            toast.success('已发布到知识广场')
        } catch { toast.error('发布失败') }
        finally { setPublishingPlaza(false) }
    }

    const handleUnpublishFromPlaza = async () => {
        if (!kb || !confirm('确定从广场撤下此知识库？')) return
        setPublishingPlaza(true)
        try {
            const updated = await kbApi.unpublishFromPlaza(kb.id)
            setKb(updated)
            toast.success('已从广场撤下')
        } catch { toast.error('撤下失败') }
        finally { setPublishingPlaza(false) }
    }

    const handleDeleteKb = async () => {
        if (!kb || !confirm('确定删除此知识库？所有文档和数据将一并删除，此操作不可撤销。')) return
        setDeletingKb(true)
        try {
            await kbApi.delete(kb.id)
            toast.success('知识库已删除')
            navigate('/knowledge')
        } catch { toast.error('删除失败'); setDeletingKb(false) }
    }

    const handleScan = async () => {
        if (!kb || (!importUrl && !importZipFile)) return
        setScanning(true)
        try {
            const result = await kbApi.scanArchive(kb.id, { url: importUrl || undefined, zipFile: importZipFile || undefined })
            setScanResult(result)
            setSelectedFiles(new Set(result.files.map(f => f.relative_path)))
        } catch (err) {
            toast.error(`扫描失败: ${err instanceof Error ? err.message : '未知错误'}`)
        } finally { setScanning(false) }
    }

    const handleConfirmImport = async () => {
        if (!kb || !scanResult) return
        setImporting(true)
        try {
            const result = await kbApi.confirmArchive(kb.id, scanResult.scan_id, Array.from(selectedFiles))
            toast.success(`导入完成：${result.result.imported} 题`)
            if (result.result.errors.length) toast.error(`部分错误: ${result.result.errors.slice(0, 3).join(', ')}`)
            setShowBatchImport(false)
            setScanResult(null); setImportUrl(''); setImportZipFile(null)
            loadDocs(kb, true); loadKb()
        } catch (err) {
            toast.error(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`)
        } finally { setImporting(false) }
    }

    const toggleFile = (path: string) => {
        setSelectedFiles(prev => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n })
    }

    const fileTypeColor = (type: string) => ({ PDF: 'text-red-500 bg-red-500/10', WORD: 'text-blue-500 bg-blue-500/10', PPT: 'text-orange-500 bg-orange-500/10', MARKDOWN: 'text-purple-500 bg-purple-500/10', TXT: 'text-gray-500 bg-gray-500/10' })[type] ?? 'text-gray-500 bg-gray-500/10'

    const statusBadge = (status: string) => {
        if (status === 'ready') return <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">就绪</span>
        if (status === 'processing') return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600"><Loader2 className="size-3 animate-spin" />处理中</span>
        if (status === 'error') return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600"><AlertCircle className="size-3" />失败</span>
        return <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{status}</span>
    }

    if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>
    if (!kb) return null

    const isQuestionBank = kb.kb_type === 'question_bank'
    const totalSelectedQ = scanResult ? scanResult.files.filter(f => selectedFiles.has(f.relative_path)).reduce((s, f) => s + f.question_count, 0) : 0

    // Layout wrapper: full-width for question banks, centered for document KBs
    const ContentWrapper = ({ children }: { children: React.ReactNode }) => isQuestionBank
        ? <div className="px-6 py-6 space-y-5">{children}</div>
        : <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">{children}</div>

    return (
        <div className="min-h-full bg-background animate-fade-in">
            {/* Breadcrumb */}
            <div className="border-b border-border bg-card/50 px-6 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <button onClick={() => navigate('/knowledge')} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                        <ArrowLeft className="size-3.5" />知识库
                    </button>
                    <ChevronRight className="size-3.5" />
                    <span className="text-foreground font-medium truncate max-w-xs">{kb.name}</span>
                </div>
            </div>

            <ContentWrapper>
                {/* KB Header Card */}
                <div className="rounded-2xl border border-border bg-card p-6">
                    <div className="flex items-start gap-5">
                        <div className={`flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${isQuestionBank ? 'from-blue-500/15 to-cyan-500/15' : 'from-indigo-500/15 to-purple-500/15'}`}>
                            {isOwner
                                ? <Database className={`size-7 ${isQuestionBank ? 'text-blue-600' : 'text-indigo-600'}`} />
                                : <BookMarked className="size-7 text-cyan-600" />
                            }
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-xl font-semibold text-foreground">{kb.name}</h1>
                                {isQuestionBank && <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 border border-blue-500/20">题库</span>}
                                {!isOwner && <span className="rounded-md bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-600 border border-cyan-500/20">已获取</span>}
                            </div>
                            {kb.description && <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{kb.description}</p>}
                            <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1.5"><FileStack className="size-3.5" />{kb.document_count} {isQuestionBank ? '道题目' : '个文档'}</span>
                                <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />{new Date(kb.created_at).toLocaleDateString('zh-CN')}</span>
                            </div>
                        </div>
                        {isOwner && (
                            <button onClick={handleDeleteKb} disabled={deletingKb} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:opacity-50 shrink-0">
                                {deletingKb ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}删除
                            </button>
                        )}
                    </div>

                    {/* Share code — owner only */}
                    {isOwner && (
                        <div className="mt-5 border-t border-border pt-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-foreground">分享码</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">生成分享码后，他人可通过此码获取此知识库</p>
                                </div>
                                {kb.share_code ? (
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
                                            <Hash className="size-3.5 text-muted-foreground" />
                                            <span className="font-mono text-sm font-semibold text-foreground tracking-widest">{kb.share_code}</span>
                                        </div>
                                        <button onClick={async () => { await navigator.clipboard.writeText(kb.share_code!); toast.success('分享码已复制') }} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent">
                                            <Copy className="size-3.5" />复制
                                        </button>
                                        <button onClick={handleRevokeShareCode} disabled={revokingCode} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:opacity-50">
                                            {revokingCode ? <Loader2 className="size-3.5 animate-spin" /> : <Link2Off className="size-3.5" />}吊销
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={handleGenerateShareCode} disabled={sharingCode} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50">
                                        {sharingCode ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}生成分享码
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Plaza publish — owner only */}
                    {isOwner && (
                        <div className="mt-5 border-t border-border pt-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-foreground">发布到广场</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {kb.shared_to_plaza_at
                                            ? `已于 ${new Date(kb.shared_to_plaza_at).toLocaleDateString('zh-CN')} 发布，任何人均可在广场浏览并获取`
                                            : '发布后将出现在知识广场，供所有用户浏览获取'}
                                    </p>
                                </div>
                                {kb.shared_to_plaza_at ? (
                                    <button
                                        onClick={handleUnpublishFromPlaza}
                                        disabled={publishingPlaza}
                                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:opacity-50"
                                    >
                                        {publishingPlaza ? <Loader2 className="size-3.5 animate-spin" /> : <GlobeLock className="size-3.5" />}从广场撤下
                                    </button>
                                ) : (
                                    <button
                                        onClick={handlePublishToPlaza}
                                        disabled={publishingPlaza}
                                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                        {publishingPlaza ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}发布到广场
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Upload zone — owner only */}
                {isOwner && (
                    <div className="rounded-2xl border border-border bg-card p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-medium text-foreground">{isQuestionBank ? '导入题目' : '上传文档'}</h2>
                            {isQuestionBank && (
                                <button onClick={() => setShowHelp(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                                    <HelpCircle className="size-3.5" />格式说明 / 导入指南
                                </button>
                            )}
                        </div>
                        <input ref={fileInputRef} type="file" multiple accept={isQuestionBank ? '.json' : '.pdf,.docx,.doc,.pptx,.ppt,.md,.txt'} className="hidden" onChange={e => e.target.files && handleUpload(e.target.files)} />
                        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="group flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border py-7 text-muted-foreground transition-all hover:border-primary/40 hover:text-primary disabled:opacity-50">
                            {uploading ? (
                                <><Loader2 className="size-5 animate-spin" /><span className="text-sm">{isQuestionBank ? '导入中...' : '上传中...'}</span></>
                            ) : (
                                <>
                                    <div className="flex size-10 items-center justify-center rounded-xl bg-muted group-hover:bg-primary/10 transition-colors">
                                        <Upload className="size-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-medium">{isQuestionBank ? '点击导入 .json 题目数据集文件' : '点击或拖拽文件到此处上传'}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{isQuestionBank ? '支持标准 {"example": [...]} 格式的题目数据集' : '支持 PDF、Word、PPT、Markdown、TXT'}</p>
                                    </div>
                                </>
                            )}
                        </button>
                        {isQuestionBank && (
                            <button onClick={() => setShowBatchImport(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/10">
                                <Package className="size-4" />从 GitHub 一键导入题目数据集
                            </button>
                        )}
                    </div>
                )}

                {/* Content list */}
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    {/* Question bank: search + filter toolbar */}
                    {isQuestionBank && bankQuestions.length > 0 && (
                        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/20 px-5 py-3">
                            {/* Search */}
                            <div className="relative min-w-[220px] flex-1">
                                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="search"
                                    value={searchText}
                                    onChange={e => { setSearchText(e.target.value); setDisplayCount(PAGE_SIZE) }}
                                    placeholder="搜索题目内容或答案..."
                                    className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                />
                            </div>
                            {/* Subject filter */}
                            {subjects.length > 0 && (
                                <div className="relative">
                                    <select value={filterSubject} onChange={e => { setFilterSubject(e.target.value); setDisplayCount(PAGE_SIZE) }} className="appearance-none rounded-lg border border-border bg-card py-1.5 pl-3 pr-7 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 cursor-pointer">
                                        <option value="">全部科目</option>
                                        {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                </div>
                            )}
                            {/* Type filter */}
                            {types.length > 0 && (
                                <div className="relative">
                                    <select value={filterType} onChange={e => { setFilterType(e.target.value); setDisplayCount(PAGE_SIZE) }} className="appearance-none rounded-lg border border-border bg-card py-1.5 pl-3 pr-7 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 cursor-pointer">
                                        <option value="">全部题型</option>
                                        {types.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                </div>
                            )}
                            {/* Difficulty filter */}
                            {difficulties.length > 0 && (
                                <div className="relative">
                                    <select value={filterDifficulty} onChange={e => { setFilterDifficulty(e.target.value); setDisplayCount(PAGE_SIZE) }} className="appearance-none rounded-lg border border-border bg-card py-1.5 pl-3 pr-7 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 cursor-pointer">
                                        <option value="">全部难度</option>
                                        {difficulties.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                </div>
                            )}
                            {/* Count + clear */}
                            <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                                显示 <span className="font-medium text-foreground">{Math.min(displayCount, filteredQuestions.length)}</span> / <span className="font-medium text-foreground">{filteredQuestions.length}</span>
                                {bankQuestions.length < totalOnServer && <span> (已加载 {bankQuestions.length}/{totalOnServer})</span>}
                            </span>
                            {hasActiveFilter && (
                                <button onClick={() => { setSearchText(''); setFilterSubject(''); setFilterType(''); setFilterDifficulty(''); setDisplayCount(PAGE_SIZE) }} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                                    <RotateCcw className="size-3" />清除
                                </button>
                            )}
                        </div>
                    )}

                    {/* Header row for list headers */}
                    {!isQuestionBank && documents.length > 0 && (
                        <div className="grid grid-cols-[auto_1fr_100px_80px_120px_40px] items-center gap-4 border-b border-border bg-muted/20 px-6 py-2 text-xs font-medium text-muted-foreground">
                            <span className="w-8" /><span>文件名</span><span>状态</span><span>分块</span><span>上传时间</span><span />
                        </div>
                    )}

                    {/* Loading state */}
                    {docsLoading ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 animate-spin text-primary" /></div>
                    ) : isQuestionBank ? (
                        bankQuestions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted"><FileStack className="size-7 text-muted-foreground" /></div>
                                <p className="text-sm font-medium text-foreground">暂无题目</p>
                                <p className="mt-1 text-xs text-muted-foreground">{isOwner ? '上传 JSON 文件或从 GitHub 一键导入数据集开始' : '知识库暂无题目数据'}</p>
                                {isOwner && <button onClick={() => setShowHelp(true)} className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline"><HelpCircle className="size-3.5" />查看导入说明</button>}
                            </div>
                        ) : filteredQuestions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Search className="size-8 text-muted-foreground mb-3" />
                                <p className="text-sm font-medium text-foreground">没有符合条件的题目</p>
                                <button onClick={() => { setSearchText(''); setFilterSubject(''); setFilterType(''); setFilterDifficulty('') }} className="mt-3 text-xs text-primary hover:underline">清除筛选条件</button>
                            </div>
                        ) : (
                            <>
                                {/* Table header */}
                                <div className="grid grid-cols-[40px_1fr_90px_90px_80px_120px] items-center gap-3 border-b border-border bg-muted/20 px-5 py-2 text-xs font-medium text-muted-foreground">
                                    <span className="text-center">#</span>
                                    <span>题目内容</span>
                                    <span>科目</span>
                                    <span>题型</span>
                                    <span>难度</span>
                                    <span>答案</span>
                                </div>
                                <div className="divide-y divide-border">
                                    {visibleQuestions.map((q, idx) => (
                                        <div key={q.id} className="grid grid-cols-[40px_1fr_90px_90px_80px_120px] items-start gap-3 px-5 py-3.5 hover:bg-muted/20 transition-colors">
                                            <span className="pt-0.5 text-center text-xs font-mono text-muted-foreground">{idx + 1}</span>
                                            <p className="text-sm text-foreground line-clamp-3 leading-relaxed">{q.content}</p>
                                            <span className="pt-0.5 text-xs text-muted-foreground truncate">{q.subject || '—'}</span>
                                            <span className="pt-0.5 text-xs text-muted-foreground truncate">{q.question_type || '—'}</span>
                                            <span className="pt-0.5 text-xs text-muted-foreground">{q.difficulty || '—'}</span>
                                            <span className="pt-0.5 text-xs font-medium text-foreground line-clamp-2">{q.answer}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Show more / load more from server */}
                                <div className="flex items-center justify-center gap-4 border-t border-border px-6 py-4">
                                    {displayCount < filteredQuestions.length && (
                                        <button onClick={() => setDisplayCount(c => c + PAGE_SIZE)} className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors">
                                            显示更多（{Math.min(PAGE_SIZE, filteredQuestions.length - displayCount)} 条）
                                        </button>
                                    )}
                                    {bankQuestions.length < totalOnServer && !hasActiveFilter && (
                                        <button onClick={() => kb && loadDocs(kb, false)} disabled={loadingMore} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-50">
                                            {loadingMore ? <><Loader2 className="size-4 animate-spin" />加载中...</> : `从服务器加载更多（还有 ${totalOnServer - bankQuestions.length} 题）`}
                                        </button>
                                    )}
                                    {displayCount >= filteredQuestions.length && bankQuestions.length >= totalOnServer && filteredQuestions.length > 0 && (
                                        <span className="text-xs text-muted-foreground">已显示全部 {filteredQuestions.length} 条结果</span>
                                    )}
                                </div>
                            </>
                        )
                    ) : (
                        documents.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted"><FileText className="size-7 text-muted-foreground" /></div>
                                <p className="text-sm font-medium text-foreground">暂无文档</p>
                                <p className="mt-1 text-xs text-muted-foreground">{isOwner ? '点击上方上传文档开始使用' : '知识库暂无文档'}</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border">
                                {documents.map(doc => (
                                    <div key={doc.id} className="grid grid-cols-[auto_1fr_100px_80px_120px_40px] items-center gap-4 px-6 py-3.5 hover:bg-muted/20 transition-colors">
                                        <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${fileTypeColor(doc.file_type)}`}><FileText className="size-4" /></div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-foreground">{doc.original_filename}</p>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">{doc.file_type}</p>
                                        </div>
                                        <div>{statusBadge(doc.status)}</div>
                                        <div className="text-sm text-muted-foreground">{doc.chunk_count > 0 ? `${doc.chunk_count} 块` : '—'}</div>
                                        <div className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleDateString('zh-CN')}</div>
                                        {isOwner ? (
                                            <button onClick={() => handleDeleteDoc(doc.id)} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        ) : <span />}
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            </ContentWrapper>

            {showHelp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in p-4">
                    <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-card shadow-2xl">
                        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
                            <div className="flex items-center gap-2">
                                <HelpCircle className="size-5 text-primary" />
                                <h3 className="text-base font-medium text-foreground">真题库使用说明</h3>
                            </div>
                            <button onClick={() => setShowHelp(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors"><X className="size-4" /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm">
                            {/* What is it */}
                            <section>
                                <h4 className="font-semibold text-foreground mb-2">什么是真题库？</h4>
                                <p className="text-muted-foreground leading-relaxed">真题库是 CogniLoop 专为结构化考试题目设计的知识库类型。与普通文档知识库不同，真题库中每道题目均包含 <strong className="text-foreground">题型、科目、难度、答案、解析</strong> 等结构化字段，可被智能出题系统精确调用，实现按科目、难度自动出卷。</p>
                            </section>

                            {/* JSON format */}
                            <section>
                                <h4 className="font-semibold text-foreground mb-2">支持的 JSON 格式</h4>
                                <p className="text-muted-foreground mb-3">题目数据集采用标准 JSON 格式，每个文件包含一个 <code className="rounded bg-muted px-1">example</code> 数组：</p>
                                <pre className="rounded-xl bg-muted/60 border border-border p-4 text-xs text-foreground overflow-x-auto leading-relaxed font-mono">{`{
  "example": [
    {
      "year": "2023",
      "index": "1",
      "question": "题目正文内容...",
      "answer": "A",
      "analysis": "解析内容（可选）",
      "subject": "数学",
      "type": "单选题",
      "difficulty": "中等"
    },
    ...
  ]
}`}</pre>
                                <p className="mt-2 text-xs text-muted-foreground">系统会自动识别 <code className="rounded bg-muted px-1">question / answer / subject / type / difficulty / analysis</code> 字段，未提供的字段将留空。</p>
                            </section>

                            {/* GitHub import guide */}
                            <section>
                                <h4 className="font-semibold text-foreground mb-3">从 GitHub 导入开源题目数据集</h4>
                                <ol className="space-y-3 text-muted-foreground">
                                    <li className="flex gap-3">
                                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold mt-0.5">1</span>
                                        <span>点击上方「从 GitHub 一键导入题目数据集」按钮</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold mt-0.5">2</span>
                                        <div>
                                            <span>在 GitHub 地址框中粘贴数据集仓库 URL，例如：</span>
                                            <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs text-foreground">https://github.com/your-org/your-exam-dataset</code>
                                        </div>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold mt-0.5">3</span>
                                        <span>点击「扫描」，系统自动下载并识别所有 JSON 文件，显示各文件的科目、题型和题目数量</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold mt-0.5">4</span>
                                        <span>勾选需要导入的科目文件，点击「确认导入」，系统将去重后批量入库</span>
                                    </li>
                                </ol>
                                <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                                    <strong>提示：</strong>也可以直接上传 ZIP 文件（从 GitHub 下载整个仓库压缩包）进行离线导入，无需网络访问 GitHub。
                                </div>
                            </section>
                        </div>

                        <div className="border-t border-border px-6 py-4 shrink-0 flex justify-end">
                            <button onClick={() => setShowHelp(false)} className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors">我知道了</button>
                        </div>
                    </div>
                </div>
            )}

            {showBatchImport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
                    <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-card shadow-2xl">
                        <div className="flex items-center justify-between border-b border-border px-6 py-4">
                            <h3 className="text-base font-medium text-foreground">从 GitHub 导入题目数据集</h3>
                            <button onClick={() => { setShowBatchImport(false); setScanResult(null); setImportUrl(''); setImportZipFile(null) }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors"><X className="size-4" /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            <div>
                                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5"><Globe className="size-4" />GitHub 仓库地址</label>
                                <input value={importUrl} onChange={e => { setImportUrl(e.target.value); setImportZipFile(null) }} placeholder="https://github.com/your-org/your-exam-dataset" className="w-full rounded-lg border border-border bg-input-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30" />
                            </div>
                            <div className="flex items-center gap-3"><div className="flex-1 border-t border-border" /><span className="text-xs text-muted-foreground">或</span><div className="flex-1 border-t border-border" /></div>
                            <div>
                                <input ref={zipInputRef} type="file" accept=".zip" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setImportZipFile(f); setImportUrl('') } }} />
                                <button onClick={() => zipInputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-3 text-sm text-muted-foreground transition-all hover:border-primary/30 hover:text-primary">
                                    <Upload className="size-4" />{importZipFile ? importZipFile.name : '上传 ZIP 文件'}
                                </button>
                            </div>
                            <button onClick={handleScan} disabled={scanning || (!importUrl && !importZipFile)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50">
                                {scanning ? <><Loader2 className="size-4 animate-spin" />扫描中...</> : '扫描'}
                            </button>
                            {scanResult && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-sm font-medium text-foreground">发现 {scanResult.files.length} 个 JSON 文件</p>
                                        <div className="flex gap-3">
                                            <button onClick={() => setSelectedFiles(new Set(scanResult.files.map(f => f.relative_path)))} className="text-xs text-primary hover:underline">全选</button>
                                            <button onClick={() => setSelectedFiles(new Set())} className="text-xs text-muted-foreground hover:underline">取消全选</button>
                                        </div>
                                    </div>
                                    <div className="max-h-60 space-y-1.5 overflow-y-auto">
                                        {scanResult.files.map(f => (
                                            <button key={f.relative_path} onClick={() => toggleFile(f.relative_path)} className={`flex w-full items-start gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors ${selectedFiles.has(f.relative_path) ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
                                                {selectedFiles.has(f.relative_path) ? <CheckSquare className="mt-0.5 size-4 shrink-0 text-primary" /> : <Square className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                                                <div className="flex-1 overflow-hidden">
                                                    <p className="truncate font-medium text-foreground">{f.filename}</p>
                                                    <p className="text-xs text-muted-foreground">{f.subject} / {f.question_type} · {f.question_count} 题</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <p className="mt-3 text-center text-sm text-muted-foreground">已选 {selectedFiles.size} 个文件，共 {totalSelectedQ} 题</p>
                                </div>
                            )}
                        </div>

                        {scanResult && (
                            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
                                <button onClick={() => { setShowBatchImport(false); setScanResult(null); setImportUrl(''); setImportZipFile(null) }} className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors">取消</button>
                                <button onClick={handleConfirmImport} disabled={importing || selectedFiles.size === 0} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50">
                                    {importing ? <><Loader2 className="mr-1.5 inline size-4 animate-spin" />导入中...</> : `确认导入 (${selectedFiles.size} 个文件)`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
