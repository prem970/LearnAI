'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth.js'
import {
  RESPONSE_MODES,
  DIFFICULTY_LEVELS,
} from '../data/studentDashboardMock.js'
import { buildTeacherSystemPrompt, buildUserMessageWithContext } from '../prompts/teacherSystemPrompt.js'
import {
  fetchStudentDashboard,
  fetchTeachers,
  fetchTeacherTtsAudio,
  dismissAllLearningRecs,
  fetchLearningRecs,
  generateDidVideo,
  sendChatMessage,
  sendVoiceChatMessage,
  submitSessionFeedback,
} from '../services/api.js'
import { didMicrosoftVoiceIdForGender } from '../constants/didMicrosoftVoices.js'
import FormattedAnswerText from '../components/FormattedAnswerText.jsx'
import LogoutReviewModal from '../components/LogoutReviewModal.jsx'
import StudentQuizHub from '../components/StudentQuizHub.jsx'
import { sanitizeMathForSpeech } from '../utils/speechTextSanitize.js'
import { filterCurriculumForTeacher, teacherSubjectList } from '../lib/teacherSubjects.js'

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

// Sample logo placeholder (user will replace later)
function LogoPlaceholder() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563eb] to-[#0ea5e9] flex items-center justify-center text-white font-bold text-sm">
        L
      </div>
      <span className="font-[700] text-[#0b1220] text-lg tracking-tight">LearnAI</span>
    </div>
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

  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioChunksRef = useRef([])
  const ttsRateRef = useRef(1)
  const ttsVoicesRef = useRef({ male: null, female: null })
  const elevenLabsAudioRef = useRef(null)
  const elevenLabsObjectUrlRef = useRef(null)

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

  const handleSendMessage = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    if (!selectedSubject || !selectedLesson) return

    setChatInput('')
    setTeacherTopTool('learn')
    setDoubtHistory((prev) => (prev.includes(text) ? prev : [text, ...prev].slice(0, 10)))

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
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

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#eff6ff]">
      {/* ─── Top header ───────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200/80 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <LogoPlaceholder />
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {[
              { id: 'home', label: 'Home' },
              { id: 'learn', label: 'Learn through Chat' },
              { id: 'quiz', label: 'Quiz' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setLearningMode(m.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none cursor-pointer ${
                  learningMode === m.id ? 'bg-[#2563eb] text-white' : 'bg-transparent text-slate-600'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            <div className="text-right">
              <p className="text-sm font-semibold text-[#0b1220]">Welcome, {displayName}</p>
              <p className="text-xs text-slate-500">
                {gradeLabel ? `Grade: ${gradeLabel}` : 'Grade: —'}
                {boardLabel ? ` · Board: ${boardLabel}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogoutClick}
              className="px-3 py-1.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {learningMode === 'home' && (
        <div className="flex-1 overflow-y-auto max-w-[1100px] w-full mx-auto px-4 md:px-6 py-8">
          <h1 className="text-2xl font-[800] text-[#0b1220]">How do you want to learn today?</h1>
          <p className="text-slate-500 mt-2">Chat with an AI teacher, or take a quiz assigned to your grade.</p>
          {learningRecs[0] ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[#0b1220]">Recommended next</p>
                <p className="text-slate-600 mt-1">{learningRecs[0].reason}</p>
              </div>
              <button
                type="button"
                onClick={dismissFollowUp}
                className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-amber-800/70 hover:bg-amber-100 hover:text-amber-950"
                aria-label="Dismiss recommendation"
              >
                ×
              </button>
            </div>
          ) : null}
          <div className="grid md:grid-cols-2 gap-4 mt-8">
            <button
              type="button"
              onClick={() => setLearningMode('learn')}
              className="text-left rounded-3xl border border-slate-100 bg-white p-6 shadow-sm hover:border-[#2563eb]/40 cursor-pointer"
            >
              <p className="text-2xl">💬</p>
              <p className="text-lg font-bold mt-3">Learn through Chat</p>
              <p className="text-sm text-slate-500 mt-2">Ask questions, get guided explanations, and work through ideas with your AI teacher.</p>
            </button>
            <button
              type="button"
              onClick={() => setLearningMode('quiz')}
              className="text-left rounded-3xl border border-slate-100 bg-white p-6 shadow-sm hover:border-[#2563eb]/40 cursor-pointer"
            >
              <p className="text-2xl">📝</p>
              <p className="text-lg font-bold mt-3">Quiz</p>
              <p className="text-sm text-slate-500 mt-2">Take assessments for your grade. After each answer, a tutor helps you understand why.</p>
            </button>
          </div>
        </div>
      )}

      {learningMode === 'quiz' && (
        <div className="flex-1 min-h-0 max-w-[1600px] w-full mx-auto px-4 md:px-6 py-4 flex flex-col">
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
          <div className="absolute inset-0 z-50">
            <div className="absolute inset-0 bg-white/50 backdrop-blur-md" />
            <div className="relative h-full flex items-center justify-center p-4">
              <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/95 shadow-xl px-6 py-5 text-center">
                <p className="text-base font-semibold text-[#0b1220]">Loading curriculum...</p>
                <p className="mt-1 text-sm text-slate-500">Please wait while we fetch your dashboard.</p>
              </div>
            </div>
          </div>
        )}
        {!dashboardLoading && dashboardError && (
          <div className="absolute top-[72px] left-0 right-0 z-50 px-4 md:px-6">
            <div className="max-w-[1600px] mx-auto rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
              {dashboardError}
            </div>
          </div>
        )}
        {/* Teacher Side — 60%, full height */}
        <section className="flex-[3] min-w-0 flex flex-col flex-1 min-h-0 gap-4 relative">
          {/* Top tool switcher — fills available height */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {[
                  { id: 'teacher', label: 'Teacher', icon: '🧑‍🏫' },
                  { id: 'mode', label: 'Mode', icon: '🎛️' },
                  { id: 'difficulty', label: 'Level', icon: '🧠' },
                  { id: 'learn', label: 'Learn', icon: '🎓' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTeacherTopTool(item.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                      teacherTopTool === item.id
                        ? 'bg-[#2563eb] text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    } ${item.id === 'learn' && !canEnterLearn ? 'ring-1 ring-[#2563eb]/20' : ''}`}
                    aria-pressed={teacherTopTool === item.id}
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 hidden md:inline">
                  {selectedTeacher ? `Teacher: ${selectedTeacher.name}` : 'Select a teacher'}
                </span>
              </div>
            </div>

            {/* Tool panel (Teacher/Mode/Level only) */}
            {teacherTopTool !== 'learn' && <div className="mt-3 flex-1 flex flex-col min-h-0 overflow-hidden">
              {teacherTopTool === 'teacher' && (
                <div className="flex flex-col min-h-0 flex-1 gap-2 overflow-hidden">
                  {/* Search / sort / filter */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      value={teacherSearch}
                      onChange={(e) => setTeacherSearch(e.target.value)}
                      placeholder="Search teachers…"
                      className="px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb]"
                    />
                    <select
                      value={teacherSort}
                      onChange={(e) => setTeacherSort(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                    >
                      <option value="rating_desc">Sort: Rating (high → low)</option>
                      <option value="rating_asc">Sort: Rating (low → high)</option>
                      <option value="name_asc">Sort: Name (A → Z)</option>
                    </select>
                    <select
                      value={teacherStyle}
                      onChange={(e) => setTeacherStyle(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                    >
                      {teacherStyles.map((style) => (
                        <option key={style} value={style}>
                          {style === 'all' ? 'Filter: All styles' : `Style: ${style}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      Showing <span className="font-semibold">{filteredTeachers.length}</span>{' '}
                      teacher{filteredTeachers.length === 1 ? '' : 's'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setTeacherSearch('')
                        setTeacherStyle('all')
                        setTeacherSort('rating_desc')
                      }}
                      className="text-xs font-semibold text-slate-600 hover:text-[#2563eb]"
                    >
                      Reset
                    </button>
                  </div>

                  {/* List + Change Teacher in one scroll-contained block — no extra height when button appears */}
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
                      {filteredTeachers.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleSelectTeacher(t)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                            selectedTeacher?.id === t.id
                              ? 'border-[#2563eb] bg-[#eff6ff] ring-1 ring-[#2563eb]/30'
                              : 'border-slate-100 hover:bg-slate-50'
                          }`}
                        >
                          {t.avatar_url ? (
                            <img
                              src={t.avatar_url}
                              alt={t.name}
                              className="w-12 h-12 rounded-full object-cover shrink-0 border border-slate-100"
                              onError={(e) => { e.currentTarget.src = '' }}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2563eb] to-[#0ea5e9] flex items-center justify-center text-white font-semibold text-base shrink-0">
                              {t.name.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[#0b1220] truncate">{t.name}</p>
                            <p className="text-xs text-slate-500 truncate">{t.school}</p>
                            {teacherSubjectList(t).length ? (
                              <p className="text-xs text-slate-500 truncate">
                                {teacherSubjectList(t).join(' · ')}
                              </p>
                            ) : null}
                            <p className="text-xs text-[#2563eb] mt-0.5">
                              Style: {t.style} · ⭐ {teacherRatingSummary(t)}
                            </p>
                          </div>
                          <div className="text-xs text-slate-400">
                            {selectedTeacher?.id === t.id ? 'Selected' : 'Select'}
                          </div>
                        </button>
                      ))}
                      {filteredTeachers.length === 0 && (
                        <div className="text-sm text-slate-400 italic px-2 py-2">
                          No teachers match your search/filter.
                        </div>
                      )}
                    </div>
                    {selectedTeacher && (
                      <div className="flex-shrink-0 pt-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTeacher(null)}
                          className="w-full py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
                        >
                          Change Teacher
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {teacherTopTool === 'mode' && (
                <div className="flex gap-2">
                  {RESPONSE_MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setResponseMode(m.id)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                        responseMode === m.id
                          ? 'bg-[#2563eb] text-white shadow-md'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}

              {teacherTopTool === 'difficulty' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DIFFICULTY_LEVELS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDifficultyLevel(d.id)}
                      className={`py-2 rounded-xl text-sm font-medium transition-all ${
                        difficultyLevel === d.id
                          ? 'bg-[#0ea5e9] text-white shadow-md'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </div>}
            {/* Learn content — inside same card as tabs */}
            {teacherTopTool === 'learn' && (
            <div className="mt-3 flex-1 flex flex-col min-h-0">
              {canEnterLearn ? (
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[0.4fr_0.6fr] gap-4">
                  {/* Avatar panel */}
                  <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center">
                    {selectedTeacher?.avatar_url ? (
                      <img
                        src={selectedTeacher.avatar_url}
                        alt={selectedTeacher.name}
                        className="w-28 h-28 rounded-full object-cover border border-slate-100"
                        onError={(e) => { e.currentTarget.src = '' }}
                      />
                    ) : (
                      <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#2563eb] to-[#0ea5e9] flex items-center justify-center text-white font-bold text-4xl">
                        {selectedTeacher ? selectedTeacher.name.charAt(0) : '👩‍🏫'}
                      </div>
                    )}
                    <p className="mt-3 text-sm font-semibold text-[#0b1220]">
                      {selectedTeacher ? selectedTeacher.name : 'Select a teacher'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {selectedTeacher ? selectedTeacher.school : 'Personalize explanations by teaching style'}
                    </p>
                    {selectedTeacher && (
                      <p className="text-xs text-[#2563eb] mt-1">
                        {selectedTeacher.style} · ⭐ {teacherRatingSummary(selectedTeacher)}
                      </p>
                    )}
                    <div className="mt-4 w-full">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                          <p className="text-[11px] text-slate-500">Response</p>
                          <p className="text-sm font-semibold text-[#0b1220] capitalize">{responseMode}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                          <p className="text-[11px] text-slate-500">Difficulty</p>
                          <p className="text-sm font-semibold text-[#0b1220]">
                            {DIFFICULTY_LEVELS.find((d) => d.id === difficultyLevel)?.label || 'Beginner'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Answers (60%) */}
                  <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col min-h-0">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[#0b1220]">Teacher Answers</h3>
                        <p className="text-xs text-slate-500">
                          {selectedLesson ? `Lesson: ${selectedLesson.title}` : 'Select a lesson to begin'}
                        </p>
                      </div>
                      {selectedLesson && (
                        <button
                          type="button"
                          onClick={handleSummarize}
                          disabled={summarizing || !qaThread.some((i) => i.answer)}
                          className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#0ea5e9] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {summarizing ? 'Summarizing…' : 'Summarize'}
                        </button>
                      )}
                    </div>

                    {/* Answers feed */}
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-3 mb-4 pr-1">
                      {qaThread.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-slate-100 overflow-hidden">
                          <div className="px-4 py-3 bg-slate-50">
                            <p className="text-[11px] text-slate-500">Student asked</p>
                            <p className="text-sm font-medium text-[#0b1220]">{item.question}</p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              Teacher: {item.teacher?.name || 'not selected'} · {item.responseMode} ·{' '}
                              {DIFFICULTY_LEVELS.find((d) => d.id === item.difficultyLevel)?.label || 'Beginner'}
                            </p>
                          </div>
                          <div className="px-4 py-3">
                            {item.answer ? (
                              item.responseMode === 'audio' ? (
                                <>
                                  {audioTextViewById[item.id] ? (
                                    <div className="rounded-xl border border-[#0ea5e9]/20 bg-[#e0f2fe] p-3">
                                      <div className="mb-2">
                                        <button
                                          type="button"
                                          onClick={() => setAudioTextViewById((prev) => ({ ...prev, [item.id]: false }))}
                                          className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-white border border-[#0ea5e9]/20 text-[#0ea5e9] hover:bg-[#f0f9ff]"
                                        >
                                          ← Back
                                        </button>
                                      </div>
                                      <div className="text-sm text-slate-700 leading-relaxed">
                                        <FormattedAnswerText text={item.answer} />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="rounded-xl border border-[#0ea5e9]/20 bg-[#e0f2fe] p-3 flex flex-wrap items-center gap-3">
                                      <div className={`w-24 h-16 rounded-xl bg-gradient-to-br from-[#bae6fd] to-[#7dd3fc] flex items-center justify-center px-2 py-2 ${ttsActiveItemId === item.id && ttsSpeaking && !ttsPaused ? 'audio-wave-cluster-active ring-1 ring-[#0ea5e9]/35' : ''}`}>
                                        <div className="audio-wave-cluster">
                                          {[0.45, 0.62, 0.8, 1, 0.8, 0.62, 0.45].map((factor, bar) => (
                                            <span
                                              key={bar}
                                              className="audio-wave-bar"
                                              style={{ '--wave-factor': factor, animationDelay: `${bar * 0.08}s` }}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                      <div className="flex-1 min-w-[220px]">
                                        <p className="text-sm font-semibold text-[#0ea5e9] mb-2">Audio output</p>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => handlePlayPauseToggle(item)}
                                            disabled={ttsLoadingItemId === item.id}
                                            className={`px-3 py-1.5 rounded-md text-xs font-semibold border min-w-[44px] ${
                                              ttsActiveItemId === item.id && ttsSpeaking && !ttsPaused
                                                ? 'bg-[#0ea5e9] border-[#0ea5e9] text-white'
                                                : 'bg-white border-[#0ea5e9]/20 text-[#0ea5e9] hover:bg-[#f0f9ff]'
                                            } disabled:opacity-50`}
                                            aria-label={ttsActiveItemId === item.id && ttsSpeaking && !ttsPaused ? 'Pause audio' : 'Play audio'}
                                          >
                                            {ttsLoadingItemId === item.id
                                              ? '…'
                                              : ttsActiveItemId === item.id && ttsSpeaking && !ttsPaused
                                                ? '❚❚'
                                                : '▶'}
                                          </button>
                                          <select
                                            value={ttsRate}
                                            onChange={(e) => handleTtsRateChange(item, Number(e.target.value))}
                                            className="px-2.5 py-1.5 rounded-md border border-[#0ea5e9]/20 text-xs bg-white text-[#0ea5e9]"
                                          >
                                            <option value={1}>1x</option>
                                            <option value={1.25}>1.25x</option>
                                            <option value={1.5}>1.5x</option>
                                            <option value={1.75}>1.75x</option>
                                            <option value={2}>2x</option>
                                          </select>
                                          <button
                                            type="button"
                                            onClick={() => speakAnswerText(item)}
                                            className="px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-[#0ea5e9]/20 text-[#0ea5e9] hover:bg-[#f0f9ff]"
                                          >
                                            Replay
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAudioTextViewById((prev) => ({ ...prev, [item.id]: true }))
                                            }}
                                            className="px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-[#0ea5e9]/20 text-[#0ea5e9] hover:bg-[#f0f9ff]"
                                          >
                                            Text Form
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </>
                              ) : item.responseMode === 'video' ? (
                                <div className="space-y-3">
                                  <div className="text-sm text-slate-700 leading-relaxed">
                                    <FormattedAnswerText text={item.answer} />
                                  </div>
                                  {item.videoUrl ? (
                                    <div className="space-y-2">
                                      <video
                                        src={item.videoUrl}
                                        controls
                                        playsInline
                                        className="w-full rounded-xl border border-slate-200 bg-black"
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
                                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                          {item.videoPlaybackError}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : item.videoError ? (
                                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                                      {item.videoError}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-slate-400 italic">
                                      Generating video… (D‑ID; needs a teacher profile photo)
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="text-sm text-slate-700 leading-relaxed">
                                  <FormattedAnswerText text={item.answer} />
                                </div>
                              )
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="inline-block w-2 h-2 rounded-full bg-[#2563eb] animate-pulse" />
                                <p className="text-sm text-slate-400 italic">Teacher is thinking…</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {qaThread.length === 0 && (
                        <p className="text-sm text-slate-400 italic">
                          Ask a question from the student side to see the answer here.
                        </p>
                      )}
                    </div>

                    {summary && (
                      <div className="mb-4 p-3 rounded-xl bg-[#e0f2fe] border border-[#0ea5e9]/20 text-sm whitespace-pre-line">
                        <strong>Lesson Summary</strong>
                        <div className="mt-1 font-sans">
                          <FormattedAnswerText text={summary} />
                        </div>
                      </div>
                    )}

                  </section>
                </div>
              ) : (
                <section className="mt-3 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-sm text-slate-600">
                  <p className="font-semibold text-[#0b1220] mb-1">Prepare your learning session</p>
                  <p className="text-xs">
                    We’ll guide you. Select the required items to start learning.
                  </p>
                </section>
              )}
            </div>
          )}
          </div>

          {/* Learn guide overlay (blur behind) */}
          {teacherTopTool === 'learn' && !canEnterLearn && (
            <div className="absolute inset-0 z-20 rounded-2xl overflow-hidden">
              <div className="absolute inset-0 bg-white/55 backdrop-blur-md" />
              <div className="relative h-full flex items-center justify-center p-4">
                <div className="w-full max-w-[520px] bg-white rounded-2xl shadow-xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#0b1220]">Before you click Learn</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Complete these steps. Once they’re done, Learn will unlock automatically.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTeacherTopTool('teacher')}
                      className="p-2 rounded-xl hover:bg-slate-100 text-slate-600"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div>
                        <p className="text-xs font-semibold text-slate-700">1) Select Subject</p>
                        <p className="text-[11px] text-slate-500">
                          {selectedSubject ? `Selected: ${selectedSubject.label}` : 'Not selected'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSubjectOpen(true)
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#2563eb] text-white hover:opacity-90"
                      >
                        Go
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div>
                        <p className="text-xs font-semibold text-slate-700">2) Select Lesson</p>
                        <p className="text-[11px] text-slate-500">
                          {selectedLesson ? `Selected: ${selectedLesson.title}` : 'Not selected'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedSubject) {
                            setSubjectOpen(true)
                            return
                          }
                          setLessonOpen(true)
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#2563eb] text-white hover:opacity-90"
                      >
                        Go
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div>
                        <p className="text-xs font-semibold text-slate-700">3) Select Teacher</p>
                        <p className="text-[11px] text-slate-500">
                          {selectedTeacher ? `Selected: ${selectedTeacher.name}` : 'Not selected'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTeacherTopTool('teacher')}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#0ea5e9] text-white hover:opacity-90"
                      >
                        Choose
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 text-xs text-slate-500">
                    Tip: after selecting, click <strong>Learn</strong> again to start your session.
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Student Side — 40% (question-only) */}
        <section className="flex-[2] min-w-0 flex flex-col min-h-0 gap-4">
          {/* Subject/Lesson/Progress: shrink-wrap when minimized; scroll when expanded */}
          <div className="flex-shrink-0 overflow-y-auto flex flex-col gap-4 pr-1 max-h-[55vh]">
            {/* Subject (collapsible) */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100">
              <button
                type="button"
                onClick={() => setSubjectOpen((v) => !v)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-[#0b1220]">1) Subject</p>
                  <p className="text-xs text-slate-500">
                    {!selectedTeacher
                      ? 'Select a teacher first — you will only see their subjects'
                      : selectedSubject
                        ? selectedSubject.label
                        : teacherSubjectList(selectedTeacher).length
                          ? 'Choose a subject this teacher covers'
                          : 'This teacher has no subjects listed yet'}
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-500">
                  {subjectOpen ? 'Minimize' : selectedSubject ? 'Change' : 'Select'}
                </span>
              </button>
              {subjectOpen && (
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                    {subjects.map((subj) => (
                      <button
                        key={subj.id}
                        type="button"
                        onClick={() => handleSelectSubject(subj)}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          selectedSubject?.id === subj.id
                            ? 'border-[#2563eb] bg-[#eff6ff] ring-1 ring-[#2563eb]/30'
                            : 'border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-2xl block mb-1">📘</span>
                        <span className="text-sm font-semibold text-[#0b1220]">{subj.label}</span>
                      </button>
                    ))}
                    {subjects.length === 0 && (
                      <p className="col-span-2 text-sm text-slate-500 py-2">
                        {!selectedTeacher
                          ? 'Choose a teacher first. Only that teacher’s subjects will appear here.'
                          : 'This teacher has no matching subjects for your board and grade.'}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Lesson (collapsible) */}
            <section className={`bg-white rounded-2xl shadow-sm border ${selectedSubject ? 'border-slate-100' : 'border-slate-100/60 opacity-60'}`}>
              <button
                type="button"
                onClick={() => {
                  if (!selectedSubject) return
                  setLessonOpen((v) => !v)
                }}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-[#0b1220]">2) Lesson</p>
                  <p className="text-xs text-slate-500">
                    {selectedLesson ? selectedLesson.title : selectedSubject ? `Choose a lesson in ${selectedSubject.label}` : 'Select a subject first'}
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-500">
                  {!selectedSubject ? 'Locked' : lessonOpen ? 'Minimize' : selectedLesson ? 'Change' : 'Select'}
                </span>
              </button>

              {lessonOpen && selectedSubject && (
                <div className="px-4 pb-4">
                  <div className="space-y-2">
                    {lessons.map((lesson) => (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => handleSelectLesson(lesson)}
                        className={`w-full px-4 py-3 rounded-xl border text-left transition-all ${
                          selectedLesson?.id === lesson.id
                            ? 'border-[#2563eb] bg-[#eff6ff]'
                            : 'border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-sm font-medium text-[#0b1220]">{lesson.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Progress (collapsible) */}
            {selectedLesson && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-100">
                <button
                  type="button"
                  onClick={() => setProgressOpen((v) => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#0b1220]">3) Progress</p>
                    <p className="text-xs text-slate-500">
                      {completedTopics.size}/{topicList.length} topics checked
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">{progressOpen ? 'Minimize' : 'View'}</span>
                </button>
                {progressOpen && (
                  <div className="px-4 pb-4">
                    <ul className="space-y-2">
                      {topicList.map((topic, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          {completedTopics.has(i) ? (
                            <span className="text-emerald-500">✔</span>
                          ) : (
                            <span className="text-slate-300">⬜</span>
                          )}
                          <span className={completedTopics.has(i) ? 'text-slate-700' : 'text-slate-500'}>
                            {topic}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* Doubt history was moved into the Ask box */}
          </div>

          {/* Ask box: grows to fill space when Subject/Lesson/Progress are minimized */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col flex-1 min-h-[200px]">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <p className="text-sm font-semibold text-[#0b1220]">Ask your question</p>
                <p className="text-xs text-slate-500">
                  {selectedLesson ? 'Your teacher will answer on the left.' : 'Select subject + lesson first.'}
                </p>
              </div>
              <div className="text-xs font-semibold text-slate-500">
                {selectedSubject?.label ? `${selectedSubject.label}${selectedLesson ? ` · ${selectedLesson.title}` : ''}` : ''}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <p className="text-xs font-semibold text-slate-500 mb-2">Past conversations</p>
              {doubtHistory.length === 0 ? (
                <p className="text-xs text-slate-400 italic">
                  Your asked questions will show up here for quick reuse.
                </p>
              ) : (
                <ul className="mt-1 space-y-1.5">
                  {doubtHistory.map((q, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      • {q}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2 mt-3">
              <button
                type="button"
                className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Add files"
                title="Add files"
                disabled={!selectedLesson}
              >
                📎
              </button>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={selectedLesson ? 'Type your question here…' : 'Select a lesson to start…'}
                disabled={!selectedLesson}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40 focus:border-[#2563eb]"
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!selectedLesson || !chatInput.trim() || chatLoading}
                className="px-4 py-2.5 rounded-xl bg-[#2563eb] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {chatLoading ? 'Thinking…' : 'Send'}
              </button>
              <button
                type="button"
                onClick={handleMicRecording}
                className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                aria-label="Microphone"
                disabled={!selectedLesson || chatLoading || micLoading}
              >
                {micRecording ? '⏹️' : micLoading ? '…' : '🎤'}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className={`text-xs ${micError ? 'text-rose-600' : 'text-slate-400'}`}>
                {micError || (micRecording ? 'Recording... click stop to send.' : 'Use mic for voice question.')}
              </p>
            </div>
          </section>
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
    </div>
  )
}

export default StudentDashboard
