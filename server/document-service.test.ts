import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { emptySummary, type NoteSession } from '../src/domain/types'
import { generateSessionDocuments } from './document-service'

const session: NoteSession = {
  id: 'export-test', title: '测试会议纪要', mode: 'meeting', status: 'stopped', elapsedMs: 8_000, bookmarks: [],
  segments: [{ id: '1', text: '决定周五发布第一版。', startMs: 1_000, endMs: 3_000, speaker: '主持人', isFinal: true }],
  summary: { ...emptySummary(), headline: '第一版按期发布', keyPoints: [{ text: '周五发布第一版', sourceStartMs: 1_000 }] },
}

describe('document service', () => {
  it('generates editable Word, PDF, PowerPoint and Markdown artifacts', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'live-notes-documents-'))
    const artifacts = await generateSessionDocuments(session, directory)

    expect((await fs.readFile(artifacts.docx)).subarray(0, 2).toString()).toBe('PK')
    expect((await fs.readFile(artifacts.pptx)).subarray(0, 2).toString()).toBe('PK')
    expect((await fs.readFile(artifacts.pdf)).subarray(0, 4).toString()).toBe('%PDF')
    expect(await fs.readFile(artifacts.markdown, 'utf8')).toContain('第一版按期发布')
  })
})
