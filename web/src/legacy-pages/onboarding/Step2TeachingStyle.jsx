import PropTypes from 'prop-types'
import { useEffect, useRef, useState } from 'react'

const MIN_SECONDS = 35
const MAX_SECONDS = 300
const MAX_BYTES = 24 * 1024 * 1024

/**
 * MediaRecorder WebM blobs often omit duration in HTMLAudio metadata; Web Audio decode is reliable in Chrome.
 */
async function getAudioDurationSeconds(blob) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (AudioCtx) {
        const ctx = new AudioCtx()
        try {
            const ab = await blob.arrayBuffer()
            const buffer = await ctx.decodeAudioData(ab.slice(0))
            const d = buffer.duration
            if (Number.isFinite(d) && d > 0) {
                return d
            }
        } catch {
            /* fall through */
        } finally {
            await ctx.close()
        }
    }

    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob)
        const audio = new Audio()
        let settled = false
        const finish = (ok, d) => {
            if (settled) return
            if (ok && Number.isFinite(d) && d > 0 && d !== Infinity) {
                settled = true
                URL.revokeObjectURL(url)
                resolve(d)
            }
        }
        const fail = () => {
            if (settled) return
            settled = true
            URL.revokeObjectURL(url)
            reject(new Error('Could not read recording length.'))
        }
        const tryDuration = () => finish(true, audio.duration)

        audio.preload = 'auto'
        audio.onloadedmetadata = tryDuration
        audio.onloadeddata = tryDuration
        audio.oncanplaythrough = () => {
            tryDuration()
            setTimeout(() => {
                tryDuration()
                if (!settled) fail()
            }, 250)
        }
        audio.onerror = fail
        audio.src = url
        audio.load()
    })
}

function Step2TeachingStyle({ onBack, onSubmit, submitting }) {
    const [recording, setRecording] = useState(false)
    const [seconds, setSeconds] = useState(0)
    const [blob, setBlob] = useState(null)
    const [mimeType, setMimeType] = useState('')
    const [previewUrl, setPreviewUrl] = useState(null)
    const [error, setError] = useState('')
    const mediaRecorderRef = useRef(null)
    const mediaStreamRef = useRef(null)
    const chunksRef = useRef([])
    const timerRef = useRef(null)
    const secondsRef = useRef(0)
    /** Seconds counted while recording (fallback when WebM has no metadata duration). */
    const recordedDurationRef = useRef(null)

    useEffect(() => {
        if (!blob) {
            setPreviewUrl(null)
            return
        }
        const u = URL.createObjectURL(blob)
        setPreviewUrl(u)
        return () => URL.revokeObjectURL(u)
    }, [blob])

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
            if (mediaRecorderRef.current?.state !== 'inactive') {
                mediaRecorderRef.current?.stop()
            }
            mediaStreamRef.current?.getTracks?.().forEach((t) => t.stop())
        }
    }, [])

    const stopTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
        }
    }

    const startRecording = async () => {
        setError('')
        setBlob(null)
        recordedDurationRef.current = null
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            setError('Recording is not supported in this browser.')
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
            chunksRef.current = []
            recorder.ondataavailable = (e) => {
                if (e.data?.size > 0) chunksRef.current.push(e.data)
            }
            recorder.onstop = () => {
                recordedDurationRef.current = secondsRef.current
                mediaStreamRef.current?.getTracks?.().forEach((t) => t.stop())
                mediaStreamRef.current = null
                const type = recorder.mimeType || 'audio/webm'
                const b = new Blob(chunksRef.current, { type })
                setMimeType(type)
                setBlob(b)
                stopTimer()
                setRecording(false)
                setSeconds(0)
                secondsRef.current = 0
            }
            recorder.start(250)
            setRecording(true)
            setSeconds(0)
            secondsRef.current = 0
            timerRef.current = setInterval(() => {
                setSeconds((s) => {
                    const next = s + 1
                    secondsRef.current = next
                    if (next >= MAX_SECONDS && mediaRecorderRef.current?.state === 'recording') {
                        mediaRecorderRef.current.stop()
                    }
                    return next
                })
            }, 1000)
        } catch {
            setError('Microphone permission denied or unavailable.')
        }
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop()
        }
    }

    const handleFile = async (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        setError('')
        if (file.size > MAX_BYTES) {
            setError('File is too large (max ~24 MB).')
            return
        }
        recordedDurationRef.current = null
        setBlob(file)
        setMimeType(file.type || 'audio/webm')
    }

    const handleSubmit = async () => {
        if (!blob) {
            setError('Record or upload audio of your teaching sample.')
            return
        }
        if (blob.size < 1024) {
            setError('Audio is too short. Please record again.')
            return
        }
        let duration
        try {
            duration = await getAudioDurationSeconds(blob)
        } catch {
            duration = null
        }
        const timerFallback =
            recordedDurationRef.current != null && recordedDurationRef.current > 0
                ? recordedDurationRef.current
                : null
        if (duration == null || !Number.isFinite(duration) || duration <= 0) {
            if (timerFallback != null && timerFallback >= MIN_SECONDS) {
                duration = timerFallback
            } else {
                setError(
                    'Could not read audio length. If you uploaded a file, try MP3 or WAV. If you recorded, try again or use Chrome.',
                )
                return
            }
        }
        if (duration < MIN_SECONDS) {
            setError(`Please record at least ${MIN_SECONDS} seconds (about ${MIN_SECONDS}–90s works well).`)
            return
        }
        if (duration > MAX_SECONDS) {
            setError(`Please keep the sample under ${MAX_SECONDS / 60} minutes.`)
            return
        }
        setError('')
        onSubmit({ audioBlob: blob, mimeType: mimeType || blob.type || 'audio/webm' })
    }

    const mm = Math.floor(seconds / 60)
    const ss = seconds % 60
    const timerLabel = recording ? `${mm}:${String(ss).padStart(2, '0')}` : null

    return (
        <div className="animate-auth-fade">
            <div className="mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#eff6ff] rounded-full mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2563eb]" />
                    <span className="text-xs font-[600] text-[#2563eb] uppercase tracking-wider">Step 2</span>
                </div>
                <h2 className="text-[1.35rem] font-[700] text-[#0b1220] mb-1">Teach a topic — by voice</h2>
                <p className="text-sm text-slate-500">
                    Record yourself explaining any topic from your grades/subjects. We transcribe it for your teaching style and clone your voice for students.
                </p>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-r from-[#eff6ff] to-[#f0f9ff] border border-[#2563eb]/15 mb-5">
                <div className="flex gap-3">
                    <span className="text-xl flex-shrink-0 mt-0.5">🎙️</span>
                    <div>
                        <p className="text-sm font-[600] text-[#0b1220] mb-1">Tips</p>
                        <ul className="text-sm text-slate-600 leading-relaxed list-disc pl-4 space-y-1">
                            <li>Speak clearly in a quiet place.</li>
                            <li>Aim for <strong>{MIN_SECONDS}+ seconds</strong> (up to {MAX_SECONDS / 60} min).</li>
                            <li>Teach one topic as you would in class — examples and questions welcome.</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 mb-4">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                    {!recording ? (
                        <button
                            type="button"
                            onClick={startRecording}
                            disabled={submitting}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-white bg-[#2563eb] hover:opacity-95 disabled:opacity-50"
                        >
                            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                            Start recording
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={stopRecording}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-white bg-rose-600 hover:opacity-95"
                        >
                            Stop
                        </button>
                    )}
                    {timerLabel && (
                        <span className="text-sm font-mono font-[600] text-[#2563eb]">{timerLabel}</span>
                    )}
                    <label className="text-sm text-slate-600 cursor-pointer">
                        <span className="underline text-[#2563eb] font-[600]">Or upload audio</span>
                        <input type="file" accept="audio/*,.webm,.wav,.mp3,.m4a,.ogg" className="hidden" onChange={handleFile} disabled={submitting || recording} />
                    </label>
                </div>

                {blob && (
                    <p className="text-xs text-slate-500 mb-2">
                        Ready: {(blob.size / 1024 / 1024).toFixed(2)} MB · {mimeType || blob.type || 'audio'}
                    </p>
                )}

                {previewUrl && (
                    <audio
                        controls
                        className="w-full rounded-xl"
                        src={previewUrl}
                    />
                )}
            </div>

            {error && (
                <p className="text-rose-600 text-sm font-medium mb-3">{error}</p>
            )}

            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    disabled={submitting}
                    className="flex-1 px-4 py-2.5 rounded-full font-semibold text-[#2563eb] border-2 border-[#2563eb]/30 bg-white hover:bg-[#eff6ff] disabled:opacity-50"
                >
                    ← Back
                </button>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || recording}
                    className="flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 rounded-full font-semibold text-white btn-gradient disabled:opacity-60"
                >
                    {submitting ? (
                        <span className="spinner" aria-label="Submitting" />
                    ) : (
                        <>
                            Submit My Profile
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}

Step2TeachingStyle.propTypes = {
    onBack: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
    submitting: PropTypes.bool,
}

export default Step2TeachingStyle
