import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatAnswerForDisplay } from '../utils/speechTextSanitize.js'

/**
 * Renders teacher/story answers on the dark split-flap board.
 * Uses flap tokens so bold/headings stay readable (never light-theme black).
 */
export default function FormattedAnswerText({ text, className = '' }) {
  const cleaned = normalizeAsterisks(formatAnswerForDisplay(text ?? ''))

  return (
    <div
      className={`prose prose-invert max-w-none whitespace-pre-wrap text-[var(--flap-ink)] [&_p]:text-[var(--flap-ink)] [&_li]:text-[var(--flap-ink)] ${className}`.trim()}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="my-2 leading-relaxed text-[var(--flap-ink)]">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--flap-ink)]">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[var(--flap-ink)]">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="my-2 list-disc pl-5 text-[var(--flap-ink)] marker:text-[var(--flap-amber)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal pl-5 text-[var(--flap-ink)] marker:text-[var(--flap-amber)]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="my-1 text-[var(--flap-ink)]">{children}</li>
          ),
          h1: ({ children }) => (
            <h1 className="mt-4 mb-2 text-lg font-semibold text-[var(--flap-ink)]">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 text-base font-semibold text-[var(--flap-ink)]">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1 text-sm font-semibold text-[var(--flap-ink)]">{children}</h3>
          ),
          code: ({ children }) => (
            <code className="rounded-none border border-[var(--board-rule)] bg-[var(--board-steel-deep)] px-1 py-0.5 text-[0.9em] text-[var(--flap-amber)]">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a href={href} className="text-[var(--flap-amber)] underline-offset-2 hover:underline">
              {children}
            </a>
          ),
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  )
}

function normalizeAsterisks(s) {
  let t = s.replace(/[\u2217\u204E\uFE61\uFF0A]/g, '*')
  t = t.replace(/\*\*\s+/g, '**')
  t = t.replace(/([^\s*])\s+\*\*/g, '$1**')
  return t
}
