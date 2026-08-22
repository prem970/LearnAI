import { prisma } from './prisma.js'
import { json, parseJsonArray, readJson } from './http.js'
import { requireUser } from './auth.js'
import * as store from './quizStore.js'
import { matchTeacherSubject, teacherSubjectList } from './teacherSubjects.js'
import {
  answersMatch,
  buildQuizAnalytics,
  completeAttempt,
  generateClassInsights,
  generateQuizQuestions,
  generateStudentInsights,
  publicQuestion,
  quizListStats,
  regenerateOneQuestion,
  serializeQuiz,
  studentAttemptPayload,
  teacherCurriculumTree,
  tutorReply,
} from './quizzes.js'

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

async function requireQuizOwner(request, quizId) {
  const auth = await requireUser(request, 'teacher')
  if (auth.error) return auth
  const quiz = await store.getQuiz(quizId)
  if (!quiz) return { error: json({ message: 'Quiz not found.' }, 404) }
  if (quiz.teacherId !== auth.user.id) return { error: json({ message: 'Forbidden.' }, 403) }
  const questions = await store.getQuizQuestions(quiz.id)
  return { user: auth.user, quiz: { ...quiz, questions } }
}

export async function dispatchQuizApi(request, slugParts, method) {
  await store.ensureQuizTables()
  const [a, b, c, d, e] = slugParts

  if (a === 'teacher' && b === 'curriculum' && method === 'GET') {
    const auth = await requireUser(request, 'teacher')
    if (auth.error) return auth.error
    return json(await teacherCurriculumTree(auth.user.id))
  }

  if (a === 'teacher' && b === 'quizzes' && !c && method === 'GET') {
    const auth = await requireUser(request, 'teacher')
    if (auth.error) return auth.error
    const quizzes = await store.listTeacherQuizzes(auth.user.id)
    const stats = await quizListStats(quizzes.map((q) => q.id))
    return json({
      quizzes: quizzes.map((q) => {
        const s = stats.get(q.id) || { attempted: 0, completed: 0 }
        return serializeQuiz(q, { students_attempted: s.attempted, students_completed: s.completed })
      }),
    })
  }

  if (a === 'teacher' && b === 'quizzes' && c === 'generate' && method === 'POST') {
    const auth = await requireUser(request, 'teacher')
    if (auth.error) return auth.error
    const body = await readJson(request)
    const gradeId = num(body.grade_id)
    const unitId = num(body.lesson_id || body.curriculum_unit_id)
    const count = Math.min(20, Math.max(1, num(body.question_count) || 5))
    if (!gradeId || !unitId) return json({ message: 'grade_id and lesson_id are required.' }, 422)
    const grade = await prisma.boardGrade.findUnique({
      where: { id: gradeId },
      include: { board: true },
    })
    const unit = await prisma.curriculumUnit.findUnique({
      where: { id: unitId },
      include: { topics: true, curriculum: { include: { subject: true } } },
    })
    if (!grade || !unit) return json({ message: 'Grade or lesson not found.' }, 422)
    const topicId = num(body.topic_id)
    const topic = topicId ? unit.topics.find((t) => t.id === topicId) : null
    const difficulty = String(body.difficulty || 'beginner')
    const subjectLabel = unit.curriculum.subject?.label || String(body.subject || 'Subject')
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: auth.user.id },
      select: { subjects: true },
    })
    const taught = teacherSubjectList({ subjects: parseJsonArray(profile?.subjects) })
    if (!taught.length || !matchTeacherSubject(subjectLabel, taught)) {
      return json({ message: 'You can only create quizzes for subjects you teach.' }, 403)
    }
    const generated = await generateQuizQuestions(
      {
        gradeLabel: grade.label,
        boardName: grade.board?.name,
        subject: subjectLabel,
        lesson: unit.title,
        topic: topic?.title || null,
        topics: topic ? [topic.title] : unit.topics.map((t) => t.title),
        difficulty,
      },
      { count },
    )
    const quizId = await store.insertQuiz({
      teacherId: auth.user.id,
      title: String(body.title || generated.title).slice(0, 255),
      boardId: grade.boardId,
      gradeId: grade.id,
      gradeLabel: grade.label,
      subjectId: unit.curriculum.subjectId,
      subjectLabel,
      curriculumUnitId: unit.id,
      lessonTitle: unit.title,
      topicId: topic?.id || null,
      topicTitle: topic?.title || null,
      difficulty,
      questionCount: generated.questions.length,
      status: 'draft',
    })
    for (let i = 0; i < generated.questions.length; i += 1) {
      await store.insertQuestion(quizId, generated.questions[i], i)
    }
    const quiz = await store.getQuiz(quizId)
    const questions = await store.getQuizQuestions(quizId)
    return json({
      quiz: serializeQuiz(quiz),
      questions: questions.map((q) => publicQuestion(q, { reveal: true })),
    })
  }

  if (a === 'teacher' && b === 'quizzes' && c && !d && method === 'GET') {
    const owned = await requireQuizOwner(request, num(c))
    if (owned.error) return owned.error
    return json({
      quiz: serializeQuiz(owned.quiz),
      questions: owned.quiz.questions.map((q) => publicQuestion(q, { reveal: true })),
    })
  }

  if (a === 'teacher' && b === 'quizzes' && c && !d && method === 'PATCH') {
    const owned = await requireQuizOwner(request, num(c))
    if (owned.error) return owned.error
    const body = await readJson(request)
    const quiz = await store.updateQuizFields(owned.quiz.id, {
      title: body.title != null ? String(body.title).slice(0, 255) : undefined,
      difficulty: body.difficulty != null ? String(body.difficulty).slice(0, 32) : undefined,
    })
    return json({ quiz: serializeQuiz(quiz) })
  }

  if (a === 'teacher' && b === 'quizzes' && c && !d && method === 'DELETE') {
    const owned = await requireQuizOwner(request, num(c))
    if (owned.error) return owned.error
    await store.deleteQuiz(owned.quiz.id)
    return json({ message: 'Quiz deleted.' })
  }

  if (a === 'teacher' && b === 'quizzes' && c && d === 'publish' && method === 'POST') {
    const owned = await requireQuizOwner(request, num(c))
    if (owned.error) return owned.error
    if (!owned.quiz.questions.length) return json({ message: 'Add at least one question before publishing.' }, 422)
    const quiz = await store.updateQuizFields(owned.quiz.id, {
      status: 'published',
      publishedAt: new Date(),
      questionCount: owned.quiz.questions.length,
    })
    return json({ quiz: serializeQuiz(quiz) })
  }

  if (a === 'teacher' && b === 'quizzes' && c && d === 'questions' && e && method === 'PATCH') {
    const owned = await requireQuizOwner(request, num(c))
    if (owned.error) return owned.error
    const qid = num(e)
    const question = owned.quiz.questions.find((q) => q.id === qid)
    if (!question) return json({ message: 'Question not found.' }, 404)
    const body = await readJson(request)
    const updated = await store.updateQuestionRow(qid, {
      prompt: body.prompt != null ? String(body.prompt) : undefined,
      correctAnswer: body.correct_answer != null ? String(body.correct_answer) : undefined,
      explanation: body.explanation != null ? String(body.explanation) : undefined,
      options: body.options,
      type: body.type != null ? String(body.type) : undefined,
      topicTitle: body.topic_title != null ? String(body.topic_title) : undefined,
    })
    return json({ question: publicQuestion(updated, { reveal: true }) })
  }

  if (a === 'teacher' && b === 'quizzes' && c && d === 'questions' && e && method === 'DELETE') {
    const owned = await requireQuizOwner(request, num(c))
    if (owned.error) return owned.error
    const qid = num(e)
    if (!owned.quiz.questions.some((q) => q.id === qid)) return json({ message: 'Question not found.' }, 404)
    await store.deleteQuestionRow(qid)
    await store.updateQuizFields(owned.quiz.id, { questionCount: Math.max(0, owned.quiz.questions.length - 1) })
    return json({ message: 'Question removed.' })
  }

  if (a === 'teacher' && b === 'quizzes' && c && d === 'questions' && num(e) && slugParts[5] === 'regenerate' && method === 'POST') {
    const owned = await requireQuizOwner(request, num(c))
    if (owned.error) return owned.error
    const qid = num(e)
    const question = owned.quiz.questions.find((q) => q.id === qid)
    if (!question) return json({ message: 'Question not found.' }, 404)
    const next = await regenerateOneQuestion(
      {
        gradeLabel: owned.quiz.gradeLabel,
        subject: owned.quiz.subjectLabel,
        lesson: owned.quiz.lessonTitle,
        topic: owned.quiz.topicTitle,
        topics: owned.quiz.topicTitle ? [owned.quiz.topicTitle] : [],
        difficulty: owned.quiz.difficulty,
      },
      question.prompt,
    )
    const updated = await store.updateQuestionRow(qid, next)
    return json({ question: publicQuestion(updated, { reveal: true }) })
  }

  if (a === 'teacher' && b === 'quizzes' && c && d === 'analytics' && method === 'GET') {
    const owned = await requireQuizOwner(request, num(c))
    if (owned.error) return owned.error
    return json(await buildQuizAnalytics(owned.quiz.id))
  }

  if (a === 'teacher' && b === 'quizzes' && c && d === 'insights' && method === 'POST') {
    const owned = await requireQuizOwner(request, num(c))
    if (owned.error) return owned.error
    const analytics = await buildQuizAnalytics(owned.quiz.id)
    const insights = await generateClassInsights(analytics)
    await store.updateQuizFields(owned.quiz.id, { insightsJson: insights })
    return json({ insights })
  }

  if (a === 'teacher' && b === 'students' && c && d === 'quiz-insights' && method === 'GET') {
    const auth = await requireUser(request, 'teacher')
    if (auth.error) return auth.error
    const studentId = num(c)
    const attempts = await store.listTeacherStudentAttempts(auth.user.id, studentId)
    const history = []
    for (const a of attempts) {
      const answers = await store.listAnswers(a.id)
      const questions = await store.getQuizQuestions(a.quizId)
      const byQ = new Map(questions.map((q) => [q.id, q]))
      history.push({
        quiz_id: a.quizId,
        title: a.quizTitle,
        subject: a.subjectLabel,
        lesson: a.lessonTitle,
        score: Number(a.scorePercent || 0),
        completed_at: a.completedAt ? new Date(a.completedAt).toISOString() : null,
        missed: answers.filter((x) => x.firstIsCorrect === false).map((x) => ({
          prompt: byQ.get(x.questionId)?.prompt,
          topic: byQ.get(x.questionId)?.topicTitle,
          answer: x.firstAnswer,
          misconception: x.misconception,
        })),
        avg_time_ms: answers.length
          ? Math.round(answers.reduce((s, x) => s + (x.timeMs || 0), 0) / answers.length)
          : 0,
      })
    }
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true },
    })
    const insights = history.length ? await generateStudentInsights({ student, history }) : null
    return json({ student: student || { id: studentId }, history, insights })
  }

  if (a === 'student' && b === 'learning-recs' && method === 'GET') {
    const auth = await requireUser(request, 'student')
    if (auth.error) return auth.error
    const recs = await store.listLearningRecs(auth.user.id)
    return json({
      recs: recs.map((r) => ({
        id: r.id,
        subject: r.subject,
        lesson: r.lesson,
        topic: r.topic,
        reason: r.reason,
        created_at: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      })),
    })
  }

  if (a === 'student' && b === 'learning-recs' && !c && method === 'PATCH') {
    const auth = await requireUser(request, 'student')
    if (auth.error) return auth.error
    await store.dismissAllLearningRecs(auth.user.id)
    return json({ ok: true })
  }

  if (a === 'student' && b === 'learning-recs' && c && method === 'PATCH') {
    const auth = await requireUser(request, 'student')
    if (auth.error) return auth.error
    const recId = num(c)
    if (!recId) return json({ message: 'Invalid recommendation.' }, 400)
    const ok = await store.dismissLearningRec(recId, auth.user.id)
    if (!ok) return json({ message: 'Recommendation not found.' }, 404)
    return json({ ok: true })
  }

  if (a === 'student' && b === 'quizzes' && !c && method === 'GET') {
    const auth = await requireUser(request, 'student')
    if (auth.error) return auth.error
    const profile = await prisma.studentProfile.findUnique({ where: { userId: auth.user.id } })
    const gradeId = profile?.gradeId || auth.user.gradeId
    if (!gradeId) return json({ quizzes: [] })
    const quizzes = await store.listPublishedByGrade(gradeId)
    const attempts = await store.listStudentAttempts(auth.user.id, quizzes.map((q) => q.id))
    const byQuiz = new Map(attempts.map((a) => [a.quizId, a]))
    return json({
      quizzes: quizzes.map((q) => {
        const att = byQuiz.get(q.id)
        let bucket = 'available'
        if (att?.status === 'completed') bucket = 'completed'
        else if (att?.status === 'in_progress') bucket = 'active'
        return serializeQuiz(q, {
          attempt_status: att?.status || 'not_started',
          bucket,
          score_percent: att?.scorePercent == null ? null : Number(att.scorePercent),
        })
      }),
    })
  }

  if (a === 'student' && b === 'quizzes' && c && d === 'start' && method === 'POST') {
    const auth = await requireUser(request, 'student')
    if (auth.error) return auth.error
    const quizId = num(c)
    const profile = await prisma.studentProfile.findUnique({ where: { userId: auth.user.id } })
    const quiz = await store.getQuiz(quizId)
    if (!quiz || quiz.status !== 'published') return json({ message: 'Quiz not available.' }, 404)
    const gradeId = profile?.gradeId || auth.user.gradeId
    if (gradeId && quiz.gradeId !== gradeId) return json({ message: 'This quiz is not assigned to your grade.' }, 403)
    const existing = await store.getAttemptByQuizStudent(quizId, auth.user.id)
    if (existing) return json(await studentAttemptPayload(existing))
    const attempt = await store.createAttempt(quizId, auth.user.id)
    return json(await studentAttemptPayload(attempt))
  }

  if (a === 'student' && b === 'quiz-attempts' && c && !d && method === 'GET') {
    const auth = await requireUser(request, 'student')
    if (auth.error) return auth.error
    const attempt = await store.getAttempt(num(c))
    if (!attempt || attempt.studentId !== auth.user.id) return json({ message: 'Attempt not found.' }, 404)
    return json(await studentAttemptPayload(attempt))
  }

  if (a === 'student' && b === 'quiz-attempts' && c && d === 'submit-answer' && method === 'POST') {
    const auth = await requireUser(request, 'student')
    if (auth.error) return auth.error
    const attempt = await store.getAttempt(num(c))
    if (!attempt || attempt.studentId !== auth.user.id) return json({ message: 'Attempt not found.' }, 404)
    if (attempt.status === 'completed') return json({ message: 'Quiz already completed.' }, 422)
    const quiz = await store.getQuiz(attempt.quizId)
    const body = await readJson(request)
    const question = await store.getQuestion(num(body.question_id))
    if (!question || question.quizId !== attempt.quizId) return json({ message: 'Question not found.' }, 404)
    const answerText = String(body.answer ?? '').trim()
    if (!answerText) return json({ message: 'Answer is required.' }, 422)
    const timeMs = Math.max(0, num(body.time_ms) || 0)
    const correct = answersMatch(question, answerText)
    const existing = await store.getAnswer(attempt.id, question.id)
    const firstTime = !existing?.firstAnswer
    const nextIncorrect = (existing?.incorrectAttempts || 0) + (correct ? 0 : 1)
    const revealAllowed = correct || nextIncorrect >= 2
    const thread = Array.isArray(existing?.tutorThread) ? [...existing.tutorThread] : parseJsonArray(existing?.tutorThread)
    const feedback = await tutorReply({
      meta: {
        gradeLabel: quiz.gradeLabel,
        subject: quiz.subjectLabel,
        lesson: quiz.lessonTitle,
        topic: quiz.topicTitle,
      },
      question,
      studentAnswer: answerText,
      isCorrect: correct,
      attempted: true,
      hintCount: (existing?.hintCount || 0) + (correct ? 0 : 1),
      incorrectAttempts: nextIncorrect,
      revealAllowed,
      chatMessage: correct
        ? 'I submitted this answer. Confirm if it is correct and explain why, then briefly reinforce the idea.'
        : 'I submitted this answer. It may be wrong. Help me reason without giving the answer yet unless I have already tried enough.',
    })
    thread.push({ role: 'student', content: `Answer: ${answerText}` }, { role: 'assistant', content: feedback })
    const saved = await store.saveAnswer({
      attemptId: attempt.id,
      questionId: question.id,
      firstAnswer: firstTime ? answerText : existing.firstAnswer,
      firstIsCorrect: firstTime ? correct : existing.firstIsCorrect,
      latestAnswer: answerText,
      isCorrect: correct,
      timeMs: (existing?.timeMs || 0) + timeMs,
      hintCount: (existing?.hintCount || 0) + (correct ? 0 : 1),
      incorrectAttempts: nextIncorrect,
      revealed: Boolean(existing?.revealed || revealAllowed),
      tutorThread: thread,
    })
    const questions = await store.getQuizQuestions(attempt.quizId)
    const idx = questions.findIndex((q) => q.id === question.id)
    await store.updateAttempt(attempt.id, { currentIndex: Math.max(attempt.currentIndex, idx) })
    return json({
      is_correct: correct,
      first_is_correct: saved.firstIsCorrect,
      revealed: saved.revealed,
      hint_count: saved.hintCount,
      incorrect_attempts: saved.incorrectAttempts,
      feedback,
      explanation: saved.revealed || correct ? question.explanation : null,
      correct_answer: saved.revealed || correct ? question.correctAnswer : null,
    })
  }

  if (a === 'student' && b === 'quiz-attempts' && c && d === 'tutor' && method === 'POST') {
    const auth = await requireUser(request, 'student')
    if (auth.error) return auth.error
    const attempt = await store.getAttempt(num(c))
    if (!attempt || attempt.studentId !== auth.user.id) return json({ message: 'Attempt not found.' }, 404)
    const quiz = await store.getQuiz(attempt.quizId)
    const body = await readJson(request)
    const question = await store.getQuestion(num(body.question_id))
    if (!question || question.quizId !== attempt.quizId) return json({ message: 'Question not found.' }, 404)
    const message = String(body.message || '').trim()
    if (!message) return json({ message: 'message is required.' }, 422)
    const existing = await store.getAnswer(attempt.id, question.id)
    const attempted = Boolean(existing?.firstAnswer)
    const incorrectAttempts = existing?.incorrectAttempts || 0
    const revealAllowed = Boolean(existing?.revealed || existing?.isCorrect || incorrectAttempts >= 2)
    const reply = await tutorReply({
      meta: {
        gradeLabel: quiz.gradeLabel,
        subject: quiz.subjectLabel,
        lesson: quiz.lessonTitle,
        topic: quiz.topicTitle,
      },
      question,
      studentAnswer: existing?.latestAnswer,
      isCorrect: Boolean(existing?.isCorrect),
      attempted,
      hintCount: existing?.hintCount || 0,
      incorrectAttempts,
      revealAllowed,
      chatMessage: attempted ? message : `I have not submitted an answer yet. ${message}`,
    })
    const thread = Array.isArray(existing?.tutorThread) ? [...existing.tutorThread] : []
    thread.push({ role: 'student', content: message }, { role: 'assistant', content: reply })
    await store.saveAnswer({
      attemptId: attempt.id,
      questionId: question.id,
      firstAnswer: existing?.firstAnswer || null,
      firstIsCorrect: existing?.firstIsCorrect ?? null,
      latestAnswer: existing?.latestAnswer || null,
      isCorrect: Boolean(existing?.isCorrect),
      timeMs: existing?.timeMs || 0,
      hintCount: attempted ? (existing?.hintCount || 0) + 1 : existing?.hintCount || 0,
      incorrectAttempts: existing?.incorrectAttempts || 0,
      revealed: Boolean(existing?.revealed),
      tutorThread: thread,
    })
    return json({ reply, attempted, reveal_allowed: revealAllowed })
  }

  if (a === 'student' && b === 'quiz-attempts' && c && d === 'complete' && method === 'POST') {
    const auth = await requireUser(request, 'student')
    if (auth.error) return auth.error
    const attempt = await store.getAttempt(num(c))
    if (!attempt || attempt.studentId !== auth.user.id) return json({ message: 'Attempt not found.' }, 404)
    const updated = await completeAttempt(attempt.id)
    return json(await studentAttemptPayload(updated, { includeSecrets: true }))
  }

  return null
}
