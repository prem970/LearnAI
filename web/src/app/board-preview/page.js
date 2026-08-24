'use client'

import {
  BoardHeader,
  BoardShell,
  FlapButton,
  FlapPanel,
  FlapPanelHead,
  FlapRow,
  FlapTab,
} from '../../components/ui/Board.jsx'

/** Static Operate board preview for craft verification (no auth). */
export default function BoardPreviewPage() {
  const tabs = ['Overview', 'Insights', 'Quizzes']
  return (
    <BoardShell>
      <BoardHeader brand="LearnAI" sub="Departures · Preview" actions={<FlapButton variant="ghost">Sign out</FlapButton>}>
        <nav className="hidden md:flex items-center gap-1 ml-2">
          {tabs.map((t, i) => (
            <FlapTab key={t} active={i === 0} onClick={() => {}}>
              {t}
            </FlapTab>
          ))}
        </nav>
      </BoardHeader>
      <div className="md:hidden flex gap-1 px-3 py-2 overflow-x-auto border-b border-[var(--board-rule)] bg-[var(--board-steel-deep)] shrink-0">
        {tabs.map((t, i) => (
          <FlapTab key={t} active={i === 0} onClick={() => {}}>
            {t}
          </FlapTab>
        ))}
      </div>
      <div className="max-w-[1280px] mx-auto px-4 py-6 space-y-4 w-full">
        <h1 className="font-[family-name:var(--font-flap)] text-3xl font-bold tracking-[0.04em] uppercase m-0">
          Welcome back, AL
        </h1>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <FlapPanel className="lg:col-span-3">
            <FlapPanelHead title="Profile" meta="Gate" />
            <div className="p-4 text-center font-[family-name:var(--font-flap)] tracking-[0.08em] uppercase">AL</div>
          </FlapPanel>
          <div className="lg:col-span-5">
            <FlapPanel>
              <FlapPanelHead title="Board status" meta="Live" />
              <FlapRow
                amber
                lamp
                cols={[
                  { label: 'Rating', width: '1fr', mute: true },
                  { label: '4.6 / 5', width: '1fr', className: 'text-[var(--flap-amber)]' },
                  { label: '12 total', width: '1fr', mute: true },
                ]}
              />
              <FlapRow
                lamp
                cols={[
                  { label: 'Style', width: '1fr', mute: true },
                  { label: 'Storyteller', width: '2fr' },
                ]}
              />
              <FlapRow
                lamp
                cols={[
                  { label: 'Learners', width: '1fr', mute: true },
                  { label: '18', width: '0.7fr', className: 'text-[var(--flap-amber)]' },
                  { label: 'Unique feedback', width: '1.4fr', mute: true },
                ]}
              />
            </FlapPanel>
          </div>
          <FlapPanel className="lg:col-span-4 max-h-[360px] flex flex-col" scroll>
            <FlapPanelHead title="Comments" meta="3 rows" />
            <ul className="flex-1 min-h-0 overflow-y-auto m-0 p-0 list-none">
              {[
                'Helped me finish the lesson after school.',
                'Clear explanations in my teacher’s style.',
                'Quiz feedback made the mistake obvious.',
              ].map((c) => (
                <li key={c}>
                  <FlapRow
                    amber
                    lamp
                    cols={[
                      { label: '5.0', width: '0.5fr', className: 'text-[var(--flap-amber)]' },
                      {
                        label: c,
                        width: '2fr',
                        className:
                          '!normal-case !tracking-normal font-[family-name:var(--font-body)] !text-sm !font-normal',
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
          </FlapPanel>
        </div>
        <FlapPanel>
          <FlapPanelHead title="Teacher board" meta="Select a row" />
          {[
            ['AL', 'Storyteller', '4.6'],
            ['Bethell', 'Coach', '4.2'],
            ['David', 'Explainer', '4.8'],
          ].map(([name, style, rating]) => (
            <FlapRow
              key={name}
              onClick={() => {}}
              selected={name === 'AL'}
              lamp
              amber={Number(rating) >= 4.5}
              cols={[
                { label: name, width: '1.2fr' },
                { label: style, width: '1fr', mute: true },
                { label: rating, width: '0.5fr', className: 'text-[var(--flap-amber)]' },
              ]}
            />
          ))}
        </FlapPanel>
      </div>
    </BoardShell>
  )
}
