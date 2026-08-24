'use client'

/** Split-flap board primitives — LearnAI Operate world. */

export function BoardShell({ children, className = '', viewport = false }) {
  return (
    <div
      className={[
        'board-frame bg-[var(--board-steel)] text-[var(--flap-ink)]',
        viewport ? 'h-[100dvh] max-h-[100dvh] flex flex-col overflow-x-clip min-h-0' : 'min-h-[100dvh] flex flex-col',
        className,
      ].join(' ')}
    >
      <div className="board-frame__rail board-frame__rail--top" aria-hidden />
      <div className="flex-1 flex flex-col min-h-0 relative z-[1]">{children}</div>
      <div className="board-frame__rail board-frame__rail--bottom" aria-hidden />
    </div>
  )
}

export function BoardHeader({ brand, sub, children, actions }) {
  return (
    <header className="shrink-0 border-b border-[var(--board-rule)] bg-[var(--board-steel-deep)]">
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="leading-none min-w-0">
            {typeof brand === 'string' || typeof brand === 'number' ? (
              <p className="font-[family-name:var(--font-flap)] text-[15px] font-semibold tracking-[0.04em] uppercase text-[var(--flap-ink)] truncate">
                {brand}
              </p>
            ) : (
              brand
            )}
            {sub ? (
              <p className="font-[family-name:var(--font-flap)] text-[9px] tracking-[0.18em] uppercase text-[var(--flap-mute)] mt-0.5">
                {sub}
              </p>
            ) : null}
          </div>
          {children}
        </div>
        {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
    </header>
  )
}

export function FlapTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'font-[family-name:var(--font-flap)] px-3 py-1.5 text-[11px] md:text-xs font-semibold tracking-[0.12em] uppercase border transition-colors cursor-pointer',
        active
          ? 'flap-cell text-[var(--flap-ink)] border-[var(--flap-ink)]/25'
          : 'bg-transparent text-[var(--flap-mute)] border-transparent hover:text-[var(--flap-ink)] hover:bg-[var(--flap-face)]/40',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function FlapRow({
  cols = [],
  amber = false,
  cancelled = false,
  selected = false,
  onClick,
  className = '',
  as: Tag = onClick ? 'button' : 'div',
  lamp = false,
}) {
  const base =
    'w-full grid items-center gap-x-2 px-2 py-1.5 border-b border-[var(--board-rule)] text-left transition-colors'
  const tone = cancelled
    ? 'text-[var(--flap-cancel)] opacity-80'
    : amber
      ? 'text-[var(--flap-amber)]'
      : selected
        ? 'bg-[var(--flap-face)] text-[var(--flap-ink)] flap-cascade'
        : 'text-[var(--flap-ink)] hover:bg-[var(--flap-face)]/50'
  return (
    <Tag
      type={Tag === 'button' ? 'button' : undefined}
      onClick={onClick}
      className={[base, tone, onClick ? 'cursor-pointer border-none bg-transparent' : '', className].join(' ')}
      style={{
        gridTemplateColumns: [
          lamp || amber ? '10px' : null,
          ...cols.map((c) => c.width || '1fr'),
        ]
          .filter(Boolean)
          .join(' '),
      }}
    >
      {(lamp || amber) && (
        <span
          className={['flap-lamp', cancelled ? 'flap-lamp--cancel' : amber ? 'flap-lamp--amber' : selected ? 'flap-lamp--on' : ''].join(' ')}
          aria-hidden
        />
      )}
      {cols.map((c, i) => (
        <span
          key={i}
          className={[
            'flap-cell font-[family-name:var(--font-flap)] tracking-[0.06em] uppercase truncate px-2 py-1.5',
            c.mute ? 'text-[var(--flap-mute)]' : '',
            c.className || '',
            i === 0 ? 'text-[13px] md:text-sm font-semibold' : 'text-[11px] md:text-xs font-medium',
          ].join(' ')}
        >
          {c.label}
        </span>
      ))}
    </Tag>
  )
}

export function FlapPanel({ children, className = '', scroll = false }) {
  return (
    <section
      className={[
        'flap-panel border border-[var(--board-rule)]',
        scroll ? 'flex flex-col min-h-0 overflow-hidden' : '',
        className,
      ].join(' ')}
    >
      {children}
    </section>
  )
}

export function FlapPanelHead({ title, meta }) {
  return (
    <div className="shrink-0 flex items-baseline justify-between gap-3 px-3 py-2 border-b border-[var(--board-rule)] bg-[var(--board-steel-deep)]">
      <h2 className="font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.16em] uppercase text-[var(--flap-ink)] m-0">
        {title}
      </h2>
      {meta ? (
        <span className="font-[family-name:var(--font-flap)] text-[10px] tracking-[0.12em] uppercase text-[var(--flap-mute)]">
          {meta}
        </span>
      ) : null}
    </div>
  )
}

export function FlapButton({ children, onClick, variant = 'primary', disabled, className = '', type = 'button' }) {
  const styles = {
    primary: 'bg-[var(--flap-ink)] text-[var(--board-steel-deep)] hover:bg-white',
    amber: 'bg-[var(--flap-amber)] text-[var(--board-steel-deep)] hover:brightness-110',
    ghost: 'bg-transparent text-[var(--flap-ink)] border border-[var(--board-rule)] hover:bg-[var(--flap-face)]',
    danger: 'bg-transparent text-[var(--flap-cancel)] border border-[var(--flap-cancel)]/40 hover:bg-[var(--flap-cancel)]/10',
  }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={[
        'font-[family-name:var(--font-flap)] px-3 py-2 text-[11px] font-semibold tracking-[0.14em] uppercase border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
        styles[variant] || styles.primary,
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function FlapInput({ className = '', ...props }) {
  return (
    <input
      {...props}
      className={[
        'w-full flap-cell text-[var(--flap-ink)] border border-[var(--board-rule)] px-3 py-2 text-sm outline-none focus:border-[var(--flap-amber)] placeholder:text-[var(--flap-mute)]',
        'font-[family-name:var(--font-body)]',
        className,
      ].join(' ')}
    />
  )
}

export function IconBell({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9a6 6 0 1 1 12 0c0 3.5 1.5 5 2 6H4c.5-1 2-2.5 2-6Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function IconLogout({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 12h10M10 8l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
