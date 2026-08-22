const { readFileSync } = require('fs')
const { join } = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const BOARDS = [
  { name: 'Central Board of Secondary Education (CBSE – India)', slug: 'cbse', grade: 'Class 7' },
  { name: 'College Board (US Curriculum / Advanced Placement)', slug: 'college-board', grade: 'Grade 7' },
  { name: 'International Baccalaureate (IB – Global)', slug: 'ib', grade: 'MYP Year 2 (Grade 7)' },
  { name: 'Cambridge Assessment International Education (IGCSE / A-Levels)', slug: 'cambridge', grade: 'Lower Secondary (Stage 8)' },
  { name: 'Pearson Edexcel (UK / International)', slug: 'pearson-edexcel', grade: 'Lower Secondary (Year 8)' },
]

const BOARD_FROM_SYLLABUS = {
  CBSE: 'cbse',
  'US Curriculum / College Board': 'college-board',
  'International Baccalaureate': 'ib',
  'Cambridge (CAIE)': 'cambridge',
  'Pearson Edexcel': 'pearson-edexcel',
}

function subjectMeta(raw) {
  let label = String(raw || '').trim()
  const lower = label.toLowerCase()
  if (lower.includes('science') || lower === 'sciences') label = 'Science'
  const key = label.toLowerCase().replace(/\s+/g, ' ')
  return { key, label }
}

async function main() {
  for (const board of BOARDS) {
    const row = await prisma.board.upsert({
      where: { slug: board.slug },
      update: { name: board.name },
      create: { slug: board.slug, name: board.name },
    })
    await prisma.boardGrade.upsert({
      where: { boardId_label: { boardId: row.id, label: board.grade } },
      update: { canonicalLevel: 7, sortOrder: 7 },
      create: { boardId: row.id, label: board.grade, canonicalLevel: 7, sortOrder: 7 },
    })
  }

  let rows = []
  try {
    rows = JSON.parse(readFileSync(join(__dirname, 'sample_syllabus.json'), 'utf8'))
  } catch {
    console.warn('sample_syllabus.json not found; boards only.')
  }

  for (const row of rows) {
    const slug = BOARD_FROM_SYLLABUS[row.board]
    if (!slug) continue
    if (String(row.unit || '').toLowerCase().includes('diagram')) continue
    const topics = (row.topics || []).filter((t) => t && !String(t).toLowerCase().includes('diagram'))
    if (!topics.length) continue

    const board = await prisma.board.findUnique({ where: { slug } })
    const grade = await prisma.boardGrade.findFirst({ where: { boardId: board.id } })
    const { key, label } = subjectMeta(row.subject)
    const subject = await prisma.subject.upsert({
      where: { key },
      update: { label },
      create: { key, label },
    })

    const curriculum = await prisma.curriculum.upsert({
      where: {
        boardId_gradeId_subjectId: {
          boardId: board.id,
          gradeId: grade.id,
          subjectId: subject.id,
        },
      },
      update: { grade: grade.label },
      create: {
        boardId: board.id,
        gradeId: grade.id,
        grade: grade.label,
        subjectId: subject.id,
      },
    })

    let unit = await prisma.curriculumUnit.findFirst({
      where: { curriculumId: curriculum.id, title: row.unit },
    })
    if (!unit) {
      const count = await prisma.curriculumUnit.count({ where: { curriculumId: curriculum.id } })
      unit = await prisma.curriculumUnit.create({
        data: { curriculumId: curriculum.id, title: row.unit, sortOrder: count },
      })
    }
    for (const topic of topics) {
      const exists = await prisma.curriculumUnitTopic.findFirst({
        where: { curriculumUnitId: unit.id, title: topic },
      })
      if (exists) continue
      const tCount = await prisma.curriculumUnitTopic.count({ where: { curriculumUnitId: unit.id } })
      await prisma.curriculumUnitTopic.create({
        data: { curriculumUnitId: unit.id, title: topic, sortOrder: tCount },
      })
    }
  }

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
