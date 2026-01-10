import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { Layout } from '@/components/Layout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { TeacherDashboard, KnowledgeBasePage, QuestionGeneratorPage, TeacherAnswersPage } from '@/pages/teacher';
import { StudentCoursesPage, StudentTestsPage, StudentExamPage, PendingTestsPage } from '@/pages/student';
import {
  AdminLoginPage,
  AdminDashboard,
  TeacherManagementPage,
  StudentManagementPage,
  CourseManagementPage,
  AdminManagementPage,
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
        {/* Public Routes */}
        <Route path="/" element={<HomePage />} />
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
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
