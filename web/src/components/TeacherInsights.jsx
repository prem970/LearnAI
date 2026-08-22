'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchTeacherInsights } from '../services/api.js'

const glass =
  'rounded-2xl border border-white/70 bg-white/70 backdrop-blur-xl shadow-[0_8px_40px_rgba(37,99,235,0.08)]'

function formatWhen(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}

export default function TeacherInsights() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetchTeacherInsights().then(({ data: next, error: err }) => {
      if (!mounted) return
      if (err) {
        setError(err.message || 'Could not load insights.')
        setData(null)
      } else {
        setError('')
        setData(next)
        const first = next?.subjects?.[0]?.subject
        setSubject((prev) => prev || first || '')
      }
      setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [])

  const subjects = data?.subjects || []
  const selected = useMemo(
    () => subjects.find((s) => s.subject === subject) || subjects[0] || null,
    [subject, subjects],
  )

  if (loading) {
    return (
      <div className={`${glass} p-8 text-sm text-slate-500`}>
        Gathering what students asked in Learn mode…
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-sm">
        {error}
      </div>
    )
  }

  if (!subjects.length) {
    return (
      <div className={`${glass} p-8 text-center`}>
        <p className="text-lg font-semibold text-[#0f172a]">
          {data && Array.isArray(data.teacher_subjects) && data.teacher_subjects.length === 0
            ? 'No subjects on your profile'
            : 'No Learn conversations yet'}
        </p>
        <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
          {data && Array.isArray(data.teacher_subjects) && data.teacher_subjects.length === 0
            ? 'Add the subjects you teach in onboarding. Insights stay private to those subjects and to you.'
            : 'When students pick you and ask a question in one of your subjects, it shows up here—only for you.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-[700] text-[#0f172a]">Conversation insights</h1>
        <p className="text-sm text-slate-500 mt-1">
          What students asked you in your subjects. Other teachers cannot see this.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {subjects.map((s) => (
          <button
            key={s.subject}
            type="button"
            onClick={() => setSubject(s.subject)}
            className={[
              'px-3 py-1.5 rounded-full text-sm font-medium border cursor-pointer',
              (selected?.subject === s.subject
                ? 'bg-[#2563eb] text-white border-[#2563eb]'
                : 'bg-white/80 text-slate-700 border-slate-200 hover:border-[#2563eb]/40'),
            ].join(' ')}
          >
            {s.subject}
            <span className="ml-1.5 opacity-70">{s.question_count}</span>
          </button>
        ))}
      </div>

      {selected ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <section className={`xl:col-span-4 ${glass} p-5 space-y-4`}>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Today in {selected.subject}</p>
              <p className="text-3xl font-[800] text-[#0f172a] mt-1 tabular-nums">{selected.today_question_count}</p>
              <p className="text-sm text-slate-500">question{selected.today_question_count === 1 ? '' : 's'} in Learn mode</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-2">Self-learned topics today</p>
              {selected.self_learned_topics_today.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing recorded yet today.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selected.self_learned_topics_today.map((topic) => (
                    <span
                      key={topic}
                      className="px-2.5 py-1 rounded-lg bg-[#0ea5e9]/10 text-[#0369a1] text-xs font-semibold"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-2">Frequent lessons</p>
              <ul className="space-y-1.5">
                {selected.frequent_lessons.map((item) => (
                  <li key={item.lesson} className="flex justify-between text-sm text-slate-700">
                    <span className="truncate pr-3">{item.lesson}</span>
                    <span className="tabular-nums text-slate-400">{item.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className={`xl:col-span-8 space-y-4`}>
            <div className={`${glass} p-5`}>
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-3">Insights from questions</h2>
              <ul className="space-y-2.5">
                {selected.insights.map((line) => (
                  <li
                    key={line}
                    className="rounded-xl bg-white/80 border border-white p-3 text-sm text-[#0f172a] leading-relaxed"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className={`${glass} p-5`}>
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-3">Recent questions</h2>
              <ul className="space-y-3">
                {selected.recent_questions.map((q) => (
                  <li key={q.id} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                    <p className="text-sm text-[#0f172a] leading-relaxed">{q.question}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {q.student_name}
                      {q.lesson ? ` · ${q.lesson}` : ''}
                      {q.created_at ? ` · ${formatWhen(q.created_at)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
