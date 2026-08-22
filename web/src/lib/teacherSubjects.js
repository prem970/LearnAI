export function normalizeSubjectKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
}

export function teacherSubjectList(teacher) {
  const raw = teacher?.subjects ?? teacher?.teacherProfile?.subjects ?? []
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean)
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

export function matchTeacherSubject(subjectLabel, teacherSubjects) {
  const taught = teacherSubjectList({ subjects: teacherSubjects })
  const needle = normalizeSubjectKey(subjectLabel)
  if (!needle || !taught.length) return null
  const aliases = {
    maths: 'mathematics',
    math: 'mathematics',
    ela: 'english',
    sst: 'socialscience',
  }
  const canon = (value) => aliases[value] || value
  const n = canon(needle)
  return (
    taught.find((name) => {
      const key = canon(normalizeSubjectKey(name))
      if (!key) return false
      if (n === key) return true
      const [shorter, longer] = n.length <= key.length ? [n, key] : [key, n]
      if (shorter.length < 4) return false
      return longer.startsWith(shorter)
    }) || null
  )
}

export function subjectBelongsToTeacher(subjectLabel, teacher) {
  return Boolean(matchTeacherSubject(subjectLabel, teacherSubjectList(teacher)))
}

export function filterCurriculumForTeacher(subjects, teacher) {
  const taught = teacherSubjectList(teacher)
  if (!taught.length) return []
  return (subjects || []).filter((subj) =>
    matchTeacherSubject(subj?.label || subj?.name || subj?.key, taught),
  )
}
