function trimSlash(value) {
  return String(value || '').trim().replace(/\/$/, '')
}

function speechConfig() {
  return {
    endpoint: trimSlash(process.env.AZURE_SPEECH_TO_TEXT_ENDPOINT),
    apiKey: String(process.env.AZURE_SPEECH_TO_TEXT_API_KEY || '').trim(),
  }
}

function toAzureLocale(language) {
  const raw = String(language || 'en').trim().toLowerCase()
  if (!raw) return 'en-US'
  if (/^[a-z]{2}-[a-z]{2}$/i.test(raw)) return raw
  const map = {
    en: 'en-US',
    hi: 'hi-IN',
    ta: 'ta-IN',
    te: 'te-IN',
    kn: 'kn-IN',
    ml: 'ml-IN',
    mr: 'mr-IN',
    bn: 'bn-IN',
    gu: 'gu-IN',
    pa: 'pa-IN',
    ur: 'ur-IN',
  }
  return map[raw] || 'en-US'
}

function extractFastTranscript(data) {
  const combined = data?.combinedPhrases?.[0]?.text
  if (combined) return String(combined).trim()
  const phrases = Array.isArray(data?.phrases)
    ? data.phrases.map((p) => p.text).filter(Boolean).join(' ')
    : ''
  return String(phrases || data?.text || data?.DisplayText || '').trim()
}

async function fileToBlob(file) {
  if (file instanceof Blob) return file
  const buf = Buffer.from(await file.arrayBuffer())
  return new Blob([buf], { type: file.type || 'audio/webm' })
}

/**
 * Azure Speech REST (fast transcription, then short-audio fallback).
 */
export async function transcribeAudio(file, language) {
  const { endpoint, apiKey } = speechConfig()
  if (!endpoint || !apiKey) {
    const err = new Error(
      'Azure Speech is not configured. Set AZURE_SPEECH_TO_TEXT_ENDPOINT and AZURE_SPEECH_TO_TEXT_API_KEY.',
    )
    err.status = 500
    throw err
  }

  const locale = toAzureLocale(language)
  const audio = await fileToBlob(file)
  const filename = file.name || `speech-${Date.now()}.webm`

  const fastForm = new FormData()
  fastForm.append('audio', audio, filename)
  fastForm.append('definition', JSON.stringify({ locales: [locale] }))

  const fastUrl = `${endpoint}/speechtotext/transcriptions:transcribe?api-version=2024-11-15`
  const fastRes = await fetch(fastUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      Accept: 'application/json',
    },
    body: fastForm,
  })
  const fastData = await fastRes.json().catch(() => ({}))
  if (!fastRes.ok) {
    const err = new Error(fastData?.error?.message || `Azure Speech failed (${fastRes.status}).`)
    err.status = fastRes.status
    throw err
  }

  const text = extractFastTranscript(fastData)
  if (!text) {
    const err = new Error('Could not detect speech in audio.')
    err.status = 422
    throw err
  }
  return text
}
