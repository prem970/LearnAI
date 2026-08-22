'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/useAuth.js'
import TeacherAccountSettings from '../components/TeacherAccountSettings.jsx'
import TeacherInsights from '../components/TeacherInsights.jsx'
import TeacherTuneLab from '../components/TeacherTuneLab.jsx'
import TeacherQuizzes from '../components/TeacherQuizzes.jsx'
import { getTeachingStyleDisplay } from '../constants/teachingStyleCopy.js'
import { fetchTeacherProfile } from '../services/api.js'

const glass =
    'rounded-2xl border border-white/70 bg-white/70 backdrop-blur-xl shadow-[0_8px_40px_rgba(37,99,235,0.08)]'

const glassFancy =
    'rounded-3xl border border-white/80 bg-white/75 backdrop-blur-2xl shadow-[0_12px_48px_rgba(37,99,235,0.12)] transition-all duration-300 hover:shadow-[0_20px_60px_rgba(37,99,235,0.16)] hover:border-[#2563eb]/25'

const DASHBOARD_TABS = new Set(['overview', 'insights', 'quizzes', 'tune', 'profile'])

function isBrowserReloadNavigation() {
    if (typeof performance === 'undefined') return false
    const [nav] = performance.getEntriesByType('navigation')
    return nav?.type === 'reload'
}

/** Five stars reflecting average rating (0–5), including half stars. */
function StarRow({ value, max = 5 }) {
    if (value == null || Number.isNaN(Number(value))) {
        return (
            <div className="flex items-center gap-0.5 md:gap-1.5" aria-hidden>
                {Array.from({ length: max }, (_, i) => (
                    <span key={i} className="text-3xl md:text-4xl leading-none text-slate-200">★</span>
                ))}
            </div>
        )
    }
    const n = Math.max(0, Math.min(max, Number(value)))
    const full = Math.floor(n)
    const partial = n - full >= 0.5 ? 1 : 0
    return (
        <div className="flex items-center gap-0.5 md:gap-1.5" aria-hidden>
            {Array.from({ length: max }, (_, i) => {
                const filled = i < full || (i === full && partial)
                return (
                    <span
                        key={i}
                        className={`text-3xl md:text-4xl leading-none ${filled ? 'text-amber-400' : 'text-slate-200'}`}
                    >
                        ★
                    </span>
                )
            })}
        </div>
    )
}

function TeacherDashboard() {
    const { user, logout, updateUser } = useAuth()
    const displayName = user?.name || 'Teacher'
    const [activeTab, setActiveTab] = useState('overview')
    const [profileError, setProfileError] = useState('')
    const [profile, setProfile] = useState(null)

    useEffect(() => {
        if (isBrowserReloadNavigation()) return
        const tab = typeof window !== 'undefined' ? sessionStorage.getItem('teacherActiveTab') : null
        if (tab && DASHBOARD_TABS.has(tab)) {
            setActiveTab(tab)
            sessionStorage.removeItem('teacherActiveTab')
        }
    }, [])

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'insights', label: 'Insights' },
        { id: 'quizzes', label: 'Quizzes' },
        { id: 'tune', label: 'Tune' },
        { id: 'profile', label: 'Profile' },
    ]

    const loadProfile = useCallback(async () => {
        setProfileError('')
        const { data, error } = await fetchTeacherProfile()
        if (error) {
            setProfileError(error.message || 'Failed to load profile.')
            return
        }
        setProfile(data?.profile || null)
    }, [])

    useEffect(() => {
        loadProfile()
    }, [loadProfile, activeTab])

    const avatarUrl = profile?.avatar_url || user?.avatar_url || ''
    const avgRating = profile?.rating != null && profile.rating !== '' && !Number.isNaN(Number(profile.rating))
        ? Number(profile.rating)
        : null
    const ratingCount = Number(profile?.rating_count ?? 0)
    const { title: styleTitle, blurb: styleBlurb } = getTeachingStyleDisplay(profile?.detected_teaching_style)
    const studentsHelped = Number(profile?.students_helped_count ?? 0)
    const overviewComments = Array.isArray(profile?.overview_comments) ? profile.overview_comments : []
    /** md+: keep overview within one viewport — show first N; rest summarized below. */
    const visibleOverviewComments = overviewComments.slice(0, 8)
    const moreCommentsCount = overviewComments.length - visibleOverviewComments.length
    const firstName = displayName.trim().split(/\s+/)[0] || 'Teacher'

    return (
        <div
            className={`min-h-screen bg-[#f0f9ff] flex flex-col ${
                activeTab === 'overview' ? 'md:h-[100dvh] md:max-h-[100dvh] md:overflow-hidden md:overflow-x-hidden' : ''
            }`}
            style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}
        >
            {/* ═══ Top Navigation Bar ═══ */}
            <header className="bg-[#0f172a] text-white sticky top-0 z-30 shadow-[0_2px_20px_rgba(0,0,0,0.3)]">
                <div className="max-w-[1280px] mx-auto px-5 md:px-8 flex items-center justify-between h-14">
                    {/* Brand */}
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col leading-tight">
                            <span className="text-[15px] font-[750] tracking-tight">LearnAI</span>
                            <span className="text-[9px] text-white/50 uppercase tracking-widest">Teacher Console</span>
                        </div>
                        {/* Desktop tabs */}
                        <nav className="hidden md:flex items-center gap-1 ml-6">
                            {tabs.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setActiveTab(t.id)}
                                    className={[
                                        'px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer border-none',
                                        activeTab === t.id
                                            ? 'bg-[#2563eb] text-white'
                                            : 'text-white/60 hover:text-white hover:bg-white/10',
                                    ].join(' ')}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-3">
                        <button className="relative p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer border-none" aria-label="Notifications">
                            🔔
                            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
                        </button>
                        <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                            <div className="w-8 h-8 rounded-lg overflow-hidden bg-gradient-to-br from-[#2563eb] to-[#1e3a8a] flex items-center justify-center text-sm font-bold">
                                {user?.avatar_url ? (
                                    <img
                                        src={user.avatar_url}
                                        alt={displayName}
                                        className="w-full h-full object-cover"
                                        onError={(e) => { e.currentTarget.src = '' }}
                                    />
                                ) : (
                                    displayName.charAt(0).toUpperCase()
                                )}
                            </div>
                            <div className="hidden sm:block">
                                <p className="text-[13px] font-semibold leading-tight">{displayName}</p>
                                <p className="text-[10px] text-white/50">Teacher</p>
                            </div>
                        </div>
                        <button
                            onClick={logout}
                            className="text-[12px] text-white/50 hover:text-white transition-colors cursor-pointer border-none bg-transparent px-2"
                        >
                            Sign out
                        </button>
                    </div>
                </div>

                {/* Mobile tabs */}
                <div className="md:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={[
                                'shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer border-none',
                                activeTab === t.id
                                    ? 'bg-[#2563eb] text-white'
                                    : 'text-white/60 hover:bg-white/10',
                            ].join(' ')}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </header>

            {/* ═══ Page Content ═══ */}
            <div
                className={[
                    'flex-1 w-full mx-auto min-h-0',
                    activeTab === 'overview'
                        ? 'w-full max-w-[1920px] mx-auto md:flex md:flex-col md:overflow-hidden md:min-h-0 box-border p-0'
                        : 'max-w-[1280px] px-4 sm:px-6 lg:px-10 py-6 lg:py-8',
                ].join(' ')}
            >
                {activeTab !== 'overview' && activeTab !== 'insights' && activeTab !== 'quizzes' && (
                <div className="mb-6">
                    <h1 className="text-xl font-[700] text-[#0f172a]">
                        {activeTab === 'profile'
                            ? 'Account & security'
                            : activeTab === 'insights'
                              ? 'Conversation insights'
                            : activeTab === 'tune'
                              ? 'Teaching Lab'
                              : ''}
                    </h1>
                </div>
                )}

                {activeTab === 'profile' && (
                    <>
                        {profileError ? (
                            <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-sm max-w-3xl mx-auto">
                                {profileError}
                            </div>
                        ) : null}
                        <TeacherAccountSettings user={user} updateUser={updateUser} />
                    </>
                )}

                {activeTab === 'insights' && <TeacherInsights />}

                {activeTab === 'quizzes' && <TeacherQuizzes />}

                {activeTab === 'tune' && (
                    <>
                        {profileError ? (
                            <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-sm max-w-3xl mx-auto">
                                {profileError}
                            </div>
                        ) : null}
                        <TeacherTuneLab user={user} profile={profile} onSaved={loadProfile} />
                    </>
                )}

                {activeTab !== 'profile' && activeTab !== 'tune' && activeTab !== 'insights' && activeTab !== 'quizzes' && (
                <div className="relative flex flex-col flex-1 min-h-0">
                    {/* Ambient background — inset-0 only; padding lives on content so nothing clips */}
                    <div
                        className="absolute inset-0 rounded-none lg:rounded-[1.5rem] overflow-hidden pointer-events-none"
                        aria-hidden
                    >
                        <div
                            className="absolute inset-0 opacity-[0.65]"
                            style={{
                                background:
                                    'radial-gradient(ellipse 90% 70% at 10% 20%, rgba(37, 99, 235, 0.18), transparent 55%), radial-gradient(ellipse 80% 60% at 90% 80%, rgba(1, 126, 132, 0.16), transparent 50%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(37, 99, 235, 0.08), transparent 45%)',
                            }}
                        />
                        <div
                            className="absolute inset-0 opacity-[0.4]"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%232563eb' fill-opacity='0.06'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                            }}
                        />
                        <div className="absolute top-10 right-[15%] w-72 h-72 rounded-full bg-gradient-to-br from-[#2563eb]/20 to-transparent blur-3xl" />
                        <div className="absolute bottom-20 left-[10%] w-96 h-96 rounded-full bg-gradient-to-tr from-[#0ea5e9]/15 to-transparent blur-3xl" />
                    </div>

                    <div className="relative z-10 flex flex-col flex-1 min-h-0 gap-2 md:gap-3 lg:gap-4 p-3 sm:p-3.5 md:p-3 lg:p-4 md:overflow-hidden">
                        {/* Hero */}
                        <header className="shrink-0 text-center lg:text-left max-w-3xl mx-auto lg:mx-0 p-0 m-0">
                            <h1 className="text-2xl sm:text-3xl md:text-[1.65rem] lg:text-3xl xl:text-[2.35rem] font-[800] tracking-tight text-[#0f172a] leading-[1.12]">
                                Welcome back,{' '}
                                <span className="bg-gradient-to-r from-[#2563eb] via-[#3b82f6] to-[#0ea5e9] bg-clip-text text-transparent">
                                    {firstName}
                                </span>
                            </h1>
                            <p className="mt-1.5 md:mt-1.5 text-sm sm:text-[0.9375rem] text-slate-600 max-w-xl mx-auto lg:mx-0 leading-snug">
                                See how you help students learn faster - and how your style stays with them after class,
                                whenever they need you.
                            </p>
                        </header>

                        {/* Bento: tablet = profile | metrics, then comments full width; xl = one row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-2.5 md:gap-3 lg:gap-4 flex-1 min-h-0 xl:items-stretch xl:grid-rows-1 auto-rows-min md:auto-rows-min md:overflow-hidden">
                            {/* Profile */}
                            <section
                                className={`md:col-span-1 xl:col-span-3 ${glassFancy} p-4 md:p-4 lg:p-5 flex flex-col items-center justify-center text-center relative overflow-hidden group min-h-0`}
                            >
                                <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br from-[#2563eb]/20 to-transparent blur-2xl group-hover:scale-110 transition-transform duration-500" />
                                <div className="relative w-32 h-32 md:w-36 md:h-36 xl:w-40 xl:h-40 rounded-[1.75rem] overflow-hidden bg-gradient-to-br from-[#2563eb] via-[#3b82f6] to-[#0ea5e9] p-[3px] shadow-[0_16px_48px_rgba(37,99,235,0.35)] mb-3 md:mb-4">
                                    <div className="w-full h-full rounded-[1.6rem] overflow-hidden bg-[#0f172a]">
                                        {avatarUrl ? (
                                            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white text-5xl font-bold">
                                                {displayName.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <p className="relative text-lg sm:text-xl font-bold text-[#0f172a] leading-tight tracking-tight">{displayName}</p>
                                <p className="relative text-xs text-slate-500 mt-2 font-medium">Your profile</p>
                            </section>

                            {/* Metrics stack */}
                            <div className="md:col-span-1 xl:col-span-5 flex flex-col gap-2.5 md:gap-3 min-w-0 min-h-0 md:max-h-full md:overflow-hidden">
                                <section className={`${glassFancy} p-3.5 sm:p-4 md:p-4 relative overflow-hidden border-t-4 border-t-[#f59e0b]/90 shrink-0`}>
                                    <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-3">Ratings</h2>
                                    <div className="flex items-center w-full min-w-0">
                                        <div className="flex-1 min-w-0 text-left">
                                            <p className="text-3xl md:text-4xl xl:text-5xl font-[800] text-[#0f172a] tabular-nums leading-none tracking-tight">
                                                {avgRating != null ? avgRating.toFixed(1) : '—'}
                                                <span className="text-base md:text-lg xl:text-xl font-semibold text-slate-400">/5</span>
                                            </p>
                                            <p className="text-sm text-slate-600 mt-1.5 md:mt-2 font-medium">
                                                {ratingCount === 0 ? 'No ratings yet' : `${ratingCount} rating${ratingCount === 1 ? '' : 's'} total`}
                                            </p>
                                        </div>
                                        <div className="shrink-0 px-1">
                                            <StarRow value={avgRating} />
                                        </div>
                                        <div className="flex-1 min-w-0" aria-hidden="true" />
                                    </div>
                                </section>

                                <section className={`${glassFancy} p-3.5 sm:p-4 md:p-4 border-t-4 border-t-[#2563eb]/80 md:flex-1 md:min-h-0 md:overflow-hidden`}>
                                    <h2 className="text-[10px] md:text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-2 flex items-center gap-2">
                                        <span className="text-base md:text-lg" aria-hidden>🧠</span>
                                        Style of teaching
                                    </h2>
                                    <p className="text-sm md:text-base font-semibold text-[#0f172a] leading-snug mb-2">
                                        {styleTitle}
                                    </p>
                                    <p className="text-xs md:text-[13px] text-slate-600 leading-relaxed max-md:line-clamp-5 md:line-clamp-5 xl:line-clamp-6">
                                        {styleBlurb}
                                    </p>
                                </section>

                                <section className={`${glassFancy} p-3.5 sm:p-4 md:p-4 shrink-0 border-t-4 border-t-[#0ea5e9]`}>
                                    <h2 className="text-[10px] md:text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1 flex items-center gap-2">
                                        <span className="text-base md:text-lg" aria-hidden>🌱</span>
                                        Students benefited
                                    </h2>
                                    <p className="text-4xl md:text-5xl xl:text-6xl font-[800] bg-gradient-to-br from-[#0ea5e9] to-[#0369a1] bg-clip-text text-transparent tabular-nums leading-none">
                                        {studentsHelped}
                                    </p>
                                    <p className="text-xs md:text-sm text-slate-600 mt-2 leading-snug line-clamp-2">
                                        Unique learners who&apos;ve left feedback—every number is a real connection.
                                    </p>
                                </section>
                            </div>

                            {/* Comments */}
                            <section
                                className={`md:col-span-2 xl:col-span-4 ${glassFancy} p-3.5 sm:p-4 md:p-4 lg:p-4 flex flex-col min-h-[280px] max-md:max-h-[min(520px,50vh)] md:min-h-0 md:max-h-full md:h-full xl:h-auto border-t-4 border-t-[#38bdf8]/70 overflow-hidden`}
                            >
                                <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1 flex items-center gap-2">
                                    <span className="text-lg" aria-hidden>💬</span>
                                    Comments
                                </h2>
                                <p className="text-[11px] text-slate-500 mb-3">How did you help them cross the finish line?</p>
                                {visibleOverviewComments.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center py-8 md:py-6 px-4 rounded-2xl bg-gradient-to-b from-slate-50/80 to-white/40 border border-dashed border-slate-200/80 min-h-0">
                                        <span className="text-3xl md:text-4xl mb-2 md:mb-3 opacity-40" aria-hidden>✨</span>
                                        <p className="text-slate-600 font-medium text-sm md:text-base">No comments yet</p>
                                        <p className="text-xs text-slate-400 mt-2 max-w-[14rem]">When students share words of appreciation, they&apos;ll glow here.</p>
                                    </div>
                                ) : (
                                    <ul className="space-y-2 flex-1 min-h-0 overflow-y-auto max-md:max-h-[min(480px,50vh)] pr-1 [scrollbar-width:thin] md:overflow-hidden md:pr-0">
                                        {visibleOverviewComments.map((c, idx) => (
                                            <li
                                                key={`${c.created_at ?? idx}-${idx}`}
                                                className="rounded-xl md:rounded-2xl bg-gradient-to-br from-white/90 to-[#eff6ff]/90 border border-white shadow-sm p-3 md:p-3 text-sm text-[#0f172a] leading-relaxed md:shrink md:min-h-0 hover:shadow-md transition-shadow"
                                            >
                                                <p className="text-[10px] md:text-[11px] font-semibold text-[#2563eb] mb-1 flex items-center gap-2 flex-wrap">
                                                    <span className="text-amber-500">★</span>
                                                    {c.rating != null ? `${c.rating}.0` : ''}
                                                    {c.created_at ? (
                                                        <span className="text-slate-400 font-normal">
                                                            · {new Date(c.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                                        </span>
                                                    ) : null}
                                                </p>
                                                <p className="text-sm md:text-[13px] xl:text-[15px] text-slate-800 max-md:line-clamp-3 md:line-clamp-2 xl:line-clamp-3">{c.feedback}</p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {moreCommentsCount > 0 ? (
                                    <p className="text-[10px] md:text-[11px] text-slate-400 mt-2 shrink-0">
                                        +{moreCommentsCount} more not shown
                                    </p>
                                ) : null}
                            </section>
                        </div>
                    </div>
                </div>
                )}
            </div>
        </div>
    )
}

export default TeacherDashboard
