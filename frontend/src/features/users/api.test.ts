import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usersApi } from './api'

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }))
vi.mock('@/shared/api/client', () => ({ apiFetch: apiFetchMock }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('usersApi.getAll – query building', () => {
  it('uses a bare path when no filters are set', async () => {
    apiFetchMock.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 0 })
    await usersApi.getAll()
    expect(apiFetchMock).toHaveBeenCalledWith('/users', { method: 'GET' })
  })

  it('encodes active filters into the query string', async () => {
    apiFetchMock.mockResolvedValue({})
    await usersApi.getAll({
      page: 2,
      pageSize: 25,
      search: 'ann',
      role: 'Admin',
      status: 'active',
      sortBy: 'email',
      sortDir: 'desc'
    })
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/users?page=2&pageSize=25&search=ann&role=Admin&status=active&sortBy=email&sortDir=desc',
      { method: 'GET' }
    )
  })

  it('drops the status param when it is "all"', async () => {
    apiFetchMock.mockResolvedValue({})
    await usersApi.getAll({ status: 'all', page: 1 })
    expect(apiFetchMock).toHaveBeenCalledWith('/users?page=1', { method: 'GET' })
  })
})
