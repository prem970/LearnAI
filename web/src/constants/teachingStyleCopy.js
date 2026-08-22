/**
 * Short copy for teachers: what each style tends to give learners (AI mirrors this in student chat).
 * Keys align with TeachingStyleDetector.php (plus common variants).
 */

const BLURBS = {
    socratic:
        'Learners get questions and back-and-forth dialogue—so they discover ideas themselves and build reasoning, not just answers.',
    storytelling:
        'Stories, scenes, and narrative hooks turn facts into something memorable and human, so ideas stick after the lesson ends.',
    'concept-first':
        'The big idea and “why it matters” come first; details attach to a mental model so students understand, not only recall.',
    'exam-oriented':
        'Explanations stress what counts for mastery and exams—precision, wording, and what examiners look for.',
    visual:
        'Abstract topics become images, analogies, and spatial language so students can picture relationships and steps.',
    'structured-conceptual':
        'Clear order: definitions, steps, and rules in sequence—easy to follow, revise, and build into larger topics.',
    general:
        'A steady, approachable mix of clarity and support—meeting learners where they are without a rigid single formula.',
}

function normalizeStyleKey(raw) {
    if (raw == null) return 'general'
    const s = String(raw).trim()
    if (!s || s === '—') return 'general'
    const t = s.toLowerCase()

    if (t.includes('socratic')) return 'socratic'
    if (t.includes('story')) return 'storytelling'
    if (t.includes('concept-first') || t.includes('concept first')) return 'concept-first'
    if (t.includes('exam')) return 'exam-oriented'
    if (t.includes('visual')) return 'visual'
    if (t.includes('structured') || (t.includes('conceptual') && !t.includes('concept-first'))) {
        return 'structured-conceptual'
    }
    if (t === 'general') return 'general'

    return null
}

/**
 * @param {string | null | undefined} detectedStyle — e.g. from profile.detected_teaching_style
 * @returns {{ title: string, blurb: string }}
 */
export function getTeachingStyleDisplay(detectedStyle) {
    const title = detectedStyle?.trim() || '—'
    if (!title || title === '—') {
        return {
            title: '—',
            blurb: 'Complete onboarding with a short teaching sample so we can label your style and tune what students hear.',
        }
    }

    const key = normalizeStyleKey(title)
    if (key && BLURBS[key]) {
        return { title, blurb: BLURBS[key] }
    }

    return {
        title,
        blurb: `Your AI tutor mirrors this “${title}” approach so explanations feel aligned with how you teach—not a generic voice.`,
    }
}
