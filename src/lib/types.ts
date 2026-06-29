// Handgepflegte Kern-Typen passend zum Supabase-Schema (V1).
// Später ggf. durch generierte Typen ersetzen: `supabase gen types typescript`.

export type SystemRolle = 'admin' | 'disponent' | 'lead' | 'crew' | 'gast'
export type PersonTyp = 'intern' | 'freelance' | 'lokal' | 'volunteer' | 'vendor' | 'client'
export type ProjektTyp = 'dreh' | 'event' | 'live'
export type SchichtTyp = 'arbeit' | 'standby' | 'eigendispo' | 'nachtwache'
export type CrewStatus = 'eingeladen' | 'zugesagt' | 'abgesagt'

export const PLANER_ROLLEN: SystemRolle[] = ['admin', 'disponent', 'lead']

export interface Person {
  id: string
  auth_user_id: string | null
  name: string
  kuerzel: string | null
  email: string
  mobil: string | null
}

export interface Membership {
  id: string
  person_id: string
  org_id: string
  rolle: SystemRolle
  typ: PersonTyp
  org?: { id: string; name: string } | null
}
