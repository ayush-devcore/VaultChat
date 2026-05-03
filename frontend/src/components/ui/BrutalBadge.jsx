/**
 * BrutalBadge — Small status/tag badge in Neo-Brutalist style.
 */
export default function BrutalBadge({
  variant = 'yellow',
  children,
  className = '',
  dot = false,
  ...props
}) {
  const variantStyles = {
    yellow: 'bg-vault-yellow text-vault-black',
    pink: 'bg-vault-pink text-vault-black',
    blue: 'bg-vault-blue text-white',
    green: 'bg-vault-green text-vault-black',
    red: 'bg-vault-red text-white',
    gray: 'bg-vault-gray text-vault-black',
  };

  return (
    <span
      className={`
        brutal-badge
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {dot && (
        <span
          className={`
            inline-block w-2 h-2 rounded-full mr-1.5
            ${variant === 'green' ? 'bg-vault-black' : 'bg-current'}
            animate-[pulse-dot_1.5s_ease-in-out_infinite]
          `}
        />
      )}
      {children}
    </span>
  );
}
