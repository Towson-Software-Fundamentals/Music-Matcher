import { z } from 'zod'

export const kindSchema = z.enum(['artist', 'genre', 'song'])
export type PreferenceType = z.infer<typeof kindSchema>
export const errorSchema = z.object({
  code: z.enum(['UNAUTHENTICATED', 'FORBIDDEN', 'VALIDATION_FAILED', 'PROFILE_NOT_READY',
    'PROFILE_UNAVAILABLE', 'HANDLE_TAKEN', 'SAME_PROFILE', 'INSUFFICIENT_PREFERENCES',
    'STALE_WRITE', 'NOT_FOUND', 'RATE_LIMITED', 'CATALOG_UNAVAILABLE', 'NETWORK_ERROR', 'INTERNAL_ERROR']),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), code: z.string(), message: z.string() })).optional(),
  retryAfterSeconds: z.number().optional(),
})
export type ApiError = z.infer<typeof errorSchema>
export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError }
export const failure = (code: ApiError['code'], message: string): ApiResult<never> =>
  ({ data: null, error: { code, message } })
export const success = <T,>(data: T): ApiResult<T> => ({ data, error: null })
export const valueSchema = z.object({
  type: kindSchema, displayValue: z.string(), normalizedValue: z.string(),
})
export const catalogSchema = z.object({
  id: z.uuid(), type: kindSchema, displayValue: z.string(), subtitle: z.string().nullable(),
  provider: z.literal('musicbrainz'), externalId: z.string(), sourceUrl: z.url(), attribution: z.string(),
})
export type CatalogItem = z.infer<typeof catalogSchema>
export const profileSchema = z.object({
  id: z.uuid(), displayName: z.string(), handle: z.string(),
  comparisonEnabled: z.boolean(), revision: z.number().int(),
})
export type OwnProfile = z.infer<typeof profileSchema>
export const targetSchema = profileSchema.pick({ id: true, displayName: true, handle: true })
export type ComparisonProfile = z.infer<typeof targetSchema>
export const preferenceSetSchema = z.object({
  revision: z.number().int(),
  items: z.array(valueSchema.extend({ id: z.uuid(), catalogItem: catalogSchema.nullable() })),
})
export type PreferenceSet = z.infer<typeof preferenceSetSchema>
export type PreferenceInput =
  | { type: PreferenceType; source: 'custom'; displayValue: string }
  | { type: PreferenceType; source: 'catalog'; catalogItemId: string }
const participant = z.object({
  profileId: z.uuid(), displayName: z.string(), handle: z.string(),
  preferenceRevision: z.number().int(), preferences: z.array(valueSchema),
})
export const comparisonSchema = z.object({
  id: z.uuid(), createdAt: z.iso.datetime({ offset: true }), algorithmVersion: z.literal('jaccard-text-v1'),
  participantA: participant, participantB: participant, score: z.number().min(0).max(1),
  intersectionCount: z.number().int(), unionCount: z.number().int(),
  shared: z.array(z.object({
    type: kindSchema, normalizedValue: z.string(), displayValueA: z.string(), displayValueB: z.string(),
  })), onlyA: z.array(valueSchema), onlyB: z.array(valueSchema),
})
export type ComparisonSnapshot = z.infer<typeof comparisonSchema>
export const cursorSchema = z.object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() })
export type HistoryCursor = z.infer<typeof cursorSchema>
export const historySchema = z.object({
  items: z.array(z.object({
    id: z.uuid(), createdAt: z.iso.datetime({ offset: true }), score: z.number().min(0).max(1),
    algorithmVersion: z.literal('jaccard-text-v1'),
    otherParticipant: z.object({ displayName: z.string(), handle: z.string() }),
  })), nextCursor: cursorSchema.nullable(),
})

export function normalize(value: string) {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase()
}

export function validatePreferences(items: PreferenceInput[]): string | null {
  if (items.length > 100) return 'Choose at most 100 preferences.'
  const keys = new Set<string>()
  for (const item of items) {
    if (item.source === 'custom') {
      const value = normalize(item.displayValue)
      if (!value || [...item.displayValue.trim()].length > 200) return 'Enter 1–200 characters per preference.'
      const key = `${item.type}:${value}`
      if (keys.has(key)) return `Duplicate preference: ${item.displayValue.trim()}.`
      keys.add(key)
    }
  }
  return null
}
