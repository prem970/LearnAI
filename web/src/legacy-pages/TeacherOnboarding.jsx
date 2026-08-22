'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../context/useAuth.js'
import { fetchTeacherProfile, submitTeacherOnboarding } from '../services/api.js'
import AvatarUploader from '../components/AvatarUploader.jsx'
import ProgressBar from './onboarding/ProgressBar.jsx'
import Step1ContentSetup from './onboarding/Step1ContentSetup.jsx'
import Step2TeachingStyle from './onboarding/Step2TeachingStyle.jsx'

function TeacherOnboarding() {
    const searchParams = useSearchParams()
    const startAtStep2 = searchParams.get('step') === '2'
    const [step, setStep] = useState(() => (startAtStep2 ? 2 : 1))
    const [formData, setFormData] = useState({})
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState('')
    const [profileLoaded, setProfileLoaded] = useState(!startAtStep2)
    const { user, updateUser } = useAuth()
    const router = useRouter()
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '')

    useEffect(() => {
        if (!startAtStep2) return
        let cancelled = false
        ;(async () => {
            const { data, error } = await fetchTeacherProfile()
            if (cancelled || error) {
                setProfileLoaded(true)
                return
            }
            const p = data?.profile
            if (p) {
                setFormData({
                    upload_preference: p.upload_preference || 'both',
                    grades: Array.isArray(p.grades) ? p.grades : [],
                    subjects: Array.isArray(p.subjects) ? p.subjects : [],
                    number_of_syllabi: p.number_of_syllabi ?? null,
                    number_of_materials: p.number_of_materials ?? null,
                })
                if (p.avatar_url) setAvatarUrl(p.avatar_url)
            }
            setProfileLoaded(true)
        })()
        return () => {
            cancelled = true
        }
    }, [startAtStep2])

    const handleStep1Next = (step1Data) => {
        setFormData(prev => ({ ...prev, ...step1Data }))
        setStep(2)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const handleStep2Submit = async (step2Data) => {
        const { audioBlob, mimeType } = step2Data
        const form = new FormData()
        form.append('upload_preference', formData.upload_preference)
        form.append('grades', JSON.stringify(formData.grades))
        form.append('subjects', JSON.stringify(formData.subjects))
        if (formData.number_of_syllabi != null) {
            form.append('number_of_syllabi', String(formData.number_of_syllabi))
        }
        if (formData.number_of_materials != null) {
            form.append('number_of_materials', String(formData.number_of_materials))
        }
        const mt = (mimeType || '').toLowerCase()
        const ext = mt.includes('wav')
            ? 'wav'
            : mt.includes('mp3')
                ? 'mp3'
                : mt.includes('m4a')
                    ? 'm4a'
                    : mt.includes('ogg')
                        ? 'ogg'
                        : mt.includes('mp4')
                            ? 'mp4'
                            : 'webm'
        form.append('audio', audioBlob, `teaching-sample.${ext}`)
        form.append('language', 'en')

        setSubmitting(true)
        setSubmitError('')
        const { error } = await submitTeacherOnboarding(form)
        setSubmitting(false)

        if (error) {
            setSubmitError(error.message || 'Something went wrong. Please try again.')
            return
        }

        // Update auth state so ProtectedRoute won't redirect back
        updateUser({ onboarding_completed: true })
        if (startAtStep2) {
            if (typeof window !== 'undefined') sessionStorage.setItem('teacherActiveTab', 'tune')
            router.replace('/teacher')
        } else {
            router.replace('/onboarding-complete')
        }
    }

    return (
        <div className="min-h-screen flex items-stretch justify-center bg-white">
            <div className="w-full max-w-[960px] grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] bg-white shadow-[0_28px_80px_rgba(9,9,11,0.12)] border border-slate-200 animate-auth-fade md:rounded-[18px] md:overflow-hidden md:self-center md:my-8">

                {/* ── Purple side panel ── */}
                <aside className="hidden md:flex flex-col justify-between p-10 bg-gradient-to-br from-[#2563eb] to-[#1e3a8a] text-white relative overflow-hidden" aria-hidden="true">
                    <div className="absolute inset-0 opacity-90 pointer-events-none"
                        style={{ background: 'radial-gradient(circle at 20% 0,rgba(244,244,245,.22),transparent 60%),radial-gradient(circle at 100% 100%,rgba(14,165,233,.32),transparent 70%)', mixBlendMode: 'screen' }} />

                    <div className="relative z-10">
                        <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-2xl mb-6 backdrop-blur-sm">
                            🧠
                        </div>
                        <p className="text-[1.3rem] font-[700] mb-3 leading-tight">
                            Build Your AI Teaching Identity
                        </p>
                        <p className="text-sm text-white/85 leading-relaxed mb-6">
                            This isn&apos;t just a form. You&apos;re training your personal AI to understand
                            how <em>you</em> teach — so it can help your students the same way you would.
                        </p>

                        <div className="space-y-3">
                            {[
                                { icon: '📄', text: 'Share your content preferences' },
                                { icon: '🎙️', text: 'Capture your natural teaching voice' },
                                { icon: '✨', text: 'AI detects your unique teaching style' },
                            ].map((item, i) => (
                                <div key={i} className={['flex items-center gap-3 transition-all duration-300', step > i ? 'opacity-100' : 'opacity-50'].join(' ')}>
                                    <span className="text-base">{item.icon}</span>
                                    <p className="text-sm text-white/90 font-[500]">{item.text}</p>
                                    {step > i + 1 && (
                                        <svg className="w-4 h-4 text-teal-300 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="relative z-10 pt-6 border-t border-white/20">
                        <p className="text-xs text-white/60">
                            LearnAI Teacher Onboarding · Secure & Private
                        </p>
                    </div>
                </aside>

                {/* ── Form panel ── */}
                <div className="px-7 py-9 md:px-10 overflow-y-auto">
                    <header className="mb-2">
                        <p className="text-[1.05rem] font-[700] text-[#2563eb] tracking-wide">LearnAI</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {startAtStep2 ? 'Re-record your teaching voice — step 2 of 2' : 'Teacher Onboarding — Just 2 quick steps'}
                        </p>
                    </header>

                    <div className="mt-4 mb-5">
                        <AvatarUploader
                            displayName={user?.name || 'Teacher'}
                            initialUrl={avatarUrl}
                            onUploaded={(url) => {
                                setAvatarUrl(url)
                                updateUser?.({ avatar_url: url })
                            }}
                        />
                    </div>

                    <ProgressBar current={step} />

                    {submitError && (
                        <div className="mb-4 px-3 py-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm">
                            {submitError}
                        </div>
                    )}

                    {step === 1 && (
                        <Step1ContentSetup data={formData} onNext={handleStep1Next} />
                    )}
                    {step === 2 && (!startAtStep2 || profileLoaded) && (
                        <Step2TeachingStyle
                            onBack={() => {
                                if (startAtStep2) {
                                    if (typeof window !== 'undefined') sessionStorage.setItem('teacherActiveTab', 'tune')
                                    router.replace('/teacher')
                                    return
                                }
                                setStep(1)
                                window.scrollTo({ top: 0, behavior: 'smooth' })
                            }}
                            onSubmit={handleStep2Submit}
                            submitting={submitting}
                        />
                    )}
                    {step === 2 && startAtStep2 && !profileLoaded && (
                        <p className="text-sm text-slate-500 py-8 text-center">Loading your profile…</p>
                    )}
                </div>
            </div>
        </div>
    )
}

export default TeacherOnboarding
