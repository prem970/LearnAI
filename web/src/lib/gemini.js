/**
 * Google Gemini client for multimodal homework photo hints.
 */

function geminiConfig() {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim()
  const model = String(process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim()
  return { apiKey, model }
}

/**
 * @param {object} options
 * @param {string} options.systemPrompt
 * @param {string} [options.text]
 * @param {string} [options.imageBase64]
 * @param {string} [options.mimeType]
 * @param {Array<{ role: string, content: string }>} [options.history]
 * @param {number} [options.maxTokens]
 */
export async function homeworkHintCompletion({
  systemPrompt,
  text = '',
  imageBase64,
  mimeType = 'image/jpeg',
  history = [],
  maxTokens = 1024,
}) {
  const { apiKey, model } = geminiConfig()
  if (!apiKey) {
    const err = new Error(
      'Gemini is not configured. Set GEMINI_API_KEY (and optionally GEMINI_MODEL).',
    )
    err.status = 500
    throw err
  }

  if (!imageBase64 && !String(text || '').trim() && (!history || history.length === 0)) {
    const err = new Error('A homework photo or a follow-up message is required.')
    err.status = 422
    throw err
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const generativeModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.6,
    },
  })

  const contents = []

  for (const turn of history || []) {
    const role = turn.role === 'assistant' ? 'model' : 'user'
    const content = String(turn.content || '').trim()
    if (!content) continue
    contents.push({
      role,
      parts: [{ text: content }],
    })
  }

  const userParts = []
  if (imageBase64) {
    userParts.push({
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: imageBase64,
      },
    })
  }
  const userText = String(text || '').trim()
  if (userText) {
    userParts.push({ text: userText })
  } else if (imageBase64) {
    userParts.push({
      text: 'Please look at this homework photo and help me with a hint only — do not give the final answer.',
    })
  }

  if (userParts.length) {
    contents.push({ role: 'user', parts: userParts })
  }

  if (!contents.length) {
    const err = new Error('Nothing to send to Gemini.')
    err.status = 422
    throw err
  }

  try {
    const result = await generativeModel.generateContent({ contents })
    const response = result.response
    const answer = response?.text?.() || ''
    const usageMeta = response?.usageMetadata || null

    return {
      answer,
      usage: usageMeta
        ? {
            prompt_tokens: usageMeta.promptTokenCount,
            completion_tokens: usageMeta.candidatesTokenCount,
            total_tokens: usageMeta.totalTokenCount,
          }
        : null,
      routedModel: model,
    }
  } catch (error) {
    const message = error?.message || 'Gemini homework hint request failed.'
    const err = new Error(message)
    err.status = /API key|permission|401|403/i.test(message) ? 502 : 502
    throw err
  }
}
