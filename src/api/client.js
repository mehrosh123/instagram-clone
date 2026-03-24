const TOKEN_KEYS = ['auth_token', 'token']

export function getAuthToken() {
  for (const key of TOKEN_KEYS) {
    const token = localStorage.getItem(key)
    if (token) {
      return token
    }
  }
  return null
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
    cache: 'no-store',
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
