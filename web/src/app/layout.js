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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full antialiased">
        {/*
          THESIS: Teacher and lesson presence as live departure-board rows — not a glass SaaS card grid.
          OWN-WORLD: Matte black flap faces, white condensed caps, brushed steel frame, amber delay lamps; rows flip, columns stay.
          STORY: Student picks a teacher row and learns; teacher scans impact rows the same way travelers scan departures.
          FIRST VIEWPORT: Full-width board chrome; modes as column headers; primary action is selecting a live row (teacher / lesson / tab).
          FORM: Split-Flap Concourse (challenger) · seed 9be1cd88
          FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
        */}
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
