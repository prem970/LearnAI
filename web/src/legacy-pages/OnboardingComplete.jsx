'use client'

import Link from 'next/link'

function OnboardingComplete() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-white px-4">
            <div className="w-full max-w-md text-center animate-auth-fade">

                {/* Success icon */}
                <div className="relative inline-flex mb-8">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#2563eb] to-[#1e3a8a] flex items-center justify-center shadow-[0_16px_48px_rgba(37,99,235,0.4)]">
                        <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    {/* Decorative rings */}
                    <div className="absolute inset-0 rounded-full border-2 border-[#2563eb]/20 scale-125 animate-ping" style={{ animationDuration: '2s' }} />
                </div>

                {/* Card */}
                <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(9,9,11,0.10)] border border-slate-200 p-8 mb-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#eff6ff] rounded-full mb-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#2563eb]" />
                        <span className="text-xs font-[600] text-[#2563eb] uppercase tracking-wider">Profile Created</span>
                    </div>

                    <h1 className="text-2xl font-[750] text-[#0b1220] mb-3 leading-tight">
                        Your Teaching Profile<br />Has Been Created 🎉
                    </h1>

                    <p className="text-sm text-slate-500 leading-relaxed mb-6">
                        LearnAI has captured your teaching style and preferences.
                        Students can now learn in <em>your</em> voice and pace—faster clarity when it matters—with you effectively
                        available to them any time they study.
                    </p>

                    {/* What happens next */}
                    <div className="text-left space-y-3 mb-6 p-4 bg-slate-50 rounded-2xl">
                        <p className="text-xs font-[700] text-slate-400 uppercase tracking-wider mb-2">What just happened</p>
                        {[
                            { icon: '🧠', text: 'Teaching style detected from your explanation' },
                            { icon: '📚', text: 'Content preferences saved to your profile' },
                            { icon: '⚡', text: 'AI model is being personalised for you' },
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <span className="text-base">{item.icon}</span>
                                <p className="text-sm text-slate-600 font-[500]">{item.text}</p>
                            </div>
                        ))}
                    </div>

                    <Link
                        href="/login"
                        className="inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-full font-semibold text-white btn-gradient transition-transform duration-120 hover:-translate-y-px active:translate-y-0 no-underline"
                    >
                        Go to Login
                    </Link>
                </div>

                <p className="text-xs text-slate-400">
                    LearnAI · Teaching that scales—students learn faster; you&apos;re there around the clock
                </p>
            </div>
        </div>
    )
}

export default OnboardingComplete
