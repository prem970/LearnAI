import { useState } from 'react'
import PropTypes from 'prop-types'

function normalizeSubject(raw) {
  const cleaned = raw.trim().replace(/\s+/g, ' ')
  if (!cleaned) return { key: '', label: '' }
  const key = cleaned.toLowerCase()
  const label = cleaned.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())
  return { key, label }
}

const chipBase =
  'inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-medium ' +
  'bg-[#eff6ff] text-brand-dark border-none cursor-pointer transition-colors duration-150 hover:bg-[#dbeafe]'

const inputWrapBase =
  'rounded-xl border bg-white px-2 py-1.5 flex flex-col gap-1 relative transition-[border-color] duration-200 '

function SubjectChips({ value, onChange, suggestions, onSearch, onEnsureSubject, error }) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)

  const handleAdd = async () => {
    const { key, label } = normalizeSubject(input)
    if (!key) return
    if (value.some((s) => s.key === key)) { setInput(''); setOpen(false); return }
    const provisional = { key, label }
    onChange([...value, provisional])
    setInput('')
    setOpen(false)
    const subject = await onEnsureSubject({ label })
    if (!subject) return
    onChange((prev) => prev.map((s) => (s.key === key ? subject : s)))
  }

  return (
    <div className="grid gap-1">
      <label className="text-sm font-medium text-[#0b1220]">Subjects they handle</label>
      <div className={`${inputWrapBase}${error ? 'border-rose-500' : 'border-slate-200'}`}>
        <div className="flex flex-wrap gap-1.5">
          {value.map((subject) => (
            <button
              key={subject.id ?? subject.key}
              type="button"
              className={chipBase}
              onClick={() => onChange(value.filter((s) => s.key !== subject.key))}
            >
              <span>{subject.label}</span>
              <span aria-hidden="true" className="text-[0.85em]">×</span>
            </button>
          ))}
          <input
            className="flex-1 min-w-[160px] border-none outline-none text-sm font-[inherit] py-1 px-1 bg-transparent"
            value={input}
            onChange={async (e) => {
              const text = e.target.value
              setInput(text)
              if (text.trim()) { setOpen(true); onSearch(text) }
              else setOpen(false)
            }}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') { e.preventDefault(); await handleAdd() }
            }}
            onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
            onBlur={() => setTimeout(() => setOpen(false), 80)}
            placeholder={value.length > 0 ? '' : 'Type a subject and press Enter'}
          />
        </div>

        {suggestions.length > 0 && open && (
          <ul className="absolute left-0 right-0 top-full mt-1 z-10 bg-white rounded-xl shadow-[0_18px_45px_rgba(15,23,42,0.16)] py-1 max-h-56 overflow-y-auto list-none m-0 p-0">
            {suggestions.map((s) => (
              <li
                key={s.id}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-[#eff6ff] transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!value.some((v) => v.id === s.id)) onChange([...value, s])
                  setInput(''); setOpen(false)
                }}
              >
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-rose-500 mt-0.5">{error}</p>}
    </div>
  )
}

SubjectChips.propTypes = {
  value: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, key: PropTypes.string.isRequired, label: PropTypes.string.isRequired })).isRequired,
  onChange: PropTypes.func.isRequired,
  suggestions: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number.isRequired, key: PropTypes.string.isRequired, label: PropTypes.string.isRequired })).isRequired,
  onSearch: PropTypes.func.isRequired,
  onEnsureSubject: PropTypes.func.isRequired,
  error: PropTypes.string,
}

export default SubjectChips
