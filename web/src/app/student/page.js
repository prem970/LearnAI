'use client'

import ProtectedRoute from '@/components/ProtectedRoute.jsx'
import StudentDashboard from '@/legacy-pages/StudentDashboard.jsx'

export default function StudentPage() {
  return (
    <ProtectedRoute requiredRole="student">
      <StudentDashboard />
    </ProtectedRoute>
  )
}
