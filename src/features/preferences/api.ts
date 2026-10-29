import { rpc } from '../../shared/client'
import { preferenceSetSchema, type PreferenceInput } from '../../shared/contracts'
export const getMyPreferences = () => rpc('get_my_preferences', preferenceSetSchema)
export const saveMyPreferences = (input: { expectedRevision: number; items: PreferenceInput[] }) =>
  rpc('save_my_preferences', preferenceSetSchema, input)
