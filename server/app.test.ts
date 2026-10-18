import { describe, expect, it } from 'vitest'
import request from 'supertest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createApp } from './app'
import { MediaJobManager } from './media-job-manager'
import { emptySummary } from '../src/domain/types'

describe('HTTP API', () => {
  it('reports health and rejects an empty summary request', async () => {
    const app = createApp(async () => { throw new Error('should not run') })

    await request(app).get('/api/health').expect(200).expect(({ body }) => expect(body.status).toBe('ok'))
    await request(app).post('/api/summarize').send({ mode: 'meeting', segments: [] }).expect(400)
  })

  it('creates a background job from an existing absolute media path', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'live-notes-api-'))
    const sourcePath = path.join(directory, 'lesson.mp4')
    await fs.writeFile(sourcePath, 'test')
    const manager = new MediaJobManager({
      outputRoot: directory,
      processor: async () => ({ durationMs: 1_000, mediaKind: 'video', summary: emptySummary(), artifacts: {} }),
    })
    const app = createApp(async () => { throw new Error('should not run') }, manager)

    await request(app).post('/api/media/jobs/path').send({ path: sourcePath, mode: 'class' }).expect(202)
      .expect(({ body }) => expect(body).toMatchObject({ title: 'lesson', sourceName: 'lesson.mp4' }))
    await request(app).post('/api/media/jobs/path').send({ path: 'relative.mp4', mode: 'class' }).expect(400)
  })
})
