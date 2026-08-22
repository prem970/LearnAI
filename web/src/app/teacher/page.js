'use client'

import ProtectedRoute from '@/components/ProtectedRoute.jsx'
import TeacherDashboard from '@/legacy-pages/TeacherDashboard.jsx'

export default function TeacherPage() {
  return (
    <ProtectedRoute requiredRole="teacher" requireOnboarding>
      <TeacherDashboard />
    </ProtectedRoute>
  )
}
