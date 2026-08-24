'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/useAuth.js'
import TeacherAccountSettings from '../components/TeacherAccountSettings.jsx'
import TeacherInsights from '../components/TeacherInsights.jsx'
import TeacherTuneLab from '../components/TeacherTuneLab.jsx'
import TeacherQuizzes from '../components/TeacherQuizzes.jsx'
import { getTeachingStyleDisplay } from '../constants/teachingStyleCopy.js'
import { fetchTeacherProfile } from '../services/api.js'
import {
  BoardHeader,
  BoardShell,
  FlapButton,
  FlapPanel,
  FlapPanelHead,
  FlapRow,
  FlapTab,
  IconBell,
  IconLogout,
} from '../components/ui/Board.jsx'

const DASHBOARD_TABS = new Set(['overview', 'insights', 'quizzes', 'tune', 'profile'])

function isBrowserReloadNavigation() {
  if (typeof performance === 'undefined') return false
  const [nav] = performance.getEntriesByType('navigation')
  return nav?.type === 'reload'
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
  }, [loadProfile])

  const avatarUrl = profile?.avatar_url || user?.avatar_url || ''
  const avgRating =
    profile?.rating != null && profile.rating !== '' && !Number.isNaN(Number(profile.rating))
      ? Number(profile.rating)
      : null
  const ratingCount = Number(profile?.rating_count ?? 0)
  const { title: styleTitle, blurb: styleBlurb } = getTeachingStyleDisplay(profile?.detected_teaching_style)
  const studentsHelped = Number(profile?.students_helped_count ?? 0)
  const overviewComments = Array.isArray(profile?.overview_comments) ? profile.overview_comments : []
  const firstName = displayName.trim().split(/\s+/)[0] || 'Teacher'

  const tabNav = (
    <nav className="hidden md:flex items-center gap-1 ml-2" aria-label="Teacher sections">
      {tabs.map((t) => (
        <FlapTab key={t.id} active={activeTab === t.id} onClick={() => setActiveTab(t.id)}>
          {t.label}
        </FlapTab>
      ))}
    </nav>
  )

  const actions = (
    <>
      <button
        type="button"
        className="relative p-2 text-[var(--flap-mute)] hover:text-[var(--flap-ink)] border-none bg-transparent cursor-pointer"
        aria-label="Notifications"
      >
        <IconBell />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--flap-amber)]" />
      </button>
      <div className="flex items-center gap-2 pl-2 border-l border-[var(--board-rule)]">
        <div className="w-8 h-8 bg-[var(--flap-face)] border border-[var(--board-rule)] flex items-center justify-center text-xs font-bold overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>
        <div className="hidden sm:block leading-tight">
          <p className="font-[family-name:var(--font-flap)] text-[12px] font-semibold tracking-[0.08em] uppercase">
            {displayName}
          </p>
          <p className="font-[family-name:var(--font-flap)] text-[9px] tracking-[0.14em] uppercase text-[var(--flap-mute)]">
            Teacher
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={logout}
        className="p-2 text-[var(--flap-mute)] hover:text-[var(--flap-ink)] border-none bg-transparent cursor-pointer"
        aria-label="Sign out"
      >
        <IconLogout />
      </button>
    </>
  )

  return (
    <BoardShell>
      <BoardHeader brand="LearnAI" sub="Departures · Teacher" actions={actions}>
        {tabNav}
      </BoardHeader>

      <div className="md:hidden flex gap-1 px-3 py-2 overflow-x-auto border-b border-[var(--board-rule)] bg-[var(--board-steel-deep)]">
        {tabs.map((t) => (
          <FlapTab key={t.id} active={activeTab === t.id} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </FlapTab>
        ))}
      </div>

      <div className="flex-1 w-full max-w-[1280px] mx-auto px-3 sm:px-5 py-5 md:py-6 min-h-0">
        {activeTab === 'profile' && (
          <>
            {profileError ? (
              <div className="mb-4 px-3 py-2 border border-[var(--flap-cancel)]/50 text-[var(--flap-cancel)] text-sm">
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
              <div className="mb-4 px-3 py-2 border border-[var(--flap-cancel)]/50 text-[var(--flap-cancel)] text-sm">
                {profileError}
              </div>
            ) : null}
            <TeacherTuneLab user={user} profile={profile} onSaved={loadProfile} />
          </>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-4">
            <header className="border-b border-[var(--board-rule)] pb-4">
              <h1 className="font-[family-name:var(--font-flap)] text-3xl md:text-4xl font-bold tracking-[0.04em] uppercase text-[var(--flap-ink)] m-0">
                Welcome back, {firstName}
              </h1>
              <p className="mt-2 text-sm text-[var(--flap-mute)] max-w-2xl leading-relaxed">
                Live board of how students keep learning in your style after class.
              </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 lg:items-start">
              <FlapPanel className="lg:col-span-3">
                <FlapPanelHead title="Profile" meta="Gate" />
                <div className="p-4 flex flex-col items-center text-center">
                  <div className="w-28 h-28 border border-[var(--board-rule)] bg-[var(--flap-face)] overflow-hidden mb-3">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-[family-name:var(--font-flap)] text-4xl font-bold">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <p className="font-[family-name:var(--font-flap)] text-lg font-semibold tracking-[0.08em] uppercase m-0">
                    {displayName}
                  </p>
                </div>
              </FlapPanel>

              <div className="lg:col-span-5 space-y-3">
                <FlapPanel>
                  <FlapPanelHead title="Board status" meta="Live" />
                  <FlapRow
                    amber={avgRating != null && avgRating >= 4.5}
                    lamp
                    cols={[
                      { label: 'Rating', width: '1fr', mute: true },
                      {
                        label: avgRating != null ? `${avgRating.toFixed(1)} / 5` : '— / 5',
                        width: '1fr',
                        className: avgRating != null ? 'text-[var(--flap-amber)]' : '',
                      },
                      {
                        label: ratingCount === 0 ? 'No ratings' : `${ratingCount} total`,
                        width: '1.1fr',
                        mute: true,
                      },
                    ]}
                  />
                  <FlapRow
                    lamp
                    cols={[
                      { label: 'Style', width: '1fr', mute: true },
                      { label: styleTitle, width: '2.1fr' },
                    ]}
                  />
                  <div className="px-3 py-2 border-b border-[var(--board-rule)]">
                    <p className="text-xs text-[var(--flap-mute)] leading-relaxed m-0">{styleBlurb}</p>
                  </div>
                  <FlapRow
                    lamp
                    cols={[
                      { label: 'Learners', width: '1fr', mute: true },
                      { label: String(studentsHelped), width: '0.7fr', className: 'text-[var(--flap-amber)]' },
                      { label: 'Unique feedback', width: '1.4fr', mute: true },
                    ]}
                  />
                </FlapPanel>
              </div>

              <FlapPanel className="lg:col-span-4 flex flex-col min-h-[320px] max-h-[min(70vh,560px)]" scroll>
                <FlapPanelHead
                  title="Comments"
                  meta={overviewComments.length ? `${overviewComments.length} rows` : 'Empty'}
                />
                {overviewComments.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-10">
                    <p className="font-[family-name:var(--font-flap)] text-sm tracking-[0.12em] uppercase text-[var(--flap-mute)] m-0">
                      No comments yet
                    </p>
                    <p className="text-xs text-[var(--flap-mute)] mt-2 max-w-[16rem] m-0">
                      When students share appreciation, those rows board here.
                    </p>
                  </div>
                ) : (
                  <ul className="flex-1 min-h-0 overflow-y-auto m-0 p-0 list-none">
                    {overviewComments.map((c, idx) => (
                      <li key={`${c.created_at ?? idx}-${idx}`}>
                        <FlapRow
                          amber={c.rating >= 5}
                          cols={[
                            {
                              label: c.rating != null ? `${c.rating}.0` : '—',
                              width: '0.55fr',
                              className: 'text-[var(--flap-amber)]',
                            },
                            {
                              label: c.feedback || '',
                              width: '2fr',
                              className: '!normal-case !tracking-normal font-[family-name:var(--font-body)] !text-sm !font-normal',
                            },
                            {
                              label: c.created_at
                                ? new Date(c.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
                                : '',
                              width: '0.9fr',
                              mute: true,
                            },
                          ]}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </FlapPanel>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <FlapButton variant="amber" onClick={() => setActiveTab('insights')}>
                Open insights
              </FlapButton>
              <FlapButton variant="ghost" onClick={() => setActiveTab('quizzes')}>
                Quizzes
              </FlapButton>
            </div>
          </div>
        )}
      </div>
    </BoardShell>
  )
}

export default TeacherDashboard
