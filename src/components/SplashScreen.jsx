import BrandLogo from './BrandLogo'

export default function SplashScreen() {
  return (
    <div className="splash-screen" role="status" aria-live="polite">
      <div className="splash-content">
        <BrandLogo imageOnly />
        <p className="splash-text">Loading...</p>
      </div>
    </div>
  )
}
