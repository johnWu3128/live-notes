import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from './app'

describe('HTTP API', () => {
  it('reports health and rejects an empty summary request', async () => {
    const app = createApp(async () => { throw new Error('should not run') })

    await request(app).get('/api/health').expect(200).expect(({ body }) => expect(body.status).toBe('ok'))
    await request(app).post('/api/summarize').send({ mode: 'meeting', segments: [] }).expect(400)
  })
})
