import { chatCompletion } from './openai.js'

const STYLES = ['Socratic', 'Storytelling', 'Concept-first', 'Exam-oriented', 'Visual explanation', 'Structured/Conceptual', 'General']

function heuristic(text) {
  const t = text.toLowerCase()
  const scores = {
    Socratic: (t.match(/\bwhy\b|\bwhat if\b|\bask\b|\bquestion\b/g) || []).length,
    Storytelling: (t.match(/\bstory\b|\bimagine\b|\bonce\b|\bexample from life\b/g) || []).length,
    'Concept-first': (t.match(/\bconcept\b|\bfirst understand\b|\bidea behind\b/g) || []).length,
    'Exam-oriented': (t.match(/\bexam\b|\bmarks\b|\bboard\b|\bformula\b/g) || []).length,
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  if (!best || best[1] === 0) return { style: 'General', ai_confidence: null, ai_reason: null }
  return { style: best[0], ai_confidence: null, ai_reason: null }
}

export async function detectTeachingStyle(teachingExplanation) {
  try {
    const { answer } = await chatCompletion({
      systemPrompt: `Classify the teacher's spoken explanation. Reply JSON only with keys style, confidence (0-1), reason. style must be one of: ${STYLES.join(', ')} or a new Title Case label of at most 3 words.`,
      messages: [{ role: 'user', content: teachingExplanation.slice(0, 4000) }],
      maxTokens: 200,
    })
    const jsonMatch = answer.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
    if (!parsed?.style) return heuristic(teachingExplanation)
    return {
      style: String(parsed.style),
      ai_confidence: Number(parsed.confidence ?? 0),
      ai_reason: parsed.reason || null,
    }
  } catch {
    return heuristic(teachingExplanation)
  }
}
