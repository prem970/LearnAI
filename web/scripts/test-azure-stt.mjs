import { readFileSync } from 'fs'

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const endpoint = String(env.AZURE_SPEECH_TO_TEXT_ENDPOINT || '').replace(/\/$/, '')
const apiKey = env.AZURE_SPEECH_TO_TEXT_API_KEY || ''
const wavPath = `${process.env.TEMP}/learnai-stt-test.wav`
const wav = readFileSync(wavPath)
const blob = new Blob([wav], { type: 'audio/wav' })

console.log('Host:', new URL(`${endpoint}/`).host)
console.log('WAV bytes:', wav.length)

const form = new FormData()
form.append('audio', blob, 'test.wav')
form.append('definition', JSON.stringify({ locales: ['en-US'] }))

const fastRes = await fetch(
  `${endpoint}/speechtotext/transcriptions:transcribe?api-version=2024-11-15`,
  {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': apiKey, Accept: 'application/json' },
    body: form,
  },
)
const fastText = await fastRes.text()
let fastJson
try {
  fastJson = JSON.parse(fastText)
} catch {
  fastJson = fastText.slice(0, 800)
}

console.log('\nFast transcription HTTP', fastRes.status)
if (fastJson && typeof fastJson === 'object') {
  console.log('transcript:', fastJson?.combinedPhrases?.[0]?.text || '(none)')
  if (!fastJson?.combinedPhrases?.[0]?.text) {
    console.log(JSON.stringify(fastJson).slice(0, 700))
  }
} else {
  console.log(String(fastJson).slice(0, 700))
}

const shortRes = await fetch(
  `${endpoint}/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple`,
  {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'audio/wav',
      Accept: 'application/json',
    },
    body: wav,
  },
)
const shortText = await shortRes.text()
let shortJson
try {
  shortJson = JSON.parse(shortText)
} catch {
  shortJson = shortText.slice(0, 800)
}

console.log('\nShort audio REST HTTP', shortRes.status)
if (shortJson && typeof shortJson === 'object') {
  console.log('DisplayText:', shortJson.DisplayText || shortJson.displayText || '(none)')
  console.log('RecognitionStatus:', shortJson.RecognitionStatus || '')
  if (!shortJson.DisplayText) console.log(JSON.stringify(shortJson).slice(0, 700))
} else {
  console.log(String(shortJson).slice(0, 700))
}
