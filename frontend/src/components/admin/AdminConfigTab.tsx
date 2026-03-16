import { useEffect, useState, useRef } from 'react'
import { adminApi, type SystemConfig } from '@/lib/api'
import { toast } from 'sonner'
import { Play, Database, Server, Key, Plus, Trash2, Tag, ShieldAlert, ChevronDown, ChevronUp, RefreshCw, Zap, Settings2, Download, Upload } from 'lucide-react'
import { TestResultModal } from './TestResultModal'
import { useAuthStore } from '@/stores/auth'


const PRO_NODES = [
    { key: 'HOTSPOT_SEARCHER', label: '热点检索', desc: '搜索时事热点素材' },
    { key: 'QUESTION_GENERATOR', label: '题目生成', desc: '核心出题模型，建议用强模型' },
    { key: 'QUALITY_CHECKER', label: '质量审查', desc: '审查题目质量，可用快速模型' },
] as const

type ProNodeKey = typeof PRO_NODES[number]['key']

interface NodeConfig {
    apiKey: string
    baseUrl: string
    model: string
}

interface StudentModel { apiKey: string; baseUrl: string; model: string; promptDegradation: boolean }
interface LlmConfig  { key: string; baseUrl: string; model: string }
interface EmbConfig  { key: string; baseUrl: string; model: string; dims: string }
interface OcrConfig  { key: string; baseUrl: string; model: string; mode: 'multimodal'|'ocr_plus_llm'; llmModel: string }
interface LdConfig   { enabled: boolean; clientId: string; clientSecret: string; redirectUri: string; minTrust: string }
interface TestingState { llm: boolean; emb: boolean; ocr: boolean }
interface SavingState  { aiServices: boolean; proNodes: boolean; ld: boolean }
interface ExportState  { showConfirm: boolean; isExporting: boolean }
interface ImportState  { isImporting: boolean; showConfirm: boolean; file: File|null; preview: { key:string; value:string|null; description:string|null }[] }

export function AdminConfigTab() {
    const [configs, setConfigs] = useState<SystemConfig[]>([])
    const [loading, setLoading] = useState(true)

    const [activeTab, setActiveTab] = useState<'llm' | 'ai_services' | 'pro_nodes' | 'linux_do' | 'raw'>('llm')

    const [llmConfig,   setLlmConfig]   = useState<LlmConfig>({ key: '', baseUrl: '', model: '' })
    const [embConfig,   setEmbConfig]   = useState<EmbConfig>({ key: '', baseUrl: '', model: '', dims: '' })
    const [ocrConfig,   setOcrConfig]   = useState<OcrConfig>({ key: '', baseUrl: '', model: '', mode: 'multimodal', llmModel: '' })
    const [ldConfig,    setLdConfig]    = useState<LdConfig>({ enabled: false, clientId: '', clientSecret: '', redirectUri: '', minTrust: '1' })
    const [testing,     setTesting]     = useState<TestingState>({ llm: false, emb: false, ocr: false })
    const [saving,      setSaving]      = useState<SavingState>({ aiServices: false, proNodes: false, ld: false })
    const [exportState, setExportState] = useState<ExportState>({ showConfirm: false, isExporting: false })
    const [importState, setImportState] = useState<ImportState>({ isImporting: false, showConfirm: false, file: null, preview: [] })

    // Test result modal state
    const [testModal, setTestModal] = useState<{
        open: boolean
        type: 'llm' | 'embedding' | 'ocr'
        loading: boolean
        result: any | null
        error: string | null
    }>({ open: false, type: 'llm', loading: false, result: null, error: null })

    // Pro node config state
    const [nodeConfigs, setNodeConfigs] = useState<Record<ProNodeKey, NodeConfig>>({
        HOTSPOT_SEARCHER: { apiKey: '', baseUrl: '', model: '' },
        QUESTION_GENERATOR: { apiKey: '', baseUrl: '', model: '' },
        QUALITY_CHECKER: { apiKey: '', baseUrl: '', model: '' },
    })
    const [expandedNodes, setExpandedNodes] = useState<ProNodeKey[]>([])
    const [proConcurrency, setProConcurrency] = useState('3')

    const [studentCount, setStudentCount] = useState(3)
    const [studentModels, setStudentModels] = useState<StudentModel[]>(
        Array.from({ length: 5 }, () => ({ apiKey: '', baseUrl: '', model: '', promptDegradation: false }))
    )

    const [allowRegistration, setAllowRegistration] = useState(true)

    const [rawConfirmInput, setRawConfirmInput] = useState('')
    const rawUnlocked = rawConfirmInput === '我明白我在做什么并且我确认我需要这么做'

    const { user } = useAuthStore()

    const handleExport = async () => {
        setExportState(p => ({ ...p, showConfirm: false, isExporting: true }))
        try {
            const blob = await adminApi.exportConfigs()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            const date = new Date().toISOString().slice(0, 10)
            a.href = url
            a.download = `cogniloop-configs-${date}.json`
            a.click()
            URL.revokeObjectURL(url)
            toast.success('配置已导出')
        } catch (err: any) {
            toast.error(err.message || '导出失败')
        } finally {
            setExportState(p => ({ ...p, isExporting: false }))
        }
    }

    const importFileRef = useRef<HTMLInputElement>(null)

    const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ''
        const reader = new FileReader()
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result as string)
                if (!Array.isArray(data) || data.length === 0) {
                    toast.error('JSON 格式不正确，应为配置项数组')
                    return
                }
                if (!data[0].key) {
                    toast.error('JSON 格式不正确，每项须包含 key 字段')
                    return
                }
                setImportState(p => ({ ...p, file, preview: data, showConfirm: true }))
            } catch {
                toast.error('无法解析 JSON 文件')
            }
        }
        reader.readAsText(file)
    }

    const handleImport = async () => {
        setImportState(p => ({ ...p, showConfirm: false, isImporting: true }))
        try {
            const res = await adminApi.importConfigs(importState.preview)
            toast.success(`已导入 ${res.imported} 项配置`)
            await loadConfigs()
        } catch (err: any) {
            toast.error(err.message || '导入失败')
        } finally {
            setImportState(p => ({ ...p, isImporting: false, file: null, preview: [] }))
        }
    }

    const loadConfigs = async () => {
        try {
            const data = await adminApi.listConfigs()
            setConfigs(data)
            const get = (k: string) => data.find((c: SystemConfig) => c.key === k)?.value || ''
            setLlmConfig({ key: get('OPENAI_API_KEY'), baseUrl: get('OPENAI_BASE_URL'), model: get('OPENAI_MODEL') })
            setEmbConfig({ key: get('EMBEDDING_API_KEY'), baseUrl: get('EMBEDDING_BASE_URL'), model: get('EMBEDDING_MODEL'), dims: get('EMBEDDING_DIMS') })
            setOcrConfig({ key: get('OCR_API_KEY'), baseUrl: get('OCR_API_URL'), model: get('OCR_MODEL'), mode: (get('OCR_MODE') as 'multimodal' | 'ocr_plus_llm') || 'multimodal', llmModel: get('OCR_LLM_MODEL') || '' })
            setLdConfig({ enabled: get('LINUX_DO_ENABLED') === 'true', clientId: get('LINUX_DO_CLIENT_ID'), clientSecret: get('LINUX_DO_CLIENT_SECRET'), redirectUri: get('LINUX_DO_REDIRECT_URI'), minTrust: get('LINUX_DO_MIN_TRUST_LEVEL') || '1' })

            const newNodeConfigs = { ...nodeConfigs }
            for (const node of PRO_NODES) {
                newNodeConfigs[node.key] = {
                    apiKey: get(`PRO_NODE_${node.key}_API_KEY`),
                    baseUrl: get(`PRO_NODE_${node.key}_BASE_URL`),
                    model: get(`PRO_NODE_${node.key}_MODEL`),
                }
            }
            setNodeConfigs(newNodeConfigs)
            const savedModels = get('PRO_NODE_SOLVE_VERIFIER_MODELS')
            if (savedModels) {
                try {
                    const parsed: Array<{ api_key?: string; base_url?: string; model?: string; prompt_degradation?: boolean }> = JSON.parse(savedModels)
                    const count = Math.max(1, Math.min(5, parsed.length))
                    setStudentCount(count)
                    setStudentModels(
                        Array.from({ length: 5 }, (_, i) => ({
                            apiKey: parsed[i]?.api_key || '',
                            baseUrl: parsed[i]?.base_url || '',
                            model: parsed[i]?.model || '',
                            promptDegradation: parsed[i]?.prompt_degradation ?? false,
                        }))
                    )
                } catch { /* ignore */ }
            }
            setProConcurrency(get('PRO_CONCURRENCY') || '3')

            const allowReg = data.find((c: SystemConfig) => c.key === 'ALLOW_REGISTRATION')?.value
            setAllowRegistration(allowReg !== 'false')
        } catch {
            toast.error('加载系统配置失败')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadConfigs() }, [])

    const MASK_PREFIX = '****'

    const saveLlmConfig = async () => {
        try {
            if (!llmConfig.key.startsWith(MASK_PREFIX)) await adminApi.setConfig('OPENAI_API_KEY', llmConfig.key, 'LLM API 密钥')
            if (llmConfig.baseUrl) await adminApi.setConfig('OPENAI_BASE_URL', llmConfig.baseUrl, 'LLM 基础 URL')
            await adminApi.setConfig('OPENAI_MODEL', llmConfig.model || 'gpt-4o-mini', 'LLM 模型名称')
            toast.success('LLM 配置已保存')
            loadConfigs()
        } catch { toast.error('保存失败') }
    }

    const handleTestLlm = () => {
        if (!llmConfig.model) return toast.error('请填写 Model')
        if (!llmConfig.key && !llmConfig.key.startsWith(MASK_PREFIX)) return toast.error('请填写 Key')
        const isMasked = llmConfig.key.startsWith(MASK_PREFIX)
        runTestModal('llm', () => adminApi.testLlm({
            api_key: isMasked ? undefined : llmConfig.key,
            base_url: llmConfig.baseUrl || undefined,
            model: llmConfig.model,
            use_stored: isMasked,
        }), (v) => setTesting(p => ({ ...p, llm: v })))
    }

    const handleTestEmb = () => {
        if (!embConfig.model) return toast.error('请填写 Model')
        if (!embConfig.key && !embConfig.key.startsWith(MASK_PREFIX)) return toast.error('请填写 Key')
        const isMasked = embConfig.key.startsWith(MASK_PREFIX)
        runTestModal('embedding', () => adminApi.testEmbedding({
            api_key: isMasked ? undefined : embConfig.key,
            base_url: embConfig.baseUrl || undefined,
            model: embConfig.model,
            dimensions: embConfig.dims ? parseInt(embConfig.dims) : undefined,
            use_stored: isMasked,
        }), (v) => setTesting(p => ({ ...p, emb: v })))
    }

    const handleTestOcr = () => {
        runTestModal('ocr', () => adminApi.testOcr(), (v) => setTesting(p => ({ ...p, ocr: v })))
    }

    const saveAiServicesConfig = async () => {
        setSaving(p => ({ ...p, aiServices: true }))
        try {
            if (!embConfig.key.startsWith(MASK_PREFIX)) await adminApi.setConfig('EMBEDDING_API_KEY', embConfig.key, 'Embedding API 密钥')
            if (embConfig.baseUrl) await adminApi.setConfig('EMBEDDING_BASE_URL', embConfig.baseUrl, 'Embedding 基础 URL')
            await adminApi.setConfig('EMBEDDING_MODEL', embConfig.model || 'text-embedding-3-small', 'Embedding 模型名称')
            if (embConfig.dims) await adminApi.setConfig('EMBEDDING_DIMS', embConfig.dims, '向量维度')
            if (ocrConfig.key && !ocrConfig.key.startsWith(MASK_PREFIX)) await adminApi.setConfig('OCR_API_KEY', ocrConfig.key, 'OCR API 密钥')
            if (ocrConfig.baseUrl) await adminApi.setConfig('OCR_API_URL', ocrConfig.baseUrl, 'OCR API 基础 URL')
            await adminApi.setConfig('OCR_MODEL', ocrConfig.model || 'gpt-4o', 'OCR 视觉模型名称')
            await adminApi.setConfig('OCR_MODE', ocrConfig.mode, 'OCR 识别模式')
            if (ocrConfig.mode === 'ocr_plus_llm') {
                await adminApi.setConfig('OCR_LLM_MODEL', ocrConfig.llmModel, 'OCR 结构化 LLM 模型')
            }
            toast.success('AI 服务配置已保存')
            loadConfigs()
        } catch { toast.error('保存失败') } finally { setSaving(p => ({ ...p, aiServices: false })) }
    }

    const runTestModal = async (type: 'llm' | 'embedding' | 'ocr', apiCall: () => Promise<any>, setLoader: (v: boolean) => void) => {
        setTestModal({ open: true, type, loading: true, result: null, error: null })
        setLoader(true)
        try {
            const res = await apiCall()
            if (res.ok) {
                setTestModal(prev => ({ ...prev, loading: false, result: res }))
            } else {
                setTestModal(prev => ({ ...prev, loading: false, error: res.message || '未知错误' }))
            }
        } catch (error: any) {
            const detail = error.response?.data?.detail || error.message || '连接失败'
            setTestModal(prev => ({ ...prev, loading: false, error: detail }))
        } finally {
            setLoader(false)
        }
    }

    const updateNodeConfig = (nodeKey: ProNodeKey, field: keyof NodeConfig, value: string) => {
        setNodeConfigs(prev => ({
            ...prev,
            [nodeKey]: { ...prev[nodeKey], [field]: value },
        }))
    }

    const toggleNodeExpand = (nodeKey: ProNodeKey) => {
        setExpandedNodes(prev =>
            prev.includes(nodeKey) ? prev.filter(k => k !== nodeKey) : [...prev, nodeKey]
        )
    }

    const syncNodeFromGlobal = (nodeKey: ProNodeKey) => {
        setNodeConfigs(prev => ({
            ...prev,
            [nodeKey]: { apiKey: llmConfig.key, baseUrl: llmConfig.baseUrl, model: llmConfig.model },
        }))
        toast.success(`已同步全局配置到 ${PRO_NODES.find(n => n.key === nodeKey)?.label}`)
    }

    const syncAllFromGlobal = () => {
        if (!window.confirm('确定将全局 LLM 配置同步到所有 3 个节点？')) return
        const synced = { ...nodeConfigs }
        for (const node of PRO_NODES) {
            synced[node.key] = { apiKey: llmConfig.key, baseUrl: llmConfig.baseUrl, model: llmConfig.model }
        }
        setNodeConfigs(synced)
        toast.success('已同步全局配置到所有节点')
    }

    const saveProNodesConfig = async () => {
        try {
            setSaving(p => ({ ...p, proNodes: true }))
            for (const node of PRO_NODES) {
                const cfg = nodeConfigs[node.key]
                const prefix = `PRO_NODE_${node.key}`
                if (cfg.apiKey && !cfg.apiKey.startsWith(MASK_PREFIX)) await adminApi.setConfig(`${prefix}_API_KEY`, cfg.apiKey, `${node.label} API Key`)
                if (cfg.baseUrl) await adminApi.setConfig(`${prefix}_BASE_URL`, cfg.baseUrl, `${node.label} Base URL`)
                if (cfg.model) await adminApi.setConfig(`${prefix}_MODEL`, cfg.model, `${node.label} 模型名称`)
            }
            // Solve verifier special configs
            const modelsPayload = studentModels.slice(0, studentCount).map((m, i) => ({
                label: `学生${i + 1}`,
                api_key: m.apiKey,
                base_url: m.baseUrl,
                model: m.model,
                prompt_degradation: m.promptDegradation,
            }))
            await adminApi.setConfig(
                'PRO_NODE_SOLVE_VERIFIER_MODELS',
                JSON.stringify(modelsPayload),
                'Solve Verifier 多模型配置'
            )
            await adminApi.setConfig('PRO_CONCURRENCY', String(Math.max(1, Math.min(10, parseInt(proConcurrency) || 3))), '并发出题数')
            toast.success('仿真组卷配置已保存')
            loadConfigs()
        } catch {
            toast.error('保存失败')
        } finally {
            setSaving(p => ({ ...p, proNodes: false }))
        }
    }

    const saveLoginAccessConfig = async () => {
        try {
            setSaving(p => ({ ...p, ld: true }))
            await adminApi.setConfig('LINUX_DO_ENABLED', String(ldConfig.enabled), 'Linux DO 登录开关')
            if (ldConfig.clientId) await adminApi.setConfig('LINUX_DO_CLIENT_ID', ldConfig.clientId, 'Linux DO Client ID')
            if (ldConfig.clientSecret && !ldConfig.clientSecret.startsWith(MASK_PREFIX)) await adminApi.setConfig('LINUX_DO_CLIENT_SECRET', ldConfig.clientSecret, 'Linux DO Client Secret（加密存储）')
            if (ldConfig.redirectUri) await adminApi.setConfig('LINUX_DO_REDIRECT_URI', ldConfig.redirectUri, 'Linux DO 回调地址')
            await adminApi.setConfig('LINUX_DO_MIN_TRUST_LEVEL', ldConfig.minTrust || '1', 'Linux DO 最低信任等级')
            await adminApi.setConfig('ALLOW_REGISTRATION', String(allowRegistration), '公开注册开关')
            toast.success('配置已保存')
            loadConfigs()
        } catch { toast.error('保存失败') } finally { setSaving(p => ({ ...p, ld: false })) }
    }

    const handleAddRaw = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const key = fd.get('key') as string
        const val = fd.get('val') as string
        const desc = fd.get('desc') as string
        if (!key) return toast.error('Key 不能为空')
        try {
            await adminApi.setConfig(key, val, desc)
            toast.success('已添加')
            e.currentTarget.reset()
            loadConfigs()
        } catch { toast.error('添加失败') }
    }

    const handleDelete = async (key: string) => {
        if (!window.confirm(`确定删除 ${key}？`)) return
        try {
            await adminApi.deleteConfig(key)
            toast.success('已删除')
            loadConfigs()
        } catch { toast.error('删除失败') }
    }

    if (loading) return (
        <div className="p-6 space-y-5 animate-pulse">
            <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-muted/50" />
                <div className="space-y-1.5">
                    <div className="h-4 w-24 rounded bg-muted/50" />
                    <div className="h-3 w-40 rounded bg-muted/50" />
                </div>
            </div>
            <div className="h-64 rounded-xl bg-muted/50" />
        </div>
    )

    const inputClass = "w-full bg-transparent border-0 border-b border-border px-0 py-2 text-sm focus:outline-none focus:border-foreground font-mono transition-colors placeholder:text-muted-foreground/50"

    const SUB_TABS = [
        { key: 'llm' as const, label: 'LLM 核心模型' },
        { key: 'ai_services' as const, label: 'AI 服务配置' },
        { key: 'pro_nodes' as const, label: '仿真组卷设置' },
        { key: 'linux_do' as const, label: '登录与访问控制' },
        { key: 'raw' as const, label: '高级变量' },
    ]

    return (
        <div className="animate-fade-in">
            {/* Page header */}
            <div className="px-6 py-5 border-b border-border flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 shadow-lg shadow-violet-500/25">
                    <Settings2 className="size-5 text-white" />
                </div>
                <div className="flex-1">
                    <h2 className="text-base font-medium text-foreground">系统设置</h2>
                    <p className="text-xs text-muted-foreground">配置 LLM 模型、向量模型及仿真组卷参数</p>
                </div>
                {user?.is_superadmin && (
                    <>
                        <button
                            onClick={() => importFileRef.current?.click()}
                            disabled={importState.isImporting}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition disabled:opacity-50"
                        >
                            <Upload className="size-3.5" />
                            {importState.isImporting ? '导入中...' : '导入配置'}
                        </button>
                        <input ref={importFileRef} type="file" accept=".json" className="hidden" onChange={handleImportFileSelect} />
                        <button
                            onClick={() => setExportState(p => ({ ...p, showConfirm: true }))}
                            disabled={exportState.isExporting}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition disabled:opacity-50"
                        >
                            <Download className="size-3.5" />
                            {exportState.isExporting ? '导出中...' : '导出配置'}
                        </button>
                    </>
                )}
            </div>

            {/* Sub-tabs */}
            <div className="flex border-b border-border px-6">
                {SUB_TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        className={`relative px-4 py-3 text-sm font-medium transition-colors ${activeTab === t.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {t.label}
                        {activeTab === t.key && <span className="absolute bottom-0 inset-x-1 h-0.5 rounded-full bg-foreground" />}
                    </button>
                ))}
            </div>

            {activeTab === 'llm' && (
                <div className="animate-in fade-in p-6">
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="px-6 py-4 border-b border-border">
                            <p className="text-sm text-muted-foreground">负责题库智能生成、填空题/简答题批改的核心语言模型。</p>
                        </div>
                        <div className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border">
                            <div className="px-6 py-5 space-y-1">
                                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Key className="size-3" /> API Key <span className="text-rose-500">*</span></label>
                                <input type="password" value={llmConfig.key} onChange={e => setLlmConfig(p => ({ ...p, key: e.target.value }))} placeholder="sk-..." className={inputClass} />
                            </div>
                            <div className="px-6 py-5 space-y-1">
                                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Server className="size-3" /> Base URL</label>
                                <input type="text" value={llmConfig.baseUrl} onChange={e => setLlmConfig(p => ({ ...p, baseUrl: e.target.value }))} placeholder="https://api.openai.com/v1" className={inputClass} />
                            </div>
                            <div className="px-6 py-5 space-y-1">
                                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Tag className="size-3" /> Model Name <span className="text-rose-500">*</span></label>
                                <input type="text" value={llmConfig.model} onChange={e => setLlmConfig(p => ({ ...p, model: e.target.value }))} placeholder="gpt-4o-mini" className={inputClass} />
                            </div>
                        </div>
                        <div className="flex items-center gap-3 px-6 py-4 border-t border-border bg-muted/20">
                            <button onClick={saveLlmConfig} className="bg-foreground text-background px-5 py-2 rounded-md text-sm font-medium transition-colors hover:bg-foreground/90">
                                保存
                            </button>
                            <button onClick={handleTestLlm} disabled={testing.llm} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                                {testing.llm ? <div className="size-3.5 animate-spin rounded-full border-2 border-foreground border-t-transparent" /> : <Play className="size-3.5 text-emerald-500" />}
                                {testing.llm ? '测试中...' : '测试连接'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'ai_services' && (
                <div className="animate-in fade-in p-6 space-y-4">
                    {/* Embedding section */}
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="px-6 py-4 border-b border-border">
                            <p className="text-xs font-medium text-foreground uppercase tracking-wider mb-0.5">Embedding 向量</p>
                            <p className="text-sm text-muted-foreground">负责将文档和题目转化为向量数组，用于知识库检索 (RAG)。</p>
                        </div>
                        <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
                            <div className="px-6 py-5 space-y-5">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Key className="size-3" /> API Key <span className="text-rose-500">*</span></label>
                                    <input type="password" value={embConfig.key} onChange={e => setEmbConfig(p => ({ ...p, key: e.target.value }))} placeholder="sk-..." className={inputClass} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Database className="size-3" /> 向量维度</label>
                                    <input type="number" value={embConfig.dims} onChange={e => setEmbConfig(p => ({ ...p, dims: e.target.value }))} placeholder="可选，默认由模型决定" className={inputClass} />
                                </div>
                            </div>
                            <div className="px-6 py-5 space-y-5">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Server className="size-3" /> Base URL</label>
                                    <input type="text" value={embConfig.baseUrl} onChange={e => setEmbConfig(p => ({ ...p, baseUrl: e.target.value }))} placeholder="https://api.openai.com/v1" className={inputClass} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Tag className="size-3" /> Model Name <span className="text-rose-500">*</span></label>
                                    <input type="text" value={embConfig.model} onChange={e => setEmbConfig(p => ({ ...p, model: e.target.value }))} placeholder="text-embedding-3-small" className={inputClass} />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 px-6 py-3 border-t border-border bg-muted/10">
                            <button onClick={handleTestEmb} disabled={testing.emb} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                                {testing.emb ? <div className="size-3.5 animate-spin rounded-full border-2 border-foreground border-t-transparent" /> : <Play className="size-3.5 text-emerald-500" />}
                                {testing.emb ? '测试中...' : '测试连接'}
                            </button>
                        </div>
                    </div>

                    {/* OCR section */}
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="px-6 py-4 border-b border-border">
                            <p className="text-xs font-medium text-foreground uppercase tracking-wider mb-0.5">OCR 识别</p>
                            <p className="text-sm text-muted-foreground">用于试卷模板 OCR 扫描识别的视觉模型。留空则自动使用全局 LLM 配置。</p>
                        </div>
                        <div className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border">
                            <div className="px-6 py-5 space-y-1">
                                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Key className="size-3" /> API Key</label>
                                <input type="password" value={ocrConfig.key} onChange={e => setOcrConfig(p => ({ ...p, key: e.target.value }))} placeholder="留空则使用全局 LLM Key" className={inputClass} />
                            </div>
                            <div className="px-6 py-5 space-y-1">
                                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Server className="size-3" /> Base URL</label>
                                <input type="text" value={ocrConfig.baseUrl} onChange={e => setOcrConfig(p => ({ ...p, baseUrl: e.target.value }))} placeholder="留空则使用全局 LLM URL" className={inputClass} />
                            </div>
                            <div className="px-6 py-5 space-y-1">
                                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Tag className="size-3" /> Model Name</label>
                                <input type="text" value={ocrConfig.model} onChange={e => setOcrConfig(p => ({ ...p, model: e.target.value }))} placeholder="默认 gpt-4o" className={inputClass} />
                            </div>
                        </div>
                        <div className="px-6 py-5 border-t border-border space-y-3">
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Tag className="size-3" /> 识别模式</label>
                            <div className="flex flex-col gap-2">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input type="radio" name="ocrMode" value="multimodal" checked={ocrConfig.mode === 'multimodal'} onChange={() => setOcrConfig(p => ({ ...p, mode: 'multimodal' }))} className="mt-0.5 accent-primary" />
                                    <div>
                                        <p className="text-sm font-medium text-foreground">多模态大模型</p>
                                        <p className="text-xs text-muted-foreground">图片直接发给视觉大模型，一步输出结构化 JSON（默认）</p>
                                    </div>
                                </label>
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input type="radio" name="ocrMode" value="ocr_plus_llm" checked={ocrConfig.mode === 'ocr_plus_llm'} onChange={() => setOcrConfig(p => ({ ...p, mode: 'ocr_plus_llm' }))} className="mt-0.5 accent-primary" />
                                    <div>
                                        <p className="text-sm font-medium text-foreground">OCR + LLM 两步识别</p>
                                        <p className="text-xs text-muted-foreground">Step 1 用 OCR 模型提取文字，Step 2 用全局 LLM 结构化（适合 PaddleOCR-VL 等专用 OCR 模型）</p>
                                    </div>
                                </label>
                            </div>
                            {ocrConfig.mode === 'ocr_plus_llm' && (
                                <div className="mt-2 space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Tag className="size-3" /> 结构化 LLM 模型（Step 2，使用全局 LLM API Key）</label>
                                    <input type="text" value={ocrConfig.llmModel} onChange={e => setOcrConfig(p => ({ ...p, llmModel: e.target.value }))} placeholder="留空则使用全局 LLM 模型" className={inputClass} />
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3 px-6 py-3 border-t border-border bg-muted/10">
                            <button onClick={handleTestOcr} disabled={testing.ocr} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                                {testing.ocr ? <div className="size-3.5 animate-spin rounded-full border-2 border-foreground border-t-transparent" /> : <Play className="size-3.5 text-emerald-500" />}
                                {testing.ocr ? '识别中...' : '测试识别'}
                            </button>
                        </div>
                    </div>

                    {/* Shared save button */}
                    <div>
                        <button onClick={saveAiServicesConfig} disabled={saving.aiServices} className="bg-foreground text-background px-5 py-2 rounded-md text-sm font-medium transition-colors hover:bg-foreground/90 disabled:opacity-50">
                            {saving.aiServices ? '保存中...' : '保存'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'pro_nodes' && (
                <div className="animate-in fade-in p-6 space-y-4">
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">为仿真组卷的每个 AI 节点单独配置 LLM 模型。留空则自动使用全局 LLM 配置。</p>
                            <button
                                onClick={syncAllFromGlobal}
                                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors shrink-0 ml-4"
                            >
                                <RefreshCw className="size-3" /> 一键同步全局配置
                            </button>
                        </div>
                        <div className="divide-y divide-border">
                            {PRO_NODES.map(node => {
                                const cfg = nodeConfigs[node.key]
                                const isExpanded = expandedNodes.includes(node.key)
                                const hasConfig = !!(cfg.apiKey || cfg.baseUrl || cfg.model)

                                return (
                                    <div key={node.key}>
                                        <button
                                            onClick={() => toggleNodeExpand(node.key)}
                                            className="w-full flex items-center gap-3 px-6 py-4 hover:bg-accent/30 transition-colors"
                                        >
                                            <Settings2 className="size-4 text-muted-foreground shrink-0" />
                                            <div className="flex-1 text-left">
                                                <span className="text-sm font-medium text-foreground">{node.label}</span>
                                                <span className="text-xs text-muted-foreground ml-2">{node.desc}</span>
                                            </div>
                                            {hasConfig && (
                                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                                    已配置
                                                </span>
                                            )}
                                            {isExpanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                                        </button>

                                        {isExpanded && (
                                            <div className="bg-accent/10 border-t border-border">
                                                <div className="flex items-center justify-end px-6 pt-3">
                                                    <button
                                                        onClick={() => syncNodeFromGlobal(node.key)}
                                                        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                                                    >
                                                        <RefreshCw className="size-2.5" /> 同步全局
                                                    </button>
                                                </div>
                                                <div className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border/50 px-6 pb-4">
                                                    <div className="px-3 py-3 space-y-1">
                                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                                            <Key className="size-3" /> API Key
                                                        </label>
                                                        <input
                                                            type="password"
                                                            value={cfg.apiKey}
                                                            onChange={e => updateNodeConfig(node.key, 'apiKey', e.target.value)}
                                                            placeholder="留空使用全局配置"
                                                            className={inputClass}
                                                        />
                                                    </div>
                                                    <div className="px-3 py-3 space-y-1">
                                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                                            <Server className="size-3" /> Base URL
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={cfg.baseUrl}
                                                            onChange={e => updateNodeConfig(node.key, 'baseUrl', e.target.value)}
                                                            placeholder="留空使用全局配置"
                                                            className={inputClass}
                                                        />
                                                    </div>
                                                    <div className="px-3 py-3 space-y-1">
                                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                                            <Tag className="size-3" /> Model Name
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={cfg.model}
                                                            onChange={e => updateNodeConfig(node.key, 'model', e.target.value)}
                                                            placeholder="留空使用全局配置"
                                                            className={inputClass}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Solve Verifier config card */}
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                            <Zap className="size-4 text-muted-foreground" />
                            <div>
                                <h4 className="text-sm font-medium text-foreground">模拟学生</h4>
                                <p className="text-xs text-muted-foreground mt-0.5">为每位模拟学生单独配置模型和提示词降级策略</p>
                            </div>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            {/* Student count selector */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <label className="text-xs font-medium text-foreground">模拟学生数量</label>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">选择同时模拟的学生人数（1–5）</p>
                                </div>
                                <div className="flex border border-border rounded-lg overflow-hidden">
                                    {[1, 2, 3, 4, 5].map(n => (
                                        <button key={n} type="button" onClick={() => setStudentCount(n)}
                                            className={`w-8 py-1.5 text-sm font-mono transition-colors ${
                                                studentCount === n ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                                            }`}>
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Per-student model config rows */}
                            <div className="space-y-2">
                                {Array.from({ length: studentCount }, (_, i) => (
                                    <div key={i} className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-2">
                                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">学生 {i + 1}</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-muted-foreground">API Key</label>
                                                <input type="password" value={studentModels[i]?.apiKey || ''}
                                                    onChange={e => setStudentModels(prev => prev.map((m, j) => j === i ? { ...m, apiKey: e.target.value } : m))}
                                                    placeholder="sk-..."
                                                    className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-foreground transition-colors" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-muted-foreground">Base URL</label>
                                                <input type="text" value={studentModels[i]?.baseUrl || ''}
                                                    onChange={e => setStudentModels(prev => prev.map((m, j) => j === i ? { ...m, baseUrl: e.target.value } : m))}
                                                    placeholder="https://api.openai.com/v1"
                                                    className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-foreground transition-colors" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-muted-foreground">Model</label>
                                                <input type="text" value={studentModels[i]?.model || ''}
                                                    onChange={e => setStudentModels(prev => prev.map((m, j) => j === i ? { ...m, model: e.target.value } : m))}
                                                    placeholder="gpt-4o-mini"
                                                    className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-foreground transition-colors" />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between pt-1">
                                            <span className="text-[10px] text-muted-foreground">提示词降级</span>
                                            <button type="button" onClick={() => setStudentModels(prev => prev.map((m, j) => j === i ? { ...m, promptDegradation: !m.promptDegradation } : m))}
                                                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0 ${studentModels[i]?.promptDegradation ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                                                <span className={`inline-block size-3 rounded-full bg-white transition-transform ${studentModels[i]?.promptDegradation ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Concurrency */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <label className="text-xs font-medium text-foreground">并发出题数</label>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">每批并发生成的题目数量 (1-10)</p>
                                </div>
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={proConcurrency}
                                    onChange={e => setProConcurrency(e.target.value)}
                                    className="w-16 bg-transparent border border-border rounded-lg px-2 py-1 text-sm text-center font-mono focus:outline-none focus:border-foreground transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Save button */}
                    <div>
                        <button
                            onClick={saveProNodesConfig}
                            disabled={saving.proNodes}
                            className="bg-foreground text-background px-5 py-2 rounded-md text-sm font-medium transition-colors hover:bg-foreground/90 disabled:opacity-50"
                        >
                            {saving.proNodes ? '保存中...' : '保存所有节点配置'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'linux_do' && (
                <div className="animate-in fade-in p-6 space-y-4">
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="px-6 py-4 border-b border-border">
                            <p className="text-sm text-muted-foreground">配置 Linux DO OAuth 2.0 第三方登录。填写 Client ID 后登录页将自动显示登录按钮。</p>
                        </div>
                        <div className="divide-y divide-border">
                            <div className="flex items-center justify-between px-6 py-4">
                                <div>
                                    <label className="text-sm font-medium text-foreground">启用 Linux DO 登录</label>
                                    <p className="text-xs text-muted-foreground mt-0.5">开启后登录页将显示 Linux DO 登录按钮</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setLdConfig(p => ({ ...p, enabled: !p.enabled }))}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${ldConfig.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                                >
                                    <span className={`inline-block size-4 rounded-full bg-white transition-transform ${ldConfig.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </button>
                            </div>
                            <div className="px-6 py-5 space-y-1">
                                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Key className="size-3" /> Client ID <span className="text-rose-500">*</span></label>
                                <input type="text" value={ldConfig.clientId} onChange={e => setLdConfig(p => ({ ...p, clientId: e.target.value }))} placeholder="从 Linux DO 开发者中心获取" className={inputClass} />
                            </div>
                            <div className="px-6 py-5 space-y-1">
                                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Key className="size-3" /> Client Secret <span className="text-rose-500">*</span></label>
                                <input type="password" value={ldConfig.clientSecret} onChange={e => setLdConfig(p => ({ ...p, clientSecret: e.target.value }))} placeholder="加密存储" className={inputClass} />
                            </div>
                            <div className="px-6 py-5 space-y-1">
                                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Server className="size-3" /> 回调地址 <span className="text-rose-500">*</span></label>
                                <input type="text" value={ldConfig.redirectUri} onChange={e => setLdConfig(p => ({ ...p, redirectUri: e.target.value }))} placeholder="https://your-domain.com/oauth/callback" className={inputClass} />
                                <p className="text-[10px] text-muted-foreground mt-1">如果你的前端地址是 https://your-domain.com 你就填写 https://your-domain.com/oauth/callback 需与 Linux DO 开发者中心中填写的回调地址完全一致</p>
                            </div>
                            <div className="flex items-center justify-between px-6 py-4">
                                <div>
                                    <label className="text-sm font-medium text-foreground">最低信任等级</label>
                                    <p className="text-xs text-muted-foreground mt-0.5">低于此等级的 Linux DO 账号将被拒绝登录（0–4）</p>
                                </div>
                                <input
                                    type="number"
                                    min={0}
                                    max={4}
                                    value={ldConfig.minTrust}
                                    onChange={e => setLdConfig(p => ({ ...p, minTrust: e.target.value }))}
                                    className="w-16 bg-transparent border border-border rounded-lg px-2 py-1 text-sm text-center font-mono focus:outline-none focus:border-foreground transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="px-6 py-4 border-b border-border">
                            <p className="text-sm text-muted-foreground">控制用户的注册方式和平台访问权限。</p>
                        </div>
                        <div className="divide-y divide-border">
                            <div className="flex items-center justify-between px-6 py-4">
                                <div>
                                    <label className="text-sm font-medium text-foreground">开放公开注册</label>
                                    <p className="text-xs text-muted-foreground mt-0.5">关闭后用户无法通过注册表单创建账号，但 Linux DO 等第三方登录不受影响</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setAllowRegistration(v => !v)}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${allowRegistration ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                                >
                                    <span className={`inline-block size-4 rounded-full bg-white transition-transform ${allowRegistration ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <button onClick={saveLoginAccessConfig} disabled={saving.ld} className="bg-foreground text-background px-5 py-2 rounded-md text-sm font-medium transition-colors hover:bg-foreground/90 disabled:opacity-50">
                            {saving.ld ? '保存中...' : '保存'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'raw' && (
                <div className="animate-in fade-in p-6">
                    {!rawUnlocked ? (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                            <div className="px-6 py-5 space-y-4">
                                <div className="flex gap-3">
                                    <ShieldAlert className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">高风险操作区域</p>
                                        <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                                            此功能允许直接向运行时注入任意环境变量。写入未知的 Key 可能导致服务崩溃、数据丢失或安全漏洞。<br />
                                            请不要在不了解后果的情况下修改任何变量。如需继续，请在下方输入确认语句。
                                        </p>
                                    </div>
                                </div>
                                <label className="block text-xs font-medium text-amber-700 dark:text-amber-400">
                                    输入：<span className="font-mono">我明白我在做什么并且我确认我需要这么做</span>
                                </label>
                                <input
                                    type="text"
                                    value={rawConfirmInput}
                                    onChange={e => setRawConfirmInput(e.target.value)}
                                    placeholder="在此输入确认语句..."
                                    className="w-full rounded-lg border border-amber-500/40 bg-transparent px-3.5 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-amber-500 transition-colors"
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                            </div>
                        </div>
                    ) : (
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="px-6 py-3 border-b border-border bg-amber-500/5 flex gap-2 items-center">
                            <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            <p className="text-xs text-amber-700 dark:text-amber-400">直接注入运行时环境变量，篡改未知 Key 可能导致系统崩溃。</p>
                        </div>

                        <form onSubmit={handleAddRaw} className="grid grid-cols-12 items-end gap-0 border-b border-border divide-x divide-border">
                            <div className="col-span-3 px-4 py-3">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Key</label>
                                <input name="key" required className={`${inputClass} uppercase`} placeholder="SYS_..." />
                            </div>
                            <div className="col-span-4 px-4 py-3">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Value</label>
                                <input name="val" className={inputClass} placeholder="值..." />
                            </div>
                            <div className="col-span-3 px-4 py-3">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">备注</label>
                                <input name="desc" className={inputClass} placeholder="可选" />
                            </div>
                            <div className="col-span-2 px-4 py-3 flex items-end">
                                <button type="submit" className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 transition-colors py-2">
                                    <Plus className="size-3.5" /> 注入
                                </button>
                            </div>
                        </form>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-muted/30 text-muted-foreground border-b border-border">
                                    <tr>
                                        <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">Key</th>
                                        <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">Value</th>
                                        <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">备注</th>
                                        <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider text-right">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {configs.map(c => (
                                        <tr key={c.key} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-3 font-mono text-xs font-medium text-foreground/90">{c.key}</td>
                                            <td className="px-6 py-3 font-mono text-xs text-muted-foreground truncate max-w-[200px]">{c.value ? c.value.replace(/./g, '*') : '-'}</td>
                                            <td className="px-6 py-3 text-xs text-muted-foreground">{c.description || '-'}</td>
                                            <td className="px-6 py-3 text-right">
                                                <button onClick={() => handleDelete(c.key)} className="text-rose-500 hover:text-rose-700 transition-colors text-xs font-medium inline-flex items-center gap-1">
                                                    <Trash2 className="size-3.5" /> 删除
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {configs.length === 0 && (
                                        <tr><td colSpan={4} className="px-6 py-10 text-center text-muted-foreground text-xs">暂无环境变量</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    )}
                </div>
            )}

            <TestResultModal
                open={testModal.open}
                onClose={() => setTestModal(prev => ({ ...prev, open: false }))}
                type={testModal.type}
                loading={testModal.loading}
                result={testModal.result}
                error={testModal.error}
            />

            {exportState.showConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setExportState(p => ({ ...p, showConfirm: false }))}>
                    <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
                                    <ShieldAlert className="size-5 text-amber-500" />
                                </div>
                                <div>
                                    <h3 className="text-base font-medium text-foreground">确认导出配置</h3>
                                    <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                                        导出文件将包含所有系统配置的<span className="font-medium text-amber-500">明文内容</span>，包括 API Key 等敏感信息。请妥善保管导出文件，避免泄露。
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
                            <button
                                onClick={() => setExportState(p => ({ ...p, showConfirm: false }))}
                                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleExport}
                                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition"
                            >
                                <Download className="size-4" />
                                确认导出
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {importState.showConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setImportState(p => ({ ...p, showConfirm: false }))}>
                    <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/10">
                                    <Upload className="size-5 text-indigo-500" />
                                </div>
                                <div>
                                    <h3 className="text-base font-medium text-foreground">确认导入配置</h3>
                                    <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                                        将从 <span className="font-mono text-foreground">{importState.file?.name}</span> 导入 <span className="font-medium text-foreground">{importState.preview.length}</span> 项配置。已存在的配置项将被覆盖。
                                    </p>
                                </div>
                            </div>
                            <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30">
                                <table className="w-full text-left text-xs">
                                    <thead className="sticky top-0 bg-muted text-muted-foreground">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">Key</th>
                                            <th className="px-3 py-2 font-medium">Value</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {importState.preview.map(item => (
                                            <tr key={item.key}>
                                                <td className="px-3 py-1.5 font-mono font-medium text-foreground/90">{item.key}</td>
                                                <td className="px-3 py-1.5 font-mono text-muted-foreground truncate max-w-[200px]">{item.value ? '••••' : '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
                            <button
                                onClick={() => setImportState(p => ({ ...p, showConfirm: false }))}
                                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleImport}
                                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
                            >
                                <Upload className="size-4" />
                                确认导入
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
