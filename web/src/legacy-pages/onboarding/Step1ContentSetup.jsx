import PropTypes from 'prop-types'
import { useState } from 'react'

const GRADES = [
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
    'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
]

const UPLOAD_OPTIONS = [
    {
        value: 'syllabus_only',
        label: 'Syllabus Only',
        desc: 'Upload curriculum documents and syllabi',
        icon: '📄',
    },
    {
        value: 'materials_only',
        label: 'Study Materials',
        desc: 'Names of reference books and materials',
        icon: '📚',
    },
    {
        value: 'both',
        label: 'Both',
        desc: 'Syllabus and names of reference books',
        icon: '🗂️',
    },
]

function ErrorMsg({ msg }) {
    if (!msg) return null
    return <p className="text-rose-500 text-xs mt-1.5 font-medium">{msg}</p>
}

function Step1ContentSetup({ data, onNext }) {
    const [form, setForm] = useState({
        upload_preference: data.upload_preference || '',
        grades: data.grades || [],
        subjects: data.subjects || '',
        number_of_syllabi: data.number_of_syllabi || '',
        number_of_materials: data.number_of_materials || '',
    })
    const [errors, setErrors] = useState({})

    const showSyllabus = form.upload_preference === 'syllabus_only' || form.upload_preference === 'both'
    const showMaterials = form.upload_preference === 'materials_only' || form.upload_preference === 'both'

    const toggleGrade = (grade) => {
        setForm(prev => ({
            ...prev,
            grades: prev.grades.includes(grade)
                ? prev.grades.filter(g => g !== grade)
                : [...prev.grades, grade],
        }))
        setErrors(prev => ({ ...prev, grades: '' }))
    }

    const validate = () => {
        const errs = {}
        if (!form.upload_preference) errs.upload_preference = 'Please select what you would like to upload.'
        if (form.grades.length === 0) errs.grades = 'Select at least one grade.'
        if (!form.subjects.trim()) errs.subjects = 'Please enter your subjects.'
        if (showSyllabus && (!form.number_of_syllabi || Number(form.number_of_syllabi) < 1))
            errs.number_of_syllabi = 'Enter the number of syllabi (min 1).'
        if (showMaterials && (!form.number_of_materials || Number(form.number_of_materials) < 1))
            errs.number_of_materials = 'Enter the number of materials (min 1).'
        return errs
    }

    const handleNext = () => {
        const errs = validate()
        if (Object.keys(errs).length > 0) { setErrors(errs); return }
        const subjectArr = form.subjects.split(',').map(s => s.trim()).filter(Boolean)
        onNext({
            upload_preference: form.upload_preference,
            grades: form.grades,
            subjects: subjectArr,
            number_of_syllabi: showSyllabus ? Number(form.number_of_syllabi) : null,
            number_of_materials: showMaterials ? Number(form.number_of_materials) : null,
        })
    }

    return (
        <div className="animate-auth-fade">
            {/* Header */}
            <div className="mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#eff6ff] rounded-full mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2563eb]" />
                    <span className="text-xs font-[600] text-[#2563eb] uppercase tracking-wider">Step 1</span>
                </div>
                <h2 className="text-[1.35rem] font-[700] text-[#0b1220] mb-1">Teaching Content Setup</h2>
                <p className="text-sm text-slate-500">Tell us what kind of content you work with.</p>
            </div>

            {/* Upload Preference */}
            <div className="mb-5">
                <label className="block text-sm font-[600] text-[#0b1220] mb-2.5">
                    What would you like to upload? <span className="text-rose-500">*</span>
                </label>
                <div className="grid gap-2.5">
                    {UPLOAD_OPTIONS.map(opt => (
                        <label
                            key={opt.value}
                            className={[
                                'flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-150',
                                form.upload_preference === opt.value
                                    ? 'border-[#2563eb] bg-[#eff6ff]'
                                    : 'border-slate-200 bg-white hover:border-[#2563eb]/40 hover:bg-[#eff6ff]/50',
                            ].join(' ')}
                        >
                            <input
                                type="radio"
                                name="upload_preference"
                                value={opt.value}
                                checked={form.upload_preference === opt.value}
                                onChange={() => {
                                    setForm(prev => ({ ...prev, upload_preference: opt.value }))
                                    setErrors(prev => ({ ...prev, upload_preference: '' }))
                                }}
                                className="mt-0.5 accent-[#2563eb]"
                            />
                            <div>
                                <p className="font-[600] text-sm text-[#0b1220]">{opt.icon} {opt.label}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                            </div>
                        </label>
                    ))}
                </div>
                <ErrorMsg msg={errors.upload_preference} />
            </div>

            {/* Grade Selection */}
            <div className="mb-5">
                <label className="block text-sm font-[600] text-[#0b1220] mb-2.5">
                    Grade(s) you handle <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                    {GRADES.map(grade => (
                        <button
                            key={grade}
                            type="button"
                            onClick={() => toggleGrade(grade)}
                            className={[
                                'px-3 py-1.5 rounded-full text-xs font-[600] border transition-all duration-150 cursor-pointer',
                                form.grades.includes(grade)
                                    ? 'bg-[#2563eb] border-[#2563eb] text-white shadow-[0_2px_8px_rgba(37,99,235,0.3)]'
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-[#2563eb]/50 hover:text-[#2563eb]',
                            ].join(' ')}
                        >
                            {grade}
                        </button>
                    ))}
                </div>
                <ErrorMsg msg={errors.grades} />
            </div>

            {/* Subjects */}
            <div className="mb-5">
                <label className="block text-sm font-[600] text-[#0b1220] mb-1.5">
                    Subjects you handle <span className="text-rose-500">*</span>
                </label>
                <p className="text-xs text-slate-400 mb-2">Separate multiple subjects with commas</p>
                <input
                    type="text"
                    placeholder="e.g. Mathematics, Physics, Chemistry"
                    value={form.subjects}
                    onChange={e => {
                        setForm(prev => ({ ...prev, subjects: e.target.value }))
                        setErrors(prev => ({ ...prev, subjects: '' }))
                    }}
                    className={[
                        'w-full px-3.5 py-2.5 rounded-xl border-2 text-sm outline-none transition-all duration-150 bg-white',
                        'placeholder:text-slate-400 text-[#0b1220]',
                        errors.subjects
                            ? 'border-rose-400 focus:border-rose-500'
                            : 'border-slate-200 focus:border-[#2563eb] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]',
                    ].join(' ')}
                />
                <ErrorMsg msg={errors.subjects} />
            </div>

            {/* Conditional: Number of Syllabi */}
            {showSyllabus && (
                <div className="mb-5 animate-auth-fade">
                    <label className="block text-sm font-[600] text-[#0b1220] mb-1.5">
                        Number of syllabi to upload <span className="text-rose-500">*</span>
                    </label>
                    <input
                        type="number"
                        min={1}
                        max={50}
                        placeholder="e.g. 2"
                        value={form.number_of_syllabi}
                        onChange={e => {
                            setForm(prev => ({ ...prev, number_of_syllabi: e.target.value }))
                            setErrors(prev => ({ ...prev, number_of_syllabi: '' }))
                        }}
                        className={[
                            'w-full px-3.5 py-2.5 rounded-xl border-2 text-sm outline-none transition-all duration-150 bg-white',
                            'placeholder:text-slate-400 text-[#0b1220]',
                            errors.number_of_syllabi
                                ? 'border-rose-400 focus:border-rose-500'
                                : 'border-slate-200 focus:border-[#2563eb] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]',
                        ].join(' ')}
                    />
                    <ErrorMsg msg={errors.number_of_syllabi} />
                </div>
            )}

            {/* Conditional: Number of Materials */}
            {showMaterials && (
                <div className="mb-5 animate-auth-fade">
                    <label className="block text-sm font-[600] text-[#0b1220] mb-1.5">
                        Number of reference materials to upload <span className="text-rose-500">*</span>
                    </label>
                    <input
                        type="number"
                        min={1}
                        max={50}
                        placeholder="e.g. 3"
                        value={form.number_of_materials}
                        onChange={e => {
                            setForm(prev => ({ ...prev, number_of_materials: e.target.value }))
                            setErrors(prev => ({ ...prev, number_of_materials: '' }))
                        }}
                        className={[
                            'w-full px-3.5 py-2.5 rounded-xl border-2 text-sm outline-none transition-all duration-150 bg-white',
                            'placeholder:text-slate-400 text-[#0b1220]',
                            errors.number_of_materials
                                ? 'border-rose-400 focus:border-rose-500'
                                : 'border-slate-200 focus:border-[#2563eb] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]',
                        ].join(' ')}
                    />
                    <ErrorMsg msg={errors.number_of_materials} />
                </div>
            )}

            <button
                type="button"
                onClick={handleNext}
                className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full font-semibold text-white btn-gradient cursor-pointer transition-transform duration-120 hover:-translate-y-px active:translate-y-0"
            >
                Continue to Step 2
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
            </button>
        </div>
    )
}

Step1ContentSetup.propTypes = {
    data: PropTypes.object.isRequired,
    onNext: PropTypes.func.isRequired,
}

ErrorMsg.propTypes = {
    msg: PropTypes.string,
}

export default Step1ContentSetup
