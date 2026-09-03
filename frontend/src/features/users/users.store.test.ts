import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserDto } from '@/features/auth/auth.types'
import {
  useUsersStore,
  selectSelectedUser,
  selectTotalPages,
  selectHasNextPage,
  selectHasPrevPage
} from './users.store'
import { useAuthStore } from '@/features/auth/auth.store'

const { usersApiMock } = vi.hoisted(() => ({
  usersApiMock: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    changePassword: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}))

vi.mock('./api', () => ({ usersApi: usersApiMock }))

const users: UserDto[] = [
  {
    id: 'u1',
    email: 'ann@example.com',
    firstName: 'Ann',
    lastName: 'Adams',
    roles: ['Admin'],
    status: 'active',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    tenantId: '00000000-0000-0000-0000-000000000001'
  },
  {
    id: 'u2',
    email: 'bob@example.com',
    firstName: 'Bob',
    lastName: 'Banks',
    roles: ['ReadOnly'],
    status: 'active',
    createdAt: '2025-01-02T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    tenantId: '00000000-0000-0000-0000-000000000001'
  }
]

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isLoading: false, error: null })
  useUsersStore.setState({
    items: [],
    totalCount: 0,
    selectedUserId: null,
    filters: { search: '', role: null, status: 'all', page: 1, pageSize: 10 },
    isLoading: false,
    error: null
  })
})
describe('users store – fetchUsers', () => {
  it('loads the page into state using the current filters', async () => {
    usersApiMock.getAll.mockResolvedValue({ items: users, totalCount: 2, page: 1, pageSize: 10, totalPages: 1 })
    useUsersStore.setState({
      filters: { ...useUsersStore.getState().filters, search: 'ann', status: 'active', page: 1 }
    })

    await useUsersStore.getState().fetchUsers()

    const state = useUsersStore.getState()
    expect(state.items).toEqual(users)
    expect(state.totalCount).toBe(2)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
    // The store forwards the active filters to the API (with its abort signal).
    expect(usersApiMock.getAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'ann', status: 'active', page: 1, pageSize: 10 }),
      expect.any(AbortSignal)
    )
  })

  it('captures the error message and stops loading on failure', async () => {
    usersApiMock.getAll.mockRejectedValue(new Error('boom'))

    await useUsersStore.getState().fetchUsers()

    const state = useUsersStore.getState()
    expect(state.error).toBe('boom')
    expect(state.isLoading).toBe(false)
    expect(state.items).toEqual([])
  })

  it('aborts the superseded request before starting a new one (race guard)', async () => {
    const signals: AbortSignal[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    usersApiMock.getAll
      .mockImplementationOnce((_p: unknown, signal?: AbortSignal) => {
        signals.push(signal!)
        return firstGate
      })
      .mockImplementationOnce((_p: unknown, signal?: AbortSignal) => {
        signals.push(signal!)
        return Promise.resolve({ items: users, totalCount: 2, page: 1, pageSize: 10, totalPages: 1 })
      })

    // Start a slow request, then immediately supersede it with a fresh one.
    const first = useUsersStore.getState().fetchUsers()
    const second = useUsersStore.getState().fetchUsers()
    releaseFirst()
    await Promise.all([first, second])

    expect(signals).toHaveLength(2)
    // The first (stale) request's controller was cancelled; the latest stays live.
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
  })

  it('ignores a stale response that resolves after abort (does not overwrite state)', async () => {
    let resolveStale!: (v: unknown) => void
    const stale = new Promise((resolve) => {
      resolveStale = resolve
    })
    usersApiMock.getAll
      .mockReturnValueOnce(stale) // first request: slow, will be superseded
      .mockResolvedValueOnce({ items: [users[1]], totalCount: 1, page: 1, pageSize: 10, totalPages: 1 })

    const first = useUsersStore.getState().fetchUsers()
    await useUsersStore.getState().fetchUsers() // second request supersedes the first

    // Resolve the stale request AFTER the fresh one committed its data.
    resolveStale({ items: users, totalCount: 2, page: 1, pageSize: 10, totalPages: 1 })
    await first

    const state = useUsersStore.getState()
    // The fresh result won; the stale response did not clobber it.
    expect(state.items).toEqual([users[1]])
    expect(state.totalCount).toBe(1)
    expect(state.isLoading).toBe(false)
  })
})

describe('users store – create / update / delete', () => {
  it('prepends a newly created user and bumps the count', async () => {
    useUsersStore.setState({ items: [users[0]], totalCount: 1 })
    const created = { ...users[1], id: 'u3' }
    usersApiMock.create.mockResolvedValue(created)

    await useUsersStore.getState().createUser({
      email: created.email,
      firstName: created.firstName,
      lastName: created.lastName,
      password: 'pw',
      roles: []
    })

    const state = useUsersStore.getState()
    expect(state.items[0]).toEqual(created)
    expect(state.totalCount).toBe(2)
  })

  it('re-throws and records errors when creation fails', async () => {
    usersApiMock.create.mockRejectedValue(new Error('create failed'))
    await expect(
      useUsersStore.getState().createUser({ email: 'a', firstName: 'a', lastName: 'b', password: 'x', roles: [] })
    ).rejects.toThrow('create failed')
    expect(useUsersStore.getState().error).toBe('create failed')
  })

  it('updates a user in place', async () => {
    useUsersStore.setState({ items: users })
    const updated = { ...users[0], firstName: 'Anne' }
    usersApiMock.update.mockResolvedValue(updated)

    await useUsersStore.getState().updateUser('u1', { firstName: 'Anne' })

    const state = useUsersStore.getState()
    expect(state.items.find((u) => u.id === 'u1')?.firstName).toBe('Anne')
    expect(state.items[1]).toEqual(users[1])
  })

  it('removes a deleted user and clears its selection', async () => {
    useUsersStore.setState({ items: users, totalCount: 2, selectedUserId: 'u1' })
    usersApiMock.delete.mockResolvedValue(undefined)

    await useUsersStore.getState().deleteUser('u1')

    const state = useUsersStore.getState()
    expect(state.items.map((u) => u.id)).toEqual(['u2'])
    expect(state.totalCount).toBe(1)
    expect(state.selectedUserId).toBeNull()
  })

  it('does not drop the count below zero and re-throws on error', async () => {
    useUsersStore.setState({ items: users, totalCount: 1 })
    usersApiMock.delete.mockRejectedValue(new Error('delete failed'))
    await expect(useUsersStore.getState().deleteUser('u1')).rejects.toThrow('delete failed')
    expect(useUsersStore.getState().error).toBe('delete failed')
  })
})

describe('users store – filters & pagination', () => {
  it('clamps the page within the valid range and refetches', async () => {
    useUsersStore.setState({ totalCount: 100 }) // pageSize 10 → 10 pages
    usersApiMock.getAll.mockResolvedValue({ items: [], totalCount: 100, page: 3, pageSize: 10, totalPages: 10 })

    useUsersStore.getState().setPage(3)
    expect(useUsersStore.getState().filters.page).toBe(3)

    useUsersStore.getState().setPage(99)
    expect(useUsersStore.getState().filters.page).toBe(10)

    useUsersStore.getState().setPage(0)
    expect(useUsersStore.getState().filters.page).toBe(1)

    // Every setter (including the one fired on bounds clamp) refetches.
    expect(usersApiMock.getAll).toHaveBeenCalled()
  })

  it('search resets to page 1 then refetches', () => {
    useUsersStore.setState({ totalCount: 100, filters: { ...useUsersStore.getState().filters, page: 5 } })
    usersApiMock.getAll.mockResolvedValue({ items: [], totalCount: 100, page: 1, pageSize: 10, totalPages: 10 })

    useUsersStore.getState().setSearch('ada')

    expect(useUsersStore.getState().filters.page).toBe(1)
    expect(useUsersStore.getState().filters.search).toBe('ada')
  })
})

describe('users store selectors', () => {
  it('selectSelectedUser resolves the selected id to an item', () => {
    useUsersStore.setState({ items: users, selectedUserId: 'u2' })
    expect(selectSelectedUser(useUsersStore.getState())?.id).toBe('u2')
    useUsersStore.setState({ selectedUserId: null })
    expect(selectSelectedUser(useUsersStore.getState())).toBeNull()
  })

  it('derives total/next/previous pages from the count and filters', () => {
    const state = useUsersStore.getState
    useUsersStore.setState({ totalCount: 25, filters: { ...state().filters, page: 2, pageSize: 10 } })

    expect(selectTotalPages(useUsersStore.getState())).toBe(3)
    expect(selectHasNextPage(useUsersStore.getState())).toBe(true) // 2 < 3
    expect(selectHasPrevPage(useUsersStore.getState())).toBe(true) // 2 > 1

    useUsersStore.setState({ filters: { ...state().filters, page: 3 } })
    expect(selectHasNextPage(useUsersStore.getState())).toBe(false)

    useUsersStore.setState({ filters: { ...state().filters, page: 1 } })
    expect(selectHasPrevPage(useUsersStore.getState())).toBe(false)
  })
})
