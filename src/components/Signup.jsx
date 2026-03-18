import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import BrandLogo from './BrandLogo'
import '../styles/Auth.css'

/**
 * THEORY: Complex Form Handling
 * ==============================
 * Signup forms are more complex than login:
 * - More fields to validate
 * - Password confirmation matching
 * - Username uniqueness (server-side check)
 * - Terms acceptance
 * - Multiple validation rules per field
 */

export default function Signup({ onSwitch }) {
  const { signup, isLoading, error, clearError } = useAuth()
  
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    fullName: '',
    profilePicture: '',
    bio: '',
    website: '',
    isPrivate: false,
    password: '',
    confirmPassword: '',
    agreeToTerms: false
  })
  const [errors, setErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    clearError()
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
    // Clear error when user corrects field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  /**
   * THEORY: Complex Validation
   * ===========================
   * Multiple validation rules:
   * 1. Email format validation
   * 2. Username: alphanumeric, no special chars (except . _ -)
   * 3. Password strength: minimum 8 chars, mix of cases, numbers
   * 4. Password matching
   * 5. Terms acceptance
   * 
   * These should also be validated on server!
   */
  const validateForm = () => {
    const newErrors = {}

    // Email validation
    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }

    // Username validation - alphanumeric, underscores, dots, hyphens
    if (!formData.username) {
      newErrors.username = 'Username is required'
    } else if (!/^[a-zA-Z0-9._-]{3,20}$/.test(formData.username)) {
      newErrors.username = 'Username must be 3-20 chars (alphanumeric, ._- allowed)'
    }

    // Full name validation
    if (!formData.fullName) {
      newErrors.fullName = 'Full name is required'
    } else if (formData.fullName.length < 2) {
      newErrors.fullName = 'Full name must be at least 2 characters'
    }

    // Password validation - password strength checking
    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    } else if (!/[A-Z]/.test(formData.password)) {
      newErrors.password = 'Password must contain an uppercase letter'
    } else if (!/[0-9]/.test(formData.password)) {
      newErrors.password = 'Password must contain a number'
    }

    // Confirm password
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    // Terms agreement
    if (!formData.agreeToTerms) {
      newErrors.terms = 'You must agree to the terms'
    }

    if (formData.website && !/^https?:\/\/.+/.test(formData.website)) {
      newErrors.website = 'Website must start with http:// or https://'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitted(true)

    if (!validateForm()) return

    try {
      await signup(
        formData.email,
        formData.password,
        formData.username,
        formData.fullName,
        formData.profilePicture,
        {
          bio: formData.bio,
          website: formData.website,
          isPrivate: formData.isPrivate
        }
      )
      // On success, redirect to home
    } catch (err) {
      console.error('Signup failed:', err)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <BrandLogo imageOnly />
          <p>Create your account</p>
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
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Choose a username"
              disabled={isLoading}
              className={errors.username ? 'error' : ''}
            />
            {errors.username && <span className="error-message">{errors.username}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="fullName">Full Name</label>
            <input
              type="text"
              id="fullName"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="Your full name"
              disabled={isLoading}
              className={errors.fullName ? 'error' : ''}
            />
            {errors.fullName && <span className="error-message">{errors.fullName}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="profilePicture">Display Picture URL (optional)</label>
            <input
              type="url"
              id="profilePicture"
              name="profilePicture"
              value={formData.profilePicture}
              onChange={handleChange}
              placeholder="https://example.com/avatar.jpg"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="bio">Bio (optional)</label>
            <input
              type="text"
              id="bio"
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              placeholder="Tell people about yourself"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="website">Website (optional)</label>
            <input
              type="url"
              id="website"
              name="website"
              value={formData.website}
              onChange={handleChange}
              placeholder="https://your-site.com"
              disabled={isLoading}
              className={errors.website ? 'error' : ''}
            />
            {errors.website && <span className="error-message">{errors.website}</span>}
          </div>

          <div className="form-group checkbox">
            <input
              type="checkbox"
              id="isPrivate"
              name="isPrivate"
              checked={formData.isPrivate}
              onChange={handleChange}
              disabled={isLoading}
            />
            <label htmlFor="isPrivate">
              Private account (followers must be approved)
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="At least 8 chars, uppercase, and 1 number"
              disabled={isLoading}
              className={errors.password ? 'error' : ''}
            />
            {errors.password && <span className="error-message">{errors.password}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Re-enter your password"
              disabled={isLoading}
              className={errors.confirmPassword ? 'error' : ''}
            />
            {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
          </div>

          <div className="form-group checkbox">
            <input
              type="checkbox"
              id="terms"
              name="agreeToTerms"
              checked={formData.agreeToTerms}
              onChange={handleChange}
              disabled={isLoading}
            />
            <label htmlFor="terms">
              I agree to the Terms of Service and Privacy Policy
            </label>
            {errors.terms && <span className="error-message">{errors.terms}</span>}
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
            {isLoading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <button
              type="button"
              className="link-button"
              onClick={onSwitch}
            >
              Log in
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
