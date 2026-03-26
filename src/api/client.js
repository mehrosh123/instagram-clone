const TOKEN_KEYS = ['auth_token', 'token']
const RAW_API_BASE_URL = String(import.meta.env.VITE_API_URL || '').trim()
const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, '')

export function buildApiUrl(url) {
  const normalizedUrl = String(url || '')
  if (/^https?:\/\//i.test(normalizedUrl)) {
    return normalizedUrl
  }

  if (!API_BASE_URL) {
    return normalizedUrl
  }

  if (normalizedUrl.startsWith('/')) {
    return `${API_BASE_URL}${normalizedUrl}`
  }

  return `${API_BASE_URL}/${normalizedUrl}`
}

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

  const response = await fetch(buildApiUrl(url), {
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
