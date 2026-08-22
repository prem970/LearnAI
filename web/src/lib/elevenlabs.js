export function elevenlabsKey() {
  return process.env.ELEVENLABS_API_KEY || ''
}

export function elevenlabsBase() {
  return (process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io').replace(/\/$/, '')
}

export async function createVoiceFromSample(file, voiceName) {
  const key = elevenlabsKey()
  if (!key) throw new Error('ElevenLabs API key not configured.')

  const form = new FormData()
  form.append('name', voiceName)
  form.append('files', file)

  const response = await fetch(`${elevenlabsBase()}/v1/voices/add`, {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: form,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.voice_id) {
    throw new Error(data?.detail?.message || data?.message || 'Voice cloning failed.')
  }
  return data.voice_id
}

export async function synthesizeToMp3(voiceId, text) {
  const key = elevenlabsKey()
  if (!key) throw new Error('ElevenLabs API key not configured.')

  const response = await fetch(`${elevenlabsBase()}/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': key,
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_TTS_MODEL || 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data?.detail?.message || data?.message || 'Text-to-speech failed.')
  }
  return Buffer.from(await response.arrayBuffer())
}
