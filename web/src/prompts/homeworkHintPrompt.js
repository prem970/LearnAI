import { LEARN_AI_INSTRUCTIONS, buildTeacherSystemPrompt } from './teacherSystemPrompt.js'

/**
 * Extra rules for homework photos: read the problem, hint only, never the answer.
 */
export const HOMEWORK_PHOTO_INSTRUCTIONS = `## Homework photo mode
- The student uploaded a photo of homework or a textbook problem (and may add a short note).
- First, briefly restate what you can read from the image in 1–2 lines so they know you understood.
- If the image is blank, blurry, cropped, or unreadable: say so clearly and ask for a clearer photo. Do not invent a problem.
- Then give ONLY the next useful hint or 1–2 short guiding questions so they can take the next step themselves.
- Never write the final numeric answer, the completed working, a full solution, or copy finished homework.
- Never solve every sub-part in one reply. One step at a time.
- If they ask “just give the answer” or “solve it for me”, refuse the shortcut. Give a stronger hint and ask what they have tried.
- Wrong attempt in follow-ups: say what is wrong and why (1–2 sentences), then the thinking direction — not the finished working.
- After two genuine attempts in this thread, you may give a stronger hint or a similar worked example that is NOT the same homework item.
- Right attempt: briefly say why it is right, then the next small step or a short check question.
- Match the student’s language (including Hindi or Hinglish if they use it).
- Keep replies short and encouraging.`

/**
 * Builds the system prompt for Gemini homework-photo hint sessions.
 * Reuses teacher style / difficulty from the Learn chat prompt, then appends photo rules.
 */
export function buildHomeworkHintSystemPrompt(options = {}) {
  const base = buildTeacherSystemPrompt({
    ...options,
    responseMode: 'text',
  })
  return `${base}

${HOMEWORK_PHOTO_INSTRUCTIONS}`
}

/**
 * User-facing text payload for the first photo turn (or follow-ups with a note).
 */
export function buildHomeworkHintUserText(note, context = {}) {
  const {
    grade,
    board,
    subject,
    lesson,
    lessonTopics = [],
    difficultyLevel,
    extra,
  } = context

  const topics = Array.isArray(lessonTopics) && lessonTopics.length
    ? lessonTopics.map((t) => `- ${t}`).join('\n')
    : '- (none listed)'

  const noteLine = String(note || '').trim()
    ? `Student note (what they are stuck on):\n${String(note).trim()}`
    : 'Student note: (none — help them start from the photo)'

  const extraLine = extra ? `\nExtra: ${extra}` : ''

  return `Context (use this; do not ask the student to confirm it)
- Grade: ${grade || 'not specified'}
- Board: ${board || 'not specified'}
- Subject: ${subject || 'not specified'}
- Current lesson / syllabus topic: ${lesson || 'not specified'}
- Topics in this lesson:
${topics}
- Difficulty: ${difficultyLevel || 'beginner'}
- Reply format: text
- Mode: homework photo hints only${extraLine}

${noteLine}

Remember: hints and next steps only — never the final answer or full solution.`
}

export { LEARN_AI_INSTRUCTIONS }
