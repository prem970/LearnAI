import { prisma } from './prisma.js'

export async function syncTeacherRating(teacherId) {
  const agg = await prisma.teacherRating.aggregate({
    where: { teacherId },
    _avg: { rating: true },
    _count: { rating: true },
  })
  const avg = agg._avg.rating == null ? null : Math.round(agg._avg.rating * 100) / 100
  await prisma.teacherProfile.updateMany({
    where: { userId: teacherId },
    data: { rating: avg },
  })
  return { avg, count: agg._count.rating }
}
