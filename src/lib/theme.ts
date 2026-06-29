import { useState } from 'react'

const KEY = 'liiku.theme'

/** Dark-Mode-Toggle. Initialzustand setzt das Inline-Script in index.html (FOUC-frei). */
export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem(KEY, next ? 'dark' : 'light')
    } catch {
      /* ignore */
    }
  }

  return { dark, toggle }
}
