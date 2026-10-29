import { rpc } from '../../shared/client'
import { comparisonSchema, historySchema, type HistoryCursor } from '../../shared/contracts'
export const getComparison = (id: string) => rpc('get_comparison', comparisonSchema, { id })
export const listMyComparisons = (before?: HistoryCursor) => rpc('list_my_comparisons', historySchema, { limit: 10, ...(before ? { before } : {}) })
