import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { SummaryResult } from './summary-service'
import type { LiveSummary, NoteMode, TranscriptSegment } from '../src/domain/types'

const segmentSchema = z.object({
  id: z.string(), text: z.string().min(1), startMs: z.number().nonnegative(), endMs: z.number().nonnegative(),
  speaker: z.string().min(1), isFinal: z.boolean(), confidence: z.number().optional(),
})
const requestSchema = z.object({
  sessionId: z.string().min(1).default('web'),
  mode: z.enum(['meeting', 'class']),
  segments: z.array(segmentSchema).min(1).max(500),
  currentSummary: z.unknown().optional(),
})
type Summarize = (request: { sessionId: string; mode: NoteMode; segments: TranscriptSegment[]; currentSummary?: LiveSummary }) => Promise<SummaryResult>

export function createApp(summarize: Summarize) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '2mb' }))
  app.get('/api/health', (_request, response) => response.json({ status: 'ok', service: 'live-notes' }))
  app.post('/api/summarize', async (request, response) => {
    const parsed = requestSchema.safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'invalid_request', details: parsed.error.issues }); return }
    try { response.json(await summarize(parsed.data as Parameters<Summarize>[0])) }
    catch { response.status(503).json({ error: 'summary_unavailable' }) }
  })

  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
  app.use(express.static(dist))
  app.use((request, response, next) => {
    if (request.method === 'GET' && request.accepts('html')) response.sendFile(path.join(dist, 'index.html'))
    else next()
  })
  return app
}
