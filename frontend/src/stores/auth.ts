/**
 * Auth store — Zustand with localStorage persistence.
 */

import { create } from 'zustand'
import { api } from '@/lib/api'

interface User {
    id: number
    username: string
    email: string
    full_name: string
    avatar_url: string | null
    bio: string | null
    is_active: boolean
    is_admin: boolean
    is_superadmin: boolean
    linux_do_id?: string | null
}

interface AuthState {
    token: string | null
    user: User | null
    isLoading: boolean

    login: (username: string, password: string, captchaId: string, captchaAnswer: string) => Promise<void>
    register: (data: { username: string; email: string; password: string; full_name: string }, captchaId: string, captchaAnswer: string) => Promise<void>
    logout: () => void
    fetchUser: () => Promise<void>
    setUser: (partial: Partial<User>) => void
    init: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
    token: localStorage.getItem('token'),
    user: null,
    isLoading: true,

    login: async (username, password, captchaId, captchaAnswer) => {
        const res = await api.post<{ access_token: string }>('/auth/login', {
            username,
            password,
            captcha_id: captchaId,
            captcha_answer: captchaAnswer,
        })
        localStorage.setItem('token', res.access_token)
        try {
            const user = await api.get<User>('/auth/me')
            set({ token: res.access_token, user })
        } catch (err) {
            localStorage.removeItem('token')
            throw err
        }
    },

    register: async (data, captchaId, captchaAnswer) => {
        await api.post('/auth/register', {
            ...data,
            captcha_id: captchaId,
            captcha_answer: captchaAnswer,
        })
    },

    logout: () => {
        localStorage.removeItem('token')
        set({ token: null, user: null })
    },

    fetchUser: async () => {
        try {
            const user = await api.get<User>('/auth/me')
            set({ user, token: localStorage.getItem('token') })
        } catch {
            localStorage.removeItem('token')
            set({ token: null, user: null })
        }
    },

    setUser: (partial) => {
        set((state) => ({ user: state.user ? { ...state.user, ...partial } : null }))
    },

    init: async () => {
        const token = localStorage.getItem('token')
        if (token) {
            try {
                const user = await api.get<User>('/auth/me')
                set({ user, isLoading: false })
            } catch {
                localStorage.removeItem('token')
                set({ token: null, user: null, isLoading: false })
            }
        } else {
            set({ isLoading: false })
        }
    },
}))
