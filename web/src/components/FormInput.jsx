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
    `w-full rounded-xl border px-3 py-2.5 text-sm font-[inherit] bg-white text-[#0b1220] ` +
    `transition-[border-color,box-shadow] duration-200 outline-none ` +
    `focus:border-brand focus:ring-1 focus:ring-brand/30 ` +
    (error ? 'border-rose-500' : 'border-slate-200')

  if (as === 'select') {
    return (
      <div className="grid gap-1 min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-[#0b1220]">{label}</label>
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
        {error && <p className="text-xs text-rose-500 mt-0.5">{error}</p>}
      </div>
    )
  }

  if (as === 'select-multiple') {
    return (
      <div className="grid gap-1">
        <label htmlFor={id} className="text-sm font-medium text-[#0b1220]">{label}</label>
        <select id={id} name={name} multiple value={value} onChange={onChange}
          className={`${baseInput} min-h-[3.2rem]`} {...rest}>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && <p className="text-xs text-rose-500 mt-0.5">{error}</p>}
      </div>
    )
  }

  return (
    <div className="grid gap-1" suppressHydrationWarning>
      <label htmlFor={id} className="text-sm font-medium text-[#0b1220]">{label}</label>
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
      {error && <p className="text-xs text-rose-500 mt-0.5">{error}</p>}
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
