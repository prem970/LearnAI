'use client'

import PropTypes from 'prop-types'
import { useEffect, useRef, useState } from 'react'
import { FlapButton, FlapInput } from './ui/Board.jsx'

const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_BYTES = 8 * 1024 * 1024
const MAX_EDGE = 1600

/**
 * Compress / resize large photos before upload (keeps under Gemini-friendly size).
 */
async function prepareImageFile(file) {
  if (!file?.type?.startsWith('image/')) return file
  if (file.size <= 1.5 * 1024 * 1024 && (!file.type || file.type === 'image/jpeg')) {
    return file
  }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
    })
    if (!blob) return file
    return new File([blob], (file.name || 'homework').replace(/\.\w+$/, '') + '.jpg', {
      type: 'image/jpeg',
    })
  } catch {
    return file
  }
}

function HomeworkPhotoUploader({
  disabled = false,
  loading = false,
  compact = false,
  hideChrome = false,
  onSubmit,
  onClear,
  className = '',
}) {
  const galleryRef = useRef(null)
  const cameraRef = useRef(null)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [preparing, setPreparing] = useState(false)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const clearSelection = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl('')
    setNote('')
    setError('')
    if (galleryRef.current) galleryRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
    onClear?.()
  }

  const acceptFile = async (raw) => {
    if (!raw) return
    setError('')
    if (!ALLOWED.includes(raw.type)) {
      setError('Please upload a JPG, PNG, or WEBP image.')
      return
    }
    if (raw.size > MAX_BYTES) {
      setError('Image is too large. Please upload a file under 8MB.')
      return
    }

    setPreparing(true)
    const prepared = await prepareImageFile(raw)
    setPreparing(false)

    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(prepared)
    setFile(prepared)
    setPreviewUrl(url)
  }

  const handleFileChange = (e) => {
    const next = e.target.files?.[0]
    void acceptFile(next)
  }

  const handleSubmit = () => {
    if (!file || loading || preparing || disabled) return
    onSubmit?.({ file, note: note.trim(), previewUrl })
  }

  return (
    <div
      className={`${hideChrome ? '' : `border border-[var(--board-rule)] bg-[var(--board-steel)] ${compact ? 'p-3' : 'p-4'}`} text-[var(--flap-ink)] ${className}`.trim()}
    >
      {!hideChrome && (
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <p className="font-[family-name:var(--font-flap)] font-semibold tracking-[0.08em] uppercase text-sm text-[var(--flap-ink)]">
              Homework Photo Help
            </p>
            <p className="text-xs text-[var(--flap-mute)] mt-0.5 font-[family-name:var(--font-body)]">
              Hints only — you’ll solve it yourself. Upload or snap the problem.
            </p>
          </div>
          <span className="shrink-0 font-[family-name:var(--font-flap)] text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-1 bg-[var(--flap-amber)] text-[var(--board-steel-deep)]">
            No full answers
          </span>
        </div>
      )}

      <div className="mb-3 border border-[var(--board-rule)] bg-[var(--flap-face)] px-3 py-2 text-xs text-[var(--flap-mute)] font-[family-name:var(--font-body)]">
        We read the question from your photo and give the next step or a guiding question — never the final answer.
      </div>

      <input
        ref={galleryRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || loading}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || loading}
      />

      <div className="flex flex-wrap gap-2 mb-3">
        <FlapButton
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={disabled || loading || preparing}
          variant="ghost"
        >
          Camera
        </FlapButton>
        <FlapButton
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={disabled || loading || preparing}
          variant="ghost"
        >
          Gallery
        </FlapButton>
        {file && (
          <FlapButton type="button" onClick={clearSelection} disabled={loading} variant="danger">
            Clear
          </FlapButton>
        )}
      </div>

      {previewUrl && (
        <div className="mb-3 overflow-hidden border border-[var(--board-rule)] bg-[var(--flap-face)]">
          <div className="px-3 py-1.5 font-[family-name:var(--font-flap)] text-[11px] tracking-[0.12em] uppercase text-[var(--flap-mute)] border-b border-[var(--board-rule)]">
            Preview
          </div>
          <div className="p-2 flex justify-center">
            <img
              src={previewUrl}
              alt="Homework preview"
              className={`${compact ? 'max-h-28' : 'max-h-40'} w-auto max-w-full object-contain`}
            />
          </div>
        </div>
      )}

      <label className="block mb-3">
        <span className="text-xs font-medium text-[var(--flap-mute)]">What are you stuck on? (optional)</span>
        <FlapInput
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={disabled || loading}
          placeholder="e.g. I don’t know how to start step 2…"
          className="mt-1"
        />
      </label>

      {error && (
        <div className="mb-3 px-3 py-2 border border-[var(--flap-cancel)]/50 text-[var(--flap-cancel)] text-xs font-medium">
          {error}
        </div>
      )}

      <FlapButton
        type="button"
        onClick={handleSubmit}
        disabled={!file || disabled || loading || preparing}
        variant="amber"
        className="w-full"
      >
        {preparing ? 'Preparing photo…' : loading ? 'Getting a hint…' : 'Get a hint'}
      </FlapButton>
    </div>
  )
}

HomeworkPhotoUploader.propTypes = {
  disabled: PropTypes.bool,
  loading: PropTypes.bool,
  compact: PropTypes.bool,
  hideChrome: PropTypes.bool,
  onSubmit: PropTypes.func,
  onClear: PropTypes.func,
  className: PropTypes.string,
}

export default HomeworkPhotoUploader
