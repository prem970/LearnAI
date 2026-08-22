import { prisma } from './prisma.js'
import { chatCompletion } from './openai.js'
import { parseJsonArray } from './http.js'
import { matchTeacherSubject, teacherSubjectList } from './teacherSubjects.js'
import * as store from './quizStore.js'
import {
  QUIZ_GENERATE_INSTRUCTIONS,
  QUIZ_REGENERATE_INSTRUCTIONS,
  QUIZ_TUTOR_INSTRUCTIONS,
  CLASS_INSIGHTS_INSTRUCTIONS,
  STUDENT_INSIGHTS_INSTRUCTIONS,
  buildQuizGenerateUserMessage,
  buildQuizTutorUserMessage,
} from '../prompts/quizPrompts.js'

export function gradeNumber(label) {
  const m = String(label || '').match(/(\d{1,2})/)
  return m ? Number(m[1]) : null
}

export function extractJson(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced ? fenced[1] : raw).trim()
  try {
    return JSON.parse(body)
  } catch {
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function normalizeOptions(type, options) {
  if (type === 'true_false') {
    return [
      { id: 'true', text: 'True' },
      { id: 'false', text: 'False' },
    ]
  }
  if (type === 'short') return []
  const list = Array.isArray(options) ? options : []
  return list.slice(0, 4).map((opt, i) => {
    const id = String(opt?.id || String.fromCharCode(65 + i)).trim() || String.fromCharCode(65 + i)
    return { id, text: String(opt?.text || '').trim() }
  })
}

function validateQuestion(q) {
  const type = ['mcq', 'true_false', 'short'].includes(q?.type) ? q.type : 'mcq'
  const prompt = String(q?.prompt || '').trim()
  const correct = String(q?.correct_answer || q?.correctAnswer || '').trim()
  const options = normalizeOptions(type, q?.options)
  if (!prompt || !correct) return { ok: false, reason: 'Missing prompt or answer' }
  if (type === 'mcq') {
    if (options.length < 4) return { ok: false, reason: 'MCQ needs 4 options' }
    const ids = options.map((o) => o.id.toLowerCase())
    const texts = options.map((o) => o.text.toLowerCase())
    const c = correct.toLowerCase()
    if (!ids.includes(c) && !texts.includes(c)) return { ok: false, reason: 'Correct answer not in options' }
    if (options.some((o) => !o.text)) return { ok: false, reason: 'Empty option' }
  }
  if (type === 'true_false' && !['true', 'false'].includes(correct.toLowerCase())) {
    return { ok: false, reason: 'true_false answer must be true/false' }
  }
  return {
    ok: true,
    question: {
      type,
      prompt,
      options,
      correctAnswer: correct,
      explanation: String(q?.explanation || '').trim() || 'See the lesson notes for this idea.',
      topicTitle: String(q?.topic_title || q?.topicTitle || '').trim() || null,
      misconceptionHint: String(q?.misconception_hint || q?.misconceptionHint || '').trim() || null,
    },
  }
}

export function answersMatch(question, studentAnswer) {
  const expected = String(question.correctAnswer || '').trim().toLowerCase()
  const given = String(studentAnswer || '').trim().toLowerCase()
  if (!given) return false
  if (question.type === 'mcq') {
    const options = Array.isArray(question.options) ? question.options : parseJsonArray(question.options)
    const byId = options.find((o) => String(o.id).toLowerCase() === given)
    if (byId) return String(byId.id).toLowerCase() === expected || String(byId.text).toLowerCase() === expected
    const byText = options.find((o) => String(o.text).toLowerCase() === given)
    if (byText) return String(byText.id).toLowerCase() === expected || String(byText.text).toLowerCase() === expected
    return given === expected
  }
  if (question.type === 'true_false') {
    const norm = (v) => (['true', 't', 'yes', '1'].includes(v) ? 'true' : ['false', 'f', 'no', '0'].includes(v) ? 'false' : v)
    return norm(given) === norm(expected)
  }
  if (given === expected) return true
  const compact = (s) => s.replace(/[^a-z0-9]+/g, '')
  if (compact(given) === compact(expected)) return true
  if (expected.length > 3 && (given.includes(expected) || expected.includes(given))) return true
  return false
}

export function publicQuestion(question, { reveal } = {}) {
  const options = Array.isArray(question.options) ? question.options : parseJsonArray(question.options)
  const base = {
    id: question.id,
    sort_order: question.sortOrder,
    type: question.type,
    prompt: question.prompt,
    options,
    topic_title: question.topicTitle,
  }
  if (reveal) {
    base.correct_answer = question.correctAnswer
    base.explanation = question.explanation
  }
  return base
}

export async function teacherCurriculumTree(teacherId) {
  const profile = await prisma.teacherProfile.findUnique({ where: { userId: teacherId } })
  const taughtSubjects = teacherSubjectList({ subjects: parseJsonArray(profile?.subjects) })
  const taughtGrades = parseJsonArray(profile?.grades)
  const teacherGradeNums = [...new Set(taughtGrades.map(gradeNumber).filter((n) => n != null))]

  const boardGrades = await prisma.boardGrade.findMany({
    include: { board: { select: { id: true, name: true, slug: true } } },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  })

  const curricula = await prisma.curriculum.findMany({
    include: {
      subject: true,
      board: { select: { id: true, name: true, slug: true } },
      boardGrade: true,
      units: {
        orderBy: { sortOrder: 'asc' },
        include: { topics: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  })

  const packSubject = (c) => ({
    id: Number(c.subject.id),
    key: c.subject.key,
    label: c.subject.label,
    curriculum_id: Number(c.id),
    taught: Boolean(matchTeacherSubject(c.subject.label, taughtSubjects)),
    units: c.units.map((u) => ({
      id: Number(u.id),
      title: u.title,
      sort_order: u.sortOrder,
      topics: u.topics.map((t) => ({
        id: Number(t.id),
        title: t.title,
        sort_order: t.sortOrder,
      })),
    })),
  })

  const subjectsByGradeId = new Map()
  for (const c of curricula) {
    if (!c.subject || !c.boardGrade) continue
    const gid = Number(c.boardGrade.id)
    if (!subjectsByGradeId.has(gid)) subjectsByGradeId.set(gid, [])
    subjectsByGradeId.get(gid).push(packSubject(c))
  }

  const boardsByCanonical = new Map()
  for (const g of boardGrades) {
    const n = g.canonicalLevel ?? gradeNumber(g.label)
    if (n == null) continue
    if (!boardsByCanonical.has(n)) boardsByCanonical.set(n, [])
    boardsByCanonical.get(n).push(g)
  }

  const seededCanonicals = [...boardsByCanonical.keys()].sort((a, b) => a - b)
  const fallbackCanonical = seededCanonicals.includes(7) ? 7 : seededCanonicals[0]
  const gradeNums = teacherGradeNums.length ? teacherGradeNums : seededCanonicals

  const mapBoards = (canonical, sourceCanonical = canonical) => {
    const source = boardsByCanonical.get(sourceCanonical) || []
    return source
      .map((g) => {
        const subjects = [...(subjectsByGradeId.get(Number(g.id)) || [])]
          .filter((s) => (taughtSubjects.length ? s.taught : false))
          .sort((a, b) => a.label.localeCompare(b.label))
        return {
          id: Number(g.id),
          label: g.label,
          canonical_level: canonical,
          board: g.board,
          fallback: sourceCanonical !== canonical,
          subjects,
        }
      })
      .filter((b) => b.subjects.length)
  }

  const grades = []
  for (const n of gradeNums) {
    let boards = mapBoards(n, n)
    let fallback = false
    if (!boards.length && fallbackCanonical != null) {
      boards = mapBoards(n, fallbackCanonical)
      fallback = true
    }
    if (!boards.length) continue
    grades.push({
      key: String(n),
      canonical_level: n,
      label: `Grade ${n}`,
      fallback,
      boards,
    })
  }

  return {
    grades,
    teacher_subjects: taughtSubjects,
    teacher_grades: taughtGrades,
  }
}

export async function generateQuizQuestions(meta, { count = 5 } = {}) {
  const n = Math.min(20, Math.max(1, Number(count) || 5))
  const result = await chatCompletion({
    systemPrompt: QUIZ_GENERATE_INSTRUCTIONS,
    messages: [{ role: 'user', content: buildQuizGenerateUserMessage({ ...meta, count: n }) }],
    maxTokens: 4000,
  })
  const parsed = extractJson(result.answer)
  const incoming = Array.isArray(parsed?.questions) ? parsed.questions : []
  const valid = []
  for (const q of incoming) {
    const checked = validateQuestion(q)
    if (checked.ok) valid.push(checked.question)
  }
  if (valid.length < n && valid.length === 0) {
    const err = new Error('AI did not return usable questions. Try again.')
    err.status = 502
    throw err
  }
  return {
    title: String(parsed?.title || `${meta.subject} · ${meta.lesson}`).slice(0, 255),
    questions: valid.slice(0, n),
  }
}

export async function regenerateOneQuestion(meta, previousPrompt) {
  const result = await chatCompletion({
    systemPrompt: QUIZ_REGENERATE_INSTRUCTIONS,
    messages: [
      {
        role: 'user',
        content: `${buildQuizGenerateUserMessage({ ...meta, count: 1 })}\nReplace this question (do not copy it):\n${previousPrompt}`,
      },
    ],
    maxTokens: 1200,
  })
  const parsed = extractJson(result.answer)
  const checked = validateQuestion(parsed)
  if (!checked.ok) {
    const err = new Error(`Could not regenerate question (${checked.reason}).`)
    err.status = 502
    throw err
  }
  return checked.question
}

export async function tutorReply({
  meta,
  question,
  studentAnswer,
  isCorrect,
  attempted,
  hintCount,
  incorrectAttempts,
  revealAllowed,
  chatMessage,
}) {
  const result = await chatCompletion({
    systemPrompt: QUIZ_TUTOR_INSTRUCTIONS,
    messages: [
      {
        role: 'user',
        content: buildQuizTutorUserMessage({
          gradeLabel: meta.gradeLabel,
          subject: meta.subject,
          lesson: meta.lesson,
          topic: question.topicTitle || meta.topic,
          question: question.prompt,
          studentAnswer,
          isCorrect,
          attempted,
          hintCount,
          incorrectAttempts,
          revealAllowed,
          chatMessage,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
        }),
      },
    ],
    maxTokens: 700,
  })
  return String(result.answer || '').trim()
}

function median(nums) {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function difficultyBand(pctCorrect) {
  if (pctCorrect == null) return 'unknown'
  if (pctCorrect < 40) return 'hard'
  if (pctCorrect < 70) return 'medium'
  return 'easy'
}

export function serializeQuiz(quiz, extras = {}) {
  return {
    id: quiz.id,
    title: quiz.title,
    grade_id: quiz.gradeId,
    grade: quiz.gradeLabel,
    board_id: quiz.boardId,
    subject_id: quiz.subjectId,
    subject: quiz.subjectLabel,
    lesson_id: quiz.curriculumUnitId,
    lesson: quiz.lessonTitle,
    topic_id: quiz.topicId,
    topic: quiz.topicTitle,
    difficulty: quiz.difficulty,
    question_count: quiz.questionCount,
    status: quiz.status,
    published_at: quiz.publishedAt ? new Date(quiz.publishedAt).toISOString() : null,
    created_at: quiz.createdAt ? new Date(quiz.createdAt).toISOString() : null,
    ...extras,
  }
}

export async function quizListStats(quizIds) {
  if (!quizIds.length) return new Map()
  const attempts = await store.listAttemptsForQuizzes(quizIds)
  const map = new Map()
  for (const id of quizIds) map.set(id, { attempted: 0, completed: 0 })
  for (const a of attempts) {
    const row = map.get(a.quizId) || { attempted: 0, completed: 0 }
    row.attempted += 1
    if (a.status === 'completed') row.completed += 1
    map.set(a.quizId, row)
  }
  return map
}

export async function buildQuizAnalytics(quizId) {
  const quiz = await store.getQuiz(quizId)
  if (!quiz) return null
  const questionsRows = await store.getQuizQuestions(quizId)
  const attemptRows = await store.listAttemptsForQuiz(quizId)
  const studentIds = [...new Set(attemptRows.map((a) => a.studentId))]
  const students = studentIds.length
    ? await prisma.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true },
      })
    : []
  const nameById = new Map(students.map((s) => [s.id, s.name]))
  const attempts = []
  for (const a of attemptRows) {
    attempts.push({
      ...a,
      student: { id: a.studentId, name: nameById.get(a.studentId) },
      answers: await store.listAnswers(a.id),
    })
  }
  quiz.questions = questionsRows
  quiz.attempts = attempts
  const completed = attempts.filter((a) => a.status === 'completed')
  const attempted = attempts.length
  const scores = completed.map((a) => Number(a.scorePercent || 0))
  const times = completed.map((a) => Number(a.totalTimeMs || 0))
  const buckets = [
    { label: '0–20', min: 0, max: 20, count: 0 },
    { label: '20–40', min: 20, max: 40, count: 0 },
    { label: '40–60', min: 40, max: 60, count: 0 },
    { label: '60–80', min: 60, max: 80, count: 0 },
    { label: '80–100', min: 80, max: 101, count: 0 },
  ]
  for (const s of scores) {
    const b = buckets.find((x) => s >= x.min && s < x.max)
    if (b) b.count += 1
  }

  const questions = questionsRows.map((q) => {
    const rows = attempts.flatMap((a) => a.answers.filter((ans) => ans.questionId === q.id))
    const scored = rows.filter((r) => r.firstIsCorrect != null)
    const correct = scored.filter((r) => r.firstIsCorrect).length
    const pct = scored.length ? Math.round((correct / scored.length) * 100) : null
    const wrongCounts = new Map()
    for (const r of scored.filter((x) => !x.firstIsCorrect && x.firstAnswer)) {
      const key = String(r.firstAnswer).slice(0, 80)
      wrongCounts.set(key, (wrongCounts.get(key) || 0) + 1)
    }
    let mostWrong = null
    let mostWrongN = 0
    for (const [k, n] of wrongCounts) {
      if (n > mostWrongN) {
        mostWrong = k
        mostWrongN = n
      }
    }
    const misconceptions = [...new Set(rows.map((r) => r.misconception).filter(Boolean))].slice(0, 5)
    const hinted = rows.filter((r) => r.hintCount > 0).length
    const avgTime = rows.length ? Math.round(rows.reduce((s, r) => s + (r.timeMs || 0), 0) / rows.length) : 0
    return {
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      topic_title: q.topicTitle,
      percent_correct: pct,
      percent_incorrect: pct == null ? null : 100 - pct,
      most_selected_wrong: mostWrong,
      difficulty: difficultyBand(pct),
      average_time_ms: avgTime,
      common_misconceptions: misconceptions,
      students_needed_hints: hinted,
    }
  })

  const overall = {
    average_score: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    highest_score: scores.length ? Math.max(...scores) : null,
    lowest_score: scores.length ? Math.min(...scores) : null,
    median_score: scores.length ? Math.round(median(scores) * 10) / 10 : null,
    score_distribution: buckets,
    completion_rate: attempted ? Math.round((completed.length / attempted) * 100) : 0,
    average_time_ms: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
    attempted,
    completed: completed.length,
  }

  return {
    quiz: serializeQuiz(quiz),
    overall,
    questions,
    students: attempts.map((a) => ({
      student_id: a.studentId,
      name: a.student?.name,
      status: a.status,
      score: a.scorePercent == null ? null : Number(a.scorePercent),
      correct_count: a.correctCount,
      total_time_ms: a.totalTimeMs,
                      completed_at: a.completedAt ? new Date(a.completedAt).toISOString() : null,
    })),
    insights: quiz.insightsJson || null,
  }
}

export async function generateClassInsights(analytics) {
  const result = await chatCompletion({
    systemPrompt: CLASS_INSIGHTS_INSTRUCTIONS,
    messages: [{ role: 'user', content: JSON.stringify(analytics).slice(0, 12000) }],
    maxTokens: 900,
  })
  return extractJson(result.answer) || { narrative: result.answer, headline: 'Class insight' }
}

export async function generateStudentInsights(payload) {
  const result = await chatCompletion({
    systemPrompt: STUDENT_INSIGHTS_INSTRUCTIONS,
    messages: [{ role: 'user', content: JSON.stringify(payload).slice(0, 10000) }],
    maxTokens: 700,
  })
  return extractJson(result.answer) || { headline: result.answer }
}

export async function completeAttempt(attemptId) {
  const attempt = await store.getAttempt(attemptId)
  if (!attempt) return null
  if (attempt.status === 'completed') return attempt
  const quiz = await store.getQuiz(attempt.quizId)
  const questions = await store.getQuizQuestions(attempt.quizId)
  const answers = await store.listAnswers(attemptId)
  const total = questions.length
  const correct = answers.filter((a) => a.firstIsCorrect).length
  const score = total ? Math.round((correct / total) * 10000) / 100 : 0
  const totalTime = answers.reduce((s, a) => s + (a.timeMs || 0), 0)
  const byQ = new Map(questions.map((q) => [q.id, q]))
  const weak = []
  for (const a of answers) {
    if (a.firstIsCorrect === false) {
      const question = byQ.get(a.questionId)
      weak.push({
        topic: question?.topicTitle || quiz.topicTitle || quiz.lessonTitle,
        prompt: question?.prompt,
      })
    }
  }
  const summary = {
    weak_topics: [...new Set(weak.map((w) => w.topic).filter(Boolean))],
    missed: weak.slice(0, 8),
  }
  const updated = await store.updateAttempt(attemptId, {
    status: 'completed',
    completedAt: new Date(),
    scorePercent: score,
    correctCount: correct,
    totalTimeMs: totalTime,
    summaryJson: summary,
  })

  const recReason = summary.weak_topics.length
    ? `Struggled with: ${summary.weak_topics.join(', ')}. Review these in Learn through Chat, then try a short practice quiz.`
    : 'Solid performance. Keep practicing similar problems in Learn through Chat to stay sharp.'
  await store.insertLearningRec({
    studentId: attempt.studentId,
    teacherId: quiz.teacherId,
    quizId: attempt.quizId,
    subject: quiz.subjectLabel,
    lesson: quiz.lessonTitle,
    topic: summary.weak_topics[0] || quiz.topicTitle,
    reason: recReason,
  })
  return updated
}

export async function studentAttemptPayload(attempt, { includeSecrets } = {}) {
  const quiz = await store.getQuiz(attempt.quizId)
  const questions = await store.getQuizQuestions(attempt.quizId)
  const answers = await store.listAnswers(attempt.id)
  const byQ = new Map(answers.map((a) => [a.questionId, a]))
  const completed = attempt.status === 'completed'
  const started = attempt.startedAt instanceof Date ? attempt.startedAt : new Date(attempt.startedAt)
  const completedAt = attempt.completedAt
    ? (attempt.completedAt instanceof Date ? attempt.completedAt : new Date(attempt.completedAt))
    : null
  return {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      current_index: attempt.currentIndex,
      score_percent: attempt.scorePercent == null ? null : Number(attempt.scorePercent),
      correct_count: attempt.correctCount,
      started_at: started.toISOString(),
      completed_at: completedAt ? completedAt.toISOString() : null,
      summary: attempt.summaryJson || null,
    },
    quiz: serializeQuiz(quiz),
    questions: questions.map((q) => {
      const ans = byQ.get(q.id)
      const reveal = includeSecrets || completed || ans?.revealed || ans?.isCorrect
      const thread = Array.isArray(ans?.tutorThread) ? ans.tutorThread : parseJsonArray(ans?.tutorThread)
      return {
        ...publicQuestion(q, { reveal }),
        response: ans
          ? {
              latest_answer: ans.latestAnswer,
              first_is_correct: ans.firstIsCorrect,
              is_correct: ans.isCorrect,
              hint_count: ans.hintCount,
              incorrect_attempts: ans.incorrectAttempts,
              revealed: ans.revealed,
              tutor_thread: thread,
            }
          : null,
      }
    }),
  }
}
