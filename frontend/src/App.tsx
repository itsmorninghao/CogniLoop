import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { Layout } from '@/components/Layout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PublicNav } from '@/components/PublicNav';
import { SetupGuard } from '@/components/SetupGuard';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { TeacherDashboard, KnowledgeBasePage, QuestionGeneratorPage, TeacherAnswersPage } from '@/pages/teacher';
import { StudentCoursesPage, StudentTestsPage, StudentExamPage, PendingTestsPage } from '@/pages/student';
import { PlazaDiscover, PlazaMyAttempts, PlazaMyShared } from '@/pages/plaza';
import {
  AdminLoginPage,
  AdminSetupPage,
  AdminDashboard,
  TeacherManagementPage,
  StudentManagementPage,
  CourseManagementPage,
  AdminManagementPage,
  SystemSettingsPage,
} from '@/pages/admin';

export function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        {/* 首次部署：仅当无超级管理员时可访问，创建后访问会重定向到登录 */}
        <Route path="/admin/setup" element={<AdminSetupPage />} />

        {/* 以下路由均需先完成初始化；否则会重定向到 /admin/setup */}
        <Route element={<SetupGuard />}>
          {/* Public Routes with transparent nav */}
          <Route element={<><PublicNav /><Outlet /></>}>
            <Route path="/" element={<HomePage />} />
            <Route path="/plaza" element={<PlazaDiscover />} />
          </Route>

          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Admin Login (不暴露入口，直接通过 URL 访问) */}
          <Route path="/admin/login" element={<AdminLoginPage />} />

          {/* Admin Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedUserTypes={['admin']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="teachers" element={<TeacherManagementPage />} />
          <Route path="students" element={<StudentManagementPage />} />
          <Route path="courses" element={<CourseManagementPage />} />
          <Route path="settings" element={<SystemSettingsPage />} />
          <Route path="admins" element={<AdminManagementPage />} />
        </Route>

        {/* Teacher Routes */}
        <Route
          path="/teacher"
          element={
            <ProtectedRoute allowedUserTypes={['teacher']}>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<TeacherDashboard />} />
          <Route path="knowledge" element={<KnowledgeBasePage />} />
          <Route path="questions" element={<QuestionGeneratorPage />} />
          <Route path="answers/:questionSetId" element={<TeacherAnswersPage />} />
          <Route path="plaza" element={<PlazaDiscover />} />
          <Route path="plaza/my-attempts" element={<PlazaMyAttempts />} />
          <Route path="plaza/my-shared" element={<PlazaMyShared />} />
          <Route path="plaza/exam/:questionSetId" element={<StudentExamPage />} />
        </Route>

        {/* Student Routes */}
        <Route
          path="/student"
          element={
            <ProtectedRoute allowedUserTypes={['student']}>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<StudentCoursesPage />} />
          <Route path="tests" element={<PendingTestsPage />} />
          <Route path="course/:courseId/tests" element={<StudentTestsPage />} />
          <Route path="exam/:questionSetId" element={<StudentExamPage />} />
          <Route path="plaza" element={<PlazaDiscover />} />
          <Route path="plaza/my-attempts" element={<PlazaMyAttempts />} />
        </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
