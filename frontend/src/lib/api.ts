/**
 * HTTP client for CogniLoop v2 API.
 * All requests go through the Vite proxy → FastAPI.
 */

const BASE_URL = '/api/v2'

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('token')
    return token ? { 'Authorization': `Bearer ${token}` } : {}
}

async function request<T>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...((options.headers as Record<string, string>) || {}),
    }

    let res: Response
    try {
        res = await fetch(`${BASE_URL}${path}`, {
            ...options,
            headers,
        })
    } catch {
        throw new ApiError(0, '无法连接到服务器，请检查网络连接')
    }

    if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        let message: string
        if (res.status === 422 && Array.isArray(body.detail)) {
            const first = body.detail[0]
            message = first?.msg || '输入内容格式有误'
        } else if (res.status >= 500) {
            message = '服务器错误，请稍后重试'
        } else {
            message = typeof body.detail === 'string' ? body.detail : '请求失败'
        }
        throw new ApiError(res.status, message)
    }

    if (res.status === 204) return undefined as T

    return res.json()
}

/**
 * Upload a file (multipart — no Content-Type header, let browser set boundary).
 */
async function upload<T>(path: string, file: File, fieldName = 'file'): Promise<T> {
    const form = new FormData()
    form.append(fieldName, file)

    let res: Response
    try {
        res = await fetch(`${BASE_URL}${path}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: form,
        })
    } catch {
        throw new ApiError(0, '无法连接到服务器，请检查网络连接')
    }

    if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new ApiError(res.status, body.detail || '上传失败')
    }

    return res.json()
}

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message)
        this.name = 'ApiError'
    }
}

export const api = {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    patch: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
    put: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    upload: <T>(path: string, file: File, fieldName?: string) =>
        upload<T>(path, file, fieldName),
}

// Setup API (first-run)

export const setupApi = {
    check: () => api.get<{ needs_setup: boolean }>('/auth/setup-check'),
    createAdmin: (data: { username: string; email: string; password: string; full_name: string }) =>
        api.post<{ id: number }>('/auth/setup', data),
}

// SSE helper

export interface SSEEvent {
    type: string
    progress?: number
    message?: string
    node?: string
    error?: string
    question_count?: number
    total_score?: number
    accuracy?: number
    session_id?: string
    [key: string]: unknown
}

export interface SubscribeSSEOptions {
    onEvent: (event: SSEEvent) => void
    onError?: () => void          // called when all retries exhausted
    onReconnect?: () => void      // called after each successful reconnect
    maxRetries?: number           // default 3
}

/**
 * Subscribe to SSE stream for a quiz session with auto-reconnect.
 * Fetches a one-time ticket first, then opens the EventSource.
 * On disconnect, retries with exponential backoff (1s → 2s → 4s).
 * Returns a cleanup function to close the connection and stop retries.
 */
export async function subscribeSSE(
    sessionId: string,
    options: SubscribeSSEOptions,
): Promise<() => void> {
    const { onEvent, onError, onReconnect, maxRetries = 3 } = options

    let aborted = false
    let streamEnded = false
    let retryCount = 0
    let pendingTimer: ReturnType<typeof setTimeout> | undefined
    let currentES: EventSource | undefined

    function cleanup() {
        aborted = true
        if (pendingTimer !== undefined) {
            clearTimeout(pendingTimer)
            pendingTimer = undefined
        }
        if (currentES) {
            currentES.close()
            currentES = undefined
        }
    }

    async function connect(): Promise<void> {
        const { ticket } = await api.post<{ ticket: string }>('/notifications/sse-ticket')
        const url = `${BASE_URL}/quiz-sessions/${sessionId}/stream?ticket=${encodeURIComponent(ticket)}`

        if (aborted) return

        const es = new EventSource(url)
        currentES = es

        const handleEvent = (e: MessageEvent) => {
            try {
                const data: SSEEvent = JSON.parse(e.data)

                if (data.type === 'complete' || data.type === 'error') {
                    streamEnded = true
                }

                onEvent(data)
            } catch { /* noop */ }
        }

        es.addEventListener('node_start', handleEvent)
        es.addEventListener('node_complete', handleEvent)
        es.addEventListener('progress', handleEvent)
        es.addEventListener('complete', handleEvent)
        es.addEventListener('error', handleEvent)

        es.onerror = () => {
            es.close()
            currentES = undefined

            if (aborted || streamEnded) return

            retryCount++
            if (retryCount > maxRetries) {
                if (onError) onError()
                return
            }

            scheduleReconnect()
        }
    }

    function scheduleReconnect() {
        const delay = Math.pow(2, retryCount - 1) * 1000 // 1s, 2s, 4s
        pendingTimer = setTimeout(async () => {
            pendingTimer = undefined
            if (aborted || streamEnded) return

            try {
                await connect()
                retryCount = 0
                if (onReconnect) onReconnect()
            } catch {
                if (aborted || streamEnded) return

                retryCount++
                if (retryCount > maxRetries) {
                    if (onError) onError()
                    return
                }
                scheduleReconnect()
            }
        }, delay)
    }

    // Initial connection — errors propagate to caller's try/catch
    await connect()

    return cleanup
}

// Typed API helpers

export interface KnowledgeBase {
    id: number
    name: string
    description: string | null
    tags: string[]
    kb_type: string
    owner_id: number
    document_count: number
    share_code: string | null
    shared_to_plaza_at: string | null
    created_at: string
    updated_at: string
}

export interface KBDocument {
    id: number
    knowledge_base_id: number
    original_filename: string
    file_type: string
    status: string
    chunk_count: number
    error_message: string | null
    created_at: string
}

export interface QuizSession {
    id: string
    creator_id: number
    solver_id: number | null
    circle_id: number | null
    mode: string
    generation_mode: string
    title: string | null
    knowledge_scope: Record<string, unknown> | null
    quiz_config: Record<string, unknown> | null
    status: string
    total_score: number | null
    accuracy: number | null
    started_at: string | null
    completed_at: string | null
    created_at: string
    share_code: string | null
    shared_to_plaza_at: string | null
    questions?: QuizQuestion[]
    responses?: QuizResponse[]
}

export interface QuizQuestion {
    id: number
    question_index: number
    question_type: string
    content: string
    options: Record<string, string> | null
    score: number
    correct_answer: string | null
    analysis: string | null
    created_at: string
}

export interface QuizResponse {
    id: number
    question_id: number
    user_answer: string | null
    is_correct: boolean | null
    score: number | null
    ai_feedback: string | null
    time_spent: number | null
}

export interface QuizSessionListItem {
    id: string
    mode: string
    title: string | null
    status: string
    total_score: number | null
    accuracy: number | null
    created_at: string
    circle_id: number | null
    share_code: string | null
    shared_to_plaza_at: string | null
    question_count: number
    creator_full_name: string | null
    creator_username: string | null
    acquired_at: string | null
}

export interface QuizPlazaItem {
    id: string
    title: string | null
    mode: string
    question_count: number
    accuracy: number | null
    creator_full_name: string
    creator_username: string
    acquire_count: number
    shared_to_plaza_at: string
    share_code: string | null
}

export interface ExamTemplate {
    id: number
    user_id: number
    name: string
    description: string | null
    subject: string | null
    is_public: boolean
    source_template_id: number | null
    created_at: string
    updated_at: string
    slots: ExamTemplateSlot[]
}

export interface ExamTemplateSlot {
    id: number
    template_id: number
    position: number
    question_type: string
    label: string | null
    difficulty_hint: string | null
    questions: ExamTemplateSlotQuestion[]
}

export interface ExamTemplateSlotQuestion {
    id: number
    slot_id: number
    content: string
    answer: string | null
    analysis: string | null
    difficulty: string | null
    knowledge_points: string[] | null
    source_label: string | null
    created_at: string
}

export interface ExamTemplateListItem {
    id: number
    name: string
    description: string | null
    subject: string | null
    is_public: boolean
    slot_count: number
    question_count: number
    created_at: string
    updated_at: string
}

export interface PlazaTemplateItem {
    id: number
    name: string
    description: string | null
    subject: string | null
    slot_count: number
    question_count: number
    creator_username: string
    creator_full_name: string
    created_at: string
}

export interface ConflictDetail {
    position: number
    conflicting_types: Record<number, string>
}

export const examTemplateApi = {
    list: () => api.get<ExamTemplateListItem[]>('/exam-templates/'),
    get: (id: number) => api.get<ExamTemplate>(`/exam-templates/${id}`),
    create: (data: { name: string; description?: string; subject?: string; slots?: unknown[] }) =>
        api.post<ExamTemplate>('/exam-templates/', data),
    update: (id: number, data: { name?: string; description?: string; subject?: string }) =>
        api.patch<ExamTemplate>(`/exam-templates/${id}`, data),
    delete: (id: number) => api.delete(`/exam-templates/${id}`),
    replaceSlots: (id: number, slots: unknown[]) =>
        api.put<ExamTemplate>(`/exam-templates/${id}/slots`, { slots }),
    addQuestion: (id: number, slotId: number, data: Record<string, unknown>) =>
        api.post<ExamTemplateSlotQuestion>(`/exam-templates/${id}/slots/${slotId}/questions`, data),
    updateQuestion: (id: number, slotId: number, qid: number, data: Record<string, unknown>) =>
        api.patch<ExamTemplateSlotQuestion>(`/exam-templates/${id}/slots/${slotId}/questions/${qid}`, data),
    deleteQuestion: (id: number, slotId: number, qid: number) =>
        api.delete(`/exam-templates/${id}/slots/${slotId}/questions/${qid}`),
    checkConflicts: (templateIds: number[], positions: number[]) =>
        api.post<{ conflicts: ConflictDetail[] }>('/exam-templates/check-conflicts', {
            template_ids: templateIds, selected_slot_positions: positions,
        }),
    publish: (id: number) => api.post<ExamTemplate>(`/exam-templates/${id}/publish`),
    unpublish: (id: number) => api.delete<ExamTemplate>(`/exam-templates/${id}/publish`),
    listPlaza: (limit = 50, offset = 0) =>
        api.get<PlazaTemplateItem[]>(`/exam-templates/plaza?limit=${limit}&offset=${offset}`),
    acquire: (id: number) => api.post<ExamTemplate>(`/exam-templates/${id}/acquire`),
}

export const kbApi = {
    list: () => api.get<KnowledgeBase[]>('/knowledge-bases/'),
    listAcquired: () => api.get<KnowledgeBase[]>('/knowledge-bases/acquired'),
    unacquire: (id: number) => api.delete(`/knowledge-bases/acquired/${id}`),
    listAll: async () => {
        const [owned, acquired] = await Promise.all([
            api.get<KnowledgeBase[]>('/knowledge-bases/'),
            api.get<KnowledgeBase[]>('/knowledge-bases/acquired'),
        ])
        const seen = new Set(owned.map(kb => kb.id))
        return [...owned, ...acquired.filter(kb => !seen.has(kb.id))]
    },
    acquire: (shareCode: string) =>
        api.post<KnowledgeBase>('/knowledge-bases/acquire', { share_code: shareCode }),
    create: (data: { name: string; description?: string; tags?: string[]; kb_type?: string }) =>
        api.post<KnowledgeBase>('/knowledge-bases/', data),
    get: (id: number) => api.get<KnowledgeBase>(`/knowledge-bases/${id}`),
    delete: (id: number) => api.delete(`/knowledge-bases/${id}`),
    uploadDoc: (kbId: number, file: File) =>
        api.upload<KBDocument>(`/knowledge-bases/${kbId}/documents`, file),
    listDocs: (kbId: number) => api.get<KBDocument[]>(`/knowledge-bases/${kbId}/documents`),
    deleteDoc: (kbId: number, docId: number) =>
        api.delete(`/knowledge-bases/${kbId}/documents/${docId}`),
    generateShareCode: (id: number) =>
        api.post<KnowledgeBase>(`/knowledge-bases/${id}/share`),
    revokeShareCode: (id: number) =>
        api.delete<KnowledgeBase>(`/knowledge-bases/${id}/share`),
    publishToPlaza: (id: number) =>
        api.post<KnowledgeBase>(`/knowledge-bases/${id}/publish`),
    unpublishFromPlaza: (id: number) =>
        api.delete<KnowledgeBase>(`/knowledge-bases/${id}/publish`),
}

export const quizApi = {
    create: (data: {
        mode?: string
        generation_mode?: string
        title?: string
        knowledge_scope: Record<string, unknown>
        quiz_config: Record<string, unknown>
        solver_id?: number
        circle_id?: number
    }) => api.post<QuizSession>('/quiz-sessions/', data),
    list: (limit = 20, offset = 0) =>
        api.get<QuizSessionListItem[]>(`/quiz-sessions/?limit=${limit}&offset=${offset}`),
    get: (id: string) => api.get<QuizSession>(`/quiz-sessions/${id}`),
    submitResponses: (id: string, responses: { question_id: number; user_answer: string; time_spent?: number }[]) =>
        api.post<QuizResponse[]>(`/quiz-sessions/${id}/responses`, { responses }),
    submit: (id: string) => api.post<QuizSession>(`/quiz-sessions/${id}/submit`),
    deleteSession: (id: string) => api.delete(`/quiz-sessions/${id}`),
    generateShareCode: (id: string) => api.post<QuizSession>(`/quiz-sessions/${id}/share`),
    revokeShareCode: (id: string) => api.delete<QuizSession>(`/quiz-sessions/${id}/share`),
    publishToPlaza: (id: string) => api.post<QuizSession>(`/quiz-sessions/${id}/publish`),
    unpublishFromPlaza: (id: string) => api.delete<QuizSession>(`/quiz-sessions/${id}/publish`),
    acquire: (shareCode: string) => api.post<{ message: string }>('/quiz-sessions/acquire', { share_code: shareCode }),
    listMyQuizzes: (limit = 20, offset = 0) =>
        api.get<QuizSessionListItem[]>(`/quiz-sessions/my-quizzes?limit=${limit}&offset=${offset}`),
    listAcquired: () => api.get<QuizSessionListItem[]>('/quiz-sessions/acquired'),
}

export const quizPlazaApi = {
    list: (q?: string) =>
        api.get<QuizPlazaItem[]>(q ? `/quiz-plaza/?q=${encodeURIComponent(q)}` : '/quiz-plaza/'),
}

// Profile API

export interface DomainProfile {
    accuracy: number
    question_count: number
    correct: number
    avg_time_per_question: number
    preferred_difficulty: string
}

export interface ProfileShare {
    id: number
    share_type: string
    share_token: string | null
    created_at: string
}

export interface UserProfile {
    user_id: number
    overall_level: string
    total_questions_answered: number
    overall_accuracy: number
    question_type_profiles: Record<string, { accuracy: number; count: number; correct: number }>
    domain_profiles: Record<string, DomainProfile>
    learning_trajectory: { date: string; accuracy: number; question_count: number; session_id: string }[]
    profile_version: number
    last_calculated_at: string | null
    // AI analysis fields
    knowledge_point_profiles: Record<string, { attempts: number; correct: number; accuracy: number }>
    weakness_analysis: Record<string, string>
    insight_summary: string
    last_analysis_session_id?: string
}

export const profileApi = {
    getMyProfile: () => api.get<UserProfile>('/profiles/me'),
    getUserProfile: (userId: number) => api.get<UserProfile>(`/profiles/${userId}`),
    recalculate: () => api.post<UserProfile>('/profiles/me/recalculate'),
    share: (shareType = 'link') => api.post<ProfileShare>('/profiles/me/share', { share_type: shareType }),
    getMyShare: () => api.get<ProfileShare | null>('/profiles/me/share'),
    revokeShare: () => api.delete('/profiles/me/share'),
}

// Notification API

export interface Notification {
    id: number
    type: string
    title: string
    content: string | null
    category: string
    is_read: boolean
    action_url: string | null
    sender_id: number | null
    created_at: string
}

export const notificationApi = {
    list: (unreadOnly = false, limit = 50) =>
        api.get<Notification[]>(`/notifications/?unread_only=${unreadOnly}&limit=${limit}`),
    unreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
    markRead: (id: number) => api.patch(`/notifications/${id}/read`),
    markAllRead: () => api.post('/notifications/read-all'),
}

// Admin API

export interface PlatformStats {
    total_users: number
    active_users: number
    total_knowledge_bases: number
    total_quiz_sessions: number
    total_questions_generated: number
    completed_sessions: number
}

export interface AdminUser {
    id: number
    username: string
    email: string
    full_name: string
    is_active: boolean
    is_admin: boolean
    is_superadmin: boolean
    created_at: string
}

export interface SystemConfig {
    id: number
    key: string
    value: string | null
    description: string | null
    updated_at: string
}

export interface BroadcastHistoryItem {
    id: number
    title: string
    content: string | null
    created_at: string
    recipient_count: number
}

export interface AdminKBItem {
    id: number
    name: string
    description: string | null
    owner_id: number
    owner_username: string
    kb_type: string
    document_count: number
    share_code: string | null
    shared_to_plaza_at: string | null
    created_at: string
}

export interface AdminCircleItem {
    id: number
    name: string
    description: string | null
    creator_id: number
    creator_username: string
    invite_code: string
    max_members: number
    member_count: number
    is_active: boolean
    is_public: boolean
    created_at: string
}

export const adminApi = {
    stats: () => api.get<PlatformStats>('/admin/stats'),
    listUsers: (search?: string, limit = 50, offset = 0) => {
        let url = `/admin/users?limit=${limit}&offset=${offset}`
        if (search) url += `&search=${encodeURIComponent(search)}`
        return api.get<{ items: AdminUser[]; total: number }>(url)
    },
    updateUser: (id: number, data: { is_active?: boolean; is_admin?: boolean; is_superadmin?: boolean }) =>
        api.patch<AdminUser>(`/admin/users/${id}`, data),
    listConfigs: () => api.get<SystemConfig[]>('/admin/system-configs'),
    setConfig: (key: string, value: string, description?: string) =>
        api.post<SystemConfig>('/admin/system-configs', { key, value, description }),
    deleteConfig: (key: string) => api.delete(`/admin/system-configs/${key}`),
    exportConfigs: async () => {
        const res = await fetch(`${BASE_URL}/admin/system-configs/export`, {
            method: 'POST',
            headers: { ...getAuthHeaders() },
        })
        if (!res.ok) {
            const body = await res.json().catch(() => ({ detail: res.statusText }))
            throw new ApiError(res.status, typeof body.detail === 'string' ? body.detail : '导出失败')
        }
        return res.blob()
    },
    importConfigs: (items: { key: string; value: string | null; description: string | null }[]) =>
        api.post<{ imported: number }>('/admin/system-configs/import', items),
    broadcast: (title: string, content?: string) =>
        api.post<{ sent_count: number }>('/admin/system-broadcasts', { title, content }),
    listBroadcasts: () => api.get<BroadcastHistoryItem[]>('/admin/system-broadcasts'),
    deleteBroadcast: (id: number) => api.delete(`/admin/system-broadcasts/${id}`),
    testLlm: (data: { api_key?: string; base_url?: string; model: string; use_stored?: boolean }) =>
        api.post<{ ok: boolean; message: string; prompt?: string }>('/admin/system-configs/test-llm', data),
    testEmbedding: (data: { api_key?: string; base_url?: string; model: string; dimensions?: number; use_stored?: boolean }) =>
        api.post<{ ok: boolean; dimensions_returned: number; test_text?: string }>('/admin/system-configs/test-embedding', data),
    testOcr: () =>
        api.post<{ ok: boolean; message: string; image_base64?: string }>('/admin/system-configs/test-ocr', {}),
    listKBs: (search?: string, plazaOnly = false, limit = 50, offset = 0) => {
        let url = `/admin/knowledge-bases?limit=${limit}&offset=${offset}&plaza_only=${plazaOnly}`
        if (search) url += `&search=${encodeURIComponent(search)}`
        return api.get<AdminKBItem[]>(url)
    },
    unpublishKB: (id: number) => api.delete(`/admin/knowledge-bases/${id}/unpublish`),
    listCircles: (search?: string, limit = 50, offset = 0) => {
        let url = `/admin/circles?limit=${limit}&offset=${offset}`
        if (search) url += `&search=${encodeURIComponent(search)}`
        return api.get<AdminCircleItem[]>(url)
    },
    deleteCircle: (id: number) => api.delete(`/admin/circles/${id}`),
    listBlockedIps: () =>
        api.get<{ ip: string; ttl_seconds: number; fail_count: number }[]>('/admin/blocked-ips'),
    unblockIp: (ip: string) => api.delete(`/admin/blocked-ips/${encodeURIComponent(ip)}`),
    blockIp: (ip: string) => api.post(`/admin/blocked-ips/${encodeURIComponent(ip)}`),
    loginHistory: (limit = 100) =>
        api.get<{ ip: string; username: string; success: boolean; timestamp: string }[]>(
            `/admin/login-history?limit=${limit}`
        ),
    getIpBlockConfig: () => api.get<{ enabled: boolean }>('/admin/ip-block-config'),
    setIpBlockConfig: (enabled: boolean) =>
        api.post<{ enabled: boolean }>('/admin/ip-block-config', { enabled }),
}

// Circle API

export interface Circle {
    id: number
    name: string
    description: string | null
    avatar_url: string | null
    creator_id: number
    invite_code: string
    max_members: number
    is_active: boolean
    is_public: boolean
    member_count: number
    created_at: string
}

export interface DomainStat {
    domain: string
    avg_accuracy: number
    member_count: number
}

export interface LeaderboardEntry {
    user_id: number
    username: string
    full_name: string
    avatar_url: string | null
    role: string
    total_questions: number
    overall_accuracy: number
}

export interface CircleStats {
    circle_id: number
    member_count: number
    domain_stats: DomainStat[]
    leaderboard: LeaderboardEntry[]
}

export interface CircleSessionParticipantItem {
    user_id: number
    username: string
    full_name: string
    status: string
    accuracy: number | null
    total_score: number | null
    completed_at: string | null
}

export interface CircleQuizSessionItem {
    id: string
    creator_id: number
    creator_username: string
    creator_full_name: string
    title: string | null
    mode: string
    status: string
    total_score: number | null
    accuracy: number | null
    created_at: string
    participant_count: number
    current_user_status: string | null
}

export interface CircleKnowledgePointProfile {
    avg_accuracy: number
    total_attempts: number
    member_coverage: number
}

export interface CircleDomainProfile {
    avg_accuracy: number
    total_questions: number
    member_coverage: number
}

export interface CircleProfile {
    circle_id: number
    overall_accuracy: number
    total_questions: number
    member_count: number
    knowledge_point_profiles: Record<string, CircleKnowledgePointProfile>
    domain_profiles: Record<string, CircleDomainProfile>
    last_calculated_at: string | null
}

export interface CircleMember {
    id: number
    user_id: number
    username: string
    full_name: string
    avatar_url: string | null
    role: string
    joined_at: string
}

export const circleApi = {
    list: () => api.get<Circle[]>('/circles/'),
    get: (id: number) => api.get<Circle>(`/circles/${id}`),
    create: (data: { name: string; description?: string; max_members?: number; is_public?: boolean }) =>
        api.post<Circle>('/circles/', data),
    update: (id: number, data: { name?: string; description?: string; max_members?: number; is_public?: boolean }) =>
        api.patch<Circle>(`/circles/${id}`, data),
    delete: (id: number) => api.delete(`/circles/${id}`),
    join: (inviteCode: string) => api.post<Circle>('/circles/join', { invite_code: inviteCode }),
    members: (id: number) => api.get<CircleMember[]>(`/circles/${id}/members`),
    removeMember: (circleId: number, userId: number) =>
        api.delete(`/circles/${circleId}/members/${userId}`),
    stats: (id: number) => api.get<CircleStats>(`/circles/${id}/stats`),
    profile: (id: number) => api.get<CircleProfile>(`/circles/${id}/profile`),
    quizSessions: (id: number, limit = 20) =>
        api.get<CircleQuizSessionItem[]>(`/circles/${id}/quiz-sessions?limit=${limit}`),
    sessionParticipants: (circleId: number, sessionId: string) =>
        api.get<CircleSessionParticipantItem[]>(`/circles/${circleId}/sessions/${sessionId}/participants`),
}

// Plaza API

export const plazaApi = {
    list: (q?: string) =>
        api.get<KnowledgeBase[]>(q ? `/kb-plaza/?q=${encodeURIComponent(q)}` : '/kb-plaza/'),
}

// Challenge API

export const challengeApi = {
    listReceived: (status?: string) => {
        const params = status ? `?status=${encodeURIComponent(status)}` : ''
        return api.get<QuizSessionListItem[]>(`/challenges/received${params}`)
    },
    listSent: () => api.get<QuizSessionListItem[]>('/challenges/sent'),
}

// Assistant API

export interface AssistantInsights {
    patterns_found: { domain: string; issue: string; detail: string; severity: string }[]
    learning_trajectory: { date: string; accuracy: number; question_count: number; session_id: string }[]
    overall_accuracy: number
    overall_level: string
    total_questions_answered: number
}

export interface AssistantRecommendation {
    id: number
    title: string
    content: string | null
    action_url: string | null
    created_at: string
}

export const assistantApi = {
    insights: () => api.get<AssistantInsights>('/assistant/insights'),
    recommendations: () => api.get<AssistantRecommendation[]>('/assistant/recommendations'),
    trigger: () => api.post<{ status: string; message: string }>('/assistant/trigger'),
}

// User API

export interface UserPublicInfo {
    id: number
    username: string
    full_name: string
    avatar_url: string | null
    bio: string | null
    linux_do_id?: string | null
}

export const userApi = {
    search: (q: string, limit = 10) =>
        api.get<UserPublicInfo[]>(`/users/search?q=${encodeURIComponent(q)}&limit=${limit}`),
    me: () => api.get<UserPublicInfo>('/users/me'),
    updateMe: (data: { full_name?: string; bio?: string }) =>
        api.patch<UserPublicInfo>('/users/me', data),
    uploadAvatar: (file: File) =>
        api.upload<UserPublicInfo>('/users/me/avatar', file),
}

// Quiz Preset API

export interface QuizPreset {
    id: number
    name: string
    title: string | null
    difficulty: string
    question_counts: Record<string, number>
    subject: string | null
    custom_prompt: string | null
    created_at: string
    updated_at: string
}

export const presetApi = {
    list: () => api.get<QuizPreset[]>('/quiz-presets/'),
    create: (data: Omit<QuizPreset, 'id' | 'created_at' | 'updated_at'>) =>
        api.post<QuizPreset>('/quiz-presets/', data),
    update: (id: number, data: Partial<Omit<QuizPreset, 'id' | 'created_at' | 'updated_at'>>) =>
        api.put<QuizPreset>(`/quiz-presets/${id}`, data),
    delete: (id: number) => api.delete(`/quiz-presets/${id}`),
}

// Auth API

export const authApi = {
    isRegistrationEnabled: () =>
        api.get<{ enabled: boolean }>('/auth/registration-enabled'),
}

// Linux DO OAuth API

export const linuxDoApi = {
    isEnabled: () => api.get<{ enabled: boolean }>('/auth/linux-do/enabled'),
    getAuthorizeUrl: () => api.get<{ url: string }>('/auth/linux-do/authorize'),
    exchange: (code: string, state: string) =>
        api.post<{ access_token: string; token_type: string }>('/auth/linux-do/exchange', { code, state }),
    getBindUrl: () => api.get<{ url: string }>('/auth/linux-do/bind-url'),
    bind: (code: string, state: string) =>
        api.post<{ message: string }>('/auth/linux-do/bind', { code, state }),
    unbind: () => api.delete<{ message: string }>('/auth/linux-do/bind'),
}
