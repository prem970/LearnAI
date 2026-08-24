'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth.js'
import {
  RESPONSE_MODES,
  DIFFICULTY_LEVELS,
} from '../data/studentDashboardMock.js'
import { buildTeacherSystemPrompt, buildUserMessageWithContext } from '../prompts/teacherSystemPrompt.js'
import {
  buildStoryModeSystemPrompt,
  buildStoryModeUserMessage,
} from '../prompts/storyModePrompt.js'
import {
  buildHomeworkHintSystemPrompt,
  buildHomeworkHintUserText,
} from '../prompts/homeworkHintPrompt.js'
import {
  fetchStudentDashboard,
  fetchTeachers,
  fetchTeacherTtsAudio,
  dismissAllLearningRecs,
  fetchLearningRecs,
  generateDidVideo,
  sendChatMessage,
  sendHomeworkHint,
  sendVoiceChatMessage,
  submitSessionFeedback,
} from '../services/api.js'
import { didMicrosoftVoiceIdForGender } from '../constants/didMicrosoftVoices.js'
import FormattedAnswerText from '../components/FormattedAnswerText.jsx'
import HomeworkPhotoUploader from '../components/HomeworkPhotoUploader.jsx'
import LogoutReviewModal from '../components/LogoutReviewModal.jsx'
import StudentQuizHub from '../components/StudentQuizHub.jsx'
import { sanitizeMathForSpeech } from '../utils/speechTextSanitize.js'
import { filterCurriculumForTeacher, teacherSubjectList } from '../lib/teacherSubjects.js'
import {
  BoardShell,
  BoardHeader,
  FlapTab,
  FlapPanel,
  FlapPanelHead,
  FlapRow,
  FlapButton,
  FlapInput,
  IconLogout,
} from '../components/ui/Board.jsx'

/** Dev: fixed TTS gender for known demo teachers (lookup keys lowercase). */
const DEV_TEACHER_VOICE_BY_NAME = {
  al: 'female',
  alice: 'female',
  bethell: 'male',
  david: 'male',
  maria: 'female',
  jacob: 'male',
}

/** Listing uses `rating` + `rating_count` from GET /teachers (aggregated session reviews). */
function teacherRatingSummary(t) {
  if (!t) return 'No ratings yet'
  const r = t.rating
  const n = Number(t.rating_count ?? 0)
  if (r == null || r === '' || Number.isNaN(Number(r))) return 'No ratings yet'
  const avg = Number(r).toFixed(1)
  if (n > 0) return `${avg}/5 · ${n} review${n === 1 ? '' : 's'}`
  return `${avg}/5`
}

/**
 * Pick distinct male/female SpeechSynthesis voices. Browser/OS lists differ; we avoid
 * matching "Google US English Male" as female (substring "google us english" is too broad).
 */
function pickTtsMaleFemaleVoices(voices) {
  if (!voices?.length) {
    return { male: null, female: null }
  }

  const n = (v) => v.name.toLowerCase()

  const isClearlyMale = (v) => {
    const s = n(v)
    if (/\bfemale\b/.test(s)) return false
    if (/\bmale\b| male|male\)|microsoft david|microsoft mark|google uk english male|google us english male|english male/.test(s)) return true
    // "David" in "Microsoft David" etc.
    if (/\bdavid\b/.test(s) && !s.includes('female')) return true
    return false
  }

  const isClearlyFemale = (v) => {
    const s = n(v)
    if (isClearlyMale(v)) return false
    if (/\bmale\b| male|microsoft david\b/.test(s) && !/\bfemale\b/.test(s)) return false
    if (
      /\bfemale\b|zira|irina|hazel|susan|linda|samantha|victoria|karen|moira|tessa|fiona|google us english female|google uk english female/.test(s)
    ) {
      return true
    }
    if (['aria', 'kate', 'samantha', 'victoria'].some((h) => s.includes(h))) return true
    // "Google US English" without Male — often female on Chrome
    if (s.includes('google us english') && !s.includes('male')) return true
    return false
  }

  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'))
  const pool = en.length ? en : voices

  let male = pool.find(isClearlyMale) || null
  let female = pool.find(isClearlyFemale) || null

  // Hint-based fallback (narrow needles, lowercase)
  if (!male) {
    const maleHints = ['microsoft david', 'microsoft mark', 'google uk english male', 'daniel', 'fred']
    male = pool.find((v) => maleHints.some((h) => n(v).includes(h)))
  }
  if (!female) {
    const femaleHints = ['zira', 'irina', 'samantha', 'google us english female']
    female = pool.find((v) => femaleHints.some((h) => n(v).includes(h)))
  }

  const fallback = pool[0] || voices[0]
  if (!male) male = fallback
  if (!female) female = fallback

  // Ensure two different voices when the engine exposes more than one
  if (male && female && male.voiceURI === female.voiceURI && pool.length > 1) {
    const other = pool.find((v) => v.voiceURI !== male.voiceURI)
    if (other) {
      if (isClearlyMale(other) && !isClearlyFemale(other)) male = other
      else if (isClearlyFemale(other) && !isClearlyMale(other)) female = other
      else female = other
    }
  }

  return { male, female }
}


function LogoPlaceholder() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-7 h-7 border border-[var(--board-rule)] bg-[var(--flap-face)] flex items-center justify-center font-[family-name:var(--font-flap)] text-xs font-bold text-[var(--flap-amber)]">
        L
      </span>
      <span className="font-[family-name:var(--font-flap)] text-[15px] font-semibold tracking-[0.04em] uppercase text-[var(--flap-ink)]">
        LearnAI
      </span>
    </span>
  )
}

function StudentDashboard() {
  const { user, logout } = useAuth()
  const [dashboard, setDashboard] = useState(null)
  const [dashboardError, setDashboardError] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [teachers, setTeachers] = useState([])
  const [teachersError, setTeachersError] = useState(null)

  useEffect(() => {
    let isMounted = true
    setDashboardLoading(true)
    Promise.all([fetchStudentDashboard(), fetchTeachers()]).then(
      ([dashResult, teachersResult]) => {
        if (!isMounted) return
        const { data: dashData, error: dashError } = dashResult
        const { data: teachersData, error: teachersError } = teachersResult
        if (dashError?.status === 401 || teachersError?.status === 401) {
          logout()
          return
        }
        if (dashError) {
          setDashboardError(dashError.message || 'Failed to load dashboard.')
          setDashboard(null)
        } else {
          setDashboardError(null)
          setDashboard(dashData)
        }
        if (teachersError) {
          setTeachersError(teachersError.message || 'Failed to load teachers.')
          setTeachers([])
        } else {
          setTeachersError(null)
          setTeachers(Array.isArray(teachersData?.teachers) ? teachersData.teachers : [])
        }
        setDashboardLoading(false)
        fetchLearningRecs().then(({ data }) => {
          if (!isMounted) return
          setLearningRecs(Array.isArray(data?.recs) ? data.recs : [])
        })
      }
    )
    return () => { isMounted = false }
  }, [logout])

  const displayName = dashboard?.user?.name || user?.name || 'Student'
  const gradeLabel = dashboard?.user?.grade?.label || dashboard?.user?.grade || user?.grade || user?.current_grade || ''
  const boardLabel = dashboard?.user?.board?.name || ''

  const [learningMode, setLearningMode] = useState('home')
  const [learningRecs, setLearningRecs] = useState([])
  const [selectedSubject, setSelectedSubject] = useState(null)
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [selectedTeacher, setSelectedTeacher] = useState(null)
  const [responseMode, setResponseMode] = useState('text')
  const [difficultyLevel, setDifficultyLevel] = useState('beginner')
  const [teacherTopTool, setTeacherTopTool] = useState('teacher') // teacher | mode | difficulty
  const [teacherSearch, setTeacherSearch] = useState('')
  const [teacherStyle, setTeacherStyle] = useState('all') // all | style
  const [teacherSort, setTeacherSort] = useState('rating_desc') // rating_desc | rating_asc | name_asc
  const [qaThread, setQaThread] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [completedTopics, setCompletedTopics] = useState(new Set())
  const [doubtHistory, setDoubtHistory] = useState([])
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [logoutSubmitting, setLogoutSubmitting] = useState(false)
  const [logoutSubmitError, setLogoutSubmitError] = useState('')
  const [summary, setSummary] = useState(null)
  const [summarizing, setSummarizing] = useState(false)
  const [micRecording, setMicRecording] = useState(false)
  const [micLoading, setMicLoading] = useState(false)
  const [micError, setMicError] = useState('')
  const [ttsSpeaking, setTtsSpeaking] = useState(false)
  const [ttsPaused, setTtsPaused] = useState(false)
  const [ttsRate, setTtsRate] = useState(1)
  const [ttsActiveItemId, setTtsActiveItemId] = useState(null)
  const [ttsLoadingItemId, setTtsLoadingItemId] = useState(null)
  const [audioTextViewById, setAudioTextViewById] = useState({})

  // Student-side progressive panels (auto-collapse on selection)
  const [subjectOpen, setSubjectOpen] = useState(true)
  const [lessonOpen, setLessonOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [homeworkPanelOpen, setHomeworkPanelOpen] = useState(false)
  const [chatAttachOpen, setChatAttachOpen] = useState(false)
  const [homeworkUploaderKey, setHomeworkUploaderKey] = useState(0)
  const [homeworkSessionActive, setHomeworkSessionActive] = useState(false)

  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioChunksRef = useRef([])
  const ttsRateRef = useRef(1)
  const ttsVoicesRef = useRef({ male: null, female: null })
  const elevenLabsAudioRef = useRef(null)
  const elevenLabsObjectUrlRef = useRef(null)
  const lastHomeworkImageRef = useRef(null)

  useEffect(() => {
    ttsRateRef.current = ttsRate
  }, [ttsRate])

  useEffect(() => {
    if (!showLogoutModal) return
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [showLogoutModal])

  // Load male and female TTS voices (browser voices vary by OS)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices()
      ttsVoicesRef.current = pickTtsMaleFemaleVoices(voices)
    }
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    return () => { window.speechSynthesis.onvoiceschanged = null }
  }, [])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop()
      }
      mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop())
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const subjects = useMemo(() => {
    const all = dashboard?.subjects || []
    if (!selectedTeacher) return []
    return filterCurriculumForTeacher(all, selectedTeacher)
  }, [dashboard?.subjects, selectedTeacher])
  const lessons = selectedSubject?.units || []
  const topicList = selectedLesson?.topics?.map((t) => t.title) || []
  const learnMessageContext = {
    grade: gradeLabel || '7',
    board: boardLabel || 'Unknown board',
    subject: selectedSubject?.label || selectedSubject?.name,
    lesson: selectedLesson?.title,
    lessonTopics: topicList,
    difficultyLevel,
    responseMode,
  }

  const teacherStyles = useMemo(() => {
    const styles = Array.from(new Set((teachers || []).map((t) => t.style || 'General'))).sort()
    return ['all', ...styles]
  }, [teachers])

  const filteredTeachers = useMemo(() => {
    const q = teacherSearch.trim().toLowerCase()
    let list = teachers || []

    if (teacherStyle !== 'all') {
      list = list.filter((t) => t.style === teacherStyle)
    }

    if (q) {
      list = list.filter((t) => {
        const hay = `${t.name} ${t.school} ${t.style}`.toLowerCase()
        return hay.includes(q)
      })
    }

    const sorted = [...list]
    const ratingOr0 = (x) => (Number.isFinite(Number(x?.rating)) ? Number(x.rating) : 0)
    if (teacherSort === 'rating_desc') sorted.sort((a, b) => ratingOr0(b) - ratingOr0(a))
    if (teacherSort === 'rating_asc') sorted.sort((a, b) => ratingOr0(a) - ratingOr0(b))
    if (teacherSort === 'name_asc') sorted.sort((a, b) => a.name.localeCompare(b.name))
    return sorted
  }, [teacherSearch, teacherSort, teacherStyle, teachers])

  /** Teachers the student actually got an answer from in this session (for logout review). */
  const conversedTeachers = useMemo(() => {
    const map = new Map()
    for (const item of qaThread) {
      if (!item.answer || !item.teacher?.id) continue
      const t = item.teacher
      if (!map.has(t.id)) {
        map.set(t.id, {
          id: t.id,
          name: t.name || 'Teacher',
          school: t.school || '',
        })
      }
    }
    return Array.from(map.values())
  }, [qaThread])

  const canEnterLearn = Boolean(selectedSubject && selectedLesson && selectedTeacher)

  const handleSelectSubject = (subj) => {
    setSelectedSubject(subj)
    setSelectedLesson(null)
    setQaThread([])
    setDoubtHistory([])
    setCompletedTopics(new Set())
    setSummary(null)
    setSubjectOpen(false)
    setLessonOpen(false)
    setProgressOpen(false)
  }

  const handleSelectLesson = (lesson) => {
    setSelectedLesson(lesson)
    setQaThread([])
    setDoubtHistory([])
    setCompletedTopics(new Set())
    setSummary(null)
    setLessonOpen(false)
    setProgressOpen(false)
  }

  const handleSelectTeacher = (t) => {
    setSelectedTeacher(t)
    const allowed = filterCurriculumForTeacher(dashboard?.subjects || [], t)
    const stillValid = allowed.some((s) => s.id === selectedSubject?.id)
    if (!stillValid) {
      setSelectedSubject(null)
      setSelectedLesson(null)
      setQaThread([])
      setDoubtHistory([])
      setCompletedTopics(new Set())
      setSummary(null)
      setLessonOpen(false)
    }
  }

  const [chatLoading, setChatLoading] = useState(false)

  const stopTtsPlayback = () => {
    if (elevenLabsAudioRef.current) {
      elevenLabsAudioRef.current.pause()
      elevenLabsAudioRef.current = null
    }
    if (elevenLabsObjectUrlRef.current) {
      URL.revokeObjectURL(elevenLabsObjectUrlRef.current)
      elevenLabsObjectUrlRef.current = null
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setTtsSpeaking(false)
    setTtsPaused(false)
    setTtsActiveItemId(null)
    setTtsLoadingItemId(null)
  }

  const inferTeacherGender = (teacher) => {
    const name = (teacher?.name || '').trim()
    if (!name) return 'female'
    const lower = name.toLowerCase()
    if (DEV_TEACHER_VOICE_BY_NAME[lower]) {
      return DEV_TEACHER_VOICE_BY_NAME[lower]
    }
    const tokens = lower.split(/\s+/).filter(Boolean)
    const firstRaw = tokens[0] === 'dr' || tokens[0] === 'prof' ? tokens[1] : tokens[0]
    const first = firstRaw || ''
    const last = tokens.length > 0 ? tokens[tokens.length - 1] : ''
    if (first && DEV_TEACHER_VOICE_BY_NAME[first]) {
      return DEV_TEACHER_VOICE_BY_NAME[first]
    }
    if (tokens.length > 1 && last && DEV_TEACHER_VOICE_BY_NAME[last]) {
      return DEV_TEACHER_VOICE_BY_NAME[last]
    }
    if (lower.startsWith('mr ') || lower.startsWith('mr. ')) return 'male'
    if (lower.startsWith('mrs ') || lower.startsWith('mrs. ') || lower.startsWith('ms ') || lower.startsWith('ms. ') || lower.startsWith('miss ')) return 'female'
    const parts = name.split(/\s+/).map((p) => p.toLowerCase())
    const firstHeuristic = (parts[0] === 'dr' || parts[0] === 'prof' ? parts[1] : parts[0]) || ''
    const maleFirst = [
      'ravi',
      'anand',
      'suresh',
      'raj',
      'kumar',
      'david',
      'john',
      'james',
      'michael',
      'robert',
      'william',
      'joseph',
      'thomas',
      'daniel',
      'matthew',
      'jacob',
      'gary',
      'eric',
      'brian',
      'kevin',
      'steven',
      'mark',
      'paul',
    ]
    const femaleFirst = ['priya', 'lakshmi', 'sita', 'anita', 'meera', 'pooja', 'alice', 'maria']
    if (femaleFirst.some((n) => firstHeuristic.includes(n))) return 'female'
    if (maleFirst.some((n) => firstHeuristic.includes(n))) return 'male'
    return 'female'
  }

  const speakAnswerTextBrowser = (item, rateOverride) => {
    const spokenText = sanitizeMathForSpeech((item?.answer || '').trim())
    if (!spokenText) return
    if (typeof window === 'undefined' || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return

    const utterance = new window.SpeechSynthesisUtterance(spokenText)
    utterance.lang = 'en-US'
    utterance.rate = Number.isFinite(rateOverride) ? rateOverride : ttsRateRef.current
    const gender = inferTeacherGender(item?.teacher)
    const voices = window.speechSynthesis.getVoices()
    const { male: maleV, female: femaleV } = pickTtsMaleFemaleVoices(voices)
    if (maleV && femaleV) {
      ttsVoicesRef.current = { male: maleV, female: femaleV }
    }
    const voice = gender === 'male' ? maleV : femaleV
    if (voice) utterance.voice = voice
    utterance.onstart = () => {
      setTtsSpeaking(true)
      setTtsPaused(false)
      setTtsActiveItemId(item.id)
    }
    utterance.onpause = () => setTtsPaused(true)
    utterance.onresume = () => setTtsPaused(false)
    utterance.onend = () => {
      setTtsSpeaking(false)
      setTtsPaused(false)
      setTtsActiveItemId(null)
    }
    utterance.onerror = () => {
      setTtsSpeaking(false)
      setTtsPaused(false)
      setTtsActiveItemId(null)
    }

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  const speakAnswerText = async (item, rateOverride) => {
    const spokenText = sanitizeMathForSpeech((item?.answer || '').trim())
    if (!spokenText) return

    const useAzureTts = item?.responseMode === 'audio' && item?.teacher?.id

    if (useAzureTts) {
      stopTtsPlayback()
      setTtsLoadingItemId(item.id)
      const { blob, error } = await fetchTeacherTtsAudio({
        teacherId: item.teacher.id,
        text: spokenText,
        rate: Number.isFinite(rateOverride) ? rateOverride : ttsRateRef.current,
      })
      setTtsLoadingItemId(null)

      if (error?.message || !blob) {
        speakAnswerTextBrowser(item, rateOverride)
        return
      }

      const url = URL.createObjectURL(blob)
      elevenLabsObjectUrlRef.current = url
      const audio = new Audio(url)
      elevenLabsAudioRef.current = audio
      audio.playbackRate = Number.isFinite(rateOverride) ? rateOverride : ttsRateRef.current

      audio.onplay = () => {
        setTtsSpeaking(true)
        setTtsPaused(false)
        setTtsActiveItemId(item.id)
      }
      audio.onpause = () => {
        if (audio.currentTime > 0 && !audio.ended) setTtsPaused(true)
      }
      audio.onended = () => {
        if (elevenLabsObjectUrlRef.current) {
          URL.revokeObjectURL(elevenLabsObjectUrlRef.current)
          elevenLabsObjectUrlRef.current = null
        }
        elevenLabsAudioRef.current = null
        setTtsSpeaking(false)
        setTtsPaused(false)
        setTtsActiveItemId(null)
      }
      audio.onerror = () => {
        if (elevenLabsObjectUrlRef.current) {
          URL.revokeObjectURL(elevenLabsObjectUrlRef.current)
          elevenLabsObjectUrlRef.current = null
        }
        elevenLabsAudioRef.current = null
        setTtsSpeaking(false)
        setTtsPaused(false)
        setTtsActiveItemId(null)
        speakAnswerTextBrowser(item, rateOverride)
      }

      try {
        await audio.play()
      } catch {
        speakAnswerTextBrowser(item, rateOverride)
      }
      return
    }

    stopTtsPlayback()
    speakAnswerTextBrowser(item, rateOverride)
  }

  const handlePlayPauseToggle = (item) => {
    const useAzureTts = item?.responseMode === 'audio' && item?.teacher?.id
    const isActive = ttsActiveItemId === item.id

    if (useAzureTts && elevenLabsAudioRef.current && isActive && ttsSpeaking) {
      if (ttsPaused) {
        elevenLabsAudioRef.current.play().catch(() => {})
        setTtsPaused(false)
      } else {
        elevenLabsAudioRef.current.pause()
        setTtsPaused(true)
      }
      return
    }

    if (!useAzureTts) {
      if (typeof window === 'undefined' || !window.speechSynthesis) return
      if (isActive && ttsSpeaking) {
        if (ttsPaused) {
          window.speechSynthesis.resume()
          setTtsPaused(false)
        } else {
          window.speechSynthesis.pause()
          setTtsPaused(true)
        }
        return
      }
    }

    speakAnswerText(item)
  }

  const handleTtsRateChange = (item, nextRate) => {
    setTtsRate(nextRate)
    const useAzureTts = item?.responseMode === 'audio' && item?.teacher?.id
    if (useAzureTts && ttsActiveItemId === item.id && elevenLabsAudioRef.current) {
      elevenLabsAudioRef.current.playbackRate = nextRate
      return
    }
    speakAnswerText(item, nextRate)
  }

  const handleHomeworkPhotoSubmit = async ({ file, note }) => {
    if (!file || chatLoading) return
    if (!selectedSubject || !selectedLesson) return

    setTeacherTopTool('learn')
    setChatAttachOpen(false)

    const noteText = String(note || '').trim()
    const questionLabel = noteText
      ? `[Homework photo] ${noteText}`
      : '[Homework photo] Help me with this problem'
    setDoubtHistory((prev) =>
      prev.includes(questionLabel) ? prev : [questionLabel, ...prev].slice(0, 10),
    )

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const teacher = selectedTeacher
    lastHomeworkImageRef.current = file
    setHomeworkSessionActive(true)

    // Own object URL so remounting the uploader does not revoke the thread thumbnail
    const imagePreviewUrl = URL.createObjectURL(file)

    const systemPrompt = buildHomeworkHintSystemPrompt({
      teacher: teacher || {},
      subject: selectedSubject,
      lesson: selectedLesson,
      lessonTopics: topicList,
      difficultyLevel,
      grade: gradeLabel || '7',
      board: boardLabel || 'Unknown board',
    })

    const userText = buildHomeworkHintUserText(noteText, {
      ...learnMessageContext,
      responseMode: 'text',
    })

    setQaThread((prev) => [
      ...prev,
      {
        id,
        question: questionLabel,
        answer: null,
        teacher,
        lessonTitle: selectedLesson.title,
        responseMode: 'text',
        difficultyLevel,
        homeworkPhoto: true,
        imagePreviewUrl,
        createdAt: new Date().toISOString(),
      },
    ])

    setChatLoading(true)

    const conversationMessages = qaThread
      .filter((item) => item.answer)
      .flatMap((item) => [
        { role: 'user', content: item.question },
        { role: 'assistant', content: item.answer },
      ])

    const { data, error } = await sendHomeworkHint({
      imageFile: file,
      note: userText,
      systemPrompt,
      messages: conversationMessages,
      learn: teacher?.id
        ? {
            teacher_id: teacher.id,
            subject: selectedSubject?.label || selectedSubject?.name || 'General',
            lesson: selectedLesson?.title || null,
            topics: topicList,
            question: questionLabel,
            response_mode: 'text',
          }
        : null,
    })

    if (error?.status === 401) {
      logout()
      return
    }

    setChatLoading(false)

    const answer = data?.answer || error?.message || 'Sorry, something went wrong. Please try again.'
    setQaThread((prev) => prev.map((item) => (item.id === id ? { ...item, answer } : item)))
    setHomeworkUploaderKey((k) => k + 1)
  }

  const handleSendMessage = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    if (!selectedSubject || !selectedLesson) return

    setChatInput('')
    setTeacherTopTool('learn')
    setDoubtHistory((prev) => (prev.includes(text) ? prev : [text, ...prev].slice(0, 10)))

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const teacher = selectedTeacher
    const useHomeworkFollowUp =
      Boolean(lastHomeworkImageRef.current) &&
      qaThread.some((item) => item.homeworkPhoto && item.answer)

    if (useHomeworkFollowUp) {
      const systemPrompt = buildHomeworkHintSystemPrompt({
        teacher: teacher || {},
        subject: selectedSubject,
        lesson: selectedLesson,
        lessonTopics: topicList,
        difficultyLevel,
        grade: gradeLabel || '7',
        board: boardLabel || 'Unknown board',
      })

      setQaThread((prev) => [
        ...prev,
        {
          id,
          question: text,
          answer: null,
          teacher,
          lessonTitle: selectedLesson.title,
          responseMode: 'text',
          difficultyLevel,
          homeworkPhoto: true,
          createdAt: new Date().toISOString(),
        },
      ])

      setChatLoading(true)

      const conversationMessages = qaThread
        .filter((item) => item.answer)
        .flatMap((item) => [
          { role: 'user', content: item.question },
          { role: 'assistant', content: item.answer },
        ])

      const followUpText = buildHomeworkHintUserText(text, {
        ...learnMessageContext,
        responseMode: 'text',
        extra: 'This is a follow-up on the homework photo already discussed. Hints only.',
      })

      const { data, error } = await sendHomeworkHint({
        imageFile: lastHomeworkImageRef.current,
        note: followUpText,
        systemPrompt,
        messages: conversationMessages,
        learn: teacher?.id
          ? {
              teacher_id: teacher.id,
              subject: selectedSubject?.label || selectedSubject?.name || 'General',
              lesson: selectedLesson?.title || null,
              topics: topicList,
              question: text,
              response_mode: 'text',
            }
          : null,
      })

      if (error?.status === 401) {
        logout()
        return
      }

      setChatLoading(false)
      const answer = data?.answer || error?.message || 'Sorry, something went wrong. Please try again.'
      setQaThread((prev) => prev.map((item) => (item.id === id ? { ...item, answer } : item)))
      return
    }

    const systemPrompt = buildTeacherSystemPrompt({
      teacher: teacher || {},
      subject: selectedSubject,
      lesson: selectedLesson,
      lessonTopics: topicList,
      responseMode,
      difficultyLevel,
      grade: gradeLabel || '7',
      board: boardLabel || 'Unknown board',
    })

    setQaThread((prev) => [
      ...prev,
      {
        id,
        question: text,
        answer: null,
        teacher,
        lessonTitle: selectedLesson.title,
        responseMode,
        difficultyLevel,
        createdAt: new Date().toISOString(),
      },
    ])

    setChatLoading(true)

    const conversationMessages = qaThread
      .filter((item) => item.answer)
      .flatMap((item) => [
        { role: 'user', content: item.question },
        { role: 'assistant', content: item.answer },
      ])
    conversationMessages.push({
      role: 'user',
      content: buildUserMessageWithContext(text, learnMessageContext),
    })

    const { data, error } = await sendChatMessage({
      systemPrompt,
      messages: conversationMessages,
      learn: teacher?.id
        ? {
            teacher_id: teacher.id,
            subject: selectedSubject?.label || selectedSubject?.name || 'General',
            lesson: selectedLesson?.title || null,
            topics: topicList,
            question: text,
            response_mode: responseMode,
          }
        : null,
    })

    if (error?.status === 401) {
      logout()
      return
    }

    setChatLoading(false)

    const answer = data?.answer || error?.message || 'Sorry, something went wrong. Please try again.'

    setQaThread((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, answer } : item,
      ),
    )

    if (responseMode === 'video' && data?.answer) {
      const avatarUrl = teacher?.avatar_url
      if (!avatarUrl) {
        setQaThread((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  videoUrl: null,
                  videoError:
                    'Video mode requires a teacher profile photo. Ask your teacher to upload an avatar, or switch to text or audio.',
                }
              : item,
          ),
        )
      } else {
        const didVoiceId = didMicrosoftVoiceIdForGender(inferTeacherGender(teacher))
        const { data: videoData, error: videoGenError, httpStatus } = await generateDidVideo({
          avatarUrl,
          text: data.answer,
          voiceId: didVoiceId,
        })
        if (videoGenError) {
          const videoErrorMessage =
            videoGenError.status === 402
              ? 'Video could not be generated: D-ID reported a billing or quota issue (HTTP 402). Add credits in the D-ID dashboard, or use text/audio mode.'
              : videoGenError.message || 'Video generation failed.'
          setQaThread((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, videoUrl: null, videoError: videoErrorMessage } : item,
            ),
          )
        } else {
          const videoUrl = videoData?.result_url || null
          if (!videoUrl) {
            const pendingMsg =
              httpStatus === 202 || videoData?.status === 'unknown'
                ? videoData?.message ||
                  'D-ID is still rendering this clip. Wait a moment and refresh, or switch to text/audio.'
                : 'No video URL was returned. Check D_ID_API_KEY and the Network tab for POST /api/chat/video.'
            setQaThread((prev) =>
              prev.map((item) =>
                item.id === id ? { ...item, videoUrl: null, videoError: pendingMsg } : item,
              ),
            )
          } else {
            setQaThread((prev) =>
              prev.map((item) =>
                item.id === id
                  ? { ...item, videoUrl, videoError: undefined, videoPlaybackError: undefined }
                  : item,
              ),
            )
          }
        }
      }
    }

    if (data?.answer) {
      const responseLower = data.answer.toLowerCase()
      setCompletedTopics((prev) => {
        const next = new Set(prev)
        topicList.forEach((topic, i) => {
          if (next.has(i)) return
          const keywords = topic
            .toLowerCase()
            .split(/[\s,\-–—:;/()]+/)
            .filter((w) => w.length > 2)
          const matched = keywords.filter((kw) => responseLower.includes(kw))
          if (matched.length >= Math.max(1, Math.ceil(keywords.length * 0.4))) {
            next.add(i)
          }
        })
        return next
      })
    }

    if (responseMode === 'audio' && data?.answer && teacher?.id) {
      speakAnswerText({
        id,
        answer: data.answer,
        teacher,
        responseMode: 'audio',
      })
    }
  }

  const handleMicRecording = async () => {
    if (!selectedSubject || !selectedLesson) return
    if (chatLoading || micLoading) return

    if (micRecording) {
      mediaRecorderRef.current?.stop()
      setMicRecording(false)
      return
    }

    setMicError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicError('Voice input is not supported in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const preferredType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : undefined
      const recorder = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType })
        : new MediaRecorder(stream)

      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        setMicRecording(false)
        mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop())
        mediaStreamRef.current = null

        if (!audioChunksRef.current.length) {
          setMicError('No audio captured. Please try again.')
          setMicLoading(false)
          return
        }

        const id = `voice-${Date.now()}-${Math.random().toString(16).slice(2)}`
        const teacher = selectedTeacher
        const systemPrompt = buildTeacherSystemPrompt({
          teacher: teacher || {},
          subject: selectedSubject,
          lesson: selectedLesson,
          lessonTopics: topicList,
          responseMode,
          difficultyLevel,
          grade: gradeLabel || '7',
          board: boardLabel || 'Unknown board',
        })

        setQaThread((prev) => [
          ...prev,
          {
            id,
            question: 'Voice message',
            answer: null,
            teacher,
            lessonTitle: selectedLesson.title,
            responseMode,
            difficultyLevel,
            createdAt: new Date().toISOString(),
            fromVoice: true,
          },
        ])

        setMicLoading(true)

        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })

        const conversationMessages = qaThread
          .filter((item) => item.answer)
          .flatMap((item) => [
            { role: 'user', content: item.question },
            { role: 'assistant', content: item.answer },
          ])
        conversationMessages.push({
          role: 'user',
          content: buildUserMessageWithContext(
            '(The student’s question is the voice transcript that follows this turn.)',
            learnMessageContext,
          ),
        })

        const { data, error } = await sendVoiceChatMessage({
          systemPrompt,
          messages: conversationMessages,
          audioBlob,
          language: 'en',
          learn: teacher?.id
            ? {
                teacher_id: teacher.id,
                subject: selectedSubject?.label || selectedSubject?.name || 'General',
                lesson: selectedLesson?.title || null,
                topics: topicList,
                response_mode: responseMode,
              }
            : null,
        })

        if (error?.status === 401) {
          logout()
          return
        }

        const transcript = data?.transcript?.trim() || 'Voice message'
        const answer = data?.answer || error?.message || 'Sorry, something went wrong with voice input. Please try again.'

        setQaThread((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, question: transcript, answer } : item,
          ),
        )
        setDoubtHistory((prev) => (prev.includes(transcript) ? prev : [transcript, ...prev].slice(0, 10)))
        setMicLoading(false)
        if (responseMode === 'audio' && data?.answer && teacher?.id) {
          speakAnswerText({
            id,
            answer: data.answer,
            teacher,
            responseMode: 'audio',
          })
        }
      }

      recorder.start()
      setMicRecording(true)
    } catch (error) {
      setMicError('Microphone permission denied or unavailable.')
      mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop())
      mediaStreamRef.current = null
      setMicRecording(false)
      setMicLoading(false)
    }
  }

  const performLogout = () => {
    setShowLogoutModal(false)
    setLogoutSubmitError('')
    logout()
  }

  const dismissFollowUp = () => {
    setLearningRecs([])
    dismissAllLearningRecs()
  }

  /** Review popup only after at least one completed exchange in this session. */
  const handleLogoutClick = () => {
    const hadConversation = qaThread.some((item) => Boolean(item.answer))
    if (hadConversation) {
      setLogoutSubmitError('')
      setShowLogoutModal(true)
    } else {
      logout()
    }
  }

  const handleLogoutSubmitReview = async ({ teacherId, rating, feedback }) => {
    setLogoutSubmitError('')
    setLogoutSubmitting(true)
    const { error } = await submitSessionFeedback({
      teacherId,
      rating,
      feedback,
    })
    setLogoutSubmitting(false)
    if (error) {
      setLogoutSubmitError(
        error.fieldErrors?.teacher_id ||
          error.fieldErrors?.rating ||
          error.message ||
          'Could not save feedback. Try again or use Quit without review.',
      )
      return
    }
    performLogout()
  }

  const handleSummarize = async () => {
    const answered = qaThread.filter((item) => item.answer)
    if (answered.length === 0) return

    setSummarizing(true)
    setSummary(null)

    const conversationMessages = answered.flatMap((item) => [
      { role: 'user', content: item.question },
      { role: 'assistant', content: item.answer },
    ])
    conversationMessages.push({
      role: 'user',
      content: buildUserMessageWithContext(
        'Summarize everything we have discussed so far in this session as concise bullet points. Cover every topic and key concept that was explained. Do not add new information.',
        learnMessageContext,
      ),
    })

    const systemPrompt = buildTeacherSystemPrompt({
      teacher: selectedTeacher || {},
      subject: selectedSubject,
      lesson: selectedLesson,
      lessonTopics: topicList,
      responseMode,
      difficultyLevel,
      grade: gradeLabel || '7',
      board: boardLabel || 'Unknown board',
    })

    const { data, error } = await sendChatMessage({
      systemPrompt,
      messages: conversationMessages,
    })

    if (error?.status === 401) {
      logout()
      return
    }

    setSummarizing(false)
    setSummary(
      data?.answer || error?.message || 'Could not generate summary. Please try again.'
    )
  }

  const handleStoryMode = async (item) => {
    if (!item?.answer || !selectedSubject || !selectedLesson || item.storyLoading) return

    setQaThread((prev) =>
      prev.map((q) =>
        q.id === item.id ? { ...q, storyLoading: true, storyError: null } : q,
      ),
    )

    const systemPrompt = buildStoryModeSystemPrompt({
      subject: selectedSubject,
      lesson: selectedLesson,
      grade: gradeLabel || '7',
      board: boardLabel || 'Unknown board',
    })

    const messages = [
      {
        role: 'user',
        content: buildStoryModeUserMessage({
          question: item.question,
          priorAnswer: item.answer,
          context: learnMessageContext,
        }),
      },
    ]

    const { data, error } = await sendChatMessage({
      systemPrompt,
      messages,
      temperature: 0,
    })

    if (error?.status === 401) {
      logout()
      return
    }

    const facts = data?.answer || null
    setQaThread((prev) =>
      prev.map((q) =>
        q.id === item.id
          ? {
              ...q,
              storyLoading: false,
              storyFacts: facts,
              storyError: facts
                ? null
                : error?.message || 'Could not load Story mode. Please try again.',
            }
          : q,
      ),
    )
  }

  return (
    <BoardShell viewport={learningMode === 'learn'}>
      <BoardHeader
        brand={<LogoPlaceholder />}
        sub="Concourse · Student"
        actions={
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right leading-tight">
              <p className="font-[family-name:var(--font-flap)] text-[12px] font-semibold tracking-[0.08em] uppercase text-[var(--flap-ink)] m-0">
                {displayName}
              </p>
              <p className="font-[family-name:var(--font-flap)] text-[9px] tracking-[0.14em] uppercase text-[var(--flap-mute)] m-0">
                {gradeLabel ? `Grade ${gradeLabel}` : 'Grade —'}
                {boardLabel ? ` · ${boardLabel}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogoutClick}
              className="p-2 text-[var(--flap-mute)] hover:text-[var(--flap-ink)] border-none bg-transparent cursor-pointer"
              aria-label="Log out"
            >
              <IconLogout />
            </button>
          </div>
        }
      >
        <nav className="hidden md:flex items-center gap-1 ml-2" aria-label="Learning mode">
          {[
            { id: 'home', label: 'Home' },
            { id: 'learn', label: 'Learn' },
            { id: 'quiz', label: 'Quiz' },
          ].map((m) => (
            <FlapTab key={m.id} active={learningMode === m.id} onClick={() => setLearningMode(m.id)}>
              {m.label}
            </FlapTab>
          ))}
        </nav>
      </BoardHeader>

      <div className="md:hidden flex gap-1 px-3 py-2 overflow-x-auto border-b border-[var(--board-rule)] bg-[var(--board-steel-deep)] shrink-0">
        {[
          { id: 'home', label: 'Home' },
          { id: 'learn', label: 'Learn' },
          { id: 'quiz', label: 'Quiz' },
        ].map((m) => (
          <FlapTab key={m.id} active={learningMode === m.id} onClick={() => setLearningMode(m.id)}>
            {m.label}
          </FlapTab>
        ))}
      </div>

      {learningMode === 'home' && (
        <div className="max-w-[1100px] w-full mx-auto px-4 md:px-6 py-8">
          <h1 className="font-[family-name:var(--font-flap)] text-3xl md:text-4xl font-bold tracking-[0.04em] uppercase text-[var(--flap-ink)] m-0">
            How do you want to learn today?
          </h1>
          <p className="text-[var(--flap-mute)] mt-2 text-sm leading-relaxed m-0">
            Chat with an AI teacher, or take a quiz assigned to your grade.
          </p>
          {learningRecs[0] ? (
            <div className="mt-4 border border-[var(--flap-amber)]/40 bg-[var(--flap-face)] px-4 py-3 text-sm flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-[family-name:var(--font-flap)] text-[11px] tracking-[0.14em] uppercase text-[var(--flap-amber)] m-0">
                  Recommended next
                </p>
                <p className="text-[var(--flap-mute)] mt-1 m-0">{learningRecs[0].reason}</p>
              </div>
              <button
                type="button"
                onClick={dismissFollowUp}
                className="shrink-0 px-2 py-1 text-[var(--flap-mute)] hover:text-[var(--flap-ink)] border-none bg-transparent cursor-pointer text-lg leading-none"
                aria-label="Dismiss recommendation"
              >
                ×
              </button>
            </div>
          ) : null}
          <div className="grid md:grid-cols-2 gap-3 mt-8">
            <button
              type="button"
              onClick={() => setLearningMode('learn')}
              className="text-left border border-[var(--board-rule)] bg-[var(--board-steel-deep)] p-5 hover:border-[var(--flap-amber)]/50 cursor-pointer"
            >
              <p className="font-[family-name:var(--font-flap)] text-[11px] tracking-[0.16em] uppercase text-[var(--flap-amber)] m-0">
                Departures
              </p>
              <p className="font-[family-name:var(--font-flap)] text-lg font-semibold tracking-[0.06em] uppercase text-[var(--flap-ink)] mt-2 m-0">
                Learn through Chat
              </p>
              <p className="text-sm text-[var(--flap-mute)] mt-2 m-0 leading-relaxed">
                Ask questions, get guided explanations, and work through ideas with your AI teacher.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setLearningMode('quiz')}
              className="text-left border border-[var(--board-rule)] bg-[var(--board-steel-deep)] p-5 hover:border-[var(--flap-amber)]/50 cursor-pointer"
            >
              <p className="font-[family-name:var(--font-flap)] text-[11px] tracking-[0.16em] uppercase text-[var(--flap-amber)] m-0">
                Arrivals
              </p>
              <p className="font-[family-name:var(--font-flap)] text-lg font-semibold tracking-[0.06em] uppercase text-[var(--flap-ink)] mt-2 m-0">
                Quiz
              </p>
              <p className="text-sm text-[var(--flap-mute)] mt-2 m-0 leading-relaxed">
                Take assessments for your grade. After each answer, a tutor helps you understand why.
              </p>
            </button>
          </div>
        </div>
      )}

      {learningMode === 'quiz' && (
        <div className="max-w-[1600px] w-full mx-auto px-4 md:px-6 py-4 flex flex-col">
          <StudentQuizHub
            onLearnTopic={() => {
              dismissFollowUp()
              setLearningMode('learn')
            }}
          />
        </div>
      )}

      {learningMode === 'learn' && (
        <main className="relative flex-1 flex min-h-0 overflow-hidden max-w-[1600px] w-full mx-auto px-4 md:px-6 py-4 gap-4">
          {dashboardLoading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-[var(--board-steel)]/90">
              <FlapPanel className="w-full max-w-sm">
                <FlapPanelHead title="Loading" meta="Curriculum" />
                <div className="px-4 py-5 text-center">
                  <p className="font-[family-name:var(--font-flap)] text-sm tracking-[0.08em] uppercase text-[var(--flap-ink)] m-0">
                    Loading curriculum…
                  </p>
                  <p className="mt-1 text-sm text-[var(--flap-mute)] m-0">
                    Please wait while we fetch your dashboard.
                  </p>
                </div>
              </FlapPanel>
            </div>
          )}
          {!dashboardLoading && dashboardError && (
            <div className="absolute top-2 left-4 right-4 z-50">
              <div className="max-w-[1600px] mx-auto border border-[var(--flap-cancel)]/50 bg-[var(--flap-face)] px-4 py-2 text-sm text-[var(--flap-cancel)]">
                {dashboardError}
              </div>
            </div>
          )}

          {/* Teacher Side */}
          <section className="flex-[3] min-w-0 flex flex-col min-h-0 relative">
            <FlapPanel scroll className="flex-1 flex flex-col min-h-0">
              <div className="shrink-0 flex items-center justify-between gap-2 px-2 py-2 border-b border-[var(--board-rule)] bg-[var(--board-steel-deep)]">
                <div className="flex items-center gap-1 flex-wrap">
                  {[
                    { id: 'teacher', label: 'Teacher' },
                    { id: 'mode', label: 'Mode' },
                    { id: 'difficulty', label: 'Level' },
                    { id: 'learn', label: 'Learn' },
                  ].map((item) => (
                    <FlapTab
                      key={item.id}
                      active={teacherTopTool === item.id}
                      onClick={() => setTeacherTopTool(item.id)}
                    >
                      {item.label}
                    </FlapTab>
                  ))}
                </div>
                <span className="font-[family-name:var(--font-flap)] text-[10px] tracking-[0.12em] uppercase text-[var(--flap-mute)] hidden md:inline truncate max-w-[12rem]">
                  {selectedTeacher ? selectedTeacher.name : 'Select a teacher'}
                </span>
              </div>

              {teacherTopTool !== 'learn' && (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-3">
                  {teacherTopTool === 'teacher' && (
                    <div className="flex flex-col min-h-0 flex-1 gap-2 overflow-hidden">
                      <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <FlapInput
                          value={teacherSearch}
                          onChange={(e) => setTeacherSearch(e.target.value)}
                          placeholder="Search teachers…"
                        />
                        <select
                          value={teacherSort}
                          onChange={(e) => setTeacherSort(e.target.value)}
                          className="w-full bg-[var(--flap-face)] text-[var(--flap-ink)] border border-[var(--board-rule)] px-3 py-2 text-sm outline-none focus:border-[var(--flap-amber)] font-[family-name:var(--font-body)]"
                        >
                          <option value="rating_desc">Sort: Rating (high → low)</option>
                          <option value="rating_asc">Sort: Rating (low → high)</option>
                          <option value="name_asc">Sort: Name (A → Z)</option>
                        </select>
                        <select
                          value={teacherStyle}
                          onChange={(e) => setTeacherStyle(e.target.value)}
                          className="w-full bg-[var(--flap-face)] text-[var(--flap-ink)] border border-[var(--board-rule)] px-3 py-2 text-sm outline-none focus:border-[var(--flap-amber)] font-[family-name:var(--font-body)]"
                        >
                          {teacherStyles.map((style) => (
                            <option key={style} value={style}>
                              {style === 'all' ? 'Filter: All styles' : `Style: ${style}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="shrink-0 flex items-center justify-between">
                        <p className="font-[family-name:var(--font-flap)] text-[10px] tracking-[0.12em] uppercase text-[var(--flap-mute)] m-0">
                          Showing {filteredTeachers.length} teacher{filteredTeachers.length === 1 ? '' : 's'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setTeacherSearch('')
                            setTeacherStyle('all')
                            setTeacherSort('rating_desc')
                          }}
                          className="font-[family-name:var(--font-flap)] text-[10px] tracking-[0.12em] uppercase text-[var(--flap-mute)] hover:text-[var(--flap-amber)] border-none bg-transparent cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>

                      <div className="flex-1 min-h-0 flex flex-col overflow-hidden border border-[var(--board-rule)]">
                        <div className="shrink-0 grid grid-cols-[1.4fr_1fr_0.9fr] gap-x-3 px-3 py-1.5 border-b border-[var(--board-rule)] bg-[var(--board-steel-deep)]">
                          {['Name', 'Style', 'Rating'].map((h) => (
                            <span
                              key={h}
                              className="font-[family-name:var(--font-flap)] text-[9px] tracking-[0.14em] uppercase text-[var(--flap-mute)]"
                            >
                              {h}
                            </span>
                          ))}
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto">
                          {filteredTeachers.map((t) => (
                            <FlapRow
                              key={t.id}
                              selected={selectedTeacher?.id === t.id}
                              onClick={() => handleSelectTeacher(t)}
                              className="grid-cols-none"
                              cols={[
                                { label: t.name, width: '1.4fr' },
                                { label: t.style || '—', width: '1fr', mute: true },
                                {
                                  label: teacherRatingSummary(t),
                                  width: '0.9fr',
                                  className: 'text-[var(--flap-amber)]',
                                },
                              ]}
                            />
                          ))}
                          {filteredTeachers.length === 0 && (
                            <p className="text-sm text-[var(--flap-mute)] italic px-3 py-3 m-0">
                              No teachers match your search/filter.
                            </p>
                          )}
                        </div>
                        {selectedTeacher && (
                          <div className="shrink-0 p-2 border-t border-[var(--board-rule)]">
                            <FlapButton
                              variant="ghost"
                              className="w-full"
                              onClick={() => setSelectedTeacher(null)}
                            >
                              Change Teacher
                            </FlapButton>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {teacherTopTool === 'mode' && (
                    <div className="flex flex-wrap gap-2">
                      {RESPONSE_MODES.map((m) => (
                        <FlapTab
                          key={m.id}
                          active={responseMode === m.id}
                          onClick={() => setResponseMode(m.id)}
                        >
                          {m.label}
                        </FlapTab>
                      ))}
                    </div>
                  )}

                  {teacherTopTool === 'difficulty' && (
                    <div className="flex flex-wrap gap-2">
                      {DIFFICULTY_LEVELS.map((d) => (
                        <FlapTab
                          key={d.id}
                          active={difficultyLevel === d.id}
                          onClick={() => setDifficultyLevel(d.id)}
                        >
                          {d.label}
                        </FlapTab>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {teacherTopTool === 'learn' && (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-3">
                  {canEnterLearn ? (
                    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[0.4fr_0.6fr] gap-3">
                      <FlapPanel className="flex flex-col items-center justify-center p-4">
                        {selectedTeacher?.avatar_url ? (
                          <img
                            src={selectedTeacher.avatar_url}
                            alt={selectedTeacher.name}
                            className="w-28 h-28 object-cover border border-[var(--board-rule)]"
                            onError={(e) => {
                              e.currentTarget.src = ''
                            }}
                          />
                        ) : (
                          <div className="w-28 h-28 border border-[var(--board-rule)] bg-[var(--flap-face)] flex items-center justify-center font-[family-name:var(--font-flap)] text-4xl font-bold text-[var(--flap-amber)]">
                            {selectedTeacher ? selectedTeacher.name.charAt(0) : '?'}
                          </div>
                        )}
                        <p className="mt-3 font-[family-name:var(--font-flap)] text-sm font-semibold tracking-[0.08em] uppercase text-[var(--flap-ink)] m-0">
                          {selectedTeacher ? selectedTeacher.name : 'Select a teacher'}
                        </p>
                        <p className="text-xs text-[var(--flap-mute)] m-0 mt-1">
                          {selectedTeacher ? selectedTeacher.school : 'Personalize explanations by teaching style'}
                        </p>
                        {selectedTeacher && (
                          <p className="font-[family-name:var(--font-flap)] text-[10px] tracking-[0.12em] uppercase text-[var(--flap-amber)] mt-2 m-0">
                            {selectedTeacher.style} · {teacherRatingSummary(selectedTeacher)}
                          </p>
                        )}
                        <div className="mt-4 w-full grid grid-cols-2 gap-2">
                          <div className="border border-[var(--board-rule)] bg-[var(--flap-face)] p-3">
                            <p className="font-[family-name:var(--font-flap)] text-[9px] tracking-[0.14em] uppercase text-[var(--flap-mute)] m-0">
                              Response
                            </p>
                            <p className="text-sm font-semibold text-[var(--flap-ink)] capitalize m-0 mt-1">
                              {responseMode}
                            </p>
                          </div>
                          <div className="border border-[var(--board-rule)] bg-[var(--flap-face)] p-3">
                            <p className="font-[family-name:var(--font-flap)] text-[9px] tracking-[0.14em] uppercase text-[var(--flap-mute)] m-0">
                              Difficulty
                            </p>
                            <p className="text-sm font-semibold text-[var(--flap-ink)] m-0 mt-1">
                              {DIFFICULTY_LEVELS.find((d) => d.id === difficultyLevel)?.label || 'Beginner'}
                            </p>
                          </div>
                        </div>
                      </FlapPanel>

                      <FlapPanel scroll className="flex flex-col min-h-0">
                        <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--board-rule)] bg-[var(--board-steel-deep)]">
                          <div>
                            <h3 className="font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.16em] uppercase text-[var(--flap-ink)] m-0">
                              Teacher Answers
                            </h3>
                            <p className="font-[family-name:var(--font-flap)] text-[9px] tracking-[0.12em] uppercase text-[var(--flap-mute)] m-0 mt-0.5">
                              {selectedLesson ? `Lesson: ${selectedLesson.title}` : 'Select a lesson to begin'}
                            </p>
                          </div>
                          {selectedLesson && (
                            <FlapButton
                              variant="amber"
                              onClick={handleSummarize}
                              disabled={summarizing || !qaThread.some((i) => i.answer)}
                            >
                              {summarizing ? 'Summarizing…' : 'Summarize'}
                            </FlapButton>
                          )}
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto space-y-0">
                          {qaThread.map((item) => (
                            <div key={item.id} className="border-b border-[var(--board-rule)]">
                              <div className="px-3 py-3 bg-[var(--board-steel-deep)]">
                                <p className="font-[family-name:var(--font-flap)] text-[9px] tracking-[0.14em] uppercase text-[var(--flap-mute)] m-0">
                                  {item.homeworkPhoto ? 'Homework photo' : 'Student asked'}
                                </p>
                                {item.imagePreviewUrl ? (
                                  <div className="mt-2 mb-2 overflow-hidden border border-[var(--board-rule)] bg-[var(--flap-face)] max-w-xs">
                                    <img
                                      src={item.imagePreviewUrl}
                                      alt="Homework"
                                      className="max-h-40 w-full object-contain"
                                    />
                                  </div>
                                ) : null}
                                <p className="text-sm font-medium text-[var(--flap-ink)] m-0 mt-1">
                                  {item.question}
                                </p>
                                <p className="font-[family-name:var(--font-flap)] text-[9px] tracking-[0.1em] uppercase text-[var(--flap-mute)] mt-1 m-0">
                                  Teacher: {item.teacher?.name || 'not selected'} · {item.responseMode} ·{' '}
                                  {DIFFICULTY_LEVELS.find((d) => d.id === item.difficultyLevel)?.label ||
                                    'Beginner'}
                                  {item.homeworkPhoto ? ' · hints only' : ''}
                                </p>
                              </div>
                              <div className="px-3 py-3">
                                {item.answer ? (
                                  <>
                                  {item.responseMode === 'audio' ? (
                                    <>
                                      {audioTextViewById[item.id] ? (
                                        <div className="border border-[var(--board-rule)] bg-[var(--flap-face)] p-3">
                                          <div className="mb-2">
                                            <FlapButton
                                              variant="ghost"
                                              onClick={() =>
                                                setAudioTextViewById((prev) => ({
                                                  ...prev,
                                                  [item.id]: false,
                                                }))
                                              }
                                            >
                                              ← Back
                                            </FlapButton>
                                          </div>
                                          <div className="text-sm text-[var(--flap-ink)] leading-relaxed">
                                            <FormattedAnswerText text={item.answer} />
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="border border-[var(--board-rule)] bg-[var(--flap-face)] p-3 flex flex-wrap items-center gap-3">
                                          <div
                                            className={`w-24 h-16 border border-[var(--board-rule)] bg-[var(--board-steel-deep)] flex items-center justify-center px-2 py-2 ${
                                              ttsActiveItemId === item.id && ttsSpeaking && !ttsPaused
                                                ? 'audio-wave-cluster-active'
                                                : ''
                                            }`}
                                          >
                                            <div className="audio-wave-cluster">
                                              {[0.45, 0.62, 0.8, 1, 0.8, 0.62, 0.45].map((factor, bar) => (
                                                <span
                                                  key={bar}
                                                  className="audio-wave-bar"
                                                  style={{
                                                    '--wave-factor': factor,
                                                    animationDelay: `${bar * 0.08}s`,
                                                  }}
                                                />
                                              ))}
                                            </div>
                                          </div>
                                          <div className="flex-1 min-w-[220px]">
                                            <p className="font-[family-name:var(--font-flap)] text-[11px] tracking-[0.14em] uppercase text-[var(--flap-amber)] mb-2 m-0">
                                              Audio output
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2">
                                              <FlapButton
                                                variant={
                                                  ttsActiveItemId === item.id && ttsSpeaking && !ttsPaused
                                                    ? 'amber'
                                                    : 'ghost'
                                                }
                                                onClick={() => handlePlayPauseToggle(item)}
                                                disabled={ttsLoadingItemId === item.id}
                                                aria-label={
                                                  ttsActiveItemId === item.id && ttsSpeaking && !ttsPaused
                                                    ? 'Pause audio'
                                                    : 'Play audio'
                                                }
                                              >
                                                {ttsLoadingItemId === item.id
                                                  ? '…'
                                                  : ttsActiveItemId === item.id &&
                                                      ttsSpeaking &&
                                                      !ttsPaused
                                                    ? 'Pause'
                                                    : 'Play'}
                                              </FlapButton>
                                              <select
                                                value={ttsRate}
                                                onChange={(e) =>
                                                  handleTtsRateChange(item, Number(e.target.value))
                                                }
                                                className="bg-[var(--flap-face)] text-[var(--flap-ink)] border border-[var(--board-rule)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--flap-amber)]"
                                              >
                                                <option value={1}>1x</option>
                                                <option value={1.25}>1.25x</option>
                                                <option value={1.5}>1.5x</option>
                                                <option value={1.75}>1.75x</option>
                                                <option value={2}>2x</option>
                                              </select>
                                              <FlapButton variant="ghost" onClick={() => speakAnswerText(item)}>
                                                Replay
                                              </FlapButton>
                                              <FlapButton
                                                variant="ghost"
                                                onClick={() => {
                                                  setAudioTextViewById((prev) => ({
                                                    ...prev,
                                                    [item.id]: true,
                                                  }))
                                                }}
                                              >
                                                Text Form
                                              </FlapButton>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  ) : item.responseMode === 'video' ? (
                                    <div className="space-y-3">
                                      <div className="text-sm text-[var(--flap-ink)] leading-relaxed">
                                        <FormattedAnswerText text={item.answer} />
                                      </div>
                                      {item.videoUrl ? (
                                        <div className="space-y-2">
                                          <video
                                            src={item.videoUrl}
                                            controls
                                            playsInline
                                            className="w-full border border-[var(--board-rule)] bg-black"
                                            onError={() => {
                                              setQaThread((prev) =>
                                                prev.map((q) =>
                                                  q.id === item.id
                                                    ? {
                                                        ...q,
                                                        videoPlaybackError:
                                                          'Could not load the video. The link may have expired or D-ID may have blocked playback. Try again or use text/audio mode.',
                                                      }
                                                    : q,
                                                ),
                                              )
                                            }}
                                          />
                                          {item.videoPlaybackError ? (
                                            <p className="text-xs text-[var(--flap-amber)] border border-[var(--flap-amber)]/40 bg-[var(--flap-face)] px-3 py-2 m-0">
                                              {item.videoPlaybackError}
                                            </p>
                                          ) : null}
                                        </div>
                                      ) : item.videoError ? (
                                        <p className="text-xs text-[var(--flap-amber)] border border-[var(--flap-amber)]/40 bg-[var(--flap-face)] px-3 py-2 leading-relaxed m-0">
                                          {item.videoError}
                                        </p>
                                      ) : (
                                        <p className="text-xs text-[var(--flap-mute)] italic m-0">
                                          Generating video… (D‑ID; needs a teacher profile photo)
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-sm text-[var(--flap-ink)] leading-relaxed">
                                      <FormattedAnswerText text={item.answer} />
                                    </div>
                                  )}

                                  <div className="mt-3 space-y-2">
                                    <FlapButton
                                      variant="amber"
                                      onClick={() => handleStoryMode(item)}
                                      disabled={item.storyLoading}
                                    >
                                      {item.storyLoading
                                        ? 'Loading Story mode…'
                                        : item.storyFacts
                                          ? 'Refresh Story mode'
                                          : 'Know more'}
                                    </FlapButton>
                                    {item.storyError ? (
                                      <p className="text-xs text-[var(--flap-amber)] border border-[var(--flap-amber)]/40 bg-[var(--flap-face)] px-3 py-2 m-0">
                                        {item.storyError}
                                      </p>
                                    ) : null}
                                    {item.storyFacts ? (
                                      <div className="p-3 border border-[var(--board-rule)] bg-[var(--flap-face)] text-sm whitespace-pre-line">
                                        <strong className="font-[family-name:var(--font-flap)] tracking-[0.08em] uppercase text-[var(--flap-amber)]">
                                          Story mode
                                        </strong>
                                        <div className="mt-1 font-[family-name:var(--font-body)] text-[var(--flap-ink)]">
                                          <FormattedAnswerText text={item.storyFacts} />
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                  </>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 bg-[var(--flap-amber)] animate-pulse" />
                                    <p className="text-sm text-[var(--flap-mute)] italic m-0">
                                      Teacher is thinking…
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {qaThread.length === 0 && (
                            <p className="text-sm text-[var(--flap-mute)] italic px-3 py-4 m-0">
                              Ask a question from the student side to see the answer here.
                            </p>
                          )}
                          {summary && (
                            <div className="m-3 p-3 border border-[var(--board-rule)] bg-[var(--flap-face)] text-sm whitespace-pre-line">
                              <strong className="font-[family-name:var(--font-flap)] tracking-[0.08em] uppercase text-[var(--flap-amber)]">
                                Lesson Summary
                              </strong>
                              <div className="mt-1 font-[family-name:var(--font-body)] text-[var(--flap-ink)]">
                                <FormattedAnswerText text={summary} />
                              </div>
                            </div>
                          )}
                        </div>
                      </FlapPanel>
                    </div>
                  ) : (
                    <FlapPanel className="p-5 text-sm text-[var(--flap-mute)]">
                      <p className="font-[family-name:var(--font-flap)] text-sm font-semibold tracking-[0.08em] uppercase text-[var(--flap-ink)] mb-1 m-0">
                        Prepare your learning session
                      </p>
                      <p className="text-xs m-0">
                        We’ll guide you. Select the required items to start learning.
                      </p>
                    </FlapPanel>
                  )}
                </div>
              )}
            </FlapPanel>

            {teacherTopTool === 'learn' && !canEnterLearn && (
              <div className="absolute inset-0 z-20 overflow-hidden">
                <div className="absolute inset-0 bg-[var(--board-steel)]/92" />
                <div className="relative h-full flex items-center justify-center p-4">
                  <FlapPanel className="w-full max-w-[520px]">
                    <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[var(--board-rule)] bg-[var(--board-steel-deep)]">
                      <div>
                        <p className="font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--flap-ink)] m-0">
                          Before you click Learn
                        </p>
                        <p className="text-xs text-[var(--flap-mute)] mt-1 m-0">
                          Complete these steps. Once they’re done, Learn will unlock automatically.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTeacherTopTool('teacher')}
                        className="p-2 text-[var(--flap-mute)] hover:text-[var(--flap-ink)] border-none bg-transparent cursor-pointer"
                        aria-label="Close"
                      >
                        ×
                      </button>
                    </div>

                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-3 p-3 border border-[var(--board-rule)] bg-[var(--flap-face)]">
                        <div>
                          <p className="font-[family-name:var(--font-flap)] text-[11px] tracking-[0.1em] uppercase text-[var(--flap-ink)] m-0">
                            1) Select Subject
                          </p>
                          <p className="text-[11px] text-[var(--flap-mute)] m-0 mt-0.5">
                            {selectedSubject ? `Selected: ${selectedSubject.label}` : 'Not selected'}
                          </p>
                        </div>
                        <FlapButton
                          variant="primary"
                          onClick={() => {
                            setSubjectOpen(true)
                          }}
                        >
                          Go
                        </FlapButton>
                      </div>

                      <div className="flex items-center justify-between gap-3 p-3 border border-[var(--board-rule)] bg-[var(--flap-face)]">
                        <div>
                          <p className="font-[family-name:var(--font-flap)] text-[11px] tracking-[0.1em] uppercase text-[var(--flap-ink)] m-0">
                            2) Select Lesson
                          </p>
                          <p className="text-[11px] text-[var(--flap-mute)] m-0 mt-0.5">
                            {selectedLesson ? `Selected: ${selectedLesson.title}` : 'Not selected'}
                          </p>
                        </div>
                        <FlapButton
                          variant="primary"
                          onClick={() => {
                            if (!selectedSubject) {
                              setSubjectOpen(true)
                              return
                            }
                            setLessonOpen(true)
                          }}
                        >
                          Go
                        </FlapButton>
                      </div>

                      <div className="flex items-center justify-between gap-3 p-3 border border-[var(--board-rule)] bg-[var(--flap-face)]">
                        <div>
                          <p className="font-[family-name:var(--font-flap)] text-[11px] tracking-[0.1em] uppercase text-[var(--flap-ink)] m-0">
                            3) Select Teacher
                          </p>
                          <p className="text-[11px] text-[var(--flap-mute)] m-0 mt-0.5">
                            {selectedTeacher ? `Selected: ${selectedTeacher.name}` : 'Not selected'}
                          </p>
                        </div>
                        <FlapButton variant="amber" onClick={() => setTeacherTopTool('teacher')}>
                          Choose
                        </FlapButton>
                      </div>
                    </div>

                    <div className="px-4 pb-4 text-xs text-[var(--flap-mute)]">
                      Tip: after selecting, click <strong>Learn</strong> again to start your session.
                    </div>
                  </FlapPanel>
                </div>
              </div>
            )}
          </section>

          {/* Student Side */}
          {/* Student Side — subject strip + homework (capped scroll) + ask fills rest */}
          <section className="flex-[2] min-w-0 flex flex-col min-h-0 gap-3">
            {/* Compact collapsible header strip — capped so it cannot steal the column */}
            <div className="shrink-0 flex flex-col gap-2 max-h-[min(32vh,280px)] min-h-0 overflow-y-auto overscroll-contain">
              <FlapPanel>
                <button
                  type="button"
                  onClick={() => setSubjectOpen((v) => !v)}
                  className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left border-none bg-transparent cursor-pointer"
                >
                  <div>
                    <p className="font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--flap-ink)] m-0">
                      1) Subject
                    </p>
                    <p className="text-xs text-[var(--flap-mute)] m-0 mt-0.5">
                      {!selectedTeacher
                        ? 'Select a teacher first — you will only see their subjects'
                        : selectedSubject
                          ? selectedSubject.label
                          : teacherSubjectList(selectedTeacher).length
                            ? 'Choose a subject this teacher covers'
                            : 'This teacher has no subjects listed yet'}
                    </p>
                  </div>
                  <span className="font-[family-name:var(--font-flap)] text-[10px] tracking-[0.12em] uppercase text-[var(--flap-mute)]">
                    {subjectOpen ? 'Minimize' : selectedSubject ? 'Change' : 'Select'}
                  </span>
                </button>
                {subjectOpen && (
                  <div className="px-3 pb-3 border-t border-[var(--board-rule)]">
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      {subjects.map((subj) => (
                        <button
                          key={subj.id}
                          type="button"
                          onClick={() => handleSelectSubject(subj)}
                          className={`p-3 border text-left cursor-pointer ${
                            selectedSubject?.id === subj.id
                              ? 'border-[var(--flap-amber)] bg-[var(--flap-face)]'
                              : 'border-[var(--board-rule)] bg-transparent hover:bg-[var(--flap-face)]/50'
                          }`}
                        >
                          <span className="font-[family-name:var(--font-flap)] text-sm font-semibold tracking-[0.06em] uppercase text-[var(--flap-ink)]">
                            {subj.label}
                          </span>
                        </button>
                      ))}
                      {subjects.length === 0 && (
                        <p className="col-span-2 text-sm text-[var(--flap-mute)] py-2 m-0">
                          {!selectedTeacher
                            ? 'Choose a teacher first. Only that teacher’s subjects will appear here.'
                            : 'This teacher has no matching subjects for your board and grade.'}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </FlapPanel>

              <FlapPanel className={!selectedSubject ? 'opacity-60' : ''}>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedSubject) return
                    setLessonOpen((v) => !v)
                  }}
                  className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left border-none bg-transparent cursor-pointer"
                >
                  <div>
                    <p className="font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--flap-ink)] m-0">
                      2) Lesson
                    </p>
                    <p className="text-xs text-[var(--flap-mute)] m-0 mt-0.5">
                      {selectedLesson
                        ? selectedLesson.title
                        : selectedSubject
                          ? `Choose a lesson in ${selectedSubject.label}`
                          : 'Select a subject first'}
                    </p>
                  </div>
                  <span className="font-[family-name:var(--font-flap)] text-[10px] tracking-[0.12em] uppercase text-[var(--flap-mute)]">
                    {!selectedSubject ? 'Locked' : lessonOpen ? 'Minimize' : selectedLesson ? 'Change' : 'Select'}
                  </span>
                </button>

                {lessonOpen && selectedSubject && (
                  <div className="px-3 pb-3 border-t border-[var(--board-rule)] space-y-0 pt-0">
                    {lessons.map((lesson) => (
                      <FlapRow
                        key={lesson.id}
                        selected={selectedLesson?.id === lesson.id}
                        onClick={() => handleSelectLesson(lesson)}
                        cols={[{ label: lesson.title, width: '1fr' }]}
                      />
                    ))}
                  </div>
                )}
              </FlapPanel>

              {selectedLesson && (
                <FlapPanel>
                  <button
                    type="button"
                    onClick={() => setProgressOpen((v) => !v)}
                    className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left border-none bg-transparent cursor-pointer"
                  >
                    <div>
                      <p className="font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--flap-ink)] m-0">
                        3) Progress
                      </p>
                      <p className="text-xs text-[var(--flap-mute)] m-0 mt-0.5">
                        {completedTopics.size}/{topicList.length} topics checked
                      </p>
                    </div>
                    <span className="font-[family-name:var(--font-flap)] text-[10px] tracking-[0.12em] uppercase text-[var(--flap-mute)]">
                      {progressOpen ? 'Minimize' : 'View'}
                    </span>
                  </button>
                  {progressOpen && (
                    <div className="px-3 pb-3 border-t border-[var(--board-rule)]">
                      <ul className="space-y-1.5 m-0 mt-2 p-0 list-none">
                        {topicList.map((topic, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm">
                            <span
                              className={
                                completedTopics.has(i)
                                  ? 'text-[var(--flap-amber)]'
                                  : 'text-[var(--flap-mute)]'
                              }
                            >
                              {completedTopics.has(i) ? '[x]' : '[ ]'}
                            </span>
                            <span
                              className={
                                completedTopics.has(i)
                                  ? 'text-[var(--flap-ink)]'
                                  : 'text-[var(--flap-mute)]'
                              }
                            >
                              {topic}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </FlapPanel>
              )}
            </div>

            <FlapPanel
              className={
                homeworkPanelOpen
                  ? 'shrink-0 max-h-[min(48vh,440px)] min-h-0 flex flex-col overflow-hidden'
                  : 'shrink-0'
              }
            >
              <button
                type="button"
                onClick={() => setHomeworkPanelOpen((o) => !o)}
                className="w-full shrink-0 flex items-center justify-between gap-3 px-3 py-2.5 text-left border-none bg-transparent cursor-pointer hover:bg-[var(--flap-face)]/40"
              >
                <div>
                  <p className="font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--flap-ink)] m-0">
                    Homework Photo Help
                  </p>
                  <p className="text-xs text-[var(--flap-mute)] m-0 mt-0.5">
                    Snap or upload a problem — get hints, not the answer.
                  </p>
                </div>
                <span className="font-[family-name:var(--font-flap)] text-[10px] tracking-[0.12em] uppercase text-[var(--flap-mute)]">
                  {homeworkPanelOpen ? 'Minimize' : 'Open'}
                </span>
              </button>
              {homeworkPanelOpen && (
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3 border-t border-[var(--board-rule)]">
                  <HomeworkPhotoUploader
                    key={`panel-${homeworkUploaderKey}`}
                    hideChrome
                    disabled={!selectedLesson}
                    loading={chatLoading}
                    onSubmit={handleHomeworkPhotoSubmit}
                  />
                  {!selectedLesson && (
                    <p className="mt-2 text-xs text-[var(--flap-amber)] m-0">
                      Select a subject and lesson first.
                    </p>
                  )}
                </div>
              )}
            </FlapPanel>

            <FlapPanel scroll className="flex-1 min-h-0 flex flex-col">
              <FlapPanelHead
                title="Ask your question"
                meta={
                  selectedSubject?.label
                    ? `${selectedSubject.label}${selectedLesson ? ` · ${selectedLesson.title}` : ''}`
                    : selectedLesson
                      ? 'Ready'
                      : 'Select subject + lesson'
                }
              />
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
                <p className="font-[family-name:var(--font-flap)] text-[10px] tracking-[0.12em] uppercase text-[var(--flap-mute)] mb-2 m-0">
                  Past conversations
                </p>
                {doubtHistory.length === 0 ? (
                  <p className="text-xs text-[var(--flap-mute)] italic m-0">
                    Your asked questions will show up here for quick reuse.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1.5 m-0 p-0 list-none">
                    {doubtHistory.map((q, i) => (
                      <li key={i} className="text-xs text-[var(--flap-ink)] border-b border-[var(--board-rule)] py-1.5">
                        {q}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {chatAttachOpen && (
                <div className="shrink-0 max-h-[min(36vh,320px)] min-h-0 overflow-y-auto overscroll-contain px-3 pb-2 border-t border-[var(--board-rule)] pt-2">
                  <HomeworkPhotoUploader
                    key={`attach-${homeworkUploaderKey}`}
                    compact
                    hideChrome
                    disabled={!selectedLesson}
                    loading={chatLoading}
                    onSubmit={handleHomeworkPhotoSubmit}
                    onClear={() => setChatAttachOpen(false)}
                  />
                </div>
              )}

              <div className="shrink-0 flex gap-2 px-3 py-3 border-t border-[var(--board-rule)]">
                <FlapButton
                  variant={chatAttachOpen ? 'amber' : 'ghost'}
                  onClick={() => setChatAttachOpen((o) => !o)}
                  disabled={!selectedLesson || chatLoading}
                  aria-label="Attach homework photo"
                  title="Attach homework photo"
                >
                  Photo
                </FlapButton>
                <FlapInput
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={selectedLesson ? 'Type your question here…' : 'Select a lesson to start…'}
                  disabled={!selectedLesson}
                  className="flex-1"
                />
                <FlapButton
                  variant="primary"
                  onClick={handleSendMessage}
                  disabled={!selectedLesson || !chatInput.trim() || chatLoading}
                >
                  {chatLoading ? 'Thinking…' : 'Send'}
                </FlapButton>
                <FlapButton
                  variant={micRecording ? 'amber' : 'ghost'}
                  onClick={handleMicRecording}
                  aria-label="Microphone"
                  disabled={!selectedLesson || chatLoading || micLoading}
                >
                  {micRecording ? 'Stop' : micLoading ? '…' : 'Mic'}
                </FlapButton>
              </div>
              <div className="shrink-0 px-3 pb-3 flex items-center justify-between gap-2">
                <p
                  className={`text-xs m-0 ${micError ? 'text-[var(--flap-cancel)]' : 'text-[var(--flap-mute)]'}`}
                >
                  {micError ||
                    (micRecording
                      ? 'Recording... click stop to send.'
                      : homeworkSessionActive
                        ? 'Follow-ups stay on your homework photo (hints only). Use mic for voice, or Photo for a new photo.'
                        : 'Use mic for voice question, or Photo for a homework photo.')}
                </p>
              </div>
            </FlapPanel>
          </section>
        </main>
      )}

      <LogoutReviewModal
        open={showLogoutModal}
        conversedTeachers={conversedTeachers}
        submitting={logoutSubmitting}
        submitError={logoutSubmitError}
        onCancel={() => {
          setShowLogoutModal(false)
          setLogoutSubmitError('')
        }}
        onQuit={performLogout}
        onSubmitReview={handleLogoutSubmitReview}
      />
    </BoardShell>
  )
}


export default StudentDashboard
