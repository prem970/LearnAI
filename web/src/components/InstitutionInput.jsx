import { useState, useRef } from 'react'
import PropTypes from 'prop-types'

const chipBase =
    'inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-medium ' +
    'bg-[#eff6ff] text-brand-dark border-none cursor-pointer transition-colors duration-150 hover:bg-[#dbeafe]'

const inputWrapBase =
    'rounded-xl border bg-white px-2 py-1.5 flex flex-col gap-1 relative transition-[border-color] duration-200 '

function InstitutionInput({ value, onChange, suggestions, onSearch, onEnsure, error }) {
    const [input, setInput] = useState('')
    const [open, setOpen] = useState(false)
    const skipBlur = useRef(false)

    const commitTyped = (text) => {
        const cleaned = text.trim()
        if (!cleaned) return
        const key = cleaned.toLowerCase().replace(/\s+/g, ' ')
        const provisional = { key, label: cleaned }
        onChange(provisional)
        setInput('')
        setOpen(false)
        onEnsure({ label: cleaned }).then((confirmed) => { if (confirmed) onChange(confirmed) })
    }

    const handleBlur = () => {
        setTimeout(() => {
            if (skipBlur.current) { skipBlur.current = false; return }
            setOpen(false)
            if (input.trim() && !value) commitTyped(input)
        }, 80)
    }

    if (value) {
        return (
            <div className="grid gap-1">
                <label className="text-sm font-medium text-[#0b1220]">University / School name</label>
                <div className={`${inputWrapBase}${error ? 'border-rose-500' : 'border-slate-200'}`}>
                    <div className="flex flex-wrap gap-1.5 py-0.5">
                        <button type="button" className={chipBase} onClick={() => onChange(null)} aria-label={`Remove ${value.label}`}>
                            <span>{value.label}</span>
                            <span aria-hidden="true" className="text-[0.85em]">×</span>
                        </button>
                    </div>
                </div>
                {error && <p className="text-xs text-rose-500 mt-0.5">{error}</p>}
            </div>
        )
    }

    return (
        <div className="grid gap-1">
            <label className="text-sm font-medium text-[#0b1220]">University / School name</label>
            <div className={`${inputWrapBase}${error ? 'border-rose-500' : 'border-slate-200'}`}>
                <div className="flex flex-wrap gap-1.5">
                    <input
                        className="flex-1 min-w-[160px] border-none outline-none text-sm font-[inherit] py-1 px-1 bg-transparent"
                        value={input}
                        placeholder="Type your university or school"
                        onChange={async (e) => {
                            const text = e.target.value
                            setInput(text)
                            if (text.trim()) { setOpen(true); onSearch(text) }
                            else setOpen(false)
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTyped(input) } }}
                        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
                        onBlur={handleBlur}
                    />
                </div>

                {suggestions.length > 0 && open && (
                    <ul className="absolute left-0 right-0 top-full mt-1 z-10 bg-white rounded-xl shadow-[0_18px_45px_rgba(15,23,42,0.16)] py-1 max-h-56 overflow-y-auto list-none m-0 p-0">
                        {suggestions.map((s) => (
                            <li
                                key={s.id ?? s.key}
                                className="px-3 py-2 text-sm cursor-pointer hover:bg-[#eff6ff] transition-colors"
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    skipBlur.current = true
                                    onChange(s)
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

InstitutionInput.propTypes = {
    value: PropTypes.shape({ id: PropTypes.number, key: PropTypes.string.isRequired, label: PropTypes.string.isRequired }),
    onChange: PropTypes.func.isRequired,
    suggestions: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, key: PropTypes.string.isRequired, label: PropTypes.string.isRequired })).isRequired,
    onSearch: PropTypes.func.isRequired,
    onEnsure: PropTypes.func.isRequired,
    error: PropTypes.string,
}

export default InstitutionInput
