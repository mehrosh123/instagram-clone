import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import AuthLanding from './AuthLanding'
import SplashScreen from './SplashScreen'

const TOKEN_KEY = 'auth_token'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, checkAuth } = useAuth()
  const [isAuthChecked, setIsAuthChecked] = useState(false)
  const hasStoredToken = !!localStorage.getItem(TOKEN_KEY)

  useEffect(() => {
    let isMounted = true

    const initializeAuth = async () => {
      setIsAuthChecked(false)

      try {
        if (hasStoredToken) {
          await checkAuth()
        }
      } finally {
        if (isMounted) {
          setIsAuthChecked(true)
        }
      }
    }

    initializeAuth()

    return () => {
      isMounted = false
    }
  }, [checkAuth, hasStoredToken])

  if (hasStoredToken && !isAuthChecked) {
    return <SplashScreen />
  }

  if (!isAuthenticated) {
    return <AuthLanding />
  }

  return children
}
