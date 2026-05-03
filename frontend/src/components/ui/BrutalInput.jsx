/**
 * BrutalInput — Neo-Brutalist form input with thick borders and hard shadows.
 */
export default function BrutalInput({
  label,
  id,
  error,
  icon,
  className = '',
  ...props
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="font-display font-bold text-xs uppercase tracking-widest text-vault-black"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-darkgray text-lg pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={id}
          className={`
            brutal-input
            focus:brutal-input-focus
            ${icon ? 'pl-10' : ''}
            ${error ? 'border-vault-red' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && (
        <span className="text-vault-red text-xs font-bold uppercase tracking-wide animate-[shake_0.3s_ease]">
          ⚠ {error}
        </span>
      )}
    </div>
  );
}
