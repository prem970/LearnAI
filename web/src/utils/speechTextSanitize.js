/**
 * Strip LaTeX-style math markers and common commands so TTS / D-ID read natural language,
 * not "backslash" or raw \( ... \).
 */
function applyLatexStripping(t) {
  if (t == null || typeof t !== 'string') return ''

  // Inline/block math delimiters (most common source of spoken "backslash")
  t = t.replace(/\\\(/g, ' ')
  t = t.replace(/\\\)/g, ' ')
  t = t.replace(/\\\[/g, ' ')
  t = t.replace(/\\\]/g, ' ')

  // \text{...} / \mathrm{...}
  t = t.replace(/\\text\{([^}]*)\}/gi, '$1')
  t = t.replace(/\\mathrm\{([^}]*)\}/gi, '$1')

  // \frac{a}{b}
  t = t.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 over $2')

  // Common symbols (worded for speech)
  t = t.replace(/\\times/gi, ' times ')
  t = t.replace(/\\cdot/gi, ' times ')
  t = t.replace(/\\div/gi, ' divided by ')
  t = t.replace(/\\pm/gi, ' plus or minus ')
  t = t.replace(/\\leq/gi, ' is less than or equal to ')
  t = t.replace(/\\geq/gi, ' is greater than or equal to ')
  t = t.replace(/\\neq/gi, ' is not equal to ')
  t = t.replace(/\\approx/gi, ' approximately ')
  t = t.replace(/\\infty/gi, ' infinity ')
  t = t.replace(/\\sqrt\{([^}]*)\}/g, ' square root of $1 ')
  t = t.replace(/\\sqrt/gi, ' square root of ')

  // Line breaks in LaTeX
  t = t.replace(/\\\\/g, ' ')

  // Remaining \commandName → drop command, keep readability
  t = t.replace(/\\([a-zA-Z]+)/g, ' ')

  // Stray backslashes
  t = t.replace(/\\/g, ' ')

  return t
}

export function sanitizeMathForSpeech(text) {
  const t = applyLatexStripping(text)
  return t.replace(/\s+/g, ' ').trim()
}

function addStructuredLineBreaks(text) {
  let t = text

  // Put common teaching labels on their own lines when the model returns them inline.
  const sectionLabels = [
    'Definition',
    'Example',
    'Expression',
    'Final Result',
    'Key Takeaway',
    'Remember',
    'Conclusion',
  ]

  sectionLabels.forEach((label) => {
    const re = new RegExp(`(?<!\\*\\*)\\s*\\b${label}\\s*:`, 'gi')
    t = t.replace(re, `\n\n**${label}:** `)
  })

  // Break each numbered step onto a new line and normalize missing spaces after the colon.
  t = t.replace(/\s*Step\s*(\d+)\s*:/gi, '\n\n**Step $1:** ')

  return t
}

/**
 * LaTeX stripped like speech, but newlines kept so steps/lists stay readable.
 * Use before rendering Markdown-style **bold** in the UI.
 */
export function formatAnswerForDisplay(text) {
  let t = applyLatexStripping(text)
  t = addStructuredLineBreaks(t)
  t = t.replace(/[^\S\n]+/g, ' ')
  t = t.replace(/\n +/g, '\n')
  // Space after . or : only when the next character is a letter (not * from **bold**)
  t = t.replace(/([.:])(?=[A-Za-z])/g, '$1 ')
  t = t.replace(/\*\*\s+/g, '**')
  t = t.replace(/([^\s*])\s+\*\*/g, '$1**')
  t = t.replace(/\n{3,}/g, '\n\n')
  return t.replace(/^\n+/, '').trim()
}
