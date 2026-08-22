'use client'

import PropTypes from 'prop-types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildTuneLabSystemPrompt, TUNE_FOLLOWUPS } from '../prompts/tuneLabPrompt.js'
import { sendChatMessage, fetchTeacherTtsAudio, generateDidVideo, updateTeacherProfile } from '../services/api.js'

const glass =
  'rounded-2xl border border-white/70 bg-white/70 backdrop-blur-xl shadow-[0_8px_40px_rgba(37,99,235,0.08)]'

/** Maps quick-tune action to stored DB / student-prompt keys */
const ACTION_TO_PREF = {
  simplify: 'simplify',
  exam: 'exam_focused',
  example: 'real_life_example',
}

function stripForSpeech(text) {
  if (!text) return ''
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sortPrefs(a) {
  return [...a].sort()
}

function prefsEqual(a, b) {
  return JSON.stringify(sortPrefs(a ?? [])) === JSON.stringify(sortPrefs(b ?? []))
}

const SOFT_HINTS = [
  'You can try simplifying this explanation for extra clarity.',
  'Small tweaks here can make a big difference for learners.',
  'Experiment with tone until it feels right to you.',
  'There is no single “right” version—pick what matches your classroom voice.',
]

export default function TeacherTuneLab({ user, profile, onSaved }) {
  const router = useRouter()
  const teacherId = user?.id
  const displayName = user?.name || 'Teacher'
  const avatarUrl = profile?.avatar_url || user?.avatar_url || ''
  const styleLabel =
    profile?.detected_teaching_style?.trim() ||
    (profile?.teaching_explanation ? 'From your teaching profile' : 'Set your style in onboarding')

  const [topic, setTopic] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [beforeText, setBeforeText] = useState('')
  const [compareOn, setCompareOn] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tuneLoading, setTuneLoading] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [videoUrl, setVideoUrl] = useState(null)
  const [videoLoading, setVideoLoading] = useState(false)
  const [hintIndex, setHintIndex] = useState(0)
  const [labError, setLabError] = useState('')
  const [pendingPrefs, setPendingPrefs] = useState([])
  const [saveBusy, setSaveBusy] = useState(false)

  const serverTuneKey = JSON.stringify(profile?.tune_preferences ?? [])

  useEffect(() => {
    setPendingPrefs(Array.isArray(profile?.tune_preferences) ? [...profile.tune_preferences] : [])
  }, [serverTuneKey])

  const hasUnsavedPrefs = !prefsEqual(pendingPrefs, profile?.tune_preferences)

  const audioRef = useRef(null)
  const videoRef = useRef(null)
  const audioObjectUrlRef = useRef(null)

  const systemPrompt = useMemo(() => {
    const expl = profile?.teaching_explanation?.trim()
    const styleLine =
      profile?.detected_teaching_style?.trim() ||
      (expl ? expl.slice(0, 400) : 'Clear, supportive classroom explanations.')
    return buildTuneLabSystemPrompt({ teacherName: displayName, teachingStyle: styleLine })
  }, [displayName, profile?.detected_teaching_style, profile?.teaching_explanation])

  useEffect(
    () => () => {
      if (audioObjectUrlRef.current) {
        URL.revokeObjectURL(audioObjectUrlRef.current)
        audioObjectUrlRef.current = null
      }
    },
    [],
  )

  const loadAudio = useCallback(async (text) => {
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current)
      audioObjectUrlRef.current = null
    }
    setAudioUrl(null)
    const plain = stripForSpeech(text)
    if (!plain || !teacherId) return
    setAudioLoading(true)
    const { blob, error } = await fetchTeacherTtsAudio({ teacherId, text: plain })
    setAudioLoading(false)
    if (error?.message || !blob) return
    const url = URL.createObjectURL(blob)
    audioObjectUrlRef.current = url
    setAudioUrl(url)
  }, [teacherId])

  const runChat = useCallback(
    async (messages) => {
      const { data, error } = await sendChatMessage({ systemPrompt, messages })
      if (error) throw new Error(error.message || 'Could not generate preview.')
      const answer = data?.answer?.trim() || ''
      if (!answer) throw new Error('No explanation was returned. Try again.')
      return answer
    },
    [systemPrompt],
  )

  const handleGenerate = async () => {
    const t = topic.trim()
    if (!t || loading) return
    setLabError('')
    setLoading(true)
    setVideoUrl(null)
    try {
      if (compareOn && previewText) setBeforeText(previewText)
      const answer = await runChat([{ role: 'user', content: `Teach this topic clearly for students: ${t}` }])
      setPreviewText(answer)
      setHintIndex((i) => (i + 1) % SOFT_HINTS.length)
      await loadAudio(answer)
    } catch (e) {
      setLabError(e.message || 'Something went wrong. You can try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  const handleTunePreview = async (actionKey) => {
    const t = topic.trim()
    const follow = TUNE_FOLLOWUPS[actionKey]
    if (!t || !follow || !previewText || tuneLoading) return
    setLabError('')
    setTuneLoading(actionKey)
    setVideoUrl(null)
    try {
      if (compareOn) setBeforeText(previewText)
      const answer = await runChat([
        { role: 'user', content: `Topic: ${t}` },
        { role: 'assistant', content: previewText },
        { role: 'user', content: follow },
      ])
      setPreviewText(answer)
      setHintIndex((i) => (i + 1) % SOFT_HINTS.length)
      await loadAudio(answer)
    } catch (e) {
      setLabError(e.message || 'Could not update the preview. Please try again.')
    } finally {
      setTuneLoading(null)
    }
  }

  const handleTuneOptionClick = (actionKey) => {
    const prefKey = ACTION_TO_PREF[actionKey]
    if (!prefKey) return
    setPendingPrefs((prev) => {
      const wasOn = prev.includes(prefKey)
      const next = wasOn ? prev.filter((p) => p !== prefKey) : [...prev, prefKey]
      if (!wasOn) {
        queueMicrotask(() => {
          handleTunePreview(actionKey)
        })
      }
      return next
    })
  }

  const handleSavePreferences = async () => {
    setLabError('')
    setSaveBusy(true)
    const { error } = await updateTeacherProfile({ tune_preferences: pendingPrefs })
    setSaveBusy(false)
    if (error) {
      setLabError(error.message || 'Could not save preferences.')
      return
    }
    onSaved?.()
  }

  const handleRerecordVoice = () => {
    router.push('/teacher-onboarding?step=2')
  }

  const handleLoadVideo = async () => {
    const plain = stripForSpeech(previewText)
    if (!plain || !avatarUrl || videoLoading) return
    setLabError('')
    setVideoLoading(true)
    setVideoUrl(null)
    const { data, error } = await generateDidVideo({
      avatarUrl,
      text: plain,
    })
    setVideoLoading(false)
    if (error?.message) {
      setLabError(error.message)
      return
    }
    if (data?.result_url) setVideoUrl(data.result_url)
  }

  const togglePlay = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }

  const replay = () => {
    const a = audioRef.current
    if (!a) return
    a.currentTime = 0
    void a.play()
  }

  const hasPreview = Boolean(previewText)
  const tuneDisabled = !topic.trim() || !hasPreview || loading || Boolean(tuneLoading)

  const previewActions = [
    { key: 'simplify', icon: '🧠', label: 'Simplify explanation', pref: 'simplify' },
    { key: 'exam', icon: '🎯', label: 'Make it exam-focused', pref: 'exam_focused' },
    { key: 'example', icon: '📖', label: 'Add real-life example', pref: 'real_life_example' },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      <div className={`${glass} p-6 md:p-8`}>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#2563eb]/90 mb-1">Teaching Lab</p>
        <h2 className="text-xl font-bold text-[#0f172a] mb-2">Tune how your AI self teaches</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Preview explanations in your voice and style - adjust quickly until it feels right. Nothing here is scored or
          shared with students.
        </p>
      </div>

      {labError ? (
        <div className="rounded-xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm text-rose-900 text-center" role="status">
          {labError}
        </div>
      ) : null}

      <div className={`${glass} p-5 md:p-6`}>
        <label htmlFor="tune-topic" className="block text-xs font-semibold text-slate-600 mb-2">
          Topic
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="tune-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a topic (e.g., Explain Magnetism)"
            className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-slate-200/90 bg-white/85 text-sm text-[#0f172a] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !topic.trim()}
            className="shrink-0 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-40 transition-all duration-200 shadow-sm"
          >
            {loading ? 'Generating…' : 'Generate Preview'}
          </button>
        </div>
      </div>

      <div
        className={`${glass} p-5 md:p-7 border-[#2563eb]/15 ring-1 ring-[#2563eb]/10 transition-all duration-300 ${
          loading || tuneLoading ? 'opacity-90' : 'opacity-100'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">
          <div className="shrink-0 flex flex-col items-center gap-2 mx-auto sm:mx-0">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-gradient-to-br from-[#2563eb] to-[#0ea5e9] shadow-inner ring-2 ring-white/80">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-3xl font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-[10px] font-medium text-slate-500 text-center max-w-[8rem] leading-tight">
              Your avatar
            </span>
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500">Teaching style</span>
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-[#0ea5e9]/10 text-[#075985] font-medium max-w-full truncate">
                {styleLabel}
              </span>
            </div>

            {videoUrl ? (
              <div className="rounded-xl overflow-hidden border border-white/80 bg-black/5 aspect-video max-h-[280px]">
                <video ref={videoRef} src={videoUrl} className="w-full h-full object-contain" controls playsInline />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200/90 bg-white/50 min-h-[120px] flex items-center justify-center p-4">
                <p className="text-xs text-slate-500 text-center">
                  {hasPreview
                    ? 'Audio preview below uses your cloned voice when available. Add a talking clip if you like.'
                    : 'Generate a preview to see your explanation here.'}
                </p>
              </div>
            )}

            {hasPreview && avatarUrl ? (
              <button
                type="button"
                onClick={handleLoadVideo}
                disabled={videoLoading}
                className="text-xs font-semibold text-[#0ea5e9] hover:underline disabled:opacity-50"
              >
                {videoLoading ? 'Preparing speaking preview…' : videoUrl ? 'Regenerate talking clip' : 'Add talking-avatar video'}
              </button>
            ) : hasPreview && !avatarUrl ? (
              <p className="text-[11px] text-slate-500">Add a profile photo under Account to enable talking-avatar video.</p>
            ) : null}

            <div
              className={`rounded-xl bg-white/60 border border-slate-100/90 p-4 text-sm text-[#0f172a] leading-relaxed whitespace-pre-wrap transition-opacity duration-300 ${
                loading || tuneLoading ? 'opacity-60' : ''
              }`}
            >
              {previewText || (
                <span className="text-slate-400">Your AI teaching preview will appear here.</span>
              )}
            </div>

            {compareOn && beforeText ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-xs text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  <span className="font-semibold text-slate-500 block mb-1">Before</span>
                  {beforeText}
                </div>
                <div className="rounded-xl border border-[#0ea5e9]/25 bg-[#0ea5e9]/5 p-3 text-xs text-slate-800 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  <span className="font-semibold text-[#075985] block mb-1">After</span>
                  {previewText}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {audioUrl ? (
                <audio ref={audioRef} src={audioUrl} className="hidden" preload="auto" />
              ) : null}
              <button
                type="button"
                onClick={togglePlay}
                disabled={!audioUrl || audioLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#0f172a] text-white disabled:opacity-40"
              >
                {audioLoading ? 'Loading voice…' : 'Play / Pause'}
              </button>
              <button
                type="button"
                onClick={replay}
                disabled={!audioUrl || audioLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white/80 text-slate-700 disabled:opacity-40"
              >
                Replay
              </button>
              {!audioUrl && hasPreview && !audioLoading ? (
                <span className="text-[11px] text-slate-500">Voice preview needs a cloned voice from onboarding.</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className={`${glass} px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-[#2563eb] focus:ring-[#2563eb]"
            checked={compareOn}
            onChange={(e) => setCompareOn(e.target.checked)}
          />
          <span className="text-sm font-medium text-[#0f172a]">Compare versions</span>
        </label>
        <p className="text-[11px] text-slate-500 sm:text-right">When on, the previous draft is kept as “Before” when you generate or tune.</p>
      </div>

      <div className={`${glass} p-5 md:p-6 space-y-4`}>
        <p className="text-xs font-semibold text-slate-600">Voice & delivery</p>
        <button
          type="button"
          onClick={handleRerecordVoice}
          className="flex w-full sm:w-auto items-center gap-3 text-left px-4 py-3 rounded-xl border border-slate-200/90 bg-white/70 hover:bg-white hover:border-[#2563eb]/35 transition-all duration-200"
        >
          <span className="text-lg" aria-hidden>
            🎤
          </span>
          <span className="text-sm font-medium text-[#0f172a]">Re-record explanation</span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">Opens voice capture</span>
        </button>

        <p className="text-xs font-semibold text-slate-600 pt-2">Quick tune (preview + student AI)</p>
        <p className="text-[11px] text-slate-500 -mt-2">
          Tap an option to preview. Selected options apply to students only after you click Save preferences.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {previewActions.map((a) => {
            const selected = pendingPrefs.includes(a.pref)
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => handleTuneOptionClick(a.key)}
                disabled={tuneDisabled || tuneLoading === a.key}
                className={`flex items-center gap-3 text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                  tuneLoading === a.key
                    ? 'border-[#2563eb] bg-[#2563eb]/10'
                    : selected
                      ? 'border-[#0ea5e9]/50 bg-[#0ea5e9]/10'
                      : 'border-slate-200/90 bg-white/70 hover:bg-white hover:border-[#2563eb]/30 disabled:opacity-40'
                }`}
              >
                <span className="text-lg" aria-hidden>
                  {a.icon}
                </span>
                <span className="text-sm font-medium text-[#0f172a]">{a.label}</span>
              </button>
            )
          })}
        </div>

        {hasUnsavedPrefs ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-slate-200/80">
            <p className="text-xs text-slate-600 flex-1">You have unsaved preference changes for student-facing AI.</p>
            <button
              type="button"
              onClick={handleSavePreferences}
              disabled={saveBusy}
              className="shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#0ea5e9] hover:bg-[#0284c7] disabled:opacity-50 transition-colors"
            >
              {saveBusy ? 'Saving…' : 'Save preferences'}
            </button>
          </div>
        ) : null}
      </div>

      <p className="text-center text-[12px] text-slate-500 px-4 leading-relaxed max-w-lg mx-auto">
        {SOFT_HINTS[hintIndex]}
      </p>
    </div>
  )
}

TeacherTuneLab.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.number,
    name: PropTypes.string,
    avatar_url: PropTypes.string,
  }),
  profile: PropTypes.object,
  onSaved: PropTypes.func,
}
