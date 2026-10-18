import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { emptySummary } from '../src/domain/types'
import { generateSpeedReadArtifacts } from './speed-read-export-service'
import type { SpeedReadGuide } from './media-types'

describe('speed read export service', () => {
  it('generates transcript, guide, notes, extracted slides and XMind artifacts', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'live-notes-speed-read-'))
    const framePath = path.join(directory, 'frame.png')
    await fs.writeFile(framePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
    const guide: SpeedReadGuide = {
      keywords: ['知识库', '智能体', 'API'],
      abstract: '课程演示了知识库构建、智能体配置和 API 验证。',
      chapters: [{ title: '知识库构建', summary: '上传并分块操作手册。', startMs: 0, endMs: 60_000, keyPoints: ['上传文档', '完成分块'] }],
      speakerSummaries: [{ speaker: '讲者', summary: '围绕知识库构建完成实操讲解。', sourceStartMs: 0 }],
      reviews: [{ question: '知识库文档上传后要做什么？', answer: '需要完成分块和向量化。', sourceStartMs: 10_000 }],
      todos: [{ text: '补充设备运维文档', sourceStartMs: 40_000 }],
      mindMap: { title: '智能体实操', children: [{ title: '知识库构建', children: [{ title: '上传文档', children: [] }] }] },
      notes: '重点复习知识库分块参数。',
      frames: [{ startMs: 0, endMs: 30_000, imagePath: framePath, transcript: '上传操作手册并完成文档分块。', chapterIndex: 0 }],
    }

    const artifacts = await generateSpeedReadArtifacts({
      title: '宝武智能体实操', mode: 'class', durationMs: 60_000,
      segments: [{ id: '1', text: '上传操作手册并完成文档分块。', startMs: 0, endMs: 30_000, speaker: '讲者', isFinal: true }],
      summary: { ...emptySummary(), headline: '知识库实操' }, guide,
    }, directory)

    expect(path.basename(artifacts.transcriptDocx)).toBe('宝武智能体实操_原文.docx')
    expect(path.basename(artifacts.guideDocx)).toBe('宝武智能体实操_导读.docx')
    expect(path.basename(artifacts.notesDocx)).toBe('宝武智能体实操_笔记.docx')
    expect(path.basename(artifacts.extractedPptx)).toBe('宝武智能体实操_PPT.pptx')
    expect(path.basename(artifacts.xmind)).toBe('宝武智能体实操_思维导图.xmind')
    for (const target of [artifacts.transcriptDocx, artifacts.guideDocx, artifacts.notesDocx, artifacts.extractedPptx, artifacts.xmind]) {
      expect((await fs.readFile(target)).subarray(0, 2).toString()).toBe('PK')
    }
    const xmind = await JSZip.loadAsync(await fs.readFile(artifacts.xmind))
    expect(Object.keys(xmind.files)).toEqual(expect.arrayContaining(['content.xml', 'styles.xml', 'META-INF/manifest.xml']))
    expect(await xmind.file('content.xml')?.async('text')).toContain('知识库构建')
  })
})
