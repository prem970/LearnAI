function trimSlash(value) {
  return String(value || '').trim().replace(/\/$/, '')
}

function azureConfig() {
  const rawEndpoint = trimSlash(process.env.AZURE_OPENAI_ENDPOINT)
  const apiKey = String(process.env.AZURE_OPENAI_API_KEY || '').trim()
  const deployment = String(process.env.AZURE_OPENAI_DEPLOYMENT || 'model-router').trim()
  const apiVersion = String(process.env.AZURE_OPENAI_API_VERSION || '').trim()
  const resourceBase = rawEndpoint
    .replace(/\/openai\/v1$/i, '')
    .replace(/\/openai$/i, '')
  const deployments = [...new Set([deployment, 'model-router'].filter(Boolean))]
  return { rawEndpoint, resourceBase, apiKey, deployment, deployments, apiVersion }
}

function azureDateVersion(version) {
  return /^20\d{2}-\d{2}-\d{2}/.test(version) ? version : '2024-10-21'
}

function azureChatTargets() {
  const { resourceBase, deployments, apiVersion } = azureConfig()
  const version = azureDateVersion(apiVersion)
  const targets = []
  for (const name of deployments) {
    targets.push({
      url: `${resourceBase}/openai/v1/chat/completions`,
      modelInBody: true,
      model: name,
    })
    targets.push({
      url: `${resourceBase}/openai/deployments/${encodeURIComponent(name)}/chat/completions?api-version=${version}`,
      modelInBody: false,
      model: name,
    })
  }
  return targets
}

function azureHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'api-key': apiKey,
    Authorization: `Bearer ${apiKey}`,
  }
}

export function openaiKey() {
  return azureConfig().apiKey || process.env.OPENAI_API_KEY || ''
}

export async function chatCompletion({ systemPrompt, messages, maxTokens = 1024 }) {
  const { resourceBase, apiKey, deployment } = azureConfig()
  if (!resourceBase || !apiKey) {
    const err = new Error(
      'Azure model router is not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT.',
    )
    err.status = 500
    throw err
  }

  const payloadMessages = [{ role: 'system', content: systemPrompt }, ...messages]
  let lastError = null

  for (const target of azureChatTargets()) {
    const body = {
      messages: payloadMessages,
      max_completion_tokens: maxTokens,
    }
    if (target.modelInBody) body.model = target.model

    const response = await fetch(target.url, {
      method: 'POST',
      headers: azureHeaders(apiKey),
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (response.ok) {
      return {
        answer: data?.choices?.[0]?.message?.content || '',
        usage: data?.usage || null,
        routedModel: data?.model || deployment,
        raw: data,
      }
    }

    lastError = data?.error?.message || `Azure chat failed (${response.status})`
    if (response.status === 401 || response.status === 403) break
  }

  const err = new Error(lastError || 'Azure model router request failed.')
  err.status = 502
  throw err
}

export { transcribeAudio } from './azureSpeech.js'
