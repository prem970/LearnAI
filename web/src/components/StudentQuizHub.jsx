'use client'

import { useEffect, useRef, useState } from 'react'
import FormattedAnswerText from './FormattedAnswerText.jsx'
import {
  completeQuizAttempt,
  fetchStudentQuizzes,
  sendQuizTutorMessage,
  startStudentQuiz,
  submitQuizAnswer,
} from '../services/api.js'

const glass = 'rounded-2xl border border-slate-100 bg-white shadow-sm'

export default function StudentQuizHub({ onLearnTopic }) {
  const [quizzes, setQuizzes] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [busy, setBusy] = useState('')

  const load = () => {
    setLoading(true)
    fetchStudentQuizzes().then(({ data, error: err }) => {
      setLoading(false)
      if (err) setError(err.message || 'Could not load quizzes.')
      else {
        setError('')
        setQuizzes(data?.quizzes || [])
      }
    })
  }

  useEffect(() => {
    load()
  }, [])

  const start = async (id) => {
    setBusy('start')
    const { data, error: err } = await startStudentQuiz(id)
    setBusy('')
    if (err) {
      setError(err.message)
      return
    }
    setSession(data)
  }

  if (session) {
    return (
      <QuizPlayer
        session={session}
        setSession={setSession}
        onExit={() => {
          setSession(null)
          load()
        }}
        onLearnTopic={onLearnTopic}
      />
    )
  }

  const groups = {
    active: quizzes.filter((q) => q.bucket === 'active'),
    available: quizzes.filter((q) => q.bucket === 'available'),
    completed: quizzes.filter((q) => q.bucket === 'completed'),
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-5">
      <header>
        <h1 className="text-xl font-[700] text-[#0b1220]">Quizzes</h1>
        <p className="text-sm text-slate-500 mt-1">Assessments for your grade, with a tutor beside every question.</p>
      </header>
      {error ? <div className="rounded-xl bg-rose-50 text-rose-800 px-3 py-2 text-sm">{error}</div> : null}
      {loading ? <p className="text-sm text-slate-500">Loading quizzes…</p> : null}
      {!loading && quizzes.length === 0 ? (
        <div className={`${glass} p-8 text-center text-sm text-slate-500`}>No quizzes assigned to your grade yet.</div>
      ) : null}
      {['active', 'available', 'completed'].map((key) =>
        groups[key].length ? (
          <section key={key} className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              {key === 'active' ? 'In progress' : key === 'available' ? 'Available' : 'Completed'}
            </h2>
            {groups[key].map((q) => (
              <article key={q.id} className={`${glass} p-4 flex flex-wrap items-center justify-between gap-3`}>
                <div>
                  <p className="font-semibold text-[#0b1220]">{q.title}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {q.subject} · {q.lesson}
                    {q.topic ? ` · ${q.topic}` : ''} · {q.question_count} questions
                    {q.score_percent != null ? ` · ${q.score_percent}%` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => start(q.id)}
                  className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-sm font-semibold border-none cursor-pointer"
                >
                  {q.bucket === 'completed' ? 'Review' : q.bucket === 'active' ? 'Continue' : 'Start'}
                </button>
              </article>
            ))}
          </section>
        ) : null,
      )}
    </div>
  )
}

function QuizPlayer({ session, setSession, onExit, onLearnTopic }) {
  const questions = session.questions || []
  const completed = session.attempt?.status === 'completed'
  const firstOpen = questions.findIndex((q) => !q.response?.latest_answer)
  const [index, setIndex] = useState(firstOpen >= 0 ? firstOpen : 0)
  const [choice, setChoice] = useState('')
  const [chat, setChat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const startedAt = useRef(Date.now())
  const question = questions[index]
  const thread = question?.response?.tutor_thread || []

  useEffect(() => {
    setChoice(question?.response?.latest_answer || '')
    startedAt.current = Date.now()
  }, [question?.id])

  const submit = async () => {
    if (!choice.trim()) {
      setError('Choose or type an answer first.')
      return
    }
    setBusy('submit')
    setError('')
    const { data, error: err } = await submitQuizAnswer(session.attempt.id, {
      question_id: question.id,
      answer: choice,
      time_ms: Date.now() - startedAt.current,
    })
    setBusy('')
    if (err) {
      setError(err.message)
      return
    }
    setSession((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === question.id
          ? {
              ...q,
              response: {
                ...(q.response || {}),
                latest_answer: choice,
                is_correct: data.is_correct,
                first_is_correct: data.first_is_correct,
                hint_count: data.hint_count,
                incorrect_attempts: data.incorrect_attempts,
                revealed: data.revealed,
                tutor_thread: [
                  ...(q.response?.tutor_thread || []),
                  { role: 'student', content: `Answer: ${choice}` },
                  { role: 'assistant', content: data.feedback },
                ],
              },
              ...(data.correct_answer ? { correct_answer: data.correct_answer, explanation: data.explanation } : {}),
            }
          : q,
      ),
    }))
  }

  const askTutor = async () => {
    if (!chat.trim()) return
    setBusy('tutor')
    const { data, error: err } = await sendQuizTutorMessage(session.attempt.id, {
      question_id: question.id,
      message: chat,
    })
    setBusy('')
    if (err) {
      setError(err.message)
      return
    }
    const msg = chat
    setChat('')
    setSession((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === question.id
          ? {
              ...q,
              response: {
                ...(q.response || {}),
                tutor_thread: [
                  ...(q.response?.tutor_thread || []),
                  { role: 'student', content: msg },
                  { role: 'assistant', content: data.reply },
                ],
              },
            }
          : q,
      ),
    }))
  }

  const finish = async () => {
    setBusy('complete')
    const { data, error: err } = await completeQuizAttempt(session.attempt.id)
    setBusy('')
    if (err) {
      setError(err.message)
      return
    }
    setSession(data)
  }

  const summary = session.attempt?.summary
  const canFinish = questions.every((q) => q.response?.latest_answer)

  if (completed) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
        <button type="button" onClick={onExit} className="text-sm text-[#2563eb] border-none bg-transparent cursor-pointer">
          ← Quiz list
        </button>
        <div className={`${glass} p-6`}>
          <p className="text-sm text-slate-500">Score</p>
          <p className="text-4xl font-[800] text-[#0b1220]">{session.attempt.score_percent}%</p>
          <p className="text-sm text-slate-600 mt-2">
            {session.attempt.correct_count} correct on first try · {session.quiz.title}
          </p>
          {summary?.weak_topics?.length ? (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm">
              <p className="font-medium">Review in Learn through Chat</p>
              <p className="mt-1 text-slate-600">{summary.weak_topics.join(', ')}</p>
              <button
                type="button"
                className="mt-3 px-3 py-1.5 rounded-lg bg-[#2563eb] text-white text-sm border-none cursor-pointer"
                onClick={() =>
                  onLearnTopic?.({
                    subject: session.quiz.subject,
                    lesson: session.quiz.lesson,
                    topic: summary.weak_topics[0],
                  })
                }
              >
                Open Learn chat for this topic
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">Nice work. Keep the ideas fresh with a short Learn chat.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4">
      <section className={`${glass} p-4 flex-1 min-w-0 flex flex-col min-h-0`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <button type="button" onClick={onExit} className="text-sm text-slate-500 border-none bg-transparent cursor-pointer">
            Exit
          </button>
          <p className="text-xs text-slate-500">
            Question {index + 1} of {questions.length}
          </p>
        </div>
        <h2 className="font-semibold text-[#0b1220] leading-snug">{question?.prompt}</h2>
        <p className="text-xs text-slate-500 mt-1">{session.quiz.subject} · {session.quiz.lesson}</p>
        {error ? <p className="text-sm text-rose-700 mt-2">{error}</p> : null}
        <div className="mt-4 space-y-2 flex-1 overflow-y-auto">
          {(question?.options || []).length > 0
            ? question.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setChoice(String(opt.id))}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm cursor-pointer ${
                    choice === String(opt.id) ? 'border-[#2563eb] bg-sky-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className="font-semibold mr-2">{opt.id}.</span>
                  {opt.text}
                </button>
              ))
            : (
                <textarea
                  className="w-full min-h-[88px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Type your answer"
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                />
              )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={submit}
            className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-sm font-semibold border-none cursor-pointer"
          >
            {busy === 'submit' ? 'Checking…' : 'Submit answer'}
          </button>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="px-3 py-2 rounded-xl bg-slate-100 text-sm border-none cursor-pointer"
          >
            Back
          </button>
          <button
            type="button"
            disabled={index >= questions.length - 1}
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            className="px-3 py-2 rounded-xl bg-slate-100 text-sm border-none cursor-pointer"
          >
            Next
          </button>
          {canFinish ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={finish}
              className="ml-auto px-4 py-2 rounded-xl bg-[#0ea5e9] text-white text-sm font-semibold border-none cursor-pointer"
            >
              {busy === 'complete' ? 'Finishing…' : 'Finish quiz'}
            </button>
          ) : null}
        </div>
      </section>
      <aside className={`${glass} p-4 w-full md:w-[380px] shrink-0 flex flex-col min-h-0`}>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Quiz companion</p>
        <p className="text-xs text-slate-500 mt-1">Hints after you try. The tutor will not give the answer first.</p>
        <div className="flex-1 min-h-[180px] overflow-y-auto mt-3 space-y-2">
          {thread.length === 0 ? (
            <p className="text-sm text-slate-500">Submit an answer to get feedback, or ask for a hint after you try.</p>
          ) : (
            thread.map((m, i) => (
              <div key={i} className={`text-sm rounded-xl px-3 py-2 ${m.role === 'student' ? 'bg-slate-50' : 'bg-sky-50'}`}>
                <FormattedAnswerText text={m.content} className="text-sm" />
              </div>
            ))
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Ask a hint…"
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') askTutor()
            }}
          />
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={askTutor}
            className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm border-none cursor-pointer"
          >
            {busy === 'tutor' ? '…' : 'Send'}
          </button>
        </div>
      </aside>
    </div>
  )
}
