import express from 'express'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import multer from 'multer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { MediaJobManager } from './media-job-manager'
import type { MediaArtifactKey } from './media-types'
import type { SummaryResult } from './summary-service'
import type { LiveSummary, NoteMode, TranscriptSegment } from '../src/domain/types'

const segmentSchema = z.object({
  id: z.string(), text: z.string().min(1), startMs: z.number().nonnegative(), endMs: z.number().nonnegative(),
  speaker: z.string().min(1), isFinal: z.boolean(), confidence: z.number().optional(),
})
const requestSchema = z.object({
  sessionId: z.string().min(1).default('web'),
  mode: z.enum(['meeting', 'class']),
  segments: z.array(segmentSchema).min(1).max(5000),
  currentSummary: z.unknown().optional(),
})
type Summarize = (request: { sessionId: string; mode: NoteMode; segments: TranscriptSegment[]; currentSummary?: LiveSummary }) => Promise<SummaryResult>

const pathJobSchema = z.object({
  path: z.string().min(1),
  title: z.string().min(1).max(160).optional(),
  mode: z.enum(['meeting', 'class']).default('class'),
})
const artifactKeys = new Set<MediaArtifactKey>(['pptx', 'markdown', 'text', 'srt', 'json'])
const mediaExtensions = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'])

/**
 * 创建本地 Web 应用并挂载实时笔记和长音视频任务接口。
 * @author wuyc
 */
export function createApp(summarize: Summarize, mediaJobs?: MediaJobManager) {
  const app = express()
  const dataRoot = path.resolve(process.env.LIVE_NOTES_DATA_DIR || path.join(process.cwd(), 'output'))
  const uploadDir = path.join(dataRoot, 'uploads')
  fs.mkdirSync(uploadDir, { recursive: true })
  const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 4 * 1024 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => callback(null, mediaExtensions.has(path.extname(file.originalname).toLowerCase())),
  })
  app.disable('x-powered-by')
  app.use(express.json({ limit: '2mb' }))
  app.get('/api/health', (_request, response) => response.json({ status: 'ok', service: 'live-notes' }))
  app.post('/api/summarize', async (request, response) => {
    const parsed = requestSchema.safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'invalid_request', details: parsed.error.issues }); return }
    try { response.json(await summarize(parsed.data as Parameters<Summarize>[0])) }
    catch { response.status(503).json({ error: 'summary_unavailable' }) }
  })
  app.post('/api/media/jobs/path', async (request, response) => {
    if (!mediaJobs) { response.status(503).json({ error: 'media_jobs_unavailable' }); return }
    const parsed = pathJobSchema.safeParse(request.body)
    if (!parsed.success || !path.isAbsolute(parsed.data?.path || '')) { response.status(400).json({ error: 'invalid_request' }); return }
    const sourcePath = path.resolve(parsed.data.path)
    const extension = path.extname(sourcePath).toLowerCase()
    try {
      const stat = await fsp.stat(sourcePath)
      if (!stat.isFile() || !mediaExtensions.has(extension)) throw new Error('invalid media')
      const title = parsed.data.title?.trim() || path.basename(sourcePath, extension)
      response.status(202).json(await mediaJobs.create({ sourcePath, sourceName: path.basename(sourcePath), title, mode: parsed.data.mode }))
    } catch { response.status(404).json({ error: 'media_not_found_or_unsupported' }) }
  })
  app.post('/api/media/jobs/upload', upload.single('media'), async (request, response) => {
    if (!mediaJobs) { response.status(503).json({ error: 'media_jobs_unavailable' }); return }
    if (!request.file) { response.status(400).json({ error: 'media_required' }); return }
    const mode = request.body.mode === 'meeting' ? 'meeting' : 'class'
    const extension = path.extname(request.file.originalname)
    const title = String(request.body.title || path.basename(request.file.originalname, extension)).slice(0, 160)
    response.status(202).json(await mediaJobs.create({ sourcePath: request.file.path, sourceName: request.file.originalname, title, mode }))
  })
  app.get('/api/media/jobs/:id', (request, response) => {
    const job = mediaJobs?.get(request.params.id)
    if (!job) { response.status(404).json({ error: 'job_not_found' }); return }
    response.json(job)
  })
  app.get('/api/media/jobs/:id/artifacts/:key', (request, response) => {
    const key = request.params.key as MediaArtifactKey
    if (!artifactKeys.has(key)) { response.status(404).end(); return }
    const artifact = mediaJobs?.getArtifact(request.params.id, key)
    if (!artifact || !fs.existsSync(artifact)) { response.status(404).end(); return }
    response.download(artifact)
  })
  app.get('/api/media/jobs/:id/media', (request, response) => {
    const source = mediaJobs?.getSource(request.params.id)
    if (!source || !fs.existsSync(source)) { response.status(404).end(); return }
    response.sendFile(path.resolve(source))
  })

  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
  app.use(express.static(dist))
  app.use((request, response, next) => {
    if (request.method === 'GET' && request.accepts('html')) response.sendFile(path.join(dist, 'index.html'))
    else next()
  })
  return app
}
