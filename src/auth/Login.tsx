import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthProvider'

export default function Login() {
  const { signInWithOtp } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)
    const { error } = await signInWithOtp(email.trim())
    if (error) {
      setError(error)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

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
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-700 disabled:opacity-60"
            >
              {status === 'sending' ? 'Sende Link …' : 'Magic Link senden'}
            </button>
            <p className="text-center text-xs text-slate-400">
              Kein Passwort. Du bekommst einen Anmeldelink per E-Mail.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
