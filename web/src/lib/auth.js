import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from './prisma.js'
import { json } from './http.js'

function secret() {
  return process.env.AUTH_SECRET || 'learnai-dev-secret-change-me'
}

export function signToken(userId, tokenVersion = 0) {
  const payload = `${userId}.${tokenVersion}`
  const sig = createHmac('sha256', secret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) {
    const legacy = token.match(/^fake-jwt-token-(\d+)$/)
    if (legacy) return { userId: Number(legacy[1]), tokenVersion: null }
    return null
  }
  const [userIdRaw, versionRaw, sig] = parts
  const payload = `${userIdRaw}.${versionRaw}`
  const expected = createHmac('sha256', secret()).update(payload).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return { userId: Number(userIdRaw), tokenVersion: Number(versionRaw) }
}

export function publicUser(user, extras = {}) {
  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    otp_verified: Boolean(user.otpVerified || user.emailVerifiedAt),
    ...extras,
  }
}

export async function getUserFromRequest(request) {
  const header = request.headers.get('authorization') || ''
  const match = header.match(/Bearer\s+(.+)/i)
  const token = match?.[1]?.trim()
  const parsed = verifyToken(token)
  if (!parsed?.userId) return null
  const user = await prisma.user.findUnique({ where: { id: parsed.userId } })
  if (!user) return null
  if (
    parsed.tokenVersion != null &&
    user.tokenVersion != null &&
    parsed.tokenVersion !== user.tokenVersion
  ) {
    return null
  }
  return user
}

export async function requireUser(request, role) {
  const user = await getUserFromRequest(request)
  if (!user) return { error: json({ message: 'Unauthorized.' }, 401) }
  if (role && user.role !== role) return { error: json({ message: 'Forbidden.' }, 403) }
  return { user }
}

export function sixDigitOtp() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

export function isDebug() {
  return process.env.APP_DEBUG === 'true' || process.env.NODE_ENV !== 'production'
}
