'use client'

import Link from 'next/link'

function OnboardingComplete() {
    return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--board-steel-deep)] px-4">
            <div className="w-full max-w-md text-center animate-auth-fade">

                {/* Success mark */}
                <div className="inline-flex mb-8">
                    <div className="w-20 h-20 border border-[var(--board-rule)] bg-[var(--board-steel)] flex items-center justify-center">
                        <svg className="w-10 h-10 text-[var(--flap-amber)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>

                <div className="bg-[var(--board-steel)] border border-[var(--board-rule)] p-8 mb-6">
                    <h1 className="font-[family-name:var(--font-flap)] text-2xl font-semibold tracking-[0.04em] uppercase text-[var(--flap-ink)] mb-3 leading-tight">
                        Your teaching profile has been created
                    </h1>

                    <p className="text-sm text-[var(--flap-mute)] leading-relaxed mb-6">
                        LearnAI has captured your teaching style and preferences.
                        Students can now learn in <em>your</em> voice and pace—faster clarity when it matters—with you effectively
                        available to them any time they study.
                    </p>

                    {/* What happens next */}
                    <div className="text-left space-y-3 mb-6 p-4 border border-[var(--board-rule)] bg-[var(--board-steel-deep)]">
                        <p className="font-[family-name:var(--font-flap)] text-xs font-semibold text-[var(--flap-mute)] uppercase tracking-wider mb-2">What just happened</p>
                        {[
                            { mark: '01', text: 'Teaching style detected from your explanation' },
                            { mark: '02', text: 'Content preferences saved to your profile' },
                            { mark: '03', text: 'AI model is being personalised for you' },
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <span className="font-[family-name:var(--font-flap)] text-xs font-semibold tracking-[0.08em] text-[var(--flap-amber)] tabular-nums">{item.mark}</span>
                                <p className="text-sm text-[var(--flap-ink)] font-medium">{item.text}</p>
                            </div>
                        ))}
                    </div>

                    <Link
                        href="/login"
                        className="inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 font-[family-name:var(--font-flap)] font-semibold tracking-[0.12em] uppercase text-[var(--board-steel-deep)] bg-[var(--flap-amber)] border-none no-underline"
                    >
                        Go to Login
                    </Link>
                </div>

                <p className="text-xs text-[var(--flap-mute)]">
                    LearnAI · Teaching that scales—students learn faster; you&apos;re there around the clock
                </p>
            </div>
        </div>
    )
}

export default OnboardingComplete
