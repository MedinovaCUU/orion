import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const applyRuntimeFavicon = async () => {
  const baseUrl = import.meta.env.BASE_URL || '/'
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const version = 'orion-runtime-2'
  const nonce = `${Date.now()}`
  const iconDefinitions = [
    { rel: 'icon', type: 'image/x-icon', href: `${normalizedBase}favicon.ico?v=${version}&t=${nonce}` },
    { rel: 'icon', type: 'image/png', href: `${normalizedBase}favicon.png?v=${version}&t=${nonce}` },
    { rel: 'shortcut icon', type: 'image/x-icon', href: `${normalizedBase}favicon.ico?v=${version}&t=${nonce}` },
    { rel: 'apple-touch-icon', href: `${normalizedBase}apple-touch-icon.png?v=${version}&t=${nonce}` },
  ]

  document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']").forEach((node) => {
    node.parentNode?.removeChild(node)
  })

  try {
    const response = await fetch(`${normalizedBase}favicon.png?v=${version}&t=${nonce}`, { cache: 'no-store' })
    if (response.ok) {
      const blobUrl = URL.createObjectURL(await response.blob())
      iconDefinitions.unshift({ rel: 'icon', type: 'image/png', href: blobUrl })
    }
  } catch {
    // Si el fetch falla, dejamos que los links estaticos hagan fallback.
  }

  for (const definition of iconDefinitions) {
    const link = document.createElement('link')
    link.rel = definition.rel
    link.href = definition.href
    if ('type' in definition && definition.type) {
      link.type = definition.type
    }
    document.head.appendChild(link)
  }
}

void applyRuntimeFavicon()

createRoot(document.getElementById('root')!).render(
  <App />,
)
