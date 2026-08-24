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
import { FlapPanel, FlapPanelHead, FlapButton, FlapInput } from './ui/Board.jsx'

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
  if (!pw) return { pct: 0, label: 'Enter a password', color: 'bg-[var(--board-rule)]' }
  let score = 0
  if (pw.length >= 8) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const maxScore = 4
  const pct = Math.min(100, (score / maxScore) * 100)
  if (score <= 1) return { pct, label: 'Weak', color: 'bg-[var(--flap-cancel)]' }
  if (score === 2) return { pct, label: 'Fair', color: 'bg-[var(--flap-amber)]' }
  if (score === 3) return { pct, label: 'Good', color: 'bg-[var(--flap-ink)]' }
  return { pct, label: 'Strong', color: 'bg-[var(--flap-amber)]' }
}

/**
 * Teacher identity & security: profile, password, email (OTP), session controls.
 * Split-flap board tokens.
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
      <FlapPanel className="p-8 text-center">
        <p className="font-[family-name:var(--font-flap)] text-sm tracking-[0.1em] uppercase text-[var(--flap-mute)] m-0">
          Loading account settings…
        </p>
      </FlapPanel>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {banner.text ? (
        <div
          className={`px-4 py-2.5 text-sm border font-[family-name:var(--font-body)] ${
            banner.type === 'ok'
              ? 'bg-[var(--flap-face)] text-[var(--flap-ink)] border-[var(--board-rule)]'
              : 'border-[var(--flap-cancel)]/50 text-[var(--flap-cancel)]'
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {/* 1. Profile */}
      <FlapPanel>
        <FlapPanelHead title="Profile information" meta="Identity" />
        <div className="p-4 md:p-5">
          <p className="text-xs text-[var(--flap-mute)] mb-5 font-[family-name:var(--font-body)]">
            Update how you appear to students. Changes apply immediately.
          </p>
          <div className="flex flex-col lg:flex-row gap-6 lg:items-start">
            <div className="shrink-0 lg:pt-1">
              <AvatarUploader
                key={user?.avatar_url || profile?.avatar_url || 'no-avatar'}
                displayName={nameValue || displayName}
                initialUrl={user?.avatar_url || profile?.avatar_url || ''}
                collapsible
                className="border-[var(--board-rule)] bg-[var(--flap-face)] shadow-none"
                onUploaded={(url) => {
                  setProfile((prev) => ({ ...(prev || {}), avatar_url: url }))
                  updateUser?.({ avatar_url: url })
                }}
              />
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <label
                  className="block font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--flap-mute)] mb-1.5"
                  htmlFor="profile-display-name"
                >
                  Display name
                </label>
                <div className="flex flex-row gap-2 items-center">
                  <FlapInput
                    id="profile-display-name"
                    type="text"
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    className="min-w-0 flex-1"
                  />
                  <FlapButton
                    type="button"
                    onClick={saveName}
                    disabled={nameSaving || !nameValue.trim() || nameValue.trim() === user?.name}
                    variant="primary"
                    className="shrink-0"
                  >
                    {nameSaving ? 'Saving…' : 'Save'}
                  </FlapButton>
                </div>
              </div>
              <div>
                <label
                  className="block font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--flap-mute)] mb-1.5"
                  htmlFor="profile-school"
                >
                  School / institution
                </label>
                <div className="flex flex-row gap-2 items-center">
                  <FlapInput
                    id="profile-school"
                    type="text"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    placeholder="e.g. your school name"
                    className="min-w-0 flex-1"
                  />
                  <FlapButton type="button" onClick={saveSchool} disabled={schoolSaving} variant="ghost" className="shrink-0">
                    {schoolSaving ? 'Saving…' : 'Save'}
                  </FlapButton>
                </div>
              </div>
              <p className="text-[11px] text-[var(--flap-mute)] pt-0.5 font-[family-name:var(--font-body)] m-0">
                Signed in as <span className="font-medium text-[var(--flap-ink)]">{user?.email}</span>
              </p>
            </div>
          </div>
        </div>
      </FlapPanel>

      {/* 2. Password */}
      <FlapPanel>
        <FlapPanelHead title="Password" meta="Security" />
        <div className="p-4 md:p-5">
          <p className="text-xs text-[var(--flap-mute)] mb-4 font-[family-name:var(--font-body)]">
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
            <FlapInput
              type="password"
              name="teacher-account-new-password"
              autoComplete="new-password"
              placeholder="New password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
            />
            <div className="h-1.5 bg-[var(--board-steel-deep)] overflow-hidden border border-[var(--board-rule)]">
              <div
                className={`h-full transition-all duration-300 ${strength.color}`}
                style={{ width: `${strength.pct}%` }}
              />
            </div>
            <p className="text-[11px] text-[var(--flap-mute)] font-[family-name:var(--font-body)] m-0">
              Strength: {strength.label}
              <span className="text-[var(--flap-mute)]"> · 8+ chars, upper & lower, number, symbol</span>
            </p>
            <FlapInput
              type="password"
              name="teacher-account-new-password-confirm"
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
            />
            <FlapButton type="submit" disabled={pwSaving || !pwNew.trim() || !pwConfirm.trim()} variant="primary">
              {pwSaving ? 'Updating…' : 'Update password'}
            </FlapButton>
          </form>
        </div>
      </FlapPanel>

      {/* 3. Email change */}
      <FlapPanel>
        <FlapPanelHead title="Email address" meta="Four steps" />
        <div className="p-4 md:p-5">
          <p className="text-xs text-[var(--flap-mute)] mb-4 font-[family-name:var(--font-body)]">
            Secure two-step verification with your current and new inboxes (four steps).
          </p>

          <div className="flex gap-1.5 sm:gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1 sm:overflow-visible" role="list">
            {EMAIL_STEP_LABELS.map((label, i) => {
              const n = i + 1
              const active = emailStep === n
              const done = emailStep > n
              return (
                <div
                  key={label}
                  role="listitem"
                  aria-current={active ? 'step' : undefined}
                  className={[
                    'flex-1 min-w-[4.5rem] sm:min-w-0 text-center font-[family-name:var(--font-flap)] px-2 py-1.5 text-[10px] sm:text-[11px] font-semibold tracking-[0.12em] uppercase border whitespace-nowrap',
                    active || done
                      ? 'flap-cell text-[var(--flap-ink)] border-[var(--flap-ink)]/25'
                      : 'bg-transparent text-[var(--flap-mute)] border-transparent',
                  ].join(' ')}
                >
                  {n}. {label}
                </div>
              )
            })}
          </div>

          {emailStep === 4 ? (
            <div className="border border-[var(--flap-amber)]/40 bg-[var(--flap-amber)]/10 px-4 py-3 text-sm text-[var(--flap-ink)] font-[family-name:var(--font-body)]">
              Your email was updated successfully. You can close this section or start another change.
              <button
                type="button"
                onClick={resetEmailFlow}
                className="ml-2 font-[family-name:var(--font-flap)] font-semibold tracking-[0.08em] uppercase text-[var(--flap-amber)] underline underline-offset-2 bg-transparent border-none cursor-pointer p-0"
              >
                Change again
              </button>
            </div>
          ) : (
            <>
              {emailStep === 1 && (
                <div className="space-y-4 max-w-md">
                  <div>
                    <FlapInput
                      type="email"
                      placeholder="New email address"
                      value={emailNew}
                      onChange={(e) => {
                        setEmailNew(e.target.value)
                        setEmailStartError('')
                      }}
                      aria-invalid={Boolean(emailStartError)}
                      aria-describedby={emailStartError ? 'email-change-start-error' : undefined}
                      className={
                        emailStartError
                          ? 'border-[var(--flap-cancel)] focus:border-[var(--flap-cancel)]'
                          : ''
                      }
                    />
                    {emailStartError ? (
                      <p
                        id="email-change-start-error"
                        className="mt-2 text-sm text-[var(--flap-cancel)] font-medium font-[family-name:var(--font-body)]"
                        role="alert"
                      >
                        {emailStartError}
                      </p>
                    ) : null}
                  </div>
                  <FlapButton
                    type="button"
                    onClick={startEmailChange}
                    disabled={emailBusy || !emailNew.includes('@')}
                    variant="primary"
                    className="w-full"
                  >
                    {emailBusy ? 'Sending…' : 'Continue'}
                  </FlapButton>
                </div>
              )}
              {emailStep === 2 && (
                <div className="space-y-3 max-w-md">
                  <p className="text-sm text-[var(--flap-mute)] font-[family-name:var(--font-body)] m-0">
                    Enter the code sent to your current email ({user?.email}).
                  </p>
                  <FlapInput
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={emailOtpOld}
                    onChange={(e) => setEmailOtpOld(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="tracking-widest"
                  />
                  <FlapButton
                    type="button"
                    onClick={verifyOld}
                    disabled={emailBusy || emailOtpOld.length !== 6}
                    variant="primary"
                    className="w-full"
                  >
                    {emailBusy ? 'Verifying…' : 'Verify & continue'}
                  </FlapButton>
                  <button
                    type="button"
                    onClick={resetEmailFlow}
                    className="font-[family-name:var(--font-flap)] text-[11px] tracking-[0.12em] uppercase text-[var(--flap-mute)] bg-transparent border-none cursor-pointer p-0"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {emailStep === 3 && (
                <div className="space-y-3 max-w-md">
                  <p className="text-sm text-[var(--flap-mute)] font-[family-name:var(--font-body)] m-0">
                    Enter the code sent to {emailNew || 'your new email'}.
                  </p>
                  <FlapInput
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={emailOtpNew}
                    onChange={(e) => setEmailOtpNew(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="tracking-widest"
                  />
                  <FlapButton
                    type="button"
                    onClick={verifyNew}
                    disabled={emailBusy || emailOtpNew.length !== 6}
                    variant="primary"
                    className="w-full"
                  >
                    {emailBusy ? 'Verifying…' : 'Confirm new email'}
                  </FlapButton>
                  <button
                    type="button"
                    onClick={resetEmailFlow}
                    className="font-[family-name:var(--font-flap)] text-[11px] tracking-[0.12em] uppercase text-[var(--flap-mute)] bg-transparent border-none cursor-pointer p-0"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </FlapPanel>

      {/* 4. Security */}
      <FlapPanel>
        <FlapPanelHead title="Security" meta="Sessions" />
        <div className="p-4 md:p-5">
          <div className="space-y-3 text-sm text-[var(--flap-mute)] font-[family-name:var(--font-body)]">
            <p className="m-0">
              <span className="font-medium text-[var(--flap-ink)]">Password last changed:</span>{' '}
              {pwdDays === null ? 'Not recorded yet' : pwdDays === 0 ? 'Today' : `${pwdDays} day${pwdDays === 1 ? '' : 's'} ago`}
            </p>
            <p className="m-0">
              <span className="font-medium text-[var(--flap-ink)]">Email last updated:</span>{' '}
              {emailDays === null ? 'Not recorded yet' : emailDays === 0 ? 'Today' : `${emailDays} day${emailDays === 1 ? '' : 's'} ago`}
            </p>
          </div>
          <FlapButton type="button" onClick={logoutAll} disabled={logoutAllBusy} variant="ghost" className="mt-4">
            {logoutAllBusy ? 'Working…' : 'Log out from all other devices'}
          </FlapButton>
          <p className="text-[11px] text-[var(--flap-mute)] mt-2 max-w-md font-[family-name:var(--font-body)]">
            Ends other browser sessions. This device stays signed in.
          </p>
        </div>
      </FlapPanel>

      {/* 5. Notifications note */}
      <FlapPanel className="border-[var(--flap-amber)]/30">
        <div className="p-4 md:p-5">
          <p className="text-xs text-[var(--flap-mute)] leading-relaxed font-[family-name:var(--font-body)] m-0">
            <span className="font-[family-name:var(--font-flap)] font-semibold tracking-[0.08em] uppercase text-[var(--flap-amber)]">
              Notifications:
            </span>{' '}
            you will be notified by email when your password or email address is changed
          </p>
        </div>
      </FlapPanel>
    </div>
  )
}
