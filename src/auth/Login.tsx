import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthProvider'

type Mode = 'password' | 'magic'

export default function Login() {
  const { signInWithOtp, signInWithPassword } = useAuth()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)

    if (mode === 'magic') {
      const { error } = await signInWithOtp(email.trim())
      if (error) {
        setError(error)
        setStatus('error')
      } else {
        setStatus('sent')
      }
      return
    }

    const { error } = await signInWithPassword(email.trim(), password)
    if (error) {
      setError(error)
      setStatus('error')
    }
    // Erfolg: onAuthStateChange übernimmt das Routing.
  }

  const tabClass = (m: Mode) =>
    [
      'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition',
      mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
    ].join(' ')

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">liiku</h1>
        <p className="mt-1 text-sm text-slate-500">Crew-Dispo &amp; Call Sheets</p>

        {status === 'sent' ? (
          <div className="mt-6 rounded-lg bg-accent-50 p-4 text-sm text-accent-700">
            Magic Link unterwegs. Prüfe dein Postfach ({email}) und öffne den Link auf diesem Gerät.
          </div>
        ) : (
          <>
            <div className="mt-6 flex gap-1 rounded-xl bg-slate-100 p-1">
              <button type="button" className={tabClass('password')} onClick={() => setMode('password')}>
                Passwort
              </button>
              <button type="button" className={tabClass('magic')} onClick={() => setMode('magic')}>
                Magic Link
              </button>
            </div>

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  E-Mail
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="du@beispiel.de"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
                />
              </div>

              {mode === 'password' && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                    Passwort
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
                  />
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={status === 'sending'}
                className="w-full rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-700 disabled:opacity-60"
              >
                {status === 'sending'
                  ? 'Moment …'
                  : mode === 'password'
                    ? 'Anmelden'
                    : 'Magic Link senden'}
              </button>

              <p className="text-center text-xs text-slate-400">
                {mode === 'password'
                  ? 'Anmeldung mit E-Mail und Passwort.'
                  : 'Kein Passwort. Du bekommst einen Anmeldelink per E-Mail.'}
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
