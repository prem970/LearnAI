import { useCallback, useEffect, useMemo, useState } from 'react'
import AvatarUploader from './AvatarUploader.jsx'
import {
  fetchTeacherProfile,
  patchTeacherAccountProfile,
  postTeacherAccountPassword,
  postTeacherEmailChangeStart,
  postTeacherEmailVerifyNew,
  postTeacherEmailVerifyOld,
  postTeacherLogoutAllSessions,
  updateTeacherProfile,
} from '../services/api.js'

const glass =
  'rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl shadow-[0_8px_40px_rgba(37,99,235,0.1)] transition-shadow duration-300 hover:shadow-[0_12px_48px_rgba(37,99,235,0.14)]'

const EMAIL_STEP_LABELS = ['New email', 'Verify current', 'Verify new', 'Done']

function apiErrorText(error, fallback) {
  if (!error) return fallback
  if (typeof error.message === 'string' && error.message.trim()) return error.message.trim()
  const fe = error.fieldErrors
  if (fe?.new_email) return fe.new_email
  const first = fe && Object.values(fe).find((m) => typeof m === 'string' && m.trim())
  if (first) return first
  return fallback
}

function daysSince(iso) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const d = Math.floor((Date.now() - t) / (86400 * 1000))
  return d
}

/** 4 rules × 25%: 8+ chars, upper+lower, digit, symbol. Full bar = all four (no hidden 12-char requirement). */
function passwordStrengthLabel(pw) {
  if (!pw) return { pct: 0, label: 'Enter a password', color: 'bg-slate-200' }
  let score = 0
  if (pw.length >= 8) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const maxScore = 4
  const pct = Math.min(100, (score / maxScore) * 100)
  if (score <= 1) return { pct, label: 'Weak', color: 'bg-rose-400' }
  if (score === 2) return { pct, label: 'Fair', color: 'bg-amber-400' }
  if (score === 3) return { pct, label: 'Good', color: 'bg-emerald-400' }
  return { pct, label: 'Strong', color: 'bg-[#0ea5e9]' }
}

/**
 * Teacher identity & security: profile, password, email (OTP), session controls.
 * Matches LearnAI palette: #2563eb, #0ea5e9, #0f172a.
 */
export default function TeacherAccountSettings({ user, updateUser }) {
  const displayName = user?.name || 'Teacher'

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [nameValue, setNameValue] = useState(displayName)
  const [schoolName, setSchoolName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [schoolSaving, setSchoolSaving] = useState(false)
  const [banner, setBanner] = useState({ type: '', text: '' })

  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  const [emailNew, setEmailNew] = useState('')
  const [emailOtpOld, setEmailOtpOld] = useState('')
  const [emailOtpNew, setEmailOtpNew] = useState('')
  const [emailStep, setEmailStep] = useState(1)
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailStartError, setEmailStartError] = useState('')

  const [logoutAllBusy, setLogoutAllBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await fetchTeacherProfile()
    setLoading(false)
    if (error) {
      setBanner({ type: 'err', text: error.message || 'Could not load profile.' })
      return
    }
    const u = data?.user
    const p = data?.profile
    setProfile(p || null)
    if (u?.name) setNameValue(u.name)
    setSchoolName(p?.school_name || '')
    if (u?.email && updateUser) {
      updateUser({
        name: u.name,
        email: u.email,
        password_changed_at: u.password_changed_at,
        email_changed_at: u.email_changed_at,
      })
    }
  }, [updateUser])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setNameValue(user?.name || displayName)
  }, [user?.name, displayName])

  const strength = useMemo(() => passwordStrengthLabel(pwNew), [pwNew])

  const pwdDays = daysSince(user?.password_changed_at)
  const emailDays = daysSince(user?.email_changed_at)

  const showBanner = (type, text) => {
    setBanner({ type, text })
    if (text) setTimeout(() => setBanner((b) => (b.text === text ? { type: '', text: '' } : b)), 5000)
  }

  const saveName = async () => {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === user?.name) return
    setNameSaving(true)
    const { error } = await patchTeacherAccountProfile({ name: trimmed })
    setNameSaving(false)
    if (error) {
      showBanner('err', error.message || 'Could not update name.')
      return
    }
    updateUser?.({ name: trimmed })
    showBanner('ok', 'Name saved.')
    load()
  }

  const saveSchool = async () => {
    setSchoolSaving(true)
    const { data, error } = await updateTeacherProfile({ school_name: schoolName })
    setSchoolSaving(false)
    if (error) {
      showBanner('err', error.message || 'Could not save school.')
      return
    }
    setProfile((prev) => ({ ...(prev || {}), ...(data?.profile || {}) }))
    showBanner('ok', 'School / institution saved.')
  }

  const savePassword = async () => {
    if (pwNew !== pwConfirm) {
      showBanner('err', 'New password and confirmation do not match.')
      return
    }
    if (pwNew.length < 8) {
      showBanner('err', 'New password must be at least 8 characters.')
      return
    }
    setPwSaving(true)
    const { error } = await postTeacherAccountPassword({
      password: pwNew,
      password_confirmation: pwConfirm,
    })
    setPwSaving(false)
    if (error) {
      showBanner('err', error.message || 'Could not update password.')
      return
    }
    setPwNew('')
    setPwConfirm('')
    showBanner('ok', 'Password updated.')
    load()
  }

  const startEmailChange = async () => {
    if (!emailNew.trim()) return
    setEmailStartError('')
    setEmailBusy(true)
    const { error } = await postTeacherEmailChangeStart({ new_email: emailNew.trim() })
    setEmailBusy(false)
    if (error) {
      const msg = apiErrorText(error, 'Could not start email change.')
      setEmailStartError(msg)
      showBanner('err', msg)
      return
    }
    setEmailStep(2)
    showBanner('ok', 'Check your current email for a verification code.')
  }

  const verifyOld = async () => {
    setEmailBusy(true)
    const { error } = await postTeacherEmailVerifyOld({ otp: emailOtpOld.trim() })
    setEmailBusy(false)
    if (error) {
      showBanner('err', error.message || 'Invalid code.')
      return
    }
    setEmailStep(3)
    setEmailOtpOld('')
    showBanner('ok', 'Check your new email for the next code.')
  }

  const verifyNew = async () => {
    setEmailBusy(true)
    const { data, error } = await postTeacherEmailVerifyNew({ otp: emailOtpNew.trim() })
    setEmailBusy(false)
    if (error) {
      const msg = apiErrorText(error, 'Invalid code.')
      showBanner('err', msg)
      if (error.code === 'email_already_exists') {
        setEmailStep(1)
        setEmailOtpNew('')
        setEmailNew('')
        setEmailStartError(msg)
      }
      return
    }
    if (data?.user?.email) updateUser?.({ email: data.user.email })
    setEmailStep(4)
    setEmailNew('')
    setEmailOtpNew('')
    showBanner('ok', 'Email address updated.')
    load()
  }

  const logoutAll = async () => {
    setLogoutAllBusy(true)
    const { error } = await postTeacherLogoutAllSessions()
    setLogoutAllBusy(false)
    if (error) {
      showBanner('err', error.message || 'Request failed.')
      return
    }
    showBanner('ok', 'Other sessions were signed out.')
  }

  const resetEmailFlow = () => {
    setEmailStep(1)
    setEmailNew('')
    setEmailOtpOld('')
    setEmailOtpNew('')
    setEmailStartError('')
  }

  if (loading && !profile) {
    return (
      <div className={`${glass} p-8 text-center text-slate-500 text-sm`}>
        Loading account settings…
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {banner.text ? (
        <div
          className={`rounded-xl px-4 py-2.5 text-sm border ${
            banner.type === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {/* 1. Profile */}
      <section className={`${glass} p-5 md:p-6`}>
        <h2 className="text-base font-semibold text-[#0f172a] mb-1">Profile information</h2>
        <p className="text-xs text-slate-500 mb-5">
          Update how you appear to students. Changes apply immediately.
        </p>
        <div className="flex flex-col lg:flex-row gap-6 lg:items-start">
          <div className="shrink-0 lg:pt-1">
            <AvatarUploader
              key={user?.avatar_url || profile?.avatar_url || 'no-avatar'}
              displayName={nameValue || displayName}
              initialUrl={user?.avatar_url || profile?.avatar_url || ''}
              collapsible
              className="border-white/60 bg-white/55 backdrop-blur-sm shadow-none"
              onUploaded={(url) => {
                setProfile((prev) => ({ ...(prev || {}), avatar_url: url }))
                updateUser?.({ avatar_url: url })
              }}
            />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="profile-display-name">
                Display name
              </label>
              <div className="flex flex-row gap-2 items-center">
                <input
                  id="profile-display-name"
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="min-w-0 flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200/90 bg-white/80 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/35 focus:border-[#2563eb]/40"
                />
                <button
                  type="button"
                  onClick={saveName}
                  disabled={nameSaving || !nameValue.trim() || nameValue.trim() === user?.name}
                  className="shrink-0 whitespace-nowrap px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-40 transition-colors"
                >
                  {nameSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="profile-school">
                School / institution
              </label>
              <div className="flex flex-row gap-2 items-center">
                <input
                  id="profile-school"
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. your school name"
                  className="min-w-0 flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200/90 bg-white/80 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/35"
                />
                <button
                  type="button"
                  onClick={saveSchool}
                  disabled={schoolSaving}
                  className="shrink-0 whitespace-nowrap px-4 py-2.5 rounded-xl text-xs font-semibold border border-[#0ea5e9]/40 text-[#0ea5e9] bg-white/80 hover:bg-[#0ea5e9]/5 disabled:opacity-40 transition-colors"
                >
                  {schoolSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 pt-0.5">
              Signed in as <span className="font-medium text-slate-600">{user?.email}</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. Password */}
      <section className={`${glass} p-5 md:p-6`}>
        <h2 className="text-base font-semibold text-[#0f172a] mb-1">Password</h2>
        <p className="text-xs text-slate-500 mb-4">
          You&apos;re signed in. Enter and confirm a new password below. No OTP required.
        </p>
        <form
          className="space-y-3 max-w-md"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault()
            savePassword()
          }}
        >
          <input
            type="password"
            name="teacher-account-new-password"
            autoComplete="new-password"
            placeholder="New password"
            value={pwNew}
            onChange={(e) => setPwNew(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/90 bg-white/80 text-sm"
          />
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
              style={{ width: `${strength.pct}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Strength: {strength.label}
            <span className="text-slate-400"> · 8+ chars, upper & lower, number, symbol</span>
          </p>
          <input
            type="password"
            name="teacher-account-new-password-confirm"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={pwConfirm}
            onChange={(e) => setPwConfirm(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/90 bg-white/80 text-sm"
          />
          <button
            type="submit"
            disabled={pwSaving || !pwNew.trim() || !pwConfirm.trim()}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-40"
          >
            {pwSaving ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </section>

      {/* 3. Email change */}
      <section className={`${glass} p-5 md:p-6`}>
        <h2 className="text-base font-semibold text-[#0f172a] mb-1">Email address</h2>
        <p className="text-xs text-slate-500 mb-4">
          Secure two-step verification with your current and new inboxes (four steps).
        </p>

        <div className="flex gap-1.5 sm:gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1 sm:overflow-visible">
          {EMAIL_STEP_LABELS.map((label, i) => {
            const n = i + 1
            const active = emailStep === n
            const done = emailStep > n
            return (
              <div
                key={label}
                className={`flex-1 min-w-[4.5rem] sm:min-w-0 text-center py-2 px-1 rounded-xl text-[10px] sm:text-[11px] font-medium transition-all duration-300 whitespace-nowrap ${
                  active
                    ? 'bg-[#2563eb] text-white shadow-md'
                    : done
                      ? 'bg-[#0ea5e9]/15 text-[#0ea5e9]'
                      : 'bg-slate-100/80 text-slate-400'
                }`}
              >
                {n}. {label}
              </div>
            )
          })}
        </div>

        {emailStep === 4 ? (
          <div className="rounded-xl bg-[#0ea5e9]/10 border border-[#0ea5e9]/20 px-4 py-3 text-sm text-[#075985]">
            Your email was updated successfully. You can close this section or start another change.
            <button
              type="button"
              onClick={resetEmailFlow}
              className="ml-2 font-semibold text-[#0ea5e9] underline underline-offset-2"
            >
              Change again
            </button>
          </div>
        ) : (
          <>
            {emailStep === 1 && (
              <div className="space-y-4 max-w-md">
                <div>
                  <input
                    type="email"
                    placeholder="New email address"
                    value={emailNew}
                    onChange={(e) => {
                      setEmailNew(e.target.value)
                      setEmailStartError('')
                    }}
                    aria-invalid={Boolean(emailStartError)}
                    aria-describedby={emailStartError ? 'email-change-start-error' : undefined}
                    className={`w-full px-3.5 py-3 rounded-xl border bg-white/80 text-sm ${
                      emailStartError
                        ? 'border-rose-400 ring-1 ring-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-300'
                        : 'border-slate-200/90'
                    }`}
                  />
                  {emailStartError ? (
                    <p id="email-change-start-error" className="mt-2 text-sm text-rose-700 font-medium" role="alert">
                      {emailStartError}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={startEmailChange}
                  disabled={emailBusy || !emailNew.includes('@')}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-40 disabled:hover:bg-[#2563eb] transition-colors shadow-sm"
                >
                  {emailBusy ? 'Sending…' : 'Continue'}
                </button>
              </div>
            )}
            {emailStep === 2 && (
              <div className="space-y-3 max-w-md">
                <p className="text-sm text-slate-600">Enter the code sent to your current email ({user?.email}).</p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={emailOtpOld}
                  onChange={(e) => setEmailOtpOld(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/90 bg-white/80 text-sm tracking-widest"
                />
                <button
                  type="button"
                  onClick={verifyOld}
                  disabled={emailBusy || emailOtpOld.length !== 6}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-40 transition-colors"
                >
                  {emailBusy ? 'Verifying…' : 'Verify & continue'}
                </button>
                <button type="button" onClick={resetEmailFlow} className="text-xs text-slate-500">
                  Cancel
                </button>
              </div>
            )}
            {emailStep === 3 && (
              <div className="space-y-3 max-w-md">
                <p className="text-sm text-slate-600">Enter the code sent to {emailNew || 'your new email'}.</p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={emailOtpNew}
                  onChange={(e) => setEmailOtpNew(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/90 bg-white/80 text-sm tracking-widest"
                />
                <button
                  type="button"
                  onClick={verifyNew}
                  disabled={emailBusy || emailOtpNew.length !== 6}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-40 transition-colors"
                >
                  {emailBusy ? 'Verifying…' : 'Confirm new email'}
                </button>
                <button type="button" onClick={resetEmailFlow} className="text-xs text-slate-500">
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* 4. Security */}
      <section className={`${glass} p-5 md:p-6`}>
        <h2 className="text-base font-semibold text-[#0f172a] mb-4">Security</h2>
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            <span className="font-medium text-[#0f172a]">Password last changed:</span>{' '}
            {pwdDays === null ? 'Not recorded yet' : pwdDays === 0 ? 'Today' : `${pwdDays} day${pwdDays === 1 ? '' : 's'} ago`}
          </p>
          <p>
            <span className="font-medium text-[#0f172a]">Email last updated:</span>{' '}
            {emailDays === null ? 'Not recorded yet' : emailDays === 0 ? 'Today' : `${emailDays} day${emailDays === 1 ? '' : 's'} ago`}
          </p>
        </div>
        <button
          type="button"
          onClick={logoutAll}
          disabled={logoutAllBusy}
          className="mt-4 px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
        >
          {logoutAllBusy ? 'Working…' : 'Log out from all other devices'}
        </button>
        <p className="text-[11px] text-slate-400 mt-2 max-w-md">
          Ends other browser sessions. This device stays signed in.
        </p>
      </section>

      {/* 5. Notifications note */}
      <section className={`${glass} p-4 md:p-5 border-[#0ea5e9]/20 bg-[#0ea5e9]/[0.06]`}>
        <p className="text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-[#075985]">Notifications:</span> you will be notified by email when your
          password or email address is changed
        </p>
      </section>
    </div>
  )
}
