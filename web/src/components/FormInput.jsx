import PropTypes from 'prop-types'

function FormInput({
  label,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  as = 'input',
  options,
  ...rest
}) {
  const id = rest.id ?? name

  const baseInput =
    `w-full border px-3 py-2.5 text-sm font-[inherit] bg-[var(--flap-face)] text-[var(--flap-ink)] ` +
    `transition-[border-color,box-shadow] duration-200 outline-none ` +
    `focus:border-[var(--flap-amber)] focus:ring-1 focus:ring-[var(--flap-amber)]/30 ` +
    (error ? 'border-[var(--flap-cancel)]' : 'border-[var(--board-rule)]')

  if (as === 'select') {
    return (
      <div className="grid gap-1 min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-[var(--flap-ink)]">{label}</label>
        <select
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          className={`${baseInput} min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap`}
          style={{ minWidth: 0 }}
          {...rest}
        >
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && <p className="text-xs text-[var(--flap-cancel)] mt-0.5">{error}</p>}
      </div>
    )
  }

  if (as === 'select-multiple') {
    return (
      <div className="grid gap-1">
        <label htmlFor={id} className="text-sm font-medium text-[var(--flap-ink)]">{label}</label>
        <select id={id} name={name} multiple value={value} onChange={onChange}
          className={`${baseInput} min-h-[3.2rem]`} {...rest}>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && <p className="text-xs text-[var(--flap-cancel)] mt-0.5">{error}</p>}
      </div>
    )
  }

  return (
    <div className="grid gap-1" suppressHydrationWarning>
      <label htmlFor={id} className="text-sm font-medium text-[var(--flap-ink)]">{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={baseInput}
        suppressHydrationWarning
        autoComplete={type === 'password' ? 'current-password' : type === 'email' ? 'email' : undefined}
        {...rest}
      />
      {error && <p className="text-xs text-[var(--flap-cancel)] mt-0.5">{error}</p>}
    </div>
  )
}

FormInput.propTypes = {
  label: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  type: PropTypes.string,
  value: PropTypes.any,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  error: PropTypes.string,
  as: PropTypes.oneOf(['input', 'select', 'select-multiple']),
  options: PropTypes.arrayOf(
    PropTypes.shape({ value: PropTypes.string.isRequired, label: PropTypes.string.isRequired })
  ),
}

export default FormInput
