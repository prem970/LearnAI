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
import { FlapPanel, FlapPanelHead, FlapRow, FlapButton, FlapInput } from './ui/Board.jsx'

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
        <h1 className="font-[family-name:var(--font-flap)] text-xl font-bold tracking-[0.06em] uppercase text-[var(--flap-ink)] m-0">
          Quizzes
        </h1>
        <p className="text-sm text-[var(--flap-mute)] mt-1 font-[family-name:var(--font-body)]">
          Assessments for your grade, with a tutor beside every question.
        </p>
      </header>
      {error ? (
        <div className="border border-[var(--flap-cancel)]/50 text-[var(--flap-cancel)] px-3 py-2 text-sm">
          {error}
        </div>
      ) : null}
      {loading ? (
        <p className="font-[family-name:var(--font-flap)] text-sm tracking-[0.1em] uppercase text-[var(--flap-mute)]">
          Loading quizzes…
        </p>
      ) : null}
      {!loading && quizzes.length === 0 ? (
        <FlapPanel className="p-8 text-center">
          <p className="font-[family-name:var(--font-flap)] text-sm tracking-[0.12em] uppercase text-[var(--flap-mute)] m-0">
            No quizzes assigned to your grade yet.
          </p>
        </FlapPanel>
      ) : null}
      {['active', 'available', 'completed'].map((key) =>
        groups[key].length ? (
          <FlapPanel key={key}>
            <FlapPanelHead
              title={key === 'active' ? 'In progress' : key === 'available' ? 'Available' : 'Completed'}
              meta={`${groups[key].length} row${groups[key].length === 1 ? '' : 's'}`}
            />
            {groups[key].map((q) => (
              <div key={q.id} className="flex flex-wrap items-center gap-2 border-b border-[var(--board-rule)] last:border-b-0">
                <div className="flex-1 min-w-0">
                  <FlapRow
                    className="!border-b-0"
                    cols={[
                      { label: q.title, width: '1.4fr' },
                      {
                        label: `${q.subject} · ${q.lesson}${q.topic ? ` · ${q.topic}` : ''} · ${q.question_count} questions${q.score_percent != null ? ` · ${q.score_percent}%` : ''}`,
                        width: '2fr',
                        mute: true,
                      },
                    ]}
                  />
                </div>
                <div className="px-3 py-2 shrink-0">
                  <FlapButton disabled={Boolean(busy)} onClick={() => start(q.id)} variant="amber">
                    {q.bucket === 'completed' ? 'Review' : q.bucket === 'active' ? 'Continue' : 'Start'}
                  </FlapButton>
                </div>
              </div>
            ))}
          </FlapPanel>
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
        <FlapButton variant="ghost" onClick={onExit}>
          Quiz list
        </FlapButton>
        <FlapPanel>
          <FlapPanelHead title="Score" meta={session.quiz.title} />
          <div className="p-5">
            <p className="font-[family-name:var(--font-flap)] text-5xl font-bold tracking-[0.04em] tabular-nums text-[var(--flap-amber)] m-0">
              {session.attempt.score_percent}%
            </p>
            <p className="text-sm text-[var(--flap-mute)] mt-2 font-[family-name:var(--font-body)]">
              {session.attempt.correct_count} correct on first try · {session.quiz.title}
            </p>
            {summary?.weak_topics?.length ? (
              <div className="mt-4 border border-[var(--flap-amber)]/40 bg-[var(--flap-face)] px-3 py-3 text-sm">
                <p className="font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--flap-amber)] m-0">
                  Review in Learn through Chat
                </p>
                <p className="mt-1 text-[var(--flap-ink)] font-[family-name:var(--font-body)]">
                  {summary.weak_topics.join(', ')}
                </p>
                <div className="mt-3">
                  <FlapButton
                    variant="amber"
                    onClick={() =>
                      onLearnTopic?.({
                        subject: session.quiz.subject,
                        lesson: session.quiz.lesson,
                        topic: summary.weak_topics[0],
                      })
                    }
                  >
                    Open Learn chat for this topic
                  </FlapButton>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--flap-mute)] font-[family-name:var(--font-body)]">
                Nice work. Keep the ideas fresh with a short Learn chat.
              </p>
            )}
          </div>
        </FlapPanel>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4">
      <FlapPanel scroll className="flex-1 min-w-0 flex flex-col min-h-0">
        <FlapPanelHead
          title="Question"
          meta={`${index + 1} of ${questions.length}`}
        />
        <div className="px-3 py-2 border-b border-[var(--board-rule)] flex items-center justify-between gap-2">
          <FlapButton variant="ghost" onClick={onExit}>
            Exit
          </FlapButton>
          <p className="font-[family-name:var(--font-flap)] text-[10px] tracking-[0.12em] uppercase text-[var(--flap-mute)] m-0">
            {session.quiz.subject} · {session.quiz.lesson}
          </p>
        </div>
        <div className="px-4 pt-3">
          <h2 className="font-[family-name:var(--font-body)] font-semibold text-[var(--flap-ink)] leading-snug m-0">
            {question?.prompt}
          </h2>
          {error ? <p className="text-sm text-[var(--flap-cancel)] mt-2 m-0">{error}</p> : null}
        </div>
        <div className="mt-3 px-4 pb-2 space-y-2 flex-1 min-h-0 overflow-y-auto">
          {(question?.options || []).length > 0
            ? question.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setChoice(String(opt.id))}
                  className={`w-full text-left px-3 py-2.5 border text-sm cursor-pointer font-[family-name:var(--font-body)] ${
                    choice === String(opt.id)
                      ? 'border-[var(--flap-amber)] bg-[var(--flap-face)] text-[var(--flap-ink)]'
                      : 'border-[var(--board-rule)] bg-[var(--board-steel-deep)] text-[var(--flap-ink)] hover:bg-[var(--flap-face)]/50'
                  }`}
                >
                  <span className="font-[family-name:var(--font-flap)] font-semibold tracking-[0.08em] uppercase mr-2 text-[var(--flap-amber)]">
                    {opt.id}.
                  </span>
                  {opt.text}
                </button>
              ))
            : (
                <textarea
                  className="w-full min-h-[88px] bg-[var(--flap-face)] text-[var(--flap-ink)] border border-[var(--board-rule)] px-3 py-2 text-sm outline-none focus:border-[var(--flap-amber)] placeholder:text-[var(--flap-mute)] font-[family-name:var(--font-body)]"
                  placeholder="Type your answer"
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                />
              )}
        </div>
        <div className="mt-auto px-3 py-3 flex flex-wrap gap-2 border-t border-[var(--board-rule)] bg-[var(--board-steel-deep)]">
          <FlapButton disabled={Boolean(busy)} onClick={submit} variant="amber">
            {busy === 'submit' ? 'Checking…' : 'Submit answer'}
          </FlapButton>
          <FlapButton disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))} variant="ghost">
            Back
          </FlapButton>
          <FlapButton
            disabled={index >= questions.length - 1}
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            variant="ghost"
          >
            Next
          </FlapButton>
          {canFinish ? (
            <FlapButton className="ml-auto" disabled={Boolean(busy)} onClick={finish} variant="primary">
              {busy === 'complete' ? 'Finishing…' : 'Finish quiz'}
            </FlapButton>
          ) : null}
        </div>
      </FlapPanel>
      <FlapPanel scroll className="w-full md:w-[380px] shrink-0 flex flex-col min-h-[220px] md:min-h-0">
        <FlapPanelHead title="Quiz companion" meta="Hints" />
        <p className="px-3 pt-2 text-xs text-[var(--flap-mute)] font-[family-name:var(--font-body)] m-0">
          Hints after you try. The tutor will not give the answer first.
        </p>
        <div className="flex-1 min-h-0 overflow-y-auto mt-3 px-3 space-y-2">
          {thread.length === 0 ? (
            <p className="text-sm text-[var(--flap-mute)] font-[family-name:var(--font-body)]">
              Submit an answer to get feedback, or ask for a hint after you try.
            </p>
          ) : (
            thread.map((m, i) => (
              <div
                key={i}
                className={`text-sm px-3 py-2 border border-[var(--board-rule)] ${
                  m.role === 'student' ? 'bg-[var(--board-steel-deep)]' : 'bg-[var(--flap-face)]'
                }`}
              >
                <FormattedAnswerText text={m.content} className="text-sm" />
              </div>
            ))
          )}
        </div>
        <div className="mt-3 p-3 flex gap-2 border-t border-[var(--board-rule)]">
          <FlapInput
            className="flex-1"
            placeholder="Ask a hint…"
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') askTutor()
            }}
          />
          <FlapButton disabled={Boolean(busy)} onClick={askTutor} variant="primary">
            {busy === 'tutor' ? '…' : 'Send'}
          </FlapButton>
        </div>
      </FlapPanel>
    </div>
  )
}
