import { sanitizeMathForSpeech } from './sanitize.js'

function normalizeAvatarUrl(url) {
  if (!url) return url
  if (url.includes('res.cloudinary.com') && url.includes('/image/upload/')) {
    return url.replace('/image/upload/', '/image/upload/f_jpg/').replace(/\.(png|webp|jpeg)$/i, '.jpg')
  }
  return url
}

export async function generateDidTalk({ avatarUrl, text, voiceId }) {
  const key = process.env.D_ID_API_KEY
  if (!key) {
    const err = new Error('D-ID API key not configured.')
    err.status = 500
    throw err
  }

  const script = sanitizeMathForSpeech(text).slice(0, 7500)
  const sourceUrl = normalizeAvatarUrl(avatarUrl)
  const body = {
    source_url: sourceUrl,
    script: {
      type: 'text',
      input: script,
      provider: {
        type: 'microsoft',
        voice_id: voiceId || 'en-US-JennyNeural',
      },
    },
  }

  const auth = key.includes(':') ? `Basic ${Buffer.from(key).toString('base64')}` : `Basic ${key}`

  const create = await fetch('https://api.d-id.com/talks', {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const created = await create.json().catch(() => ({}))
  if (!create.ok) {
    const err = new Error(created?.message || created?.description || 'D-ID request failed.')
    err.status = 502
    err.details = created
    throw err
  }

  const talkId = created.id
  for (let i = 0; i < 80; i += 1) {
    await new Promise((r) => setTimeout(r, 2000))
    const poll = await fetch(`https://api.d-id.com/talks/${talkId}`, {
      headers: { Authorization: auth },
    })
    const data = await poll.json().catch(() => ({}))
    if (data.status === 'done' && data.result_url) {
      return {
        talk_id: talkId,
        status: 'done',
        script,
        source_url: sourceUrl,
        result_url: data.result_url,
      }
    }
    if (data.status === 'error' || data.status === 'rejected') {
      const err = new Error(data?.error?.description || 'D-ID generation failed.')
      err.status = 502
      err.details = data
      throw err
    }
  }

  return {
    talk_id: talkId,
    status: 'created',
    message: 'Video is still rendering. Try again shortly.',
    pending: true,
  }
}
