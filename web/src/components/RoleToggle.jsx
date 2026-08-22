import PropTypes from 'prop-types'

const ROLES = [
  { value: 'teacher', label: 'Teacher' },
  { value: 'student', label: 'Student' },
]

function RoleToggle({ value, onChange }) {
  return (
    <div className="inline-flex p-0.5 rounded-full bg-[#eff6ff] border border-[#dbeafe]">
      {ROLES.map((role) => {
        const isActive = role.value === value
        return (
          <button
            key={role.value}
            type="button"
            onClick={() => onChange(role.value)}
            className={[
              'px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer',
              isActive
                ? 'bg-gradient-to-br from-brand to-teal text-white shadow-[0_8px_20px_rgba(37,99,235,0.35)] -translate-y-px'
                : 'text-slate-500 hover:text-slate-700',
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
