import { handleApi } from '@/lib/api'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request, context) {
  const { slug } = await context.params
  return handleApi(request, slug || [])
}

export async function POST(request, context) {
  const { slug } = await context.params
  return handleApi(request, slug || [])
}

export async function PATCH(request, context) {
  const { slug } = await context.params
  return handleApi(request, slug || [])
}

export async function DELETE(request, context) {
  const { slug } = await context.params
  return handleApi(request, slug || [])
}
