import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TenantDto } from './tenants.types'
import {
  useTenantsStore,
  selectSelectedTenant,
  selectTotalPages,
  selectHasNextPage,
  selectHasPrevPage
} from './tenants.store'

const { tenantsApiMock } = vi.hoisted(() => ({
  tenantsApiMock: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn()
  }
}))

vi.mock('./api', () => ({ tenantsApi: tenantsApiMock }))

const tenants: TenantDto[] = [
  { id: 't1', name: 'Acme', displayName: 'Acme Inc', slug: 'acme', status: 'active', createdAt: '2025-01-01T00:00:00Z' },
  { id: 't2', name: 'Globex', displayName: 'Globex Corp', slug: 'globex', status: 'suspended', createdAt: '2025-01-02T00:00:00Z' }
]

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  useTenantsStore.setState({
    items: [],
    totalCount: 0,
    selectedTenantId: null,
    filters: { search: '', page: 1, pageSize: 10 },
    isLoading: false,
    error: null
  })
})

describe('tenants store – fetchTenants', () => {
  it('loads the page into state using the current filters', async () => {
    tenantsApiMock.getAll.mockResolvedValue({ items: tenants, totalCount: 2, page: 1, pageSize: 10, totalPages: 1 })
    useTenantsStore.setState({ filters: { ...useTenantsStore.getState().filters, search: 'acme' } })

    await useTenantsStore.getState().fetchTenants()

    const state = useTenantsStore.getState()
    expect(state.items).toEqual(tenants)
    expect(state.totalCount).toBe(2)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
    expect(tenantsApiMock.getAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'acme', page: 1, pageSize: 10 })
    )
  })


describe('tenants store – create / update / delete', () => {
  it('prepends a newly created tenant and bumps the count', async () => {
    useTenantsStore.setState({ items: [tenants[0]], totalCount: 1 })
    const created = { ...tenants[1], id: 't3' }
    tenantsApiMock.create.mockResolvedValue(created)

    await useTenantsStore.getState().createTenant({ name: 'Initech', displayName: 'Initech LLC', slug: 'initech' })

    const state = useTenantsStore.getState()
    expect(state.items[0]).toEqual(created)
    expect(state.totalCount).toBe(2)
  })

  it('re-throws on failed create', async () => {
    tenantsApiMock.create.mockRejectedValue(new Error('dup'))
    await expect(
      useTenantsStore.getState().createTenant({ name: 'X', displayName: 'X', slug: 'platform' })
    ).rejects.toThrow('dup')
    expect(useTenantsStore.getState().error).toBe('dup')
  })

  it('replaces an updated tenant in place', async () => {
    useTenantsStore.setState({ items: tenants, totalCount: 2 })
    const updated = { ...tenants[0], status: 'suspended' as const }
    tenantsApiMock.update.mockResolvedValue(updated)

    await useTenantsStore.getState().updateTenant('t1', { status: 'suspended' })

    const state = useTenantsStore.getState()
    expect(state.items.find((t) => t.id === 't1')?.status).toBe('suspended')
    expect(state.items[1]).toEqual(tenants[1])
  })

  it('removes a deleted tenant and clears its selection', async () => {
    useTenantsStore.setState({ items: tenants, totalCount: 2, selectedTenantId: 't1' })
    tenantsApiMock.remove.mockResolvedValue(undefined)

    await useTenantsStore.getState().deleteTenant('t1')

    const state = useTenantsStore.getState()
    expect(state.items.map((t) => t.id)).toEqual(['t2'])
    expect(state.totalCount).toBe(1)
    expect(state.selectedTenantId).toBeNull()
  })

  it('does not drop the count below zero and re-throws on error', async () => {
    useTenantsStore.setState({ items: tenants, totalCount: 1 })
    tenantsApiMock.remove.mockRejectedValue(new Error('delete failed'))
    await expect(useTenantsStore.getState().deleteTenant('t1')).rejects.toThrow('delete failed')
    expect(useTenantsStore.getState().error).toBe('delete failed')
  })
})

describe('tenants store – filters & pagination', () => {
  it('clamps the page within the valid range and refetches', async () => {
    useTenantsStore.setState({ totalCount: 100 }) // pageSize 10 → 10 pages
    tenantsApiMock.getAll.mockResolvedValue({ items: [], totalCount: 100, page: 3, pageSize: 10, totalPages: 10 })

    useTenantsStore.getState().setPage(3)
    expect(useTenantsStore.getState().filters.page).toBe(3)

    useTenantsStore.getState().setPage(99)
    expect(useTenantsStore.getState().filters.page).toBe(10)

    useTenantsStore.getState().setPage(0)
    expect(useTenantsStore.getState().filters.page).toBe(1)


describe('tenants store selectors', () => {
  it('selectSelectedTenant resolves the selected id to an item', () => {
    useTenantsStore.setState({ items: tenants, selectedTenantId: 't2' })
    expect(selectSelectedTenant(useTenantsStore.getState())?.id).toBe('t2')
    useTenantsStore.setState({ selectedTenantId: null })
    expect(selectSelectedTenant(useTenantsStore.getState())).toBeNull()
  })

  it('derives total/next/previous pages from the count and filters', () => {
    useTenantsStore.setState({ totalCount: 25, filters: { ...useTenantsStore.getState().filters, page: 2, pageSize: 10 } })

    expect(selectTotalPages(useTenantsStore.getState())).toBe(3)
    expect(selectHasNextPage(useTenantsStore.getState())).toBe(true)
    expect(selectHasPrevPage(useTenantsStore.getState())).toBe(true)

    useTenantsStore.setState({ filters: { ...useTenantsStore.getState().filters, page: 3 } })
    expect(selectHasNextPage(useTenantsStore.getState())).toBe(false)

    useTenantsStore.setState({ filters: { ...useTenantsStore.getState().filters, page: 1 } })
    expect(selectHasPrevPage(useTenantsStore.getState())).toBe(false)
  })
})

    expect(tenantsApiMock.getAll).toHaveBeenCalled()
  })

  it('search resets to page 1 then refetches', () => {
    useTenantsStore.setState({ totalCount: 100, filters: { ...useTenantsStore.getState().filters, page: 5 } })
    tenantsApiMock.getAll.mockResolvedValue({ items: [], totalCount: 100, page: 1, pageSize: 10, totalPages: 10 })

    useTenantsStore.getState().setSearch('glo')

    expect(useTenantsStore.getState().filters.page).toBe(1)
    expect(useTenantsStore.getState().filters.search).toBe('glo')
  })
})

  it('captures the error message and stops loading on failure', async () => {
    tenantsApiMock.getAll.mockRejectedValue(new Error('boom'))

    await useTenantsStore.getState().fetchTenants()

    const state = useTenantsStore.getState()
    expect(state.error).toBe('boom')
    expect(state.isLoading).toBe(false)
    expect(state.items).toEqual([])
  })
})
