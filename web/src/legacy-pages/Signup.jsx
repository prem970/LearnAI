'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import FormInput from '../components/FormInput.jsx'
import InstitutionInput from '../components/InstitutionInput.jsx'
import RoleToggle from '../components/RoleToggle.jsx'
import SubjectChips from '../components/SubjectChips.jsx'
import { useAuth } from '../context/useAuth.js'
import {
  ensureInstitution,
  ensureSubject,
  fetchBoards,
  registerStudent,
  registerTeacher,
  resendOtp,
  searchInstitutions,
  searchSubjects,
  verifyOtp,
} from '../services/api.js'

function Signup() {
  const router = useRouter()
  const { user, role: authRole, updateUser, setAuthSession } = useAuth()
  const [role, setRole] = useState('teacher')
  const [form, setForm] = useState({
    name: '',
    subjects: [],
    grade: '',
    boardId: '',
    institution: null,
    currentGrade: '',
    email: '',
    password: '',
    password_confirmation: '',
  })
  const [errors, setErrors] = useState({})
  const [generalError, setGeneralError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [subjectSuggestions, setSubjectSuggestions] = useState([])
  const [institutionSuggestions, setInstitutionSuggestions] = useState([])
  const [boards, setBoards] = useState([])
  const [displayedOtp, setDisplayedOtp] = useState('')
  const [otpStage, setOtpStage] = useState(false)
  const [otp, setOtp] = useState(Array(6).fill(''))
  const [otpError, setOtpError] = useState('')
  const [otpSubmitting, setOtpSubmitting] = useState(false)
  const [otpResending, setOtpResending] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [pendingUserId, setPendingUserId] = useState(null)
  const [pendingRole, setPendingRole] = useState('student')
  const otpInputsRef = useRef([])

  const OTP_RESEND_SECONDS = 180
  const OTP_RESEND_KEY = 'otpResendAvailableAt'
  const isTeacher = role === 'teacher'

  const startResendCountdown = (seconds) => {
    const wait = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : OTP_RESEND_SECONDS
    const availableAt = Date.now() + wait * 1000
    localStorage.setItem(OTP_RESEND_KEY, String(availableAt))
    setResendCountdown(wait)
  }

  useEffect(() => {
    if (!user?.id || user?.otp_verified) return
    setOtpStage(true)
    setPendingUserId(user.id)
    setPendingRole(user.role || authRole || 'student')
    const stored = localStorage.getItem('dev_otp')
    if (stored) {
      setDisplayedOtp(stored)
      setOtp(stored.split('').slice(0, 6))
    }
  }, [authRole, user])

  useEffect(() => {
    let mounted = true
    const loadBoards = async () => {
      const list = await fetchBoards()
      if (!mounted) return
      setBoards(list)
    }
    loadBoards()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const fromStorage = Number(localStorage.getItem(OTP_RESEND_KEY) || 0)
    const remaining = Math.max(0, Math.ceil((fromStorage - Date.now()) / 1000))
    setResendCountdown(remaining)
  }, [otpStage])

  useEffect(() => {
    if (!otpStage || resendCountdown <= 0) return undefined
    const timer = setInterval(() => {
      setResendCountdown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [otpStage, resendCountdown])

  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Name is required.'
    if (!form.email.trim()) errs.email = 'Email is required.'
    if (!form.password) errs.password = 'Password is required.'
    if (!form.password_confirmation) {
      errs.password_confirmation = 'Please confirm your password.'
    } else if (form.password !== form.password_confirmation) {
      errs.password_confirmation = 'Passwords do not match.'
    }
    if (isTeacher) {
      if (form.subjects.length === 0) errs.subjects = 'Please add at least one subject.'
      if (!form.grade.trim()) errs.grade = 'Grade is required.'
      if (!form.institution) errs.institution = 'Institution is required.'
    } else {
      if (!form.boardId) errs.board_id = 'Board is required.'
      if (!form.currentGrade.trim()) errs.currentGrade = 'Current grade is required.'
      if (!form.institution) errs.institution = 'Institution is required.'
    }
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
    setSubmitting(true); setErrors({}); setGeneralError(''); setSubjectSuggestions([])

    const payload =
      role === 'teacher'
        ? { name: form.name, subjects: form.subjects.map((s) => s.label), grade: form.grade, institution: form.institution?.label ?? '', email: form.email, password: form.password, password_confirmation: form.password_confirmation }
        : {
            name: form.name,
            board_id: Number(form.boardId),
            current_grade: Number(form.currentGrade),
            institution: form.institution?.label ?? '',
            email: form.email,
            password: form.password,
            password_confirmation: form.password_confirmation,
          }

    const { data, error } = role === 'teacher' ? await registerTeacher(payload) : await registerStudent(payload)

    if (error) {
      if (error.fieldErrors) setErrors(error.fieldErrors)
      else if (error.message) setGeneralError(error.message)
      setSubmitting(false); return
    }

    // Persist returned user (with ID) into auth state for OTP page
    if (data?.user) {
      const returnedUser = { ...data.user, otp_verified: false, onboarding_completed: false }
      const token = data.token || `pending-${Date.now()}`
      setAuthSession(token, returnedUser, role)
      if (data.otp_code) {
        const code = String(data.otp_code)
        localStorage.setItem('dev_otp', code)
        setDisplayedOtp(code)
        setOtp(code.split('').slice(0, 6))
      }
      setPendingUserId(returnedUser.id)
      setPendingRole(role)
    }

    setSubmitting(false)
    setOtpError('')
    setOtpStage(true)
  }

  const handleOtpChange = (value, idx) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    setOtp((prev) => {
      const next = [...prev]
      next[idx] = digit
      return next
    })
    if (digit && idx < 5) {
      otpInputsRef.current[idx + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (e, idx) => {
    if (e.key !== 'Backspace') return
    if (otp[idx]) return
    if (idx > 0) otpInputsRef.current[idx - 1]?.focus()
  }

  const handleVerifyOtp = async () => {
    if (!pendingUserId) {
      setOtpError('Session expired. Please sign up again.')
      return
    }
    const code = displayedOtp || otp.join('')
    if (!code || code.length < 6) {
      setOtpError('OTP is not available. Please sign up again.')
      return
    }

    setOtpSubmitting(true)
    setOtpError('')
    const { data, error } = await verifyOtp({
      user_id: pendingUserId,
      otp_code: code,
    })
    setOtpSubmitting(false)

    if (error) {
      setOtpError(error.message || 'Invalid OTP. Please try again.')
      return
    }

    localStorage.removeItem(OTP_RESEND_KEY)
    const patch = pendingRole === 'teacher'
      ? { otp_verified: true, onboarding_completed: false }
      : { otp_verified: true }
    const nextUser = { ...(user || {}), ...patch, id: pendingUserId, role: pendingRole }
    const nextToken = data?.token || `fake-jwt-token-${pendingUserId}`
    setAuthSession(nextToken, nextUser, pendingRole)
    router.replace(pendingRole === 'teacher' ? '/teacher-onboarding' : '/student')
  }

  const handleResendOtp = async () => {
    if (!pendingUserId || resendCountdown > 0 || otpResending) return
    setOtpResending(true)
    setOtpError('')
    const { data, error } = await resendOtp({ user_id: pendingUserId })
    setOtpResending(false)

    if (error) {
      if (error.message) setOtpError(error.message)
      return
    }

    if (data?.otp_code) {
      const code = String(data.otp_code)
      localStorage.setItem('dev_otp', code)
      setDisplayedOtp(code)
      setOtp(code.split('').slice(0, 6))
    }
    startResendCountdown(data?.retry_after || OTP_RESEND_SECONDS)
  }

  return (
    <div className="min-h-screen flex items-stretch justify-center bg-white">
      <div className="w-full max-w-[960px] grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] bg-white shadow-[0_28px_80px_rgba(9,9,11,0.12)] border border-slate-200 animate-auth-fade md:rounded-[18px] md:overflow-hidden md:self-center md:my-8">

        {/* ── Purple side panel ── */}
        <aside className="hidden md:flex flex-col justify-end p-10 bg-gradient-to-br from-[#2563eb] to-[#1e3a8a] text-white relative overflow-hidden" aria-hidden="true">
          <div className="absolute inset-0 opacity-90 pointer-events-none"
            style={{ background: 'radial-gradient(circle at 20% 0,rgba(244,244,245,.22),transparent 60%),radial-gradient(circle at 100% 100%,rgba(14,165,233,.32),transparent 70%)', mixBlendMode: 'screen' }} />
          <div className="relative z-10 max-w-xs">
            <p className="text-[1.4rem] font-semibold mb-2">Learn deeper. Move faster.</p>
            <p className="text-sm text-white/90">
              Students get clearer, quicker answers in each teacher&apos;s real style—and teachers stay within reach
              24/7 through AI that carries their voice into every study session.
            </p>
          </div>
        </aside>

        {/* ── Form panel ── */}
        <div className="px-7 py-9 md:px-10 overflow-y-auto min-w-0">
          {!otpStage && (
            <header className="mb-5">
              <p className="text-[1.6rem] font-[650] text-[#0b1220] mb-0.5">Create your LearnAI account</p>
              <p className="text-sm text-slate-500">Personalized help for learners; your teaching, always on for them.</p>
            </header>
          )}

          {!otpStage && (
            <div className="mb-4">
              <RoleToggle value={role} onChange={setRole} />
            </div>
          )}

          {generalError && (
            <div className="mb-4 px-3 py-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm">
              {generalError}
            </div>
          )}

          {!otpStage ? (
            <>
              <form className="grid gap-3.5 min-w-0" onSubmit={handleSubmit} noValidate>
                <FormInput label="Name" name="name" value={form.name} onChange={handleChange} error={errors.name} required />

                {isTeacher ? (
                  <>
                    <SubjectChips
                      value={form.subjects}
                      onChange={(subjects) => setForm((prev) => ({ ...prev, subjects }))}
                      suggestions={subjectSuggestions}
                      onSearch={async (q) => setSubjectSuggestions(await searchSubjects(q))}
                      onEnsureSubject={ensureSubject}
                      error={errors.subjects}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormInput label="Grade they handle" name="grade" value={form.grade} onChange={handleChange} placeholder="E.g. Undergraduate, 10th, 12th" error={errors.grade} required />
                      <InstitutionInput
                        value={form.institution}
                        onChange={(inst) => setForm((prev) => ({ ...prev, institution: inst }))}
                        suggestions={institutionSuggestions}
                        onSearch={async (q) => setInstitutionSuggestions(await searchInstitutions(q))}
                        onEnsure={ensureInstitution}
                        error={errors.institution}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <FormInput
                      label="Board"
                      name="boardId"
                      value={form.boardId}
                      onChange={handleChange}
                      as="select"
                      options={[{ value: '', label: 'Select board' }, ...boards.map((b) => ({ value: String(b.id), label: b.name }))]}
                      error={errors.board_id}
                      required
                    />
                    <FormInput label="Current Grade" name="currentGrade" value={form.currentGrade} onChange={handleChange} placeholder="E.g. 7" error={errors.current_grade || errors.currentGrade} required />
                    <InstitutionInput
                      value={form.institution}
                      onChange={(inst) => setForm((prev) => ({ ...prev, institution: inst }))}
                      suggestions={institutionSuggestions}
                      onSearch={async (q) => setInstitutionSuggestions(await searchInstitutions(q))}
                      onEnsure={ensureInstitution}
                      error={errors.institution}
                    />
                  </>
                )}

                <FormInput label="Email" name="email" type="email" value={form.email} onChange={handleChange} error={errors.email} required />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormInput label="Password" name="password" type="password" value={form.password} onChange={handleChange} error={errors.password} required />
                  <FormInput label="Confirm Password" name="password_confirmation" type="password" value={form.password_confirmation} onChange={handleChange} error={errors.password_confirmation} required />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full font-semibold text-white btn-gradient disabled:opacity-60 cursor-pointer transition-transform duration-120 hover:-translate-y-px active:translate-y-0"
                >
                  {submitting ? <span className="spinner" aria-label="Loading" /> : 'Sign up'}
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-slate-400">
                Already have an account?{' '}
                <Link href="/login" className="font-semibold text-brand hover:underline">Log in</Link>
              </p>
            </>
          ) : (
            <div className="mt-2">
              <header className="mb-5">
                <p className="text-[1.4rem] font-[650] text-[#0b1220] mb-0.5">Verify your email</p>
                <p className="text-sm text-slate-500">Email OTP is paused during development. Use the code below to continue.</p>
              </header>

              <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-center">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800">Developing Period</p>
                <p className="mt-2 text-3xl font-[800] tracking-[0.35em] text-[#0f172a] tabular-nums">
                  {displayedOtp || '------'}
                </p>
                <p className="mt-2 text-xs text-amber-900/80">This code is shown only while email delivery is off.</p>
              </div>

              {otpError && (
                <p className="text-rose-600 text-sm text-center mb-2">{otpError}</p>
              )}

              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={otpSubmitting || !displayedOtp}
                className="w-full mt-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full font-semibold text-white btn-gradient disabled:opacity-60 cursor-pointer"
              >
                {otpSubmitting ? <span className="spinner" aria-label="Loading" /> : 'Continue'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Signup
