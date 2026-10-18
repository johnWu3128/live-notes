import { describe, expect, it, vi } from 'vitest'
import { createSummaryService } from './summary-service'
import type { TranscriptSegment } from '../src/domain/types'

const segments: TranscriptSegment[] = [
  { id: '1', speaker: '主持人', text: '决定周五发布第一版。', startMs: 1000, endMs: 3000, isFinal: true },
  { id: '2', speaker: '小王', text: '小王负责接口联调，周四前完成。', startMs: 5000, endMs: 8000, isFinal: true },
]

describe('summary service', () => {
  it('parses an OpenClaw JSON response and preserves traceable timestamps', async () => {
    const runOpenClaw = vi.fn().mockResolvedValue(JSON.stringify({ payloads: [{ text: '```json\n{"headline":"第一版按期发布","topics":[],"keyPoints":[{"text":"周五发布第一版","sourceStartMs":1000}],"decisions":[{"text":"周五发布第一版","sourceStartMs":1000}],"actions":[{"text":"完成接口联调","owner":"小王","due":"周四前","sourceStartMs":5000}],"openQuestions":[],"examples":[]}\n```' }] }))
    const summarize = createSummaryService(runOpenClaw)

    const result = await summarize({ sessionId: 'safe-session', mode: 'meeting', segments, backend: 'openclaw' })

    expect(result.provider).toBe('openclaw')
    expect(result.summary.actions[0]).toMatchObject({ owner: '小王', sourceStartMs: 5000 })
    expect(runOpenClaw).toHaveBeenCalledOnce()
  })

  it('falls back to the local summary when OpenClaw is unavailable', async () => {
    const summarize = createSummaryService(vi.fn().mockRejectedValue(new Error('offline')))

    const result = await summarize({ sessionId: 'safe-session', mode: 'meeting', segments, backend: 'openclaw' })

    expect(result.provider).toBe('local')
    expect(result.summary.decisions[0].text).toContain('周五发布第一版')
  })

  it('does not let a sparse model response erase locally extracted facts', async () => {
    const sparse = JSON.stringify({ payloads: [{ text: '{"headline":"转写内容无法识别","topics":[],"keyPoints":[],"decisions":[],"actions":[],"openQuestions":[],"examples":[]}' }] })
    const summarize = createSummaryService(vi.fn().mockResolvedValue(sparse))

    const result = await summarize({ sessionId: 'safe-session', mode: 'meeting', segments, backend: 'openclaw' })

    expect(result.summary.decisions).toHaveLength(1)
    expect(result.summary.actions[0].owner).toBe('小王')
  })

  it('uses the code-only engine without invoking OpenClaw or a direct model', async () => {
    const runOpenClaw = vi.fn()
    const runModel = vi.fn()
    const summarize = createSummaryService({ runOpenClaw, runModel })

    const result = await summarize({ sessionId: 'local-only', mode: 'meeting', segments, backend: 'local' })

    expect(result.provider).toBe('local')
    expect(runOpenClaw).not.toHaveBeenCalled()
    expect(runModel).not.toHaveBeenCalled()
  })

  it('uses a directly configured model and marks the summary source', async () => {
    const modelResponse = '{"headline":"模型总结","topics":[],"keyPoints":[{"text":"周五发布","sourceStartMs":1000}],"decisions":[],"actions":[],"openQuestions":[],"examples":[]}'
    const runModel = vi.fn().mockResolvedValue(modelResponse)
    const summarize = createSummaryService({ runOpenClaw: vi.fn(), runModel })
    const model = { provider: 'qwen' as const, apiKey: 'test-secret', baseUrl: 'https://example.test/v1', model: 'qwen-plus' }

    const result = await summarize({ sessionId: 'direct-model', mode: 'meeting', segments, backend: 'model', model })

    expect(result.provider).toBe('model')
    expect(result.summary.source).toBe('model')
    expect(runModel).toHaveBeenCalledWith(expect.stringContaining('<transcript>'), model)
  })
})
