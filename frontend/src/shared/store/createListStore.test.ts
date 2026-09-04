import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createListStore } from './createListStore'
import type { ListFiltersBase } from './createListStore'

interface Item {
  id: string
  name: string
}
interface Filters extends ListFiltersBase {
  category: string | null
}

const items: Item[] = [
  { id: 'i1', name: 'Alpha' },
  { id: 'i2', name: 'Beta' }
]

const { api } = vi.hoisted(() => ({
  api: { getAll: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}))

interface MakeOpts {
  mergeItem?: (existing: Item, updated: Item) => Item
  onUpdated?: (id: string, updated: Item) => Promise<void> | void
}

function makeStore(opts: MakeOpts = {}) {
  return createListStore<Item, Filters, { name: string }, { name?: string }, Record<string, unknown>>({
    nouns: { singular: 'item', plural: 'items' },
    api: {
      getAll: (params, signal) => api.getAll(params, signal),
      create: (data) => api.create(data),
      update: (id, data) => api.update(id, data),
      remove: (id) => api.remove(id)
    },
    initialFilters: { search: '', category: null, page: 1, pageSize: 10 },
    toParams: (f) => ({ page: f.page, pageSize: f.pageSize, search: f.search, category: f.category }),
    mergeItem: opts.mergeItem,
    onUpdated: opts.onUpdated
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createListStore – fetch', () => {
  it('loads the page using the current filters, mapped through toParams with the abort signal', async () => {
    const { store } = makeStore()
    store.setState({ filters: { ...store.getState().filters, search: 'al', category: 'c1' } })
    api.getAll.mockResolvedValue({ items, totalCount: 2 })

    await store.getState().fetchList()

    const state = store.getState()
    expect(state.items).toEqual(items)
    expect(state.totalCount).toBe(2)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
    expect(api.getAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'al', category: 'c1', page: 1, pageSize: 10 }),
      expect.any(AbortSignal)
    )
  })

  it('ignores a superseded request and only the latest clears the spinner (race guard)', async () => {
    const { store } = makeStore()
    const signals: AbortSignal[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    api.getAll
      .mockImplementationOnce((_p: unknown, signal?: AbortSignal) => {
        signals.push(signal!)
        return firstGate
      })
      .mockImplementationOnce((_p: unknown, signal?: AbortSignal) => {
        signals.push(signal!)
        return Promise.resolve({ items: [items[1]], totalCount: 1 })
      })

    const first = store.getState().fetchList()
    const second = store.getState().fetchList()
    releaseFirst()
    await Promise.all([first, second])

    expect(signals).toHaveLength(2)
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    expect(store.getState().items).toEqual([items[1]])
    expect(store.getState().isLoading).toBe(false)
  })
})

describe('createListStore – CRUD actions', () => {
  it('refetches after create instead of splicing locally, so a filtered page never overflows', async () => {
    const { store } = makeStore()
    const created = { id: 'i3', name: 'Gamma' }
    // An active search filter the new item does not match.
    store.setState({ filters: { ...store.getState().filters, search: 'al' } })
    api.create.mockResolvedValue(created)
    api.getAll.mockResolvedValue({ items: [items[0]], totalCount: 1 })

    await store.getState().createItem({ name: 'Gamma' })

    const state = store.getState()
    expect(api.getAll).toHaveBeenCalled()
    // The refetched, filtered result replaces local state instead of appending
    // the created item regardless of whether it matches the filter.
    expect(state.items).toEqual([items[0]])
    expect(state.totalCount).toBe(1)
    expect(state.isLoading).toBe(false)
  })

  it('uses mergeItem when provided, else replaces the item on update', async () => {
    const { store: replaceStore } = makeStore()
    const { store: mergeStore } = makeStore({ mergeItem: (existing, updated) => ({ ...existing, ...updated }) })
    replaceStore.setState({ items })
    mergeStore.setState({ items })
    api.update.mockResolvedValue({ id: 'i1', name: 'Updated' })

    await replaceStore.getState().updateItem('i1', { name: 'Updated' })
    expect(replaceStore.getState().items[0]).toEqual({ id: 'i1', name: 'Updated' })

    await mergeStore.getState().updateItem('i1', { name: 'Updated' })
    expect(mergeStore.getState().items[0]).toEqual({ id: 'i1', name: 'Updated' })
  })

  it('runs onUpdated after a successful update', async () => {
    const onUpdated = vi.fn()
    const { store } = makeStore({ onUpdated })
    api.update.mockResolvedValue({ id: 'i1', name: 'Updated' })

    await store.getState().updateItem('i1', { name: 'Updated' })

    expect(onUpdated).toHaveBeenCalledWith('i1', { id: 'i1', name: 'Updated' })
  })

  it('deletes an item, clears its selection and refetches so the page backfills', async () => {
    const { store } = makeStore()
    store.setState({ items, totalCount: 2, selectedId: 'i1' })
    api.remove.mockResolvedValue(undefined)
    api.getAll.mockResolvedValue({ items: [items[1]], totalCount: 1 })

    await store.getState().deleteItem('i1')

    const state = store.getState()
    expect(api.getAll).toHaveBeenCalled()
    expect(state.items.map((i) => i.id)).toEqual(['i2'])
    expect(state.totalCount).toBe(1)
    expect(state.selectedId).toBeNull()
    expect(state.isLoading).toBe(false)
  })
})

describe('createListStore – filters & pagination', () => {
  it('clamps the page to the valid range and refetches', async () => {
    const { store } = makeStore()
    store.setState({ totalCount: 100 })
    api.getAll.mockResolvedValue({ items: [], totalCount: 100 })

    store.getState().setPage(3)
    expect(store.getState().filters.page).toBe(3)

    store.getState().setPage(99)
    expect(store.getState().filters.page).toBe(10)

    store.getState().setPage(0)
    expect(store.getState().filters.page).toBe(1)

    expect(api.getAll).toHaveBeenCalled()
  })

  it('search and setFilters reset to page 1 then refetch', async () => {
    const { store } = makeStore()
    store.setState({ filters: { ...store.getState().filters, page: 5 } })
    api.getAll.mockResolvedValue({ items: [], totalCount: 0 })

    store.getState().setSearch('ada')
    expect(store.getState().filters.search).toBe('ada')
    expect(store.getState().filters.page).toBe(1)

    store.getState().setFilters({ category: 'c2' })
    expect(store.getState().filters.category).toBe('c2')
    expect(store.getState().filters.page).toBe(1)

    expect(api.getAll).toHaveBeenCalled()
  })
})

describe('createListStore – selectors', () => {
  it('selects the selected item and derives total/next/previous pages', async () => {
    const { store, selectSelectedItem, selectTotalPages, selectHasNextPage, selectHasPrevPage } = makeStore()
    const state = store.getState
    store.setState({ items, totalCount: 25, selectedId: 'i2' })
    store.setState({ filters: { ...state().filters, page: 2 } })

    expect(selectSelectedItem(store.getState())?.id).toBe('i2')
    expect(selectTotalPages(store.getState())).toBe(3)
    expect(selectHasNextPage(store.getState())).toBe(true)
    expect(selectHasPrevPage(store.getState())).toBe(true)

    store.setState({ filters: { ...state().filters, page: 1 } })
    expect(selectHasPrevPage(store.getState())).toBe(false)
  })
})
