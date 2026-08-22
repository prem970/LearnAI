import './globals.css'
import './App.css'
import Providers from './providers.jsx'

export const metadata = {
  title: 'LearnAI',
  description:
    'LearnAI helps students learn with AI that mirrors real teachers—so expert teaching is available anytime, not only in class.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
