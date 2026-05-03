/**
 * BrutalCard — Neo-Brutalist card container with thick borders and hard drop shadows.
 */
export default function BrutalCard({
  variant = 'white',
  shadow = 'md',
  className = '',
  children,
  ...props
}) {
  const variantStyles = {
    white: 'bg-white',
    yellow: 'bg-vault-yellow',
    pink: 'bg-vault-pink',
    blue: 'bg-vault-blue text-white',
    offwhite: 'bg-vault-offwhite',
  };

  const shadowStyles = {
    sm: 'shadow-[3px_3px_0px_#0A0A0A]',
    md: 'shadow-[5px_5px_0px_#0A0A0A]',
    lg: 'shadow-[8px_8px_0px_#0A0A0A]',
    none: 'shadow-none',
  };

  return (
    <div
      className={`
        border-3 border-vault-black
        ${variantStyles[variant]}
        ${shadowStyles[shadow]}
        p-6
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}
