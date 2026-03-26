import { Navigate, useLocation } from 'react-router-dom'
import { getAuthToken } from '../api/client'
import { useAuth } from '../context/useAuth'
import SplashScreen from './SplashScreen'

export default function ProtectedRoute({ children }) {
  const location = useLocation()
  const { isAuthenticated, hasCheckedAuth } = useAuth()
  const hasStoredToken = !!getAuthToken()

  if (!hasCheckedAuth && hasStoredToken) {
    return <SplashScreen />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}
