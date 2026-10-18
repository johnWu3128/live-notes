import { describe, expect, it, vi } from 'vitest'
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

  it('accepts a realtime WAV chunk and returns timestamped segments', async () => {
    const transcribeChunk = async () => [{ id: 'chunk-1', text: '电脑正在播放课程内容。', startMs: 12_000, endMs: 14_000, speaker: '系统声音', isFinal: true }]
    const app = createApp(async () => { throw new Error('should not run') }, undefined, { realtimeTranscriber: { transcribeChunk } })

    await request(app).post('/api/realtime/transcribe')
      .field('sessionId', 'realtime-session').field('mode', 'class').field('speaker', '系统声音').field('offsetMs', '12000')
      .attach('audio', Buffer.from('RIFF1234WAVE'), { filename: 'chunk.wav', contentType: 'audio/wav' })
      .expect(200)
      .expect(({ body }) => expect(body.segments[0]).toMatchObject({ text: '电脑正在播放课程内容。', startMs: 12_000 }))
  })

  it('validates and saves speed-read notes into a regenerated Word artifact', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'live-notes-notes-api-'))
    const manager = new MediaJobManager({
      outputRoot: directory,
      processor: async (input) => ({
        durationMs: 1_000, mediaKind: 'audio', summary: emptySummary(),
        speedRead: {
          keywords: [], abstract: '摘要', chapters: [], speakerSummaries: [], reviews: [], todos: [],
          mindMap: { title: '测试', children: [] }, notes: '', frames: [],
        },
        artifacts: { notesDocx: path.join(input.outputDir, '测试_笔记.docx') },
      }),
    })
    const created = await manager.create({ sourcePath: 'D:/media/demo.wav', mode: 'meeting', title: '测试' })
    await vi.waitFor(() => expect(manager.get(created.id)?.status).toBe('completed'))
    const app = createApp(async () => { throw new Error('should not run') }, manager)

    await request(app).post(`/api/media/jobs/${created.id}/notes`).send({ notes: '补充结论' }).expect(200)
      .expect(({ body }) => expect(body.speedRead.notes).toBe('补充结论'))
    expect((await fs.readFile(manager.getArtifact(created.id, 'notesDocx')!)).subarray(0, 2).toString()).toBe('PK')
    await request(app).post(`/api/media/jobs/${created.id}/notes`).send({ notes: 'x'.repeat(100_001) }).expect(400)
  })
})
