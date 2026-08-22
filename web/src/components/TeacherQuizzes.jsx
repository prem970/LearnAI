'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  deleteQuizQuestion,
  deleteTeacherQuiz,
  fetchQuizAnalytics,
  fetchStudentQuizInsights,
  fetchTeacherCurriculum,
  fetchTeacherQuiz,
  fetchTeacherQuizzes,
  generateQuizInsights,
  generateTeacherQuiz,
  patchQuizQuestion,
  publishTeacherQuiz,
  regenerateQuizQuestion,
} from '../services/api.js'

const glass =
  'rounded-2xl border border-white/70 bg-white/70 backdrop-blur-xl shadow-[0_8px_40px_rgba(37,99,235,0.08)]'

function formatWhen(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function Stat({ label, value }) {
  return (
    <div className={`${glass} p-4`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="text-2xl font-[800] text-[#0f172a] tabular-nums mt-1">{value ?? '—'}</p>
    </div>
  )
}

export default function TeacherQuizzes() {
  const [view, setView] = useState('list')
  const [quizzes, setQuizzes] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [curriculum, setCurriculum] = useState(null)
  const [form, setForm] = useState({
    grade_key: '',
    grade_id: '',
    subject_id: '',
    lesson_id: '',
    topic_id: '',
    question_count: 6,
    difficulty: 'beginner',
  })
  const [draft, setDraft] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [studentInsight, setStudentInsight] = useState(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await fetchTeacherQuizzes()
    setLoading(false)
    if (err) {
      setError(err.message || 'Could not load quizzes.')
      return
    }
    setError('')
    setQuizzes(data?.quizzes || [])
  }, [])

  useEffect(() => {
    loadList()
    fetchTeacherCurriculum().then(({ data }) => setCurriculum(data || null))
  }, [loadList])

  const grades = curriculum?.grades || []
  const selectedGrade = grades.find((g) => String(g.key) === String(form.grade_key))
  const boards = selectedGrade?.boards || []
  const selectedBoard =
    boards.find((b) => String(b.id) === String(form.grade_id)) || (boards.length === 1 ? boards[0] : null)
  const subjects = selectedBoard?.subjects || []
  const selectedSubject = subjects.find((s) => String(s.id) === String(form.subject_id))
  const lessons = selectedSubject?.units || []
  const selectedLesson = lessons.find((u) => String(u.id) === String(form.lesson_id))
  const topics = selectedLesson?.topics || []

  const openCreate = () => {
    setView('create')
    setError('')
  }

  const generate = async () => {
    if (!form.grade_id || !form.subject_id || !form.lesson_id) {
      setError('Select a grade, board, subject, and lesson.')
      return
    }
    setBusy('generate')
    setError('')
    const { data, error: err } = await generateTeacherQuiz({
      grade_id: Number(form.grade_id),
      subject_id: Number(form.subject_id) || undefined,
      lesson_id: Number(form.lesson_id),
      topic_id: form.topic_id ? Number(form.topic_id) : undefined,
      question_count: Number(form.question_count),
      difficulty: form.difficulty,
    })
    setBusy('')
    if (err) {
      setError(err.message || 'AI could not generate the quiz.')
      return
    }
    setDraft(data)
    setView('editor')
  }

  const openQuiz = async (id, nextView = 'editor') => {
    setBusy('open')
    const { data, error: err } = await fetchTeacherQuiz(id)
    setBusy('')
    if (err) {
      setError(err.message)
      return
    }
    setDraft(data)
    setView(nextView)
  }

  const openAnalytics = async (id) => {
    setBusy('analytics')
    const { data, error: err } = await fetchQuizAnalytics(id)
    setBusy('')
    if (err) {
      setError(err.message)
      return
    }
    setAnalytics(data)
    setStudentInsight(null)
    setView('analytics')
  }

  const publish = async () => {
    if (!draft?.quiz?.id) return
    setBusy('publish')
    const { data, error: err } = await publishTeacherQuiz(draft.quiz.id)
    setBusy('')
    if (err) {
      setError(err.message)
      return
    }
    setDraft((prev) => ({ ...prev, quiz: data.quiz }))
    await loadList()
  }

  const removeQuiz = async (id) => {
    if (!window.confirm('Delete this quiz?')) return
    await deleteTeacherQuiz(id)
    await loadList()
  }

  const saveQuestion = async (question) => {
    setBusy(`q-${question.id}`)
    const { data, error: err } = await patchQuizQuestion(draft.quiz.id, question.id, {
      prompt: question.prompt,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      options: question.options,
    })
    setBusy('')
    if (err) {
      setError(err.message)
      return
    }
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.id === question.id ? data.question : q)),
    }))
  }

  const regen = async (questionId) => {
    setBusy(`r-${questionId}`)
    const { data, error: err } = await regenerateQuizQuestion(draft.quiz.id, questionId)
    setBusy('')
    if (err) {
      setError(err.message)
      return
    }
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.id === questionId ? data.question : q)),
    }))
  }

  const removeQuestion = async (questionId) => {
    setBusy(`d-${questionId}`)
    const { error: err } = await deleteQuizQuestion(draft.quiz.id, questionId)
    setBusy('')
    if (err) {
      setError(err.message)
      return
    }
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.filter((q) => q.id !== questionId),
    }))
  }

  const runInsights = async () => {
    if (!analytics?.quiz?.id) return
    setBusy('insights')
    const { data, error: err } = await generateQuizInsights(analytics.quiz.id)
    setBusy('')
    if (err) {
      setError(err.message)
      return
    }
    setAnalytics((prev) => ({ ...prev, insights: data.insights }))
  }

  const openStudent = async (studentId) => {
    setBusy('student')
    const { data, error: err } = await fetchStudentQuizInsights(studentId)
    setBusy('')
    if (err) {
      setError(err.message)
      return
    }
    setStudentInsight(data)
    setView('student')
  }

  const selectClass = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'grade_key') {
        const grade = grades.find((g) => String(g.key) === String(value))
        const nextBoards = grade?.boards || []
        next.grade_id = nextBoards.length === 1 ? String(nextBoards[0].id) : ''
        next.subject_id = ''
        next.lesson_id = ''
        next.topic_id = ''
      }
      if (field === 'grade_id') {
        next.subject_id = ''
        next.lesson_id = ''
        next.topic_id = ''
      }
      if (field === 'subject_id') {
        next.lesson_id = ''
        next.topic_id = ''
      }
      if (field === 'lesson_id') next.topic_id = ''
      return next
    })
  }

  const questions = draft?.questions || []

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-[700] text-[#0f172a]">Quizzes & assessments</h1>
        <p className="text-sm text-slate-500 mt-1">
          AI builds grade-aligned questions. You preview, edit, then publish to the class.
        </p>
      </div>
      {view !== 'list' ? (
        <button
          type="button"
          className="text-sm font-medium text-[#2563eb] border-none bg-transparent cursor-pointer"
          onClick={() => {
            setView('list')
            loadList()
          }}
        >
          ← All quizzes
        </button>
      ) : (
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-sm font-semibold border-none cursor-pointer"
        >
          Create with AI
        </button>
      )}
    </header>
  )

  if (loading && view === 'list') {
    return <div className={`${glass} p-8 text-sm text-slate-500`}>Loading quizzes…</div>
  }

  return (
    <div className="space-y-4">
      {header}
      {error ? (
        <div className="px-4 py-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-sm">{error}</div>
      ) : null}

      {view === 'list' && (
        <div className="space-y-3">
          {quizzes.length === 0 ? (
            <div className={`${glass} p-10 text-center`}>
              <p className="font-semibold text-[#0f172a]">No quizzes yet</p>
              <p className="text-sm text-slate-500 mt-2">Pick a lesson and let AI draft an assessment for your class.</p>
            </div>
          ) : (
            quizzes.map((q) => (
              <article key={q.id} className={`${glass} p-4 flex flex-wrap items-center justify-between gap-3`}>
                <div>
                  <p className="font-semibold text-[#0f172a]">{q.title}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {q.grade} · {q.subject} · {q.lesson}
                    {q.topic ? ` · ${q.topic}` : ''} · {q.question_count} questions
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {q.status === 'published' ? `Published ${formatWhen(q.published_at)}` : 'Draft'}
                    {` · ${q.students_attempted || 0} attempted · ${q.students_completed || 0} completed`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 cursor-pointer" onClick={() => openQuiz(q.id)}>
                    Preview
                  </button>
                  {q.status === 'published' ? (
                    <button type="button" className="px-3 py-1.5 rounded-lg text-sm bg-[#0ea5e9] text-white border-none cursor-pointer" onClick={() => openAnalytics(q.id)}>
                      Analytics
                    </button>
                  ) : null}
                  <button type="button" className="px-3 py-1.5 rounded-lg text-sm text-rose-700 bg-rose-50 border-none cursor-pointer" onClick={() => removeQuiz(q.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {view === 'create' && (
        <div className={`${glass} p-6 space-y-4 max-w-2xl`}>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Grade → Board → Subject → Lesson → Topic</p>
          {!curriculum?.teacher_subjects?.length ? (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Add the subjects you teach in your profile before creating a quiz.
            </p>
          ) : null}
          {curriculum?.teacher_subjects?.length && !grades.length ? (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              No syllabus found for your subjects ({curriculum.teacher_subjects.join(', ')}). Update the subjects on your profile if this looks wrong.
            </p>
          ) : null}
          <label className="block text-sm font-medium">
            Grade
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
              value={form.grade_key}
              onChange={(e) => selectClass('grade_key', e.target.value)}
            >
              <option value="">Select grade</option>
              {grades.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Board / class
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
              value={form.grade_id}
              onChange={(e) => selectClass('grade_id', e.target.value)}
              disabled={!form.grade_key}
            >
              <option value="">Select board</option>
              {boards.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.label}
                  {b.board?.name ? ` · ${b.board.name}` : ''}
                </option>
              ))}
            </select>
          </label>
          {selectedGrade?.fallback || selectedBoard?.fallback ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Detailed syllabus is seeded for Grade 7. Lessons below are the closest matching curriculum for this grade.
            </p>
          ) : null}
          <label className="block text-sm font-medium">
            Subject
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
              value={form.subject_id}
              onChange={(e) => selectClass('subject_id', e.target.value)}
              disabled={!form.grade_id}
            >
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option key={`${s.curriculum_id}-${s.id}`} value={String(s.id)}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Only subjects you teach are listed.</p>
          </label>
          <label className="block text-sm font-medium">
            Syllabus / lesson
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
              value={form.lesson_id}
              onChange={(e) => selectClass('lesson_id', e.target.value)}
              disabled={!form.subject_id}
            >
              <option value="">Select lesson</option>
              {lessons.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Topic (optional)
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
              value={form.topic_id}
              onChange={(e) => selectClass('topic_id', e.target.value)}
              disabled={!form.lesson_id}
            >
              <option value="">Entire lesson</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Number of questions
              <input
                type="number"
                min={1}
                max={20}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={form.question_count}
                onChange={(e) => setForm((p) => ({ ...p, question_count: e.target.value }))}
              />
            </label>
            <label className="block text-sm font-medium">
              Difficulty
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                value={form.difficulty}
                onChange={(e) => setForm((p) => ({ ...p, difficulty: e.target.value }))}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="exam">Exam</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={generate}
            className="px-4 py-2.5 rounded-xl bg-[#2563eb] text-white text-sm font-semibold border-none cursor-pointer disabled:opacity-60"
          >
            {busy === 'generate' ? 'Generating with AI…' : 'Generate quiz (AI mode)'}
          </button>
        </div>
      )}

      {view === 'editor' && draft && (
        <div className="space-y-4">
          <div className={`${glass} p-4 flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <p className="font-semibold text-[#0f172a]">{draft.quiz.title}</p>
              <p className="text-xs text-slate-500">
                {draft.quiz.grade} · {draft.quiz.subject} · {draft.quiz.lesson} · {draft.quiz.status}
              </p>
            </div>
            <button
              type="button"
              disabled={Boolean(busy) || draft.quiz.status === 'published'}
              onClick={publish}
              className="px-4 py-2 rounded-xl bg-[#0ea5e9] text-white text-sm font-semibold border-none cursor-pointer disabled:opacity-60"
            >
              {draft.quiz.status === 'published' ? 'Published to class' : busy === 'publish' ? 'Publishing…' : 'Publish to class'}
            </button>
          </div>
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              index={i}
              question={q}
              busy={busy}
              onChange={(next) =>
                setDraft((prev) => ({
                  ...prev,
                  questions: prev.questions.map((item) => (item.id === q.id ? next : item)),
                }))
              }
              onSave={() => saveQuestion(q)}
              onRegen={() => regen(q.id)}
              onRemove={() => removeQuestion(q.id)}
            />
          ))}
        </div>
      )}

      {view === 'analytics' && analytics && (
        <AnalyticsView
          analytics={analytics}
          busy={busy}
          onInsights={runInsights}
          onStudent={openStudent}
        />
      )}

      {view === 'student' && studentInsight && (
        <StudentInsightView data={studentInsight} />
      )}
    </div>
  )
}

function QuestionEditor({ question, index, busy, onChange, onSave, onRegen, onRemove }) {
  const options = Array.isArray(question.options) ? question.options : []
  return (
    <article className={`${glass} p-4 space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Q{index + 1} · {question.type}
        </p>
        <div className="flex gap-2">
          <button type="button" className="text-xs border-none bg-white px-2 py-1 rounded-lg cursor-pointer" onClick={onSave} disabled={Boolean(busy)}>
            Save
          </button>
          <button type="button" className="text-xs border-none bg-amber-50 px-2 py-1 rounded-lg cursor-pointer" onClick={onRegen} disabled={Boolean(busy)}>
            {busy === `r-${question.id}` ? 'Regenerating…' : 'Regenerate'}
          </button>
          <button type="button" className="text-xs border-none bg-rose-50 text-rose-700 px-2 py-1 rounded-lg cursor-pointer" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
      <textarea
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[72px]"
        value={question.prompt}
        onChange={(e) => onChange({ ...question, prompt: e.target.value })}
      />
      {options.map((opt, oi) => (
        <div key={opt.id || oi} className="flex items-center gap-2">
          <span className="text-xs font-semibold w-6">{opt.id}</span>
          <input
            className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={opt.text}
            onChange={(e) => {
              const next = options.map((o, idx) => (idx === oi ? { ...o, text: e.target.value } : o))
              onChange({ ...question, options: next })
            }}
          />
        </div>
      ))}
      <label className="block text-xs font-medium text-slate-600">
        Correct answer
        <input
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          value={question.correct_answer || ''}
          onChange={(e) => onChange({ ...question, correct_answer: e.target.value })}
        />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Explanation
        <textarea
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm min-h-[64px]"
          value={question.explanation || ''}
          onChange={(e) => onChange({ ...question, explanation: e.target.value })}
        />
      </label>
    </article>
  )
}

function AnalyticsView({ analytics, busy, onInsights, onStudent }) {
  const o = analytics.overall || {}
  const maxBucket = Math.max(1, ...(analytics.overall?.score_distribution || []).map((b) => b.count))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Average score" value={o.average_score != null ? `${o.average_score}%` : null} />
        <Stat label="Highest" value={o.highest_score != null ? `${o.highest_score}%` : null} />
        <Stat label="Lowest" value={o.lowest_score != null ? `${o.lowest_score}%` : null} />
        <Stat label="Median" value={o.median_score != null ? `${o.median_score}%` : null} />
        <Stat label="Completion" value={`${o.completion_rate || 0}%`} />
        <Stat label="Avg time" value={o.average_time_ms ? `${Math.round(o.average_time_ms / 1000)}s` : '—'} />
        <Stat label="Attempted" value={o.attempted} />
        <Stat label="Completed" value={o.completed} />
      </div>
      <section className={`${glass} p-4`}>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 mb-3">Score distribution</p>
        <div className="flex items-end gap-2 h-32">
          {(o.score_distribution || []).map((b) => (
            <div key={b.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <div
                className="w-full rounded-t-lg bg-[#2563eb]/80 min-h-[4px]"
                style={{ height: `${(b.count / maxBucket) * 100}%` }}
              />
              <span className="text-[10px] text-slate-500">{b.label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className={`${glass} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Learning insights</p>
          <button type="button" onClick={onInsights} className="text-sm text-[#2563eb] border-none bg-transparent cursor-pointer">
            {busy === 'insights' ? 'Analyzing…' : 'Generate AI insights'}
          </button>
        </div>
        {analytics.insights ? (
          <div className="text-sm text-slate-700 space-y-2">
            <p className="font-semibold text-[#0f172a]">{analytics.insights.headline}</p>
            <p>{analytics.insights.narrative}</p>
            {analytics.insights.revision_topics?.length ? (
              <p><span className="font-medium">Revise:</span> {analytics.insights.revision_topics.join(', ')}</p>
            ) : null}
            {analytics.insights.strengths?.length ? (
              <p><span className="font-medium">Strong:</span> {analytics.insights.strengths.join(', ')}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Generate insights after students complete the quiz.</p>
        )}
      </section>
      <section className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Question-level analysis</p>
        {(analytics.questions || []).map((q, i) => (
          <article key={q.id} className={`${glass} p-4 text-sm`}>
            <p className="font-medium text-[#0f172a]">Q{i + 1}. {q.prompt}</p>
            <p className="text-xs text-slate-500 mt-2">
              Correct {q.percent_correct ?? '—'}% · Incorrect {q.percent_incorrect ?? '—'}% · {q.difficulty} · hints {q.students_needed_hints} · avg {Math.round((q.average_time_ms || 0) / 1000)}s
            </p>
            {q.most_selected_wrong ? <p className="text-xs mt-1">Most common wrong: {q.most_selected_wrong}</p> : null}
            {q.common_misconceptions?.length ? (
              <p className="text-xs mt-1">Misconceptions: {q.common_misconceptions.join('; ')}</p>
            ) : null}
          </article>
        ))}
      </section>
      <section className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Students</p>
        {(analytics.students || []).map((s) => (
          <button
            key={s.student_id}
            type="button"
            onClick={() => onStudent(s.student_id)}
            className={`${glass} p-3 w-full text-left cursor-pointer border-none`}
          >
            <span className="font-medium">{s.name}</span>
            <span className="text-xs text-slate-500 ml-2">
              {s.status} {s.score != null ? `· ${s.score}%` : ''}
            </span>
          </button>
        ))}
      </section>
    </div>
  )
}

function StudentInsightView({ data }) {
  const scores = (data.history || []).map((h) => h.score)
  return (
    <div className="space-y-4">
      <div className={`${glass} p-5`}>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Student insight</p>
        <p className="text-lg font-semibold text-[#0f172a] mt-2">{data.student?.name || 'Student'}</p>
        {data.insights?.headline ? <p className="mt-3 text-sm">{data.insights.headline}</p> : null}
        {data.insights?.recommendation ? (
          <p className="mt-2 text-sm text-slate-600">{data.insights.recommendation}</p>
        ) : null}
        <div className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">
          <p><span className="font-medium">Strong:</span> {(data.insights?.strong_topics || []).join(', ') || '—'}</p>
          <p><span className="font-medium">Weak:</span> {(data.insights?.weak_topics || []).join(', ') || '—'}</p>
          <p className="sm:col-span-2"><span className="font-medium">Time:</span> {data.insights?.time_pattern || '—'}</p>
          <p className="sm:col-span-2"><span className="font-medium">Improvement:</span> {data.insights?.improvement || '—'}</p>
        </div>
      </div>
      {(data.history || []).map((h) => (
        <article key={`${h.quiz_id}-${h.completed_at}`} className={`${glass} p-4 text-sm`}>
          <p className="font-medium">{h.title} · {h.score}%</p>
          <p className="text-xs text-slate-500">{h.subject} · {h.lesson}</p>
        </article>
      ))}
      {scores.length === 0 ? <p className="text-sm text-slate-500">No completed quizzes yet.</p> : null}
    </div>
  )
}
