/**
 * App root — React Router with auth guard.
 */

import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { Toaster } from 'sonner'
import { useAuthStore } from '@/stores/auth'

import AppLayout from '@/layouts/AppLayout'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const OAuthCallbackPage = lazy(() => import('@/pages/OAuthCallbackPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const KnowledgeBasePage = lazy(() => import('@/pages/KnowledgeBasePage'))
const KnowledgeBaseDetailPage = lazy(() => import('@/pages/KnowledgeBaseDetailPage'))
const QuizPage = lazy(() => import('@/pages/QuizPage'))
const QuizCreateSmartPage = lazy(() => import('@/pages/QuizCreateSmartPage'))
const QuizCreateProPage = lazy(() => import('@/pages/QuizCreateProPage'))
const QuizSessionPage = lazy(() => import('@/pages/QuizSessionPage'))
const QuizResultPage = lazy(() => import('@/pages/QuizResultPage'))
const MyQuizzesPage = lazy(() => import('@/pages/MyQuizzesPage'))
const CirclesPage = lazy(() => import('@/pages/CirclesPage'))
const CircleDetailPage = lazy(() => import('@/pages/CircleDetailPage'))
const ChallengePage = lazy(() => import('@/pages/ChallengePage'))
const PlazaPage = lazy(() => import('@/pages/PlazaPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const UserProfileViewPage = lazy(() => import('@/pages/UserProfileViewPage'))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const ExamTemplatePage = lazy(() => import('@/pages/ExamTemplatePage'))
const ExamTemplateEditorPage = lazy(() => import('@/pages/ExamTemplateEditorPage'))

function PageSkeleton() {
    return (
        <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
        </div>
    )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { token, isLoading } = useAuthStore()

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-bg">
                <div className="flex flex-col items-center gap-3">
                    <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-fg">加载中...</p>
                </div>
            </div>
        )
    }

    if (!token) {
        return <Navigate to="/login" replace />
    }

    return <>{children}</>
}

export default function App() {
    const { init } = useAuthStore()

    useEffect(() => {
        init()
    }, [init])

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Suspense fallback={<PageSkeleton />}><LoginPage /></Suspense>} />
                <Route path="/oauth/callback" element={<Suspense fallback={<PageSkeleton />}><OAuthCallbackPage /></Suspense>} />
                <Route
                    element={
                        <ProtectedRoute>
                            <AppLayout />
                        </ProtectedRoute>
                    }
                >
                    <Route index element={<Suspense fallback={<PageSkeleton />}><DashboardPage /></Suspense>} />
                    <Route path="knowledge" element={<Suspense fallback={<PageSkeleton />}><KnowledgeBasePage /></Suspense>} />
                    <Route path="knowledge/:id" element={<Suspense fallback={<PageSkeleton />}><KnowledgeBaseDetailPage /></Suspense>} />
                    <Route path="exam-templates" element={<Suspense fallback={<PageSkeleton />}><ExamTemplatePage /></Suspense>} />
                    <Route path="exam-templates/:id" element={<Suspense fallback={<PageSkeleton />}><ExamTemplateEditorPage /></Suspense>} />
                    <Route path="quiz" element={<Suspense fallback={<PageSkeleton />}><QuizPage /></Suspense>} />
                    <Route path="quiz/create-smart" element={<Suspense fallback={<PageSkeleton />}><QuizCreateSmartPage /></Suspense>} />
                    <Route path="quiz/create-pro" element={<Suspense fallback={<PageSkeleton />}><QuizCreateProPage /></Suspense>} />
                    <Route path="quiz/:id" element={<Suspense fallback={<PageSkeleton />}><QuizSessionPage /></Suspense>} />
                    <Route path="quiz/:id/result" element={<Suspense fallback={<PageSkeleton />}><QuizResultPage /></Suspense>} />
                    <Route path="my-quizzes" element={<Suspense fallback={<PageSkeleton />}><MyQuizzesPage /></Suspense>} />
                    <Route path="circles" element={<Suspense fallback={<PageSkeleton />}><CirclesPage /></Suspense>} />
                    <Route path="circles/:id" element={<Suspense fallback={<PageSkeleton />}><CircleDetailPage /></Suspense>} />
                    <Route path="challenges" element={<Suspense fallback={<PageSkeleton />}><ChallengePage /></Suspense>} />
                    <Route path="plaza" element={<Suspense fallback={<PageSkeleton />}><PlazaPage /></Suspense>} />
                    <Route path="profile" element={<Suspense fallback={<PageSkeleton />}><ProfilePage /></Suspense>} />
                    <Route path="profile/:userId" element={<Suspense fallback={<PageSkeleton />}><UserProfileViewPage /></Suspense>} />
                    <Route path="notifications" element={<Suspense fallback={<PageSkeleton />}><NotificationsPage /></Suspense>} />
                    <Route path="admin" element={<Suspense fallback={<PageSkeleton />}><AdminPage /></Suspense>} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster position="bottom-right" richColors />
        </BrowserRouter>
    )
}
