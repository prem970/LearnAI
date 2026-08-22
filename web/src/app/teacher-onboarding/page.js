'use client'

import { Suspense } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute.jsx'
import TeacherOnboarding from '@/legacy-pages/TeacherOnboarding.jsx'

function OnboardingInner() {
  return (
    <ProtectedRoute requiredRole="teacher" requireOnboarding={false}>
      <TeacherOnboarding />
    </ProtectedRoute>
  )
}

export default function TeacherOnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <OnboardingInner />
    </Suspense>
  )
}
