import { z } from 'zod'
import { decode, rpc, supabase } from '../../shared/client'
import { catalogSchema, failure, type ApiResult, type CatalogItem } from '../../shared/contracts'

const response = z.object({ items: z.array(catalogSchema), cache: z.enum(['hit', 'miss']) })
const fetchGenres = () => rpc('list_genres', z.object({ items: z.array(catalogSchema) }))
type GenreResult = Awaited<ReturnType<typeof fetchGenres>>
let genres: Promise<GenreResult> | null = null
/** The genre list (~2,200 items) is loaded once per page load and filtered locally; failures aren't cached. */
export function getGenres(): Promise<GenreResult> {
  genres ??= fetchGenres().then(result => {
    if (result.error) genres = null
    return result
  }, (reason: unknown) => {
    genres = null
    throw reason
  })
  return genres
}
export async function searchCatalog(type: 'artist' | 'song', query: string, signal: AbortSignal): Promise<ApiResult<{ items: CatalogItem[]; cache: 'hit' | 'miss' }>> {
  if (!supabase) return failure('INTERNAL_ERROR', 'Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('catalog-search', { body: { type, query }, signal })
  if (signal.aborted) throw new DOMException('Search cancelled', 'AbortError')
  if (error) {
    if ('context' in error && error.context instanceof Response) {
      const body: unknown = await error.context.json()
      return decode(response, body)
    }
    console.error('Catalog transport failed', { name: error.name })
    return failure('CATALOG_UNAVAILABLE', 'Catalog search is unavailable. Try again or explicitly add a custom entry.')
  }
  return decode(response, data)
}
