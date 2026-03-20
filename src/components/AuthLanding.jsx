import { useState } from 'react'
import BrandLogo from './BrandLogo'
import { useAuth } from '../context/AuthContext'
import '../styles/AuthLanding.css'

export default function AuthLanding() {
  const { login, signup, isLoading, error, clearError } = useAuth()
  const [mode, setMode] = useState('login')
  const [loginData, setLoginData] = useState({ email: '', password: '' })
  const [signupData, setSignupData] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [localError, setLocalError] = useState('')

  const switchMode = (nextMode) => {
    setMode(nextMode)
    setLocalError('')
    clearError()
  }

  const handleLoginChange = (event) => {
    const { name, value } = event.target
    setLocalError('')
    clearError()
    setLoginData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSignupChange = (event) => {
    const { name, value } = event.target
    setLocalError('')
    clearError()
    setSignupData((prev) => ({ ...prev, [name]: value }))
  }

  const submitLogin = async (event) => {
    event.preventDefault()
    const email = loginData.email.trim()
    const password = loginData.password

    if (!email || !password) {
      setLocalError('Please enter both email and password.')
      return
    }

    await login(email, password)
  }

  const submitSignup = async (event) => {
    event.preventDefault()
    const payload = {
      fullName: signupData.fullName.trim(),
      username: signupData.username.trim(),
      email: signupData.email.trim(),
      password: signupData.password,
      confirmPassword: signupData.confirmPassword
    }

    if (!payload.fullName || !payload.username || !payload.email || !payload.password) {
      setLocalError('Please fill all required fields.')
      return
    }

    if (payload.password !== payload.confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    try {
      await signup(payload.email, payload.password, payload.username, payload.fullName)
    } catch {
      // Error message is set by auth context and shown in UI.
    }
  }

  return (
    <div className="auth-landing">
      <section className="auth-hero" aria-hidden="true">
        <BrandLogo imageOnly />
        <h1>See moments from your close circle.</h1>
        <div className="auth-hero-collage">
          <div className="card card-main" />
          <div className="card card-left" />
          <div className="card card-right" />
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-card">
          <BrandLogo compact />

          {mode === 'login' ? (
            <form className="auth-panel-form" onSubmit={submitLogin}>
              <h2>Log in</h2>
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={loginData.email}
                onChange={handleLoginChange}
                disabled={isLoading}
              />
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={loginData.password}
                onChange={handleLoginChange}
                disabled={isLoading}
              />
              {(localError || error) && <p className="auth-error">{localError || error}</p>}
              <button type="submit" disabled={isLoading}>
                {isLoading ? 'Logging in...' : 'Log in'}
              </button>
            </form>
          ) : (
            <form className="auth-panel-form" onSubmit={submitSignup}>
              <h2>Create account</h2>
              <input
                type="text"
                name="fullName"
                placeholder="Full name"
                value={signupData.fullName}
                onChange={handleSignupChange}
                disabled={isLoading}
              />
              <input
                type="text"
                name="username"
                placeholder="Username"
                value={signupData.username}
                onChange={handleSignupChange}
                disabled={isLoading}
              />
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={signupData.email}
                onChange={handleSignupChange}
                disabled={isLoading}
              />
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={signupData.password}
                onChange={handleSignupChange}
                disabled={isLoading}
              />
              <input
                type="password"
                name="confirmPassword"
                placeholder="Confirm password"
                value={signupData.confirmPassword}
                onChange={handleSignupChange}
                disabled={isLoading}
              />
              {(localError || error) && <p className="auth-error">{localError || error}</p>}
              <button type="submit" disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create account'}
              </button>
            </form>
          )}

          <div className="auth-panel-actions">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => switchMode('login')}
            >
              Log in
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => switchMode('signup')}
            >
              Sign up
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
