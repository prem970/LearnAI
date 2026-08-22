'use client'

import PropTypes from 'prop-types'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/useAuth.js'
import { accountRole, resolveRoute } from '../context/AuthContextInner.jsx'

function ProtectedRoute({ children, requiredRole, requireOnboarding = true }) {
  const { isAuthenticated, role, user, authReady } = useAuth()
  const router = useRouter()
  const effectiveRole = accountRole(user, role)

  useEffect(() => {
    if (!authReady) return
    if (!isAuthenticated) {
      router.replace('/login')
      return
    }
    const dest = resolveRoute(user)
    if (requiredRole && effectiveRole !== requiredRole) {
      router.replace(dest)
      return
    }
    if (requiredRole === 'teacher') {
      if (requireOnboarding && !user?.onboarding_completed) {
        router.replace('/teacher-onboarding')
      }
    }
  }, [
    authReady,
    effectiveRole,
    isAuthenticated,
    requireOnboarding,
    requiredRole,
    router,
    user,
  ])

  if (!authReady || !isAuthenticated) {
    return <div className="min-h-screen bg-[#eff6ff]" aria-hidden="true" />
  }
  if (requiredRole && effectiveRole !== requiredRole) {
    return <div className="min-h-screen bg-[#eff6ff]" aria-hidden="true" />
  }
  if (requiredRole === 'teacher' && requireOnboarding && !user?.onboarding_completed) {
    return <div className="min-h-screen bg-[#eff6ff]" aria-hidden="true" />
  }
  return children
}

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
  requiredRole: PropTypes.oneOf(['teacher', 'student']),
  requireOnboarding: PropTypes.bool,
}

export default ProtectedRoute
