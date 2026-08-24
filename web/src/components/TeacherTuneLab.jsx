'use client'

import PropTypes from 'prop-types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildTuneLabSystemPrompt, TUNE_FOLLOWUPS } from '../prompts/tuneLabPrompt.js'
import { sendChatMessage, fetchTeacherTtsAudio, generateDidVideo, updateTeacherProfile } from '../services/api.js'
import { FlapPanel, FlapPanelHead, FlapButton, FlapInput } from './ui/Board.jsx'

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
    <div className="max-w-3xl mx-auto space-y-4 pb-10">
      <FlapPanel>
        <FlapPanelHead title="Tune how your AI self teaches" />
        <div className="p-4 md:p-5">
          <p className="text-sm text-[var(--flap-mute)] leading-relaxed font-[family-name:var(--font-body)] m-0">
            Preview explanations in your voice and style - adjust quickly until it feels right. Nothing here is scored or
            shared with students.
          </p>
        </div>
      </FlapPanel>

      {labError ? (
        <div
          className="border border-[var(--flap-cancel)]/50 px-4 py-3 text-sm text-[var(--flap-cancel)] text-center font-[family-name:var(--font-body)]"
          role="status"
        >
          {labError}
        </div>
      ) : null}

      <FlapPanel className="p-4 md:p-5">
        <label
          htmlFor="tune-topic"
          className="block font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--flap-mute)] mb-2"
        >
          Topic
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <FlapInput
            id="tune-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a topic (e.g., Explain Magnetism)"
            className="flex-1 min-w-0"
          />
          <FlapButton
            type="button"
            onClick={handleGenerate}
            disabled={loading || !topic.trim()}
            variant="amber"
            className="shrink-0"
          >
            {loading ? 'Generating…' : 'Generate Preview'}
          </FlapButton>
        </div>
      </FlapPanel>

      <FlapPanel
        className={`transition-opacity duration-300 ${loading || tuneLoading ? 'opacity-90' : 'opacity-100'}`}
      >
        <FlapPanelHead title="Preview" meta="Your AI self" />
        <div className="p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            <div className="shrink-0 flex flex-col items-center gap-2 mx-auto sm:mx-0">
              <div className="w-24 h-24 sm:w-28 sm:h-28 overflow-hidden border border-[var(--board-rule)] bg-[var(--board-steel-deep)]">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-[family-name:var(--font-flap)] text-[var(--flap-ink)] text-3xl font-bold">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <span className="font-[family-name:var(--font-flap)] text-[10px] tracking-[0.12em] uppercase text-[var(--flap-mute)] text-center max-w-[8rem] leading-tight">
                Your avatar
              </span>
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-[family-name:var(--font-flap)] text-[11px] tracking-[0.12em] uppercase text-[var(--flap-mute)]">
                  Teaching style
                </span>
                <span className="font-[family-name:var(--font-flap)] text-[11px] tracking-[0.06em] uppercase px-2 py-1 border border-[var(--board-rule)] bg-[var(--flap-face)] text-[var(--flap-ink)] font-medium max-w-full truncate">
                  {styleLabel}
                </span>
              </div>

              {videoUrl ? (
                <div className="overflow-hidden border border-[var(--board-rule)] bg-[var(--board-steel-deep)] aspect-video max-h-[280px]">
                  <video ref={videoRef} src={videoUrl} className="w-full h-full object-contain" controls playsInline />
                </div>
              ) : (
                <div className="border border-dashed border-[var(--board-rule)] bg-[var(--flap-face)]/40 min-h-[120px] flex items-center justify-center p-4">
                  <p className="text-xs text-[var(--flap-mute)] text-center font-[family-name:var(--font-body)] m-0">
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
                  className="font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.12em] uppercase text-[var(--flap-amber)] hover:underline disabled:opacity-50 bg-transparent border-none cursor-pointer p-0"
                >
                  {videoLoading ? 'Preparing speaking preview…' : videoUrl ? 'Regenerate talking clip' : 'Add talking-avatar video'}
                </button>
              ) : hasPreview && !avatarUrl ? (
                <p className="text-[11px] text-[var(--flap-mute)] font-[family-name:var(--font-body)] m-0">
                  Add a profile photo under Account to enable talking-avatar video.
                </p>
              ) : null}

              <div
                className={`border border-[var(--board-rule)] bg-[var(--flap-face)] p-4 text-sm text-[var(--flap-ink)] leading-relaxed whitespace-pre-wrap font-[family-name:var(--font-body)] transition-opacity duration-300 ${
                  loading || tuneLoading ? 'opacity-60' : ''
                }`}
              >
                {previewText || (
                  <span className="text-[var(--flap-mute)]">Your AI teaching preview will appear here.</span>
                )}
              </div>

              {compareOn && beforeText ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="border border-[var(--board-rule)] bg-[var(--board-steel-deep)] p-3 text-xs text-[var(--flap-mute)] whitespace-pre-wrap max-h-48 overflow-y-auto font-[family-name:var(--font-body)]">
                    <span className="font-[family-name:var(--font-flap)] font-semibold tracking-[0.12em] uppercase text-[var(--flap-mute)] block mb-1">
                      Before
                    </span>
                    {beforeText}
                  </div>
                  <div className="border border-[var(--flap-amber)]/40 bg-[var(--flap-amber)]/10 p-3 text-xs text-[var(--flap-ink)] whitespace-pre-wrap max-h-48 overflow-y-auto font-[family-name:var(--font-body)]">
                    <span className="font-[family-name:var(--font-flap)] font-semibold tracking-[0.12em] uppercase text-[var(--flap-amber)] block mb-1">
                      After
                    </span>
                    {previewText}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {audioUrl ? (
                  <audio ref={audioRef} src={audioUrl} className="hidden" preload="auto" />
                ) : null}
                <FlapButton type="button" onClick={togglePlay} disabled={!audioUrl || audioLoading} variant="primary">
                  {audioLoading ? 'Loading voice…' : 'Play / Pause'}
                </FlapButton>
                <FlapButton type="button" onClick={replay} disabled={!audioUrl || audioLoading} variant="ghost">
                  Replay
                </FlapButton>
                {!audioUrl && hasPreview && !audioLoading ? (
                  <span className="text-[11px] text-[var(--flap-mute)] font-[family-name:var(--font-body)]">
                    Voice preview needs a cloned voice from onboarding.
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </FlapPanel>

      <FlapPanel className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-[var(--flap-amber)] border-[var(--board-rule)]"
            checked={compareOn}
            onChange={(e) => setCompareOn(e.target.checked)}
          />
          <span className="font-[family-name:var(--font-flap)] text-sm font-medium tracking-[0.06em] uppercase text-[var(--flap-ink)]">
            Compare versions
          </span>
        </label>
        <p className="text-[11px] text-[var(--flap-mute)] sm:text-right font-[family-name:var(--font-body)] m-0">
          When on, the previous draft is kept as “Before” when you generate or tune.
        </p>
      </FlapPanel>

      <FlapPanel>
        <FlapPanelHead title="Voice & delivery" />
        <div className="p-4 md:p-5 space-y-4">
          <FlapButton type="button" onClick={handleRerecordVoice} variant="ghost" className="w-full sm:w-auto">
            🎤 Re-record explanation
          </FlapButton>

          <p className="font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--flap-mute)] pt-2 m-0">
            Quick tune (preview + student AI)
          </p>
          <p className="text-[11px] text-[var(--flap-mute)] -mt-2 font-[family-name:var(--font-body)] m-0">
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
                  className={`flex items-center gap-3 text-left px-4 py-3 border transition-colors font-[family-name:var(--font-body)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    tuneLoading === a.key
                      ? 'border-[var(--flap-amber)] bg-[var(--flap-amber)]/15 text-[var(--flap-ink)]'
                      : selected
                        ? 'border-[var(--flap-ink)]/30 bg-[var(--flap-face)] text-[var(--flap-ink)]'
                        : 'border-[var(--board-rule)] bg-transparent text-[var(--flap-ink)] hover:bg-[var(--flap-face)]/50'
                  }`}
                >
                  <span className="text-lg" aria-hidden>
                    {a.icon}
                  </span>
                  <span className="text-sm font-medium">{a.label}</span>
                </button>
              )
            })}
          </div>

          {hasUnsavedPrefs ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-[var(--board-rule)]">
              <p className="text-xs text-[var(--flap-mute)] flex-1 font-[family-name:var(--font-body)] m-0">
                You have unsaved preference changes for student-facing AI.
              </p>
              <FlapButton type="button" onClick={handleSavePreferences} disabled={saveBusy} variant="amber" className="shrink-0">
                {saveBusy ? 'Saving…' : 'Save preferences'}
              </FlapButton>
            </div>
          ) : null}
        </div>
      </FlapPanel>

      <p className="text-center text-[12px] text-[var(--flap-mute)] px-4 leading-relaxed max-w-lg mx-auto font-[family-name:var(--font-body)]">
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
