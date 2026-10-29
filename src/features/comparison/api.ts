import { z } from 'zod'
import { rpc } from '../../shared/client'
export const createComparison = (input: { targetProfileId: string; requestId: string }) =>
  rpc('create_comparison', z.object({ id: z.uuid(), createdAt: z.iso.datetime({ offset: true }) }), input)
