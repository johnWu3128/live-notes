import { describe, expect, it } from 'vitest'
import { createSummary, mergeTranscriptSegments } from './summary-engine'
import type { TranscriptSegment } from './types'

const segment = (id: string, text: string, startMs = 0): TranscriptSegment => ({
  id,
  text,
  startMs,
  endMs: startMs + 4000,
  speaker: '说话人 1',
  isFinal: true,
})

describe('mergeTranscriptSegments', () => {
  it('merges a revised segment without duplicating it', () => {
    const current = [segment('a', '项目下周上线')]
    const incoming = { ...segment('a', '项目计划下周上线'), endMs: 5000 }

    expect(mergeTranscriptSegments(current, incoming)).toEqual([incoming])
  })

  it('drops a repeated final result with the same normalized text', () => {
    const current = [segment('a', '需要完成接口联调。')]

    expect(mergeTranscriptSegments(current, segment('b', '需要完成接口联调'))).toEqual(current)
  })
})

describe('createSummary', () => {
  it('extracts meeting decisions, actions and open questions with traceable timestamps', () => {
    const summary = createSummary('meeting', [
      segment('a', '决定本周五发布第一版。', 5_000),
      segment('b', '小王负责接口联调，周四前完成。', 12_000),
      segment('c', '数据库容量是否足够还需要确认？', 20_000),
    ])

    expect(summary.decisions[0]).toMatchObject({ text: '本周五发布第一版', sourceStartMs: 5_000 })
    expect(summary.decisions).toHaveLength(1)
    expect(summary.actions[0]).toMatchObject({ owner: '小王', sourceStartMs: 12_000 })
    expect(summary.openQuestions[0].text).toContain('数据库容量')
  })

  it('builds class notes with concepts, examples and review questions', () => {
    const summary = createSummary('class', [
      segment('a', '今天的核心概念是剩余部分乘法，表示先确定一个数再确定另一个数。', 2_000),
      segment('b', '例如把七九六十三写成六十三等于七乘九。', 8_000),
      segment('c', '为什么余数一定小于除数？这是课后需要思考的问题。', 15_000),
    ])

    expect(summary.keyPoints.map((item) => item.text).join('')).toContain('剩余部分乘法')
    expect(summary.examples[0].sourceStartMs).toBe(8_000)
    expect(summary.openQuestions[0].text).toContain('余数一定小于除数')
  })
})
