import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { ProjektTyp } from '../lib/types'

export interface Produktion {
  id: string
  name: string
  typ: ProjektTyp
  org_id: string
  client: string | null
  start_datum: string | null
  end_datum: string | null
}

interface ProductionState {
  productions: Produktion[]
  loading: boolean
  selected: Produktion | null
  selectedId: string | null
  setSelectedId: (id: string) => void
  reload: () => void
}

const Ctx = createContext<ProductionState | undefined>(undefined)
const LS_KEY = 'liiku.selectedProduktion'

export function ProductionProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [productions, setProductions] = useState<Produktion[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedIdState] = useState<string | null>(() => localStorage.getItem(LS_KEY))

  const reload = useCallback(() => {
    if (!session) {
      setProductions([])
      setLoading(false)
      return
    }
    setLoading(true)
    supabase
      .from('projekt')
      .select('id, name, typ, org_id, client, start_datum, end_datum')
      .order('start_datum', { ascending: false })
      .then(({ data }) => {
        const list = (data as Produktion[]) ?? []
        setProductions(list)
        setSelectedIdState((cur) => {
          if (cur && list.some((p) => p.id === cur)) return cur
          return list[0]?.id ?? null
        })
        setLoading(false)
      })
  }, [session])

  useEffect(() => {
    reload()
  }, [reload])

  function setSelectedId(id: string) {
    localStorage.setItem(LS_KEY, id)
    setSelectedIdState(id)
  }

  const selected = productions.find((p) => p.id === selectedId) ?? null

  return (
    <Ctx.Provider value={{ productions, loading, selected, selectedId, setSelectedId, reload }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProductions() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProductions muss innerhalb von <ProductionProvider> verwendet werden')
  return ctx
}
