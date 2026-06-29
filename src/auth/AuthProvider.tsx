import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { PLANER_ROLLEN, type Membership, type Person } from '../lib/types'

interface AuthState {
  loading: boolean
  session: Session | null
  /** Die mit dem Login verknüpfte person-Zeile (null, wenn noch nicht angelegt). */
  person: Person | null
  /** Eigene Mitgliedschaften (orgübergreifend). */
  memberships: Membership[]
  /** True, wenn die Person in irgendeiner Org admin/disponent/lead ist. */
  isPlaner: boolean
  signInWithOtp: (email: string) => Promise<{ error: string | null }>
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [person, setPerson] = useState<Person | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])

  async function loadProfile(uid: string) {
    const { data: p } = await supabase
      .from('person')
      .select('id, auth_user_id, name, kuerzel, email, mobil')
      .eq('auth_user_id', uid)
      .maybeSingle()

    setPerson((p as Person) ?? null)

    if (p) {
      const { data: m } = await supabase
        .from('membership')
        .select('id, person_id, org_id, rolle, typ, org:org_id (id, name)')
        .eq('person_id', p.id)
      setMemberships((m as unknown as Membership[]) ?? [])
    } else {
      setMemberships([])
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s)
      if (s) {
        await loadProfile(s.user.id)
      } else {
        setPerson(null)
        setMemberships([])
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  async function signInWithOtp(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    return { error: error?.message ?? null }
  }

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const isPlaner = memberships.some((m) => PLANER_ROLLEN.includes(m.rolle))

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        person,
        memberships,
        isPlaner,
        signInWithOtp,
        signInWithPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden')
  return ctx
}
