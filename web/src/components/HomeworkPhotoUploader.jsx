'use client'

import PropTypes from 'prop-types'
import { useEffect, useRef, useState } from 'react'

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
    <div className={`rounded-2xl border border-slate-100 bg-white ${compact ? 'p-3' : 'p-4'} ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className={`font-semibold text-[#0b1220] ${compact ? 'text-sm' : 'text-sm'}`}>
            Homework Photo Help
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Hints only — you’ll solve it yourself. Upload or snap the problem.
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
          No full answers
        </span>
      </div>

      <div className="mb-3 rounded-xl bg-[#e0f2fe]/60 border border-[#0ea5e9]/20 px-3 py-2 text-xs text-slate-600">
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
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={disabled || loading || preparing}
          className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          📷 Camera
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={disabled || loading || preparing}
          className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          🖼 Gallery
        </button>
        {file && (
          <button
            type="button"
            onClick={clearSelection}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
          >
            Clear
          </button>
        )}
      </div>

      {previewUrl && (
        <div className="mb-3 rounded-xl overflow-hidden border border-slate-100 bg-slate-50">
          <div className="px-3 py-1.5 text-[11px] text-slate-500 border-b border-slate-100">Preview</div>
          <div className="p-2 flex justify-center">
            <img src={previewUrl} alt="Homework preview" className="max-h-48 rounded-lg object-contain" />
          </div>
        </div>
      )}

      <label className="block mb-3">
        <span className="text-xs font-medium text-slate-600">What are you stuck on? (optional)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={disabled || loading}
          placeholder="e.g. I don’t know how to start step 2…"
          className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40 focus:border-[#2563eb] disabled:bg-slate-50"
        />
      </label>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-medium">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!file || disabled || loading || preparing}
        className="w-full px-4 py-2.5 rounded-xl bg-[#2563eb] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {preparing ? 'Preparing photo…' : loading ? 'Getting a hint…' : 'Get a hint'}
      </button>
    </div>
  )
}

HomeworkPhotoUploader.propTypes = {
  disabled: PropTypes.bool,
  loading: PropTypes.bool,
  compact: PropTypes.bool,
  onSubmit: PropTypes.func,
  onClear: PropTypes.func,
  className: PropTypes.string,
}

export default HomeworkPhotoUploader
