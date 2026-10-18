import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { generatePresentation } from './presentation-service'
import type { DeckPlan } from './media-types'

describe('presentation service', () => {
  it('writes an editable Office presentation with speaker notes', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'live-notes-ppt-'))
    const outputPath = path.join(directory, 'notes.pptx')
    const framePath = path.join(directory, 'frame.png')
    await fs.writeFile(framePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
    const plan: DeckPlan = {
      title: '智能体实操',
      subtitle: '从配置到验证',
      transcriptNotes: ['[00:00:00] 讲者：完整转写内容'],
      slides: [
        { kind: 'cover', title: '智能体实操', subtitle: '从配置到验证', bullets: [], sourceStartMs: 0 },
        { kind: 'chapter', title: '01 模型配置', bullets: ['选择模型', '验证连接'], sourceStartMs: 1_000, notes: '[00:00:01] 讲者：选择模型并验证连接。', framePath },
        { kind: 'source', title: '资料与溯源', bullets: ['来源文件：demo.mp4'], sourceStartMs: 2_000 },
      ],
    }

    await generatePresentation(plan, outputPath)

    const bytes = await fs.readFile(outputPath)
    expect(bytes.subarray(0, 2).toString()).toBe('PK')
    expect(bytes.length).toBeGreaterThan(10_000)
  })
})
