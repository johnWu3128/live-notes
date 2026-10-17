import { describe, expect, it } from 'vitest'
import { exportMarkdown, exportSrt } from './exporters'
import type { NoteSession } from './types'

const session: NoteSession = {
  id: 'session-1',
  title: '项目周会',
  mode: 'meeting',
  status: 'stopped',
  startedAt: '2026-10-17T08:00:00.000Z',
  elapsedMs: 65_000,
  segments: [
    { id: 'a', text: '确认第一版范围', startMs: 1_200, endMs: 4_000, speaker: '产品', isFinal: true },
    { id: 'b', text: '周五完成交付', startMs: 61_000, endMs: 64_500, speaker: '研发', isFinal: true },
  ],
  summary: {
    headline: '第一版范围与交付时间已确认',
    topics: [],
    keyPoints: [{ text: '确认第一版范围', sourceStartMs: 1_200 }],
    decisions: [{ text: '周五完成交付', sourceStartMs: 61_000 }],
    actions: [{ text: '完成第一版交付', owner: '研发', due: '周五', sourceStartMs: 61_000 }],
    openQuestions: [],
    examples: [],
    updatedAt: '2026-10-17T08:01:05.000Z',
    source: 'local',
  },
  bookmarks: [],
}

describe('exporters', () => {
  it('exports readable markdown with source timestamps', () => {
    const markdown = exportMarkdown(session)

    expect(markdown).toContain('# 项目周会')
    expect(markdown).toContain('[01:01]')
    expect(markdown).toContain('研发 - 周五 - 完成第一版交付')
  })

  it('exports standards-compatible SRT timestamps', () => {
    expect(exportSrt(session.segments)).toContain('00:01:01,000 --> 00:01:04,500')
  })
})
