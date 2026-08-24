import { useEffect, useState } from 'react'

/**
 * Shown before student logout: optional feedback for one teacher they chatted with,
 * or quit without review. Cancel keeps the session.
 */
export default function LogoutReviewModal({
  open,
  conversedTeachers,
  onCancel,
  onQuit,
  onSubmitReview,
  submitting,
  submitError = '',
}) {
  const [teacherId, setTeacherId] = useState('')
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!open) return
    setLocalError('')
    setStars(0)
    setComment('')
    if (conversedTeachers?.length === 1) {
      setTeacherId(String(conversedTeachers[0].id))
    } else {
      setTeacherId('')
    }
  }, [open, conversedTeachers])

  if (!open) return null

  const canSubmit =
    conversedTeachers.length > 0 && teacherId && stars >= 1 && stars <= 5

  const handleSubmit = async () => {
    setLocalError('')
    if (!canSubmit) {
      setLocalError('Choose a teacher and a star rating to submit, or use Quit without review.')
      return
    }
    await onSubmitReview({
      teacherId: Number(teacherId),
      rating: stars,
      feedback: comment.trim() || null,
    })
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[var(--board-steel-deep)]/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-review-title"
    >
      <div className="w-full max-w-md border border-[var(--board-rule)] bg-[var(--board-steel)] p-5 sm:p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <h2
          id="logout-review-title"
          className="text-lg font-semibold text-[var(--flap-ink)] font-[family-name:var(--font-flap)] tracking-[0.1em] uppercase"
        >
          Before you go
        </h2>
        <h3 className="mt-1 text-sm text-[var(--flap-mute)]">
          Share quick feedback.
        </h3>
        <h3 className="mt-1 text-sm text-[var(--flap-mute)]">
        Your feedback will help us serve you better.
        </h3>

        {conversedTeachers.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--flap-mute)]">
            You have not completed a conversation with a teacher in this session yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="logout-teacher"
                className="block text-[11px] font-semibold tracking-[0.1em] uppercase text-[var(--flap-mute)] mb-1 font-[family-name:var(--font-flap)]"
              >
                Teacher you spoke with
              </label>
              <select
                id="logout-teacher"
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--board-rule)] text-sm bg-[var(--flap-face)] text-[var(--flap-ink)] outline-none focus:border-[var(--flap-amber)]"
              >
                <option value="">Select a teacher…</option>
                {conversedTeachers.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
                    {t.school ? ` · ${t.school}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[var(--flap-mute)] mb-1 font-[family-name:var(--font-flap)]">
                Rating
              </p>
              <div className="flex gap-1" role="group" aria-label="Rating 1 to 5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStars(n)}
                    className={`text-2xl leading-none px-0.5 transition-opacity bg-transparent border-none cursor-pointer ${
                      stars >= n ? 'opacity-100' : 'opacity-35 hover:opacity-60'
                    }`}
                    aria-pressed={stars === n}
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  >
                    ⭐
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="logout-comment"
                className="block text-[11px] font-semibold tracking-[0.1em] uppercase text-[var(--flap-mute)] mb-1 font-[family-name:var(--font-flap)]"
              >
                Comment (optional)
              </label>
              <textarea
                id="logout-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={255}
                placeholder="Suggestions or how the session went…"
                className="w-full px-3 py-2 border border-[var(--board-rule)] text-sm resize-y min-h-[80px] bg-[var(--flap-face)] text-[var(--flap-ink)] outline-none focus:border-[var(--flap-amber)] placeholder:text-[var(--flap-mute)]"
              />
              <p className="text-[11px] text-[var(--flap-mute)] mt-0.5">{comment.length}/255</p>
            </div>
          </div>
        )}

        {localError || submitError ? (
          <p className="mt-3 text-sm text-[var(--flap-cancel)]" role="alert">
            {localError || submitError}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-[11px] font-semibold tracking-[0.14em] uppercase font-[family-name:var(--font-flap)] text-[var(--flap-ink)] border border-[var(--board-rule)] bg-transparent hover:bg-[var(--flap-face)] disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onQuit}
            disabled={submitting}
            className="px-4 py-2 text-[11px] font-semibold tracking-[0.14em] uppercase font-[family-name:var(--font-flap)] text-[var(--flap-ink)] bg-[var(--board-steel-deep)] border border-[var(--board-rule)] hover:bg-[var(--flap-face)] disabled:opacity-50 cursor-pointer"
          >
            Quit without review
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || conversedTeachers.length === 0}
            className="px-4 py-2 text-[11px] font-semibold tracking-[0.14em] uppercase font-[family-name:var(--font-flap)] text-[var(--board-steel-deep)] bg-[var(--flap-amber)] hover:brightness-110 disabled:opacity-40 border-none cursor-pointer"
          >
            {submitting ? 'Saving…' : 'Submit & log out'}
          </button>
        </div>
      </div>
    </div>
  )
}
