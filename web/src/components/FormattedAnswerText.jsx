import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatAnswerForDisplay } from '../utils/speechTextSanitize.js'

export default function FormattedAnswerText({ text, className = '' }) {
  const cleaned = normalizeAsterisks(formatAnswerForDisplay(text ?? ''))

  return (
    <div className={`prose prose-slate max-w-none whitespace-pre-wrap ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-[#0b1220]">{children}</strong>,
          ul: ({ children }) => <ul className="my-2 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal pl-5">{children}</ol>,
          li: ({ children }) => <li className="my-1">{children}</li>,
          h1: ({ children }) => <h1 className="mt-4 mb-2 text-lg font-semibold text-[#0b1220]">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-4 mb-2 text-base font-semibold text-[#0b1220]">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-3 mb-1 text-sm font-semibold text-[#0b1220]">{children}</h3>,
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
