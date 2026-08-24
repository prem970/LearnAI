import PropTypes from 'prop-types'

const ROLES = [
  { value: 'teacher', label: 'Teacher' },
  { value: 'student', label: 'Student' },
]

function RoleToggle({ value, onChange }) {
  return (
    <div className="inline-flex p-0.5 bg-[var(--flap-face)] border border-[var(--board-rule)]">
      {ROLES.map((role) => {
        const isActive = role.value === value
        return (
          <button
            key={role.value}
            type="button"
            onClick={() => onChange(role.value)}
            className={[
              'px-4 py-1.5 font-[family-name:var(--font-flap)] text-xs font-semibold uppercase tracking-[0.14em] transition-colors duration-150 cursor-pointer border-none',
              isActive
                ? 'bg-[var(--flap-amber)] text-[var(--board-steel-deep)]'
                : 'bg-transparent text-[var(--flap-mute)] hover:text-[var(--flap-ink)]',
            ].join(' ')}
          >
            {role.label}
          </button>
        )
      })}
    </div>
  )
}

RoleToggle.propTypes = {
  value: PropTypes.oneOf(['teacher', 'student']).isRequired,
  onChange: PropTypes.func.isRequired,
}

export default RoleToggle
