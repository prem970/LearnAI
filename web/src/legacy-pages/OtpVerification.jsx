'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { resendOtp, verifyOtp } from '../services/api.js'
import { useAuth } from '../context/useAuth.js'

const RESEND_COOLDOWN_SEC = 60

function OtpVerification() {
    const [otp, setOtp] = useState(Array(6).fill(''))
    const [error, setError] = useState('')
    const [resent, setResent] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [resendResending, setResendResending] = useState(false)
    const [resendCountdown, setResendCountdown] = useState(0)
    const inputsRef = useRef([])
    const router = useRouter()
    const { user, setAuthSession } = useAuth()

    // DEV ONLY: OTP hint stored by Signup.jsx after registration
    const devOtp = localStorage.getItem('dev_otp')

    useEffect(() => {
        if (resendCountdown <= 0) return
        const timer = setInterval(() => setResendCountdown((c) => Math.max(0, c - 1)), 1000)
        return () => clearInterval(timer)
    }, [resendCountdown])

    const handleChange = (e, idx) => {
        const val = e.target.value.replace(/\D/, '').slice(-1)
        const next = [...otp]
        next[idx] = val
        setOtp(next)
        if (val && idx < 5) inputsRef.current[idx + 1]?.focus()
    }

    const handleKeyDown = (e, idx) => {
        if (e.key === 'Backspace') {
            if (otp[idx]) {
                const next = [...otp]
                next[idx] = ''
                setOtp(next)
            } else if (idx > 0) {
                inputsRef.current[idx - 1]?.focus()
            }
        }
    }

    const handlePaste = (e) => {
        e.preventDefault()
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
        if (!pasted) return
        const next = Array(6).fill('')
        pasted.split('').forEach((ch, i) => { next[i] = ch })
        setOtp(next)
        const focusIdx = Math.min(pasted.length, 5)
        inputsRef.current[focusIdx]?.focus()
    }

    const handleVerify = async () => {
        if (otp.some(d => d === '')) {
            setError('Please enter the full 6-digit OTP.')
            return
        }
        if (!user?.id) {
            setError('Session expired. Please sign up again.')
            return
        }

        setError('')
        setSubmitting(true)

        const { data: apiData, error: apiError } = await verifyOtp({
            user_id: user.id,
            otp_code: otp.join(''),
        })

        setSubmitting(false)

        if (apiError) {
            setError(apiError.message || 'Invalid OTP. Please try again.')
            return
        }

        const role = user?.role || localStorage.getItem('authRole') || 'student'
        const nextUser = { ...user, ...(apiData?.user || {}), otp_verified: true }
        const nextToken = apiData?.token || `fake-jwt-token-${user.id}`
        setAuthSession(nextToken, nextUser, role)

        if (role === 'teacher') {
            const needsOnboarding = !nextUser?.onboarding_completed
            router.replace(needsOnboarding ? '/teacher-onboarding' : '/teacher')
        } else {
            router.replace('/student')
        }
    }

    const handleResend = async () => {
        if (!user?.id || resendResending || resendCountdown > 0) return
        setResendResending(true)
        setError('')
        const { data, error: apiError } = await resendOtp({ user_id: user.id })
        setResendResending(false)

        if (apiError) {
            setError(apiError.message || 'Failed to resend OTP. Please try again.')
            return
        }

        setResent(true)
        setTimeout(() => setResent(false), 2000)
        if (data?.otp_code) localStorage.setItem('dev_otp', data.otp_code)
        setResendCountdown(data?.retry_after ?? RESEND_COOLDOWN_SEC)
    }

    return (
        <div className="min-h-[100dvh] flex items-stretch justify-center bg-[var(--board-steel-deep)]">
            <div className="w-full max-w-[960px] grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] bg-[var(--board-steel)] border border-[var(--board-rule)] animate-auth-fade md:self-center md:my-8">

                <aside className="hidden md:flex flex-col justify-end p-10 bg-[var(--board-steel-deep)] text-[var(--flap-ink)] border-r border-[var(--board-rule)] relative" aria-hidden="true">
                    <div className="relative z-10 max-w-xs">
                        <p className="font-[family-name:var(--font-flap)] text-[1.6rem] font-semibold tracking-[0.04em] uppercase mb-2">
                            One last step
                        </p>
                        <p className="text-sm text-[var(--flap-mute)] leading-relaxed">
                            We sent a 6-digit code to your email. Enter it below to
                            verify your identity and access your LearnAI workspace.
                        </p>
                    </div>
                </aside>

                <div className="px-7 py-12 md:px-10 flex flex-col justify-center">
                    <header className="mb-7">
                        <p className="font-[family-name:var(--font-flap)] text-[1.6rem] font-semibold tracking-[0.04em] uppercase text-[var(--flap-ink)] mb-0.5">
                            Verify your email
                        </p>
                        <p className="text-sm text-[var(--flap-mute)]">
                            Enter the 6-digit code we sent to your inbox.
                        </p>
                    </header>

                    {/* DEV MODE: OTP hint */}
                    {devOtp && (
                        <div className="mb-4 px-4 py-3 border border-[var(--board-rule)] bg-[var(--board-steel-deep)] text-center">
                            <p className="font-[family-name:var(--font-flap)] text-xs font-semibold text-[var(--flap-amber)] uppercase tracking-wide mb-1">Dev Mode — OTP Code</p>
                            <p className="font-[family-name:var(--font-flap)] text-2xl font-semibold tracking-[0.4em] text-[var(--flap-ink)]">{devOtp}</p>
                            <p className="text-[0.65rem] text-[var(--flap-mute)] mt-1">This banner is for testing only</p>
                        </div>
                    )}

                    {/* OTP boxes */}
                    <div className="flex gap-3 justify-center mb-2" onPaste={handlePaste}>
                        {otp.map((digit, idx) => (
                            <input
                                key={idx}
                                ref={el => (inputsRef.current[idx] = el)}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={digit}
                                onChange={e => handleChange(e, idx)}
                                onKeyDown={e => handleKeyDown(e, idx)}
                                autoFocus={idx === 0}
                                className={[
                                    'w-11 h-14 text-center text-[1.35rem] font-[family-name:var(--font-flap)] font-semibold border outline-none transition-colors duration-150',
                                    'bg-[var(--board-steel-deep)] text-[var(--flap-ink)]',
                                    'focus:border-[var(--flap-amber)] focus:ring-1 focus:ring-[var(--flap-amber)]',
                                    digit
                                        ? 'border-[var(--flap-amber)]'
                                        : 'border-[var(--board-rule)]',
                                    error ? 'border-[var(--flap-cancel)]' : '',
                                ].join(' ')}
                                aria-label={`OTP digit ${idx + 1}`}
                            />
                        ))}
                    </div>

                    {error && (
                        <p className="text-[var(--flap-cancel)] text-sm text-center mb-3 mt-1">{error}</p>
                    )}

                    <button
                        type="button"
                        onClick={handleVerify}
                        disabled={submitting}
                        className="w-full mt-5 flex items-center justify-center gap-2 px-4 py-2.5 font-[family-name:var(--font-flap)] font-semibold tracking-[0.12em] uppercase text-[var(--board-steel-deep)] bg-[var(--flap-amber)] border-none disabled:opacity-60 cursor-pointer"
                    >
                        {submitting ? <span className="spinner" aria-label="Loading" /> : 'Verify OTP'}
                    </button>

                    <p className="mt-4 text-center text-sm text-[var(--flap-mute)]">
                        Didn&apos;t receive a code?{' '}
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={resendResending || resendCountdown > 0 || !user?.id}
                            className="font-semibold text-[var(--flap-amber)] hover:underline underline-offset-[3px] cursor-pointer bg-transparent border-none p-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline"
                        >
                            {resendResending ? 'Sending…' : resendCountdown > 0 ? `Resend OTP in ${resendCountdown}s` : resent ? 'Sent!' : 'Resend OTP'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default OtpVerification
