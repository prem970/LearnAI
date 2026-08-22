export function json(data, status = 200) {
  return Response.json(data, { status })
}

export function parseJsonArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function titleCase(input) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function slugKey(input) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}
