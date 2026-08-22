import PropTypes from 'prop-types'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { uploadTeacherAvatar } from '../services/api.js'

function PencilIcon({ className = 'w-5 h-5' }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.75}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
      />
    </svg>
  )
}

function AvatarUploader({
  displayName = 'Teacher',
  initialUrl,
  onUploaded,
  className = '',
  collapsible = false,
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialUrl || '')
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    setAvatarUrl(initialUrl || '')
  }, [initialUrl])

  useEffect(() => {
    if (!collapsible || !expanded) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setError('')
        setExpanded(false)
      }
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [collapsible, expanded])

  const fallbackInitial = useMemo(
    () => (displayName?.trim?.() ? displayName.trim().charAt(0).toUpperCase() : 'T'),
    [displayName],
  )

  const handlePick = () => {
    setError('')
    inputRef.current?.click?.()
  }

  const closeModal = () => {
    setError('')
    setExpanded(false)
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setError('Please upload a JPG, PNG, or WEBP image.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image is too large. Please upload a file under 2MB.')
      return
    }

    const localPreview = URL.createObjectURL(file)
    setPreviewUrl(localPreview)

    setUploading(true)
    const { data, error: apiError } = await uploadTeacherAvatar(file)
    setUploading(false)

    if (apiError) {
      setError(apiError.message || 'Failed to upload image. Please try again.')
      return
    }

    const nextUrl = data?.avatar_url || ''
    setAvatarUrl(nextUrl)
    setPreviewUrl('')
    onUploaded?.(nextUrl)
    if (collapsible) {
      setExpanded(false)
    }
  }

  const shownUrl = previewUrl || avatarUrl

  const uploadBlock = (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-[#2563eb] to-[#0ea5e9] flex items-center justify-center text-white font-bold shrink-0">
            {shownUrl ? (
              <img
                src={shownUrl}
                alt="Teacher avatar"
                className="w-full h-full object-cover"
                onError={() => setAvatarUrl('')}
              />
            ) : (
              <span className="text-lg">{fallbackInitial}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0b1220] truncate">Profile photo</p>
            <p className="text-xs text-slate-500 leading-snug">
              Preferred: clean/vectorized profile photo. This will be used in teacher listings and chat.
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={handlePick}
            disabled={uploading}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 transition-colors cursor-pointer border-none"
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>

      {previewUrl && (
        <div className="mt-3 rounded-xl overflow-hidden border border-slate-100 bg-slate-50">
          <div className="px-3 py-2 text-[11px] text-slate-500 border-b border-slate-100">
            Preview (will be cropped to square automatically)
          </div>
          <div className="p-3 flex items-center justify-center">
            <img src={previewUrl} alt="Preview" className="max-h-44 rounded-xl object-contain" />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-medium">
          {error}
        </div>
      )}
    </>
  )

  if (!collapsible) {
    return (
      <div className={`p-4 rounded-2xl border border-slate-100 bg-white shadow-sm ${className}`.trim()}>
        {uploadBlock}
      </div>
    )
  }

  const modal =
    expanded &&
    typeof document !== 'undefined' &&
    createPortal(
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="presentation">
        <button
          type="button"
          className="absolute inset-0 bg-[#0f172a]/50 backdrop-blur-md cursor-default"
          aria-label="Close dialog"
          onClick={closeModal}
        />
        <div
          className="relative z-10 w-full max-w-md max-h-[min(90vh,640px)] overflow-y-auto rounded-2xl border border-white/90 bg-white p-5 shadow-[0_24px_80px_rgba(26,15,30,0.35)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="avatar-editor-heading"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-slate-100/80">
            <h2 id="avatar-editor-heading" className="text-sm font-semibold text-[#0b1220]">
              Change profile photo
            </h2>
            <button
              type="button"
              onClick={closeModal}
              className="text-xs font-semibold text-slate-500 hover:text-[#2563eb] transition-colors"
            >
              Done
            </button>
          </div>
          {uploadBlock}
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      <div className={`flex flex-col items-start gap-0 ${className}`.trim()}>
        <div className="relative shrink-0">
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-gradient-to-br from-[#2563eb] to-[#0ea5e9] flex items-center justify-center text-white text-3xl font-bold ring-2 ring-white/80 shadow-md">
            {shownUrl ? (
              <img
                src={shownUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={() => setAvatarUrl('')}
              />
            ) : (
              <span>{fallbackInitial}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setError('')
              setExpanded(true)
            }}
            className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full bg-[#2563eb] text-white shadow-lg ring-2 ring-white hover:bg-[#1d4ed8] transition-colors"
            aria-label="Edit profile photo"
          >
            <PencilIcon />
          </button>
        </div>
      </div>
      {modal}
    </>
  )
}

AvatarUploader.propTypes = {
  displayName: PropTypes.string,
  initialUrl: PropTypes.string,
  onUploaded: PropTypes.func,
  className: PropTypes.string,
  collapsible: PropTypes.bool,
}

export default AvatarUploader
