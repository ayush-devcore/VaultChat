import AuthForm from '../components/auth/AuthForm';

/**
 * LoginPage — Full-screen auth page with Neo-Brutalist branding.
 */
export default function LoginPage() {
  return (
    <div className="min-h-screen bg-vault-offwhite flex flex-col items-center justify-center px-4 py-8">
      {/* Background Decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none select-none -z-10">
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-vault-yellow border-4 border-vault-black rotate-12 opacity-30" />
        <div className="absolute top-1/3 -right-16 w-48 h-48 bg-vault-pink border-4 border-vault-black -rotate-6 opacity-25" />
        <div className="absolute -bottom-12 left-1/4 w-56 h-56 bg-vault-blue border-4 border-vault-black rotate-45 opacity-15" />
        <div className="absolute bottom-1/4 right-1/3 w-32 h-32 bg-vault-green border-4 border-vault-black -rotate-12 opacity-20" />
      </div>

      {/* Logo / Brand */}
      <div className="mb-8 text-center animate-[fadeIn_0.3s_ease-out]">
        <div className="inline-block bg-vault-black text-white px-5 py-2 border-3 border-vault-black shadow-[5px_5px_0px_#FFD700] mb-4">
          <h1 className="font-display text-4xl md:text-5xl font-black tracking-tight">
            VAULT<span className="text-vault-yellow">CHAT</span>
          </h1>
        </div>
        <p className="font-display text-sm md:text-base uppercase tracking-[0.25em] text-vault-darkgray font-bold mt-2">
          End-to-End Encrypted Messaging
        </p>
        <div className="flex items-center justify-center gap-3 mt-3">
          <span className="inline-block bg-vault-yellow border-2 border-vault-black px-2 py-0.5 text-xs font-bold font-display uppercase">
            E2EE
          </span>
          <span className="inline-block bg-vault-pink border-2 border-vault-black px-2 py-0.5 text-xs font-bold font-display uppercase">
            Zero Trust
          </span>
          <span className="inline-block bg-vault-green border-2 border-vault-black px-2 py-0.5 text-xs font-bold font-display uppercase">
            AES-256
          </span>
        </div>
      </div>

      {/* Auth Card */}
      <AuthForm />

      {/* Footer */}
      <footer className="mt-8 text-center animate-[fadeIn_0.5s_ease-out]">
        <p className="text-xs text-vault-darkgray font-mono">
          Built with 🔐 Web Crypto API • ECDH P-256 • AES-GCM
        </p>
      </footer>
    </div>
  );
}
