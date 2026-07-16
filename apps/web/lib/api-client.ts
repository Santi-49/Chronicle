const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
}

interface User {
  id: string
  email: string
  full_name: string
  is_active: boolean
  roles: Array<{
    id: string
    name: string
    permissions: Array<{
      id: string
      name: string
    }>
  }>
}

class ApiClient {
  private accessToken: string | null = null
  private refreshToken: string | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('access_token')
      this.refreshToken = localStorage.getItem('refresh_token')
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    })

    if (response.status === 401 && this.refreshToken) {
      const refreshed = await this.refresh()
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.accessToken}`
        const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
          ...options,
          headers,
        })
        if (!retryResponse.ok) {
          throw new Error(`API Error: ${retryResponse.status}`)
        }
        return retryResponse.json()
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.detail || `API Error: ${response.status}`)
    }

    if (response.status === 204) {
      return null as T
    }

    return response.json()
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken
    this.refreshToken = refreshToken
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', accessToken)
      localStorage.setItem('refresh_token', refreshToken)
    }
  }

  clearTokens() {
    this.accessToken = null
    this.refreshToken = null
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
    }
  }

  isAuthenticated(): boolean {
    return !!this.accessToken
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const response = await this.request<TokenPair>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    this.setTokens(response.access_token, response.refresh_token)
    return response
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' })
    } finally {
      this.clearTokens()
    }
  }

  async refresh(): Promise<boolean> {
    if (!this.refreshToken) return false
    
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.refreshToken}`,
        },
      })
      
      if (!response.ok) {
        this.clearTokens()
        return false
      }
      
      const data: TokenPair = await response.json()
      this.setTokens(data.access_token, data.refresh_token)
      return true
    } catch {
      this.clearTokens()
      return false
    }
  }

  async me(): Promise<User> {
    return this.request<User>('/auth/me')
  }

  async getUsers(): Promise<User[]> {
    return this.request<User[]>('/users')
  }

  async getUser(userId: string): Promise<User> {
    return this.request<User>(`/users/${userId}`)
  }

  async updateUser(userId: string, data: Partial<User>): Promise<User> {
    return this.request<User>(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteUser(userId: string): Promise<void> {
    return this.request(`/users/${userId}`, { method: 'DELETE' })
  }

  async getRoles(): Promise<Array<{ id: string; name: string; permissions: Array<{ id: string; name: string }> }>> {
    return this.request('/roles')
  }

  async getPermissions(): Promise<Array<{ id: string; name: string }>> {
    return this.request('/permissions')
  }
}

export const apiClient = new ApiClient()
export type { TokenPair, User }
