import { rpc } from '../../shared/client'
import { profileSchema, targetSchema, type OwnProfile } from '../../shared/contracts'

export const getMyProfile = () => rpc('get_my_profile', profileSchema.nullable())
export const ensureMyProfile = (input: { displayName: string; handle: string }) => rpc('ensure_my_profile', profileSchema, input)
export const updateMyProfile = (input: Omit<OwnProfile, 'id' | 'revision'> & { expectedRevision: number }) => rpc('update_my_profile', profileSchema, input)
export const lookupComparisonProfile = (handle: string) => rpc('lookup_comparison_profile', targetSchema, { handle })
