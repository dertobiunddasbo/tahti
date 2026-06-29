import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { ProductionProvider } from './productions/ProductionProvider.tsx'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ProductionProvider>
          <App />
        </ProductionProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
