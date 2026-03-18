import '../styles/BrandLogo.css'
import instagramLogoImage from '../assets/instagram.jpg'
import { useState } from 'react'

export default function BrandLogo({ compact = false, wordmarkOnly = false, imageOnly = false }) {
  const [imageFailed, setImageFailed] = useState(false)
  const logoSrc = instagramLogoImage

  return (
    <div
      className={`brand-logo ${compact ? 'compact' : ''} ${wordmarkOnly ? 'wordmark-only' : ''}`}
      aria-label="InstaClone"
    >
      {!wordmarkOnly && logoSrc && !imageFailed && (
        <img
          src={logoSrc}
          alt="InstaClone logo"
          className="brand-logo-image"
          onError={() => setImageFailed(true)}
        />
      )}
      {!wordmarkOnly && (imageFailed || !logoSrc) && (
        <span className="brand-fallback" aria-hidden="true">IG</span>
      )}
      {!imageOnly && <span className="brand-wordmark">InstaClone</span>}
    </div>
  )
}
