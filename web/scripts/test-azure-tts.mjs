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

const endpoint = String(env.AZURE_TEXT_TO_SPEECH_ENDPOINT || '').replace(/\/$/, '')
const apiKey = env.AZURE_TEXT_TO_SPEECH_API_KEY || ''
const voices = [
  'en-US-AvaMultilingualNeural',
  'en-US-EmmaMultilingualNeural',
  'en-US-SerenaMultilingualNeural',
  'en-US-AndrewMultilingualNeural',
  'en-US-BrianMultilingualNeural',
  'en-US-AlloyTurboMultilingualNeural',
]

const url = `${endpoint}/tts/cognitiveservices/v1`
for (const voice of voices) {
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${voice}"><mstts:express-as style="friendly"><prosody rate="-6%">Hi, I am your tutor.</prosody></mstts:express-as></voice></speak>`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-160kbitrate-mono-mp3',
      'User-Agent': 'LearnAI',
    },
    body: ssml,
  })
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(voice, res.status, res.ok ? `audio ${buf.length}` : buf.toString('utf8').slice(0, 280))
}
