import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { configureClient, setAuthHandlers, apiFetch, ApiClientError, type AuthHandlers } from './client'

// Build a minimal fetch Response stand-in consumed by the client interceptor.
function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body))
  } as unknown as Response
}

const baseUrl = 'http://localhost/api/v1'
const handlers: AuthHandlers = {
  getTokens: () => ({ accessToken: 'access', refreshToken: 'refresh' }),
  getTenantSlug: () => null,
  onSessionUpdated: vi.fn(),
  onSessionCleared: vi.fn()
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  configureClient(baseUrl)
  setAuthHandlers({ ...handlers, getTokens: () => ({ accessToken: 'access', refreshToken: 'refresh' }) })
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch – request construction', () => {
  it('attaches the bearer token and request URL by default', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: 1 }))

    await apiFetch<{ data: number }>('/secure', { method: 'GET' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/secure`)
    expect(init.headers.get('Authorization')).toBe('Bearer access')
  })

  it('skips the auth header when auth:false is set', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))

    await apiFetch('/auth/login', { method: 'POST', body: '{}', auth: false })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.get('Authorization')).toBeNull()
    // A JSON body still gets a Content-Type.
    expect(init.headers.get('Content-Type')).toBe('application/json')
  })

  it('returns undefined for a 204 response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204))

    const result = await apiFetch('/empty', { method: 'DELETE' })
    expect(result).toBeUndefined()
  })
})

function expectApiError(promise: Promise<unknown>): Promise<ApiClientError> {
  return promise.then(
    () => Promise.reject(new Error('Expected the promise to reject')),
    (e: unknown) => {
      expect(e).toBeInstanceOf(ApiClientError)
      return e as ApiClientError
    }
  )
}

describe('apiFetch error handling', () => {
  it('surfaces a structured ApiClientError from a JSON error body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Missing', details: [{ field: 'id', message: 'x' }] } })
    )

    const error = await expectApiError(apiFetch('/users/1', { method: 'GET' }))
    expect(error.status).toBe(404)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toBe('Missing')
    expect(error.details).toEqual([{ field: 'id', message: 'x' }])
  })

  it('falls back to HTTP_ERROR when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500)) // json() rejects

    const error = await expectApiError(apiFetch('/boom', { method: 'GET' }))
    expect(error.code).toBe('HTTP_ERROR')
    expect(error).toMatchObject({ status: 500, message: 'Request failed (500)' })
  })
})
describe('apiFetch – single-flight refresh + replay', () => {
  it('refreshes on a 401 and replays the original request with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } }))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'new-token', refreshToken: 'new-refresh', expiresIn: 900, user: {} })
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: 'ok' }))

    const result = await apiFetch<{ data: string }>('/secure', { method: 'GET' })

    expect(result).toEqual({ data: 'ok' })
    // Refresh request posts the old tokens to /auth/refresh.
    expect(fetchMock.mock.calls[1][0]).toBe(`${baseUrl}/auth/refresh`)
    expect(fetchMock.mock.calls[1][1].body).toContain('"accessToken":"access"')
    expect(handlers.onSessionUpdated).toHaveBeenCalledWith({ accessToken: 'new-token', refreshToken: 'new-refresh' })
    // Replay carried the refreshed token.
    const replayHeaders = fetchMock.mock.calls[2][1].headers
    expect(replayHeaders.get('Authorization')).toBe('Bearer new-token')
  })

  it('clears the session but still surfaces the error when refresh fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'REFRESH_TOKEN_REVOKED', message: 'revoked' } }))

    const error = await expectApiError(apiFetch('/secure', { method: 'GET' }))

    expect(handlers.onSessionCleared).toHaveBeenCalled()
    expect(handlers.onSessionUpdated).not.toHaveBeenCalled()
    expect(error.status).toBe(401)
  })

  it('coalesces concurrent 401s onto a single refresh request', async () => {
    // Order-independent mock: the first hit on each endpoint is a 401, replays succeed.
    let usersHits = 0
    let rolesHits = 0
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url)
      if (u.endsWith('/auth/refresh')) {
        return jsonResponse(200, { accessToken: 'new-token', refreshToken: 'new-refresh', expiresIn: 900, user: {} })
      }
      if (u.includes('/users')) {
        usersHits += 1
        return usersHits === 1 ? jsonResponse(401, {}) : jsonResponse(200, { data: 'users' })
      }
      if (u.includes('/roles')) {
        rolesHits += 1
        return rolesHits === 1 ? jsonResponse(401, {}) : jsonResponse(200, { data: 'roles' })
      }
      return jsonResponse(401, {})
    })

    const [users, roles] = await Promise.all([
      apiFetch('/users', { method: 'GET' }),
      apiFetch('/roles', { method: 'GET' })
    ])

    expect(users).toEqual({ data: 'users' })
    expect(roles).toEqual({ data: 'roles' })
    // Exactly one refresh round-trip for two concurrent 401s.
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))
    expect(refreshCalls).toHaveLength(1)
    expect(handlers.onSessionUpdated).toHaveBeenCalledTimes(1)
  })

  it('does not attempt refresh for the auth endpoints themselves', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'bad' } }))

    await expect(apiFetch('/auth/login', { method: 'POST', body: '{}', auth: false })).rejects.toThrow('bad')

    expect(fetchMock).toHaveBeenCalledTimes(1) // no follow-up refresh call
  })
})
