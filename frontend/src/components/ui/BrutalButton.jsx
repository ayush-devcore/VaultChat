import { useState } from 'react';

/**
 * BrutalButton — Neo-Brutalist button with press animation.
 * 
 * @param {object} props
 * @param {'yellow'|'pink'|'blue'|'green'|'red'|'white'|'black'} props.variant - Color variant
 * @param {'sm'|'md'|'lg'} props.size - Button size
 * @param {boolean} props.fullWidth - Fill container width
 * @param {boolean} props.loading - Show loading state
 * @param {boolean} props.disabled
 * @param {React.ReactNode} props.icon - Optional icon element
 * @param {React.ReactNode} props.children
 */
export default function BrutalButton({
  variant = 'yellow',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  icon,
  children,
  className = '',
  ...props
}) {
  const [pressed, setPressed] = useState(false);

  const variantStyles = {
    yellow: 'bg-vault-yellow text-vault-black',
    pink: 'bg-vault-pink text-vault-black',
    blue: 'bg-vault-blue text-white',
    green: 'bg-vault-green text-vault-black',
    red: 'bg-vault-red text-white',
    white: 'bg-white text-vault-black',
    black: 'bg-vault-black text-white',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
  };

  return (
    <button
      className={`
        brutal-btn
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${pressed && !disabled ? 'brutal-btn-press' : ''}
        ${disabled || loading ? 'opacity-60 cursor-not-allowed' : 'hover:-translate-y-0.5'}
        ${className}
      `}
      onMouseDown={() => !disabled && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>LOADING...</span>
        </>
      ) : (
        <>
          {icon && <span className="text-lg">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}
