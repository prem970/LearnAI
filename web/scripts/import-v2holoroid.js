const { readFileSync } = require('fs')
const { join } = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const DUMP_PATH = join(__dirname, '..', 'prisma', 'data', 'v2holoroid.mysql.sql')

const IMPORT_ORDER = [
  'boards',
  'subjects',
  'institutions',
  'board_grades',
  'users',
  'curriculum',
  'curriculum_units',
  'curriculum_unit_topics',
  'teacher_profiles',
  'student_profiles',
  'teacher_ratings',
  'learn_turns',
  'quizzes',
  'quiz_questions',
  'quiz_attempts',
  'quiz_attempt_answers',
  'student_learning_recs',
]

const TRUNCATE_ORDER = [...IMPORT_ORDER].reverse()

const BOOLEAN_COLUMNS = {
  users: ['otp_verified'],
  teacher_profiles: ['onboarding_completed'],
  quiz_attempt_answers: ['first_is_correct', 'is_correct', 'revealed'],
}

const JSON_COLUMNS = {
  teacher_profiles: ['grades', 'subjects', 'tune_preferences'],
  learn_turns: ['topics'],
  quizzes: ['insights_json'],
  quiz_questions: ['options'],
  quiz_attempts: ['summary_json'],
  quiz_attempt_answers: ['tutor_thread'],
}

const SKIP_COLUMNS = {
  teacher_ratings: ['chat_message_id'],
}

function readDump() {
  return readFileSync(DUMP_PATH, 'utf8')
}

function extractInsertStatements(sql, tableName) {
  const marker = `INSERT INTO \`${tableName}\``
  const statements = []
  let searchFrom = 0

  while (searchFrom < sql.length) {
    const start = sql.indexOf(marker, searchFrom)
    if (start === -1) break

    let i = start
    let inString = false
    let end = -1

    while (i < sql.length) {
      const ch = sql[i]
      if (inString) {
        if (ch === '\\' && i + 1 < sql.length) {
          i += 2
          continue
        }
        if (ch === "'") {
          if (sql[i + 1] === "'") {
            i += 2
            continue
          }
          inString = false
        }
        i += 1
        continue
      }

      if (ch === "'") {
        inString = true
        i += 1
        continue
      }
      if (ch === ';') {
        end = i
        break
      }
      i += 1
    }

    if (end === -1) break
    statements.push(sql.slice(start, end + 1))
    searchFrom = end + 1
  }

  return statements
}

function stripBackticks(sql) {
  return sql.replace(/`/g, '')
}

function parseInsert(sql) {
  const stripped = stripBackticks(sql.trim())
  const headerMatch = stripped.match(/^INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*/is)
  if (!headerMatch) return null

  const table = headerMatch[1]
  const columns = headerMatch[2].split(',').map((c) => c.trim())
  const valuesPart = stripped.slice(headerMatch[0].length).replace(/;\s*$/, '')

  return { table, columns, rows: parseValueRows(valuesPart) }
}

function parseValueRows(valuesPart) {
  const rows = []
  let i = 0

  while (i < valuesPart.length) {
    while (i < valuesPart.length && valuesPart[i] !== '(') i += 1
    if (i >= valuesPart.length) break

    i += 1
    const values = []
    while (i < valuesPart.length && valuesPart[i] !== ')') {
      while (i < valuesPart.length && /[\s,]/.test(valuesPart[i])) i += 1
      if (i >= valuesPart.length || valuesPart[i] === ')') break

      if (valuesPart[i] === "'") {
        i += 1
        let value = ''
        while (i < valuesPart.length) {
          const ch = valuesPart[i]
          if (ch === '\\' && i + 1 < valuesPart.length) {
            const next = valuesPart[i + 1]
            if (next === "'") {
              value += "'"
              i += 2
              continue
            }
            value += next
            i += 2
            continue
          }
          if (ch === "'") {
            if (valuesPart[i + 1] === "'") {
              value += "'"
              i += 2
              continue
            }
            i += 1
            break
          }
          value += ch
          i += 1
        }
        values.push({ kind: 'string', value })
        continue
      }

      let token = ''
      while (i < valuesPart.length && valuesPart[i] !== ',' && valuesPart[i] !== ')') {
        token += valuesPart[i]
        i += 1
      }
      token = token.trim()
      if (!token) continue
      if (/^NULL$/i.test(token)) values.push({ kind: 'null' })
      else if (/^-?\d+(?:\.\d+)?$/.test(token)) values.push({ kind: 'number', value: token })
      else values.push({ kind: 'raw', value: token })
    }

    rows.push(values)
    i += 1
  }

  return rows
}

function sqlLiteral(value) {
  if (value.kind === 'null') return 'NULL'
  if (value.kind === 'number') return value.value
  if (value.kind === 'raw') return value.value
  return `'${value.value.replace(/'/g, "''")}'`
}

function transformInsert(parsed) {
  const { table, columns, rows } = parsed
  const skip = new Set(SKIP_COLUMNS[table] || [])
  const boolCols = new Set(BOOLEAN_COLUMNS[table] || [])
  const jsonCols = new Set(JSON_COLUMNS[table] || [])

  const keptIndexes = columns
    .map((col, index) => ({ col, index }))
    .filter(({ col }) => !skip.has(col))

  const keptColumns = keptIndexes.map(({ col }) => col)

  const pgRows = rows.map((row) => {
    return keptIndexes.map(({ col, index }) => {
      const cell = row[index]
      if (!cell) return 'NULL'

      if (boolCols.has(col)) {
        if (cell.kind === 'null') return 'NULL'
        if (cell.kind === 'number') return cell.value === '1' ? 'true' : 'false'
        if (cell.kind === 'raw') return cell.value === '1' ? 'true' : 'false'
      }

      if (jsonCols.has(col) && cell.kind === 'string') {
        return `${sqlLiteral(cell)}::jsonb`
      }

      return sqlLiteral(cell)
    })
  })

  if (!pgRows.length) return null

  const valuesSql = pgRows.map((row) => `(${row.join(', ')})`).join(',\n')
  return `INSERT INTO ${table} (${keptColumns.join(', ')}) VALUES\n${valuesSql}`
}

function buildPostgresInserts(sql) {
  const statements = []

  for (const table of IMPORT_ORDER) {
    const inserts = extractInsertStatements(sql, table)
    for (const insert of inserts) {
      const parsed = parseInsert(insert)
      if (!parsed || !parsed.rows.length) continue
      const pgInsert = transformInsert(parsed)
      if (pgInsert) statements.push({ table, sql: pgInsert })
    }
  }

  return statements
}

async function truncateTables() {
  for (const table of TRUNCATE_ORDER) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
  }
}

async function resetSequences() {
  for (const table of IMPORT_ORDER) {
    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('${table}', 'id'),
        COALESCE((SELECT MAX(id) FROM ${table}), 1),
        (SELECT COUNT(*) > 0 FROM ${table})
      )
    `)
  }
}

async function verifyCounts() {
  const expected = {
    boards: 5,
    board_grades: 5,
    subjects: 15,
    institutions: 1,
    curriculum: 22,
    curriculum_units: 55,
    curriculum_unit_topics: 341,
    users: 6,
    teacher_profiles: 5,
    student_profiles: 1,
    teacher_ratings: 1,
    learn_turns: 4,
    quizzes: 3,
    quiz_questions: 18,
    quiz_attempts: 2,
    quiz_attempt_answers: 7,
    student_learning_recs: 1,
  }

  console.log('\nRow counts:')
  for (const table of IMPORT_ORDER) {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM ${table}`)
    const count = rows[0].count
    const ok = expected[table] == null || count === expected[table]
    console.log(`  ${table}: ${count}${expected[table] != null ? ` (expected ${expected[table]})${ok ? '' : ' MISMATCH'}` : ''}`)
  }
}

async function main() {
  console.log(`Reading dump from ${DUMP_PATH}`)
  const dump = readDump()
  const statements = buildPostgresInserts(dump)

  if (!statements.length) {
    throw new Error('No INSERT statements found in dump')
  }

  console.log(`Prepared ${statements.length} INSERT statement(s)`)

  await prisma.$transaction(async (tx) => {
    console.log('Truncating existing data...')
    for (const table of TRUNCATE_ORDER) {
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
    }

    for (const { table, sql } of statements) {
      console.log(`Importing ${table}...`)
      await tx.$executeRawUnsafe(sql)
    }

    console.log('Resetting sequences...')
    for (const table of IMPORT_ORDER) {
      await tx.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('${table}', 'id'),
          COALESCE((SELECT MAX(id) FROM ${table}), 1),
          (SELECT COUNT(*) > 0 FROM ${table})
        )
      `)
    }
  }, {
    maxWait: 60000,
    timeout: 120000,
  })

  await verifyCounts()
  console.log('\nImport complete.')
}

main()
  .catch((error) => {
    console.error('Import failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
