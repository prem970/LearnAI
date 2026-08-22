function trimSlash(value) {
  return String(value || '').trim().replace(/\/$/, '')
}

function ttsConfig() {
  return {
    endpoint: trimSlash(process.env.AZURE_TEXT_TO_SPEECH_ENDPOINT),
    apiKey: String(process.env.AZURE_TEXT_TO_SPEECH_API_KEY || '').trim(),
  }
}

/** Natural multilingual Neural voices (less robotic than Indic Neural). */
export const AZURE_TTS_VOICES = {
  female: [
    { name: 'en-US-AvaMultilingualNeural', fallback: 'en-US-AvaNeural' },
    { name: 'en-US-EmmaMultilingualNeural', fallback: 'en-US-EmmaNeural' },
    { name: 'en-US-SerenaMultilingualNeural', fallback: 'en-US-NovaTurboMultilingualNeural' },
  ],
  male: [
    { name: 'en-US-AndrewMultilingualNeural', fallback: 'en-US-AndrewNeural' },
    { name: 'en-US-BrianMultilingualNeural', fallback: 'en-US-BrianNeural' },
    { name: 'en-US-AlloyTurboMultilingualNeural', fallback: 'en-US-SteffanMultilingualNeural' },
  ],
}

const DEV_TEACHER_VOICE_BY_NAME = {
  al: 'female',
  alice: 'female',
  bethell: 'male',
  david: 'male',
  maria: 'female',
  jacob: 'male',
}

export function inferTeacherGender(teacher) {
  const name = (teacher?.name || '').trim()
  if (!name) return 'female'
  const lower = name.toLowerCase()
  if (DEV_TEACHER_VOICE_BY_NAME[lower]) return DEV_TEACHER_VOICE_BY_NAME[lower]
  const tokens = lower.split(/\s+/).filter(Boolean)
  const firstRaw = tokens[0] === 'dr' || tokens[0] === 'prof' ? tokens[1] : tokens[0]
  const first = firstRaw || ''
  const last = tokens.length > 0 ? tokens[tokens.length - 1] : ''
  if (first && DEV_TEACHER_VOICE_BY_NAME[first]) return DEV_TEACHER_VOICE_BY_NAME[first]
  if (tokens.length > 1 && last && DEV_TEACHER_VOICE_BY_NAME[last]) return DEV_TEACHER_VOICE_BY_NAME[last]
  if (lower.startsWith('mr ') || lower.startsWith('mr. ')) return 'male'
  if (
    lower.startsWith('mrs ') ||
    lower.startsWith('mrs. ') ||
    lower.startsWith('ms ') ||
    lower.startsWith('ms. ') ||
    lower.startsWith('miss ')
  ) {
    return 'female'
  }
  const parts = name.split(/\s+/).map((p) => p.toLowerCase())
  const firstHeuristic = (parts[0] === 'dr' || parts[0] === 'prof' ? parts[1] : parts[0]) || ''
  const maleFirst = [
    'ravi',
    'anand',
    'suresh',
    'raj',
    'kumar',
    'david',
    'john',
    'james',
    'michael',
    'robert',
    'william',
    'joseph',
    'thomas',
    'daniel',
    'matthew',
    'jacob',
    'gary',
    'eric',
    'brian',
    'kevin',
    'steven',
    'mark',
    'paul',
    'arjun',
    'prabhat',
  ]
  const femaleFirst = [
    'priya',
    'lakshmi',
    'sita',
    'anita',
    'meera',
    'pooja',
    'alice',
    'maria',
    'aarti',
    'neerja',
  ]
  if (femaleFirst.some((n) => firstHeuristic.includes(n))) return 'female'
  if (maleFirst.some((n) => firstHeuristic.includes(n))) return 'male'
  return 'female'
}

/**
 * Distinct natural voices per gender; extra tutors share the last slot.
 */
export function azureVoiceForTeacher(teacher, peers = []) {
  const gender = inferTeacherGender(teacher)
  const pool = AZURE_TTS_VOICES[gender] || AZURE_TTS_VOICES.female
  const sameGender = (Array.isArray(peers) && peers.length ? peers : [teacher])
    .filter((t) => inferTeacherGender(t) === gender)
    .sort((a, b) => Number(a.id) - Number(b.id))
  const rank = Math.max(
    0,
    sameGender.findIndex((t) => Number(t.id) === Number(teacher.id)),
  )
  const slot = sameGender.length ? rank : 0
  return pool[Math.min(slot, pool.length - 1)]
}

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildSsml(voiceName, text, rate, { styled } = {}) {
  const spoken = escapeXml(text).slice(0, 8000)
  const numeric = Number(rate)
  const playback = Number.isFinite(numeric) && numeric > 0 ? numeric : 1
  const conversational = playback * 0.94
  const ratePct = Math.round((conversational - 1) * 100)
  const inner = `<prosody rate="${ratePct}%" pitch="+1%">${spoken}</prosody>`
  const body = styled
    ? `<mstts:express-as style="friendly" styledegree="1.15">${inner}</mstts:express-as>`
    : inner
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${voiceName}">${body}</voice></speak>`
}

async function postTts(url, apiKey, ssml) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-160kbitrate-mono-mp3',
      'User-Agent': 'LearnAI',
      Accept: 'audio/mpeg',
    },
    body: ssml,
  })
}

async function synthesizeOnce(endpoint, apiKey, voiceName, text, rate) {
  const urls = [`${endpoint}/tts/cognitiveservices/v1`, `${endpoint}/cognitiveservices/v1`]
  let lastError = null
  for (const styled of [true, false]) {
    const ssml = buildSsml(voiceName, text, rate, { styled })
    for (const url of urls) {
      const res = await postTts(url, apiKey, ssml)
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < 32) {
          lastError = new Error('Azure TTS returned empty audio.')
          continue
        }
        return buf
      }
      const errText = await res.text().catch(() => '')
      lastError = new Error(errText.slice(0, 400) || `Azure TTS failed (${res.status}).`)
      lastError.status = res.status
      if (res.status === 404) continue
      break
    }
  }
  throw lastError || new Error('Azure TTS failed.')
}

export async function synthesizeAzureTtsMp3({ teacher, peers, text, rate }) {
  const { endpoint, apiKey } = ttsConfig()
  if (!endpoint || !apiKey) {
    const err = new Error(
      'Azure Text to Speech is not configured. Set AZURE_TEXT_TO_SPEECH_ENDPOINT and AZURE_TEXT_TO_SPEECH_API_KEY.',
    )
    err.status = 500
    throw err
  }
  const spoken = String(text || '').trim()
  if (!spoken) {
    const err = new Error('Nothing to speak.')
    err.status = 422
    throw err
  }
  const voice = azureVoiceForTeacher(teacher, peers)
  try {
    return await synthesizeOnce(endpoint, apiKey, voice.name, spoken, rate)
  } catch (primary) {
    if (voice.fallback && voice.fallback !== voice.name) {
      return synthesizeOnce(endpoint, apiKey, voice.fallback, spoken, rate)
    }
    throw primary
  }
}
