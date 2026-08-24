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
import { FlapPanel, FlapPanelHead, FlapButton, FlapInput, FlapRow } from './ui/Board.jsx'

const fieldClass =
  'mt-1 w-full flap-cell text-[var(--flap-ink)] border border-[var(--board-rule)] bg-[var(--flap-face)] px-3 py-2 outline-none focus:border-[var(--flap-amber)] font-[family-name:var(--font-body)]'
const noticeAmber =
  'text-sm text-[var(--flap-amber)] border border-[var(--flap-amber)]/40 bg-[var(--flap-face)] px-3 py-2'
const labelClass = 'block text-sm font-medium text-[var(--flap-ink)]'

function formatWhen(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function StatRows({ rows }) {
  return (
    <FlapPanel>
      <FlapPanelHead title="Quiz board" meta={`${rows.length} rows`} />
      {rows.map((r) => (
        <FlapRow
          key={r.label}
          lamp
          amber={r.amber}
          cols={[
            { label: r.label, width: '1.4fr', mute: true },
            { label: String(r.value ?? '—'), width: '1fr', className: r.amber ? 'text-[var(--flap-amber)]' : '' },
          ]}
        />
      ))}
    </FlapPanel>
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
        <h1 className="font-[family-name:var(--font-flap)] text-xl font-bold tracking-[0.06em] uppercase text-[var(--flap-ink)] m-0">
          Quizzes & assessments
        </h1>
        <p className="text-sm text-[var(--flap-mute)] mt-1 font-[family-name:var(--font-body)]">
          AI builds grade-aligned questions. You preview, edit, then publish to the class.
        </p>
      </div>
      {view !== 'list' ? (
        <FlapButton
          variant="ghost"
          onClick={() => {
            setView('list')
            loadList()
          }}
        >
          ← All quizzes
        </FlapButton>
      ) : (
        <FlapButton variant="amber" onClick={openCreate}>
          Create with AI
        </FlapButton>
      )}
    </header>
  )

  if (loading && view === 'list') {
    return (
      <FlapPanel className="p-8">
        <p className="font-[family-name:var(--font-flap)] text-sm tracking-[0.1em] uppercase text-[var(--flap-mute)] m-0">
          Loading quizzes…
        </p>
      </FlapPanel>
    )
  }

  return (
    <div className="space-y-4">
      {header}
      {error ? (
        <div className="px-4 py-3 border border-[var(--flap-cancel)]/50 text-[var(--flap-cancel)] text-sm">
          {error}
        </div>
      ) : null}

      {view === 'list' && (
        <div className="space-y-3">
          {quizzes.length === 0 ? (
            <FlapPanel className="p-10 text-center">
              <p className="font-[family-name:var(--font-flap)] font-semibold tracking-[0.08em] uppercase text-[var(--flap-ink)]">
                No quizzes yet
              </p>
              <p className="text-sm text-[var(--flap-mute)] mt-2 font-[family-name:var(--font-body)]">
                Pick a lesson and let AI draft an assessment for your class.
              </p>
            </FlapPanel>
          ) : (
            quizzes.map((q) => (
              <article
                key={q.id}
                className="border border-[var(--board-rule)] bg-[var(--board-steel)] p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <FlapRow
                    className="!border-b-0 !px-0 !py-0"
                    cols={[
                      { label: q.title, width: '1.2fr' },
                      {
                        label: `${q.grade} · ${q.subject} · ${q.lesson}${q.topic ? ` · ${q.topic}` : ''} · ${q.question_count} questions`,
                        width: '2fr',
                        mute: true,
                      },
                    ]}
                  />
                  <p className="text-xs text-[var(--flap-mute)] mt-1 px-2 font-[family-name:var(--font-body)]">
                    {q.status === 'published' ? `Published ${formatWhen(q.published_at)}` : 'Draft'}
                    {` · ${q.students_attempted || 0} attempted · ${q.students_completed || 0} completed`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <FlapButton variant="ghost" onClick={() => openQuiz(q.id)}>
                    Preview
                  </FlapButton>
                  {q.status === 'published' ? (
                    <FlapButton variant="amber" onClick={() => openAnalytics(q.id)}>
                      Analytics
                    </FlapButton>
                  ) : null}
                  <FlapButton variant="danger" onClick={() => removeQuiz(q.id)}>
                    Delete
                  </FlapButton>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {view === 'create' && (
        <FlapPanel className="p-6 space-y-4 max-w-2xl">
          <p className="font-[family-name:var(--font-flap)] text-xs font-semibold uppercase tracking-[0.14em] text-[var(--flap-mute)]">
            Grade → Board → Subject → Lesson → Topic
          </p>
          {!curriculum?.teacher_subjects?.length ? (
            <p className={noticeAmber}>Add the subjects you teach in your profile before creating a quiz.</p>
          ) : null}
          {curriculum?.teacher_subjects?.length && !grades.length ? (
            <p className={noticeAmber}>
              No syllabus found for your subjects ({curriculum.teacher_subjects.join(', ')}). Update the subjects on your
              profile if this looks wrong.
            </p>
          ) : null}
          <label className={labelClass}>
            Grade
            <select
              className={fieldClass}
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
          <label className={labelClass}>
            Board / class
            <select
              className={fieldClass}
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
            <p className={`${noticeAmber} text-xs`}>
              Detailed syllabus is seeded for Grade 7. Lessons below are the closest matching curriculum for this grade.
            </p>
          ) : null}
          <label className={labelClass}>
            Subject
            <select
              className={fieldClass}
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
            <p className="text-xs text-[var(--flap-mute)] mt-1">Only subjects you teach are listed.</p>
          </label>
          <label className={labelClass}>
            Syllabus / lesson
            <select
              className={fieldClass}
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
          <label className={labelClass}>
            Topic (optional)
            <select
              className={fieldClass}
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
            <label className={labelClass}>
              Number of questions
              <FlapInput
                type="number"
                min={1}
                max={20}
                className="mt-1"
                value={form.question_count}
                onChange={(e) => setForm((p) => ({ ...p, question_count: e.target.value }))}
              />
            </label>
            <label className={labelClass}>
              Difficulty
              <select
                className={fieldClass}
                value={form.difficulty}
                onChange={(e) => setForm((p) => ({ ...p, difficulty: e.target.value }))}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="exam">Exam</option>
              </select>
            </label>
          </div>
          <FlapButton type="button" disabled={Boolean(busy)} onClick={generate} variant="amber">
            {busy === 'generate' ? 'Generating with AI…' : 'Generate quiz (AI mode)'}
          </FlapButton>
        </FlapPanel>
      )}

      {view === 'editor' && draft && (
        <div className="space-y-4">
          <FlapPanel className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-[family-name:var(--font-flap)] font-semibold tracking-[0.06em] uppercase text-[var(--flap-ink)]">
                {draft.quiz.title}
              </p>
              <p className="text-xs text-[var(--flap-mute)]">
                {draft.quiz.grade} · {draft.quiz.subject} · {draft.quiz.lesson} · {draft.quiz.status}
              </p>
            </div>
            <FlapButton
              type="button"
              disabled={Boolean(busy) || draft.quiz.status === 'published'}
              onClick={publish}
              variant="amber"
            >
              {draft.quiz.status === 'published' ? 'Published to class' : busy === 'publish' ? 'Publishing…' : 'Publish to class'}
            </FlapButton>
          </FlapPanel>
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
        <AnalyticsView analytics={analytics} busy={busy} onInsights={runInsights} onStudent={openStudent} />
      )}

      {view === 'student' && studentInsight && <StudentInsightView data={studentInsight} />}
    </div>
  )
}

function QuestionEditor({ question, index, busy, onChange, onSave, onRegen, onRemove }) {
  const options = Array.isArray(question.options) ? question.options : []
  return (
    <article className="border border-[var(--board-rule)] bg-[var(--board-steel)] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-[family-name:var(--font-flap)] text-xs font-semibold uppercase tracking-[0.14em] text-[var(--flap-mute)]">
          Q{index + 1} · {question.type}
        </p>
        <div className="flex gap-2">
          <FlapButton variant="ghost" onClick={onSave} disabled={Boolean(busy)}>
            Save
          </FlapButton>
          <FlapButton variant="amber" onClick={onRegen} disabled={Boolean(busy)}>
            {busy === `r-${question.id}` ? 'Regenerating…' : 'Regenerate'}
          </FlapButton>
          <FlapButton variant="danger" onClick={onRemove}>
            Remove
          </FlapButton>
        </div>
      </div>
      <textarea
        className="w-full border border-[var(--board-rule)] bg-[var(--flap-face)] text-[var(--flap-ink)] px-3 py-2 text-sm min-h-[72px] outline-none focus:border-[var(--flap-amber)] font-[family-name:var(--font-body)]"
        value={question.prompt}
        onChange={(e) => onChange({ ...question, prompt: e.target.value })}
      />
      {options.map((opt, oi) => (
        <div key={opt.id || oi} className="flex items-center gap-2">
          <span className="text-xs font-semibold w-6 text-[var(--flap-ink)]">{opt.id}</span>
          <FlapInput
            className="flex-1"
            value={opt.text}
            onChange={(e) => {
              const next = options.map((o, idx) => (idx === oi ? { ...o, text: e.target.value } : o))
              onChange({ ...question, options: next })
            }}
          />
        </div>
      ))}
      <label className="block text-xs font-medium text-[var(--flap-mute)]">
        Correct answer
        <FlapInput
          className="mt-1"
          value={question.correct_answer || ''}
          onChange={(e) => onChange({ ...question, correct_answer: e.target.value })}
        />
      </label>
      <label className="block text-xs font-medium text-[var(--flap-mute)]">
        Explanation
        <textarea
          className="mt-1 w-full border border-[var(--board-rule)] bg-[var(--flap-face)] text-[var(--flap-ink)] px-2 py-1.5 text-sm min-h-[64px] outline-none focus:border-[var(--flap-amber)] font-[family-name:var(--font-body)]"
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
      <StatRows
        rows={[
          { label: 'Average score', value: o.average_score != null ? `${o.average_score}%` : '—', amber: true },
          { label: 'Highest', value: o.highest_score != null ? `${o.highest_score}%` : '—' },
          { label: 'Lowest', value: o.lowest_score != null ? `${o.lowest_score}%` : '—' },
          { label: 'Median', value: o.median_score != null ? `${o.median_score}%` : '—' },
          { label: 'Completion', value: `${o.completion_rate || 0}%` },
          { label: 'Avg time', value: o.average_time_ms ? `${Math.round(o.average_time_ms / 1000)}s` : '—' },
          { label: 'Attempted', value: o.attempted },
          { label: 'Completed', value: o.completed },
        ]}
      />
      <FlapPanel>
        <FlapPanelHead title="Score distribution" />
        <div className="p-4">
          <div className="flex items-end gap-2 h-32">
            {(o.score_distribution || []).map((b) => (
              <div key={b.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <div
                  className="w-full bg-[var(--flap-amber)] min-h-[4px]"
                  style={{ height: `${(b.count / maxBucket) * 100}%` }}
                />
                <span className="text-[10px] text-[var(--flap-mute)]">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </FlapPanel>
      <FlapPanel className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-[family-name:var(--font-flap)] text-xs font-semibold uppercase tracking-[0.14em] text-[var(--flap-mute)]">
            Learning insights
          </p>
          <FlapButton variant="ghost" onClick={onInsights}>
            {busy === 'insights' ? 'Analyzing…' : 'Generate AI insights'}
          </FlapButton>
        </div>
        {analytics.insights ? (
          <div className="text-sm text-[var(--flap-ink)] space-y-2 font-[family-name:var(--font-body)]">
            <p className="font-semibold">{analytics.insights.headline}</p>
            <p>{analytics.insights.narrative}</p>
            {analytics.insights.revision_topics?.length ? (
              <p>
                <span className="font-medium">Revise:</span> {analytics.insights.revision_topics.join(', ')}
              </p>
            ) : null}
            {analytics.insights.strengths?.length ? (
              <p>
                <span className="font-medium">Strong:</span> {analytics.insights.strengths.join(', ')}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[var(--flap-mute)]">Generate insights after students complete the quiz.</p>
        )}
      </FlapPanel>
      <section className="space-y-2">
        <p className="font-[family-name:var(--font-flap)] text-xs font-semibold uppercase tracking-[0.14em] text-[var(--flap-mute)]">
          Question-level analysis
        </p>
        {(analytics.questions || []).map((q, i) => (
          <article key={q.id} className="border border-[var(--board-rule)] bg-[var(--board-steel)] p-4 text-sm text-[var(--flap-ink)]">
            <p className="font-medium">
              Q{i + 1}. {q.prompt}
            </p>
            <p className="text-xs text-[var(--flap-mute)] mt-2">
              Correct {q.percent_correct ?? '—'}% · Incorrect {q.percent_incorrect ?? '—'}% · {q.difficulty} · hints{' '}
              {q.students_needed_hints} · avg {Math.round((q.average_time_ms || 0) / 1000)}s
            </p>
            {q.most_selected_wrong ? (
              <p className="text-xs mt-1">Most common wrong: {q.most_selected_wrong}</p>
            ) : null}
            {q.common_misconceptions?.length ? (
              <p className="text-xs mt-1">Misconceptions: {q.common_misconceptions.join('; ')}</p>
            ) : null}
          </article>
        ))}
      </section>
      <section className="space-y-0 border border-[var(--board-rule)]">
        <FlapPanelHead title="Students" />
        {(analytics.students || []).map((s) => (
          <FlapRow
            key={s.student_id}
            onClick={() => onStudent(s.student_id)}
            cols={[
              { label: s.name, width: '1.4fr' },
              {
                label: `${s.status}${s.score != null ? ` · ${s.score}%` : ''}`,
                width: '1fr',
                mute: true,
              },
            ]}
          />
        ))}
      </section>
    </div>
  )
}

function StudentInsightView({ data }) {
  const scores = (data.history || []).map((h) => h.score)
  return (
    <div className="space-y-4">
      <FlapPanel className="p-5">
        <p className="font-[family-name:var(--font-flap)] text-xs font-semibold uppercase tracking-[0.14em] text-[var(--flap-mute)]">
          Student insight
        </p>
        <p className="text-lg font-semibold text-[var(--flap-ink)] mt-2">{data.student?.name || 'Student'}</p>
        {data.insights?.headline ? <p className="mt-3 text-sm text-[var(--flap-ink)]">{data.insights.headline}</p> : null}
        {data.insights?.recommendation ? (
          <p className="mt-2 text-sm text-[var(--flap-mute)]">{data.insights.recommendation}</p>
        ) : null}
        <div className="grid sm:grid-cols-2 gap-3 mt-4 text-sm text-[var(--flap-ink)]">
          <p>
            <span className="font-medium">Strong:</span> {(data.insights?.strong_topics || []).join(', ') || '—'}
          </p>
          <p>
            <span className="font-medium">Weak:</span> {(data.insights?.weak_topics || []).join(', ') || '—'}
          </p>
          <p className="sm:col-span-2">
            <span className="font-medium">Time:</span> {data.insights?.time_pattern || '—'}
          </p>
          <p className="sm:col-span-2">
            <span className="font-medium">Improvement:</span> {data.insights?.improvement || '—'}
          </p>
        </div>
      </FlapPanel>
      {(data.history || []).map((h) => (
        <article
          key={`${h.quiz_id}-${h.completed_at}`}
          className="border border-[var(--board-rule)] bg-[var(--board-steel)] p-4 text-sm text-[var(--flap-ink)]"
        >
          <p className="font-medium">
            {h.title} · {h.score}%
          </p>
          <p className="text-xs text-[var(--flap-mute)]">
            {h.subject} · {h.lesson}
          </p>
        </article>
      ))}
      {scores.length === 0 ? <p className="text-sm text-[var(--flap-mute)]">No completed quizzes yet.</p> : null}
    </div>
  )
}
