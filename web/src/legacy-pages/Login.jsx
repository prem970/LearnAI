'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import FormInput from '../components/FormInput.jsx'
import RoleToggle from '../components/RoleToggle.jsx'
import { useAuth } from '../context/useAuth.js'
import { resolveRoute } from '../context/AuthContextInner.jsx'

function Login() {
  const { login, user, token, authReady } = useAuth()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [role, setRole] = useState('teacher')
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [generalError, setGeneralError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!authReady || !mounted || !token || !user) return
    router.replace(resolveRoute(user))
  }, [authReady, mounted, router, token, user])

  const validate = () => {
    const errs = {}
    if (!form.email.trim()) errs.email = 'Email is required.'
    if (!form.password.trim()) errs.password = 'Password is required.'
    return errs
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    const fieldErrors = validate()
    if (Object.keys(fieldErrors).length > 0) { setErrors(fieldErrors); return }
    setSubmitting(true); setErrors({}); setGeneralError('')
    const { error, ok, redirectTo } = await login({ email: form.email, password: form.password, role })
    if (!ok && error) {
      if (error.fieldErrors) setErrors(error.fieldErrors)
      else if (error.message) setGeneralError(error.message)
      if (error.role) setRole(String(error.role).toLowerCase())
      setSubmitting(false); return
    }
    if (redirectTo) router.replace(redirectTo)
    setSubmitting(false)
  }

  if (!mounted) {
    return <div className="min-h-screen bg-white" />
  }

  return (
    <div className="min-h-screen flex items-stretch justify-center bg-white">
      <div className="w-full max-w-[960px] grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] bg-white shadow-[0_28px_80px_rgba(9,9,11,0.12)] border border-slate-200 animate-auth-fade md:rounded-[18px] md:overflow-hidden md:self-center md:my-8">

        {/* ── Purple side panel ── */}
        <aside className="hidden md:flex flex-col justify-end p-10 bg-gradient-to-br from-[#2563eb] to-[#1e3a8a] text-white relative overflow-hidden" aria-hidden="true">
          <div className="absolute inset-0 opacity-90 pointer-events-none"
            style={{ background: 'radial-gradient(circle at 20% 0,rgba(244,244,245,.22),transparent 60%),radial-gradient(circle at 100% 100%,rgba(14,165,233,.32),transparent 70%)', mixBlendMode: 'screen' }} />
          <div className="relative z-10 max-w-xs">
            <p className="text-[1.4rem] font-semibold mb-2">Smarter learning, anytime</p>
            <p className="text-sm text-white/90">
              LearnAI helps students grasp concepts faster with guidance that matches how their teachers explain—while
              making that teaching presence available around the clock, not only during the bell.
            </p>
          </div>
        </aside>

        {/* ── Form panel ── */}
        <div className="px-7 py-9 md:px-10 overflow-y-auto">
          <header className="mb-5">
            <p className="text-[1.6rem] font-[650] text-[#0b1220] mb-0.5">Welcome back to LearnAI</p>
            <p className="text-sm text-slate-500">Sign in to learn faster - or to extend your reach to every student, every hour.</p>
          </header>

          <div className="mb-4">
            <RoleToggle value={role} onChange={setRole} />
          </div>

          {generalError && (
            <div className="mb-4 px-3 py-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm">
              {generalError}
            </div>
          )}

          <form className="grid gap-3.5" onSubmit={handleSubmit} noValidate>
            <FormInput label="Email" name="email" type="email" value={form.email} onChange={handleChange} error={errors.email} />
            <FormInput label="Password" name="password" type="password" value={form.password} onChange={handleChange} error={errors.password} />

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full font-semibold text-white btn-gradient disabled:opacity-60 cursor-pointer transition-transform duration-120 hover:-translate-y-px active:translate-y-0"
            >
              {submitting ? <span className="spinner" aria-label="Loading" /> : 'Log in'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-400">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-semibold text-brand hover:underline">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login
