import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import '../styles/Auth.css'

/**
 * THEORY: Form Handling in React
 * ===============================
 * 
 * Controlled Components:
 * - Form inputs are "controlled" by React state
 * - React state is the "single source of truth"
 * - Pattern: value={state} + onChange handler
 * 
 * Form Validation:
 * - Client-side: Prevents invalid submissions, improves UX
 * - Server-side: Essential for security (never trust client!)
 * - Both are needed in production apps
 * 
 * Security Best Practices:
 * 1. Hash passwords on server (bcrypt)
 * 2. Use HTTPS for all API calls
 * 3. Never store passwords in localStorage (use JWT tokens instead)
 * 4. Implement CSRF protection
 * 5. Rate limit login attempts
 */

export default function Login({ onSwitch }) {
  const { login, isLoading, error, clearError } = useAuth()
  
  // Form state - controlled components
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [errors, setErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)

  /**
   * THEORY: Input Change Handler
   * =============================
   * Updates form state as user types
   * This is the "controlled component" pattern
   */
  const handleChange = (e) => {
    const { name, value } = e.target
    clearError()
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  /**
   * THEORY: Form Validation
   * =======================
   * Client-side validation improves UX
   * Regular expressions ensure email format is valid
   */
  const validateForm = () => {
    const newErrors = {}
    const normalizedEmail = formData.email.trim()
    const normalizedPassword = formData.password.trim()

    if (!normalizedEmail) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      newErrors.email = 'Invalid email format'
    }

    if (!normalizedPassword) {
      newErrors.password = 'Password is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitted(true)
    clearError()

    if (!validateForm()) return

    try {
      // Call context's login function
      await login(formData.email.trim(), formData.password)
      // On success, redirect to home (handled by router)
    } catch (err) {
      // Error is already stored in context
      console.error('Login failed:', err)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>📷 InstaClone</h1>
          <p>Share your moments</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
              disabled={isLoading}
              className={errors.email ? 'error' : ''}
            />
            {errors.email && <span className="error-message">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter your password"
              disabled={isLoading}
              className={errors.password ? 'error' : ''}
            />
            {errors.password && <span className="error-message">{errors.password}</span>}
          </div>

          {error && (
            <div className="alert alert-error">
              <strong>Error:</strong> {error}
            </div>
          )}

          <button 
            type="submit" 
            className="btn btn-primary btn-block"
            disabled={isLoading}
          >
            {isLoading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <button
              type="button"
              className="link-button"
              onClick={onSwitch}
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
