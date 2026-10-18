import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { emptySummary } from '../src/domain/types'
import { MediaJobManager } from './media-job-manager'
import type { MediaProcessor } from './media-types'

describe('media job manager', () => {
  it('publishes incremental transcript and downloadable artifacts', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const processor: MediaProcessor = vi.fn(async (input, events) => {
      events.update({ stage: 'transcribing', progress: 25, message: '正在转写' })
      events.segment({
        id: 'segment-1', text: '这是第一段实时结果。', startMs: 0, endMs: 2_000,
        speaker: '讲者', isFinal: true,
      })
      await gate
      return {
        durationMs: 2_000,
        mediaKind: 'video' as const,
        summary: { ...emptySummary(), headline: '测试总结' },
        artifacts: { pptx: `${input.outputDir}/result.pptx`, markdown: `${input.outputDir}/notes.md` },
      }
    })
    const manager = new MediaJobManager({ processor, outputRoot: 'test-output', persist: false })

    const created = await manager.create({ sourcePath: 'D:/media/demo.mp4', mode: 'class', title: '演示' })
    await vi.waitFor(() => expect(manager.get(created.id)?.segments).toHaveLength(1))
    expect(manager.get(created.id)).toMatchObject({ stage: 'transcribing', progress: 25 })

    release()
    await vi.waitFor(() => expect(manager.get(created.id)?.status).toBe('completed'))
    expect(manager.getArtifact(created.id, 'pptx')).toContain('result.pptx')
  })

  it('keeps processor errors visible instead of losing the job', async () => {
    const processor: MediaProcessor = vi.fn(async () => { throw new Error('模型不可用') })
    const manager = new MediaJobManager({ processor, outputRoot: 'test-output', persist: false })
    const created = await manager.create({ sourcePath: 'D:/media/demo.wav', mode: 'meeting', title: '失败示例' })

    await vi.waitFor(() => expect(manager.get(created.id)?.status).toBe('failed'))
    expect(manager.get(created.id)?.error).toContain('模型不可用')
  })

  it('restores completed jobs after the server restarts', async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'live-notes-jobs-'))
    const processor: MediaProcessor = async (input) => ({
      durationMs: 1_000,
      mediaKind: 'audio',
      summary: emptySummary(),
      artifacts: { markdown: path.join(input.outputDir, 'notes.md') },
    })
    const manager = new MediaJobManager({ processor, outputRoot })
    const created = await manager.create({ sourcePath: 'D:/media/demo.wav', mode: 'meeting', title: '恢复示例' })
    await vi.waitFor(() => expect(manager.get(created.id)?.status).toBe('completed'))

    const restored = new MediaJobManager({ processor, outputRoot })
    expect(restored.get(created.id)).toMatchObject({ status: 'completed', title: '恢复示例' })
    expect(restored.getArtifact(created.id, 'markdown')).toContain('notes.md')
  })
})
