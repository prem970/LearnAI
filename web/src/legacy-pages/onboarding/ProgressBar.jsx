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
                                        'w-8 h-8 flex items-center justify-center text-sm font-[700] font-[family-name:var(--font-flap)] tracking-[0.08em] border transition-colors',
                                        isCompleted
                                            ? 'bg-[var(--flap-amber)] text-[var(--board-steel-deep)] border-[var(--flap-amber)]'
                                            : isActive
                                                ? 'bg-[var(--flap-face)] text-[var(--flap-ink)] border-[var(--flap-amber)]'
                                                : 'bg-[var(--board-steel)] text-[var(--flap-mute)] border-[var(--board-rule)]',
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
                                        'font-[family-name:var(--font-flap)] text-[0.7rem] font-semibold mt-1.5 whitespace-nowrap uppercase tracking-[0.1em] transition-colors',
                                        isActive
                                            ? 'text-[var(--flap-amber)]'
                                            : isCompleted
                                                ? 'text-[var(--flap-ink)]'
                                                : 'text-[var(--flap-mute)]',
                                    ].join(' ')}
                                >
                                    {label}
                                </span>
                            </div>

                            {/* Connector line */}
                            {idx < STEPS.length - 1 && (
                                <div className="flex-1 mx-2 mb-5">
                                    <div className="h-[2px] bg-[var(--board-rule)] relative overflow-hidden">
                                        <div
                                            className="absolute inset-y-0 left-0 bg-[var(--flap-amber)] transition-all duration-500 ease-out"
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
            <div className="h-1.5 bg-[var(--board-rule)] overflow-hidden">
                <div
                    className="h-full bg-[var(--flap-amber)] transition-all duration-500 ease-out"
                    style={{ width: `${((current - 1) / (STEPS.length - 1)) * 100}%` }}
                />
            </div>
            <p className="text-right font-[family-name:var(--font-flap)] text-[0.7rem] tracking-[0.1em] uppercase text-[var(--flap-mute)] mt-1">
                Step {current} of {STEPS.length}
            </p>
        </div>
    )
}

ProgressBar.propTypes = {
    current: PropTypes.number.isRequired,
}

export default ProgressBar
