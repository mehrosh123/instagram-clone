const TOKEN_KEY = 'auth_token'

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export async function apiFetch(url, options = {}) {
  const token = getAuthToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(url, {
    ...options,
    headers
  })

  if (!response.ok) {
    let message = 'Request failed'
    try {
      const payload = await response.json()
      message = payload.error || payload.message || message
    } catch {
      // Keep default error message when response is not JSON.
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}
