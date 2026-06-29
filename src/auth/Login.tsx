import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthProvider'

type Mode = 'password' | 'magic'

const inputCls =
  'mt-1 w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30'

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
      } else setStatus('sent')
      return
    }
    const { error } = await signInWithPassword(email.trim(), password)
    if (error) {
      setError(error)
      setStatus('error')
    }
  }

  const tabClass = (m: Mode) =>
    [
      'flex-1 rounded-lg px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition',
      mode === m ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
    ].join(' ')

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-[0_1px_0_0_var(--c-line)]">
        <h1 className="flex items-center gap-1.5 font-mono text-2xl font-bold tracking-tight">
          tahti
          <span className="inline-block h-2 w-2 rounded-full bg-accent" />
        </h1>
        <p className="mt-1 text-sm text-muted">Crew, Dispo, Call Sheet – alle im Bild</p>

        {status === 'sent' ? (
          <div className="mt-6 rounded-lg bg-accent/10 p-4 text-sm text-accent-strong">
            Magic Link unterwegs. Prüfe dein Postfach ({email}) und öffne den Link auf diesem Gerät.
          </div>
        ) : (
          <>
            <div className="mt-6 flex gap-1 rounded-xl border border-line bg-canvas p-1">
              <button type="button" className={tabClass('password')} onClick={() => setMode('password')}>
                Passwort
              </button>
              <button type="button" className={tabClass('magic')} onClick={() => setMode('magic')}>
                Magic Link
              </button>
            </div>

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-ink">
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
                  className={inputCls}
                />
              </div>

              {mode === 'password' && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-ink">
                    Passwort
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}

              {error && <p className="text-sm text-danger">{error}</p>}

              <button
                type="submit"
                disabled={status === 'sending'}
                className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-60"
              >
                {status === 'sending' ? 'Moment …' : mode === 'password' ? 'Anmelden' : 'Magic Link senden'}
              </button>

              <p className="text-center text-xs text-muted">
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
