import PropTypes from 'prop-types'

const STEPS = ['Content Setup', 'Teaching Style']

function ProgressBar({ current }) {
    return (
        <div className="mb-8">
            {/* Step labels */}
            <div className="flex items-center gap-0 mb-3">
                {STEPS.map((label, idx) => {
                    const stepNum = idx + 1
                    const isCompleted = stepNum < current
                    const isActive = stepNum === current
                    return (
                        <div key={idx} className="flex items-center flex-1">
                            <div className="flex flex-col items-center">
                                <div
                                    className={[
                                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-[700] transition-all duration-300',
                                        isCompleted
                                            ? 'bg-[#2563eb] text-white shadow-[0_2px_10px_rgba(37,99,235,0.4)]'
                                            : isActive
                                                ? 'bg-gradient-to-br from-[#2563eb] to-[#1e3a8a] text-white shadow-[0_4px_14px_rgba(37,99,235,0.45)] scale-110'
                                                : 'bg-slate-100 text-slate-400 border-2 border-slate-200',
                                    ].join(' ')}
                                >
                                    {isCompleted ? (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    ) : stepNum}
                                </div>
                                <span
                                    className={[
                                        'text-[0.7rem] font-[600] mt-1.5 whitespace-nowrap transition-colors duration-200',
                                        isActive ? 'text-[#2563eb]' : isCompleted ? 'text-[#2563eb]/70' : 'text-slate-400',
                                    ].join(' ')}
                                >
                                    {label}
                                </span>
                            </div>

                            {/* Connector line */}
                            {idx < STEPS.length - 1 && (
                                <div className="flex-1 mx-2 mb-5">
                                    <div className="h-[2px] rounded-full bg-slate-100 relative overflow-hidden">
                                        <div
                                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#2563eb] to-[#1e3a8a] transition-all duration-500 ease-out"
                                            style={{ width: isCompleted ? '100%' : '0%' }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Overall progress bar */}
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${((current - 1) / (STEPS.length - 1)) * 100}%` }}
                />
            </div>
            <p className="text-right text-[0.7rem] text-slate-400 mt-1">
                Step {current} of {STEPS.length}
            </p>
        </div>
    )
}

ProgressBar.propTypes = {
    current: PropTypes.number.isRequired,
}

export default ProgressBar
