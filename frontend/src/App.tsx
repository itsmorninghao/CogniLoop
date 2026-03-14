/**
 * App root — React Router with auth guard.
 */

import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { Toaster } from 'sonner'
import { useAuthStore } from '@/stores/auth'

import AppLayout from '@/layouts/AppLayout'
import LoginPage from '@/pages/LoginPage'
import OAuthCallbackPage from '@/pages/OAuthCallbackPage'
import DashboardPage from '@/pages/DashboardPage'
import KnowledgeBasePage from '@/pages/KnowledgeBasePage'
import KnowledgeBaseDetailPage from '@/pages/KnowledgeBaseDetailPage'
import QuizPage from '@/pages/QuizPage'
import QuizCreateSmartPage from '@/pages/QuizCreateSmartPage'
import QuizCreateProPage from '@/pages/QuizCreateProPage'
import QuizSessionPage from '@/pages/QuizSessionPage'
import QuizResultPage from '@/pages/QuizResultPage'
import MyQuizzesPage from '@/pages/MyQuizzesPage'
import CirclesPage from '@/pages/CirclesPage'
import CircleDetailPage from '@/pages/CircleDetailPage'
import ChallengePage from '@/pages/ChallengePage'
import PlazaPage from '@/pages/PlazaPage'
import ProfilePage from '@/pages/ProfilePage'
import UserProfileViewPage from '@/pages/UserProfileViewPage'
import NotificationsPage from '@/pages/NotificationsPage'
import AdminPage from '@/pages/AdminPage'
import ExamTemplatePage from '@/pages/ExamTemplatePage'
import ExamTemplateEditorPage from '@/pages/ExamTemplateEditorPage'

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
        <Route path="/login" element={<LoginPage />} />
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="knowledge" element={<KnowledgeBasePage />} />
          <Route path="knowledge/:id" element={<KnowledgeBaseDetailPage />} />
          <Route path="exam-templates" element={<ExamTemplatePage />} />
          <Route path="exam-templates/:id" element={<ExamTemplateEditorPage />} />
          <Route path="quiz" element={<QuizPage />} />
          <Route path="quiz/create-smart" element={<QuizCreateSmartPage />} />
          <Route path="quiz/create-pro" element={<QuizCreateProPage />} />
          <Route path="quiz/:id" element={<QuizSessionPage />} />
          <Route path="quiz/:id/result" element={<QuizResultPage />} />
          <Route path="my-quizzes" element={<MyQuizzesPage />} />
          <Route path="circles" element={<CirclesPage />} />
          <Route path="circles/:id" element={<CircleDetailPage />} />
          <Route path="challenges" element={<ChallengePage />} />
          <Route path="plaza" element={<PlazaPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile/:userId" element={<UserProfileViewPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="bottom-right" richColors />
    </BrowserRouter>
  )
}
