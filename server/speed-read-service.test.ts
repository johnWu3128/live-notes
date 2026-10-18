import { describe, expect, it } from 'vitest'
import { emptySummary } from '../src/domain/types'
import { buildSpeedReadGuide } from './speed-read-service'

describe('speed read service', () => {
  it('builds traceable guide, review and mind-map content without an AI model', () => {
    const guide = buildSpeedReadGuide({
      title: '宝武智能体实操',
      durationMs: 180_000,
      mode: 'class',
      segments: [
        { id: '1', text: '首先创建知识库，上传操作手册并完成文档分块。', startMs: 0, endMs: 35_000, speaker: '讲者', isFinal: true },
        { id: '2', text: '然后配置大模型和提示词，将知识库关联到问答智能体。', startMs: 35_000, endMs: 95_000, speaker: '讲者', isFinal: true },
        { id: '3', text: '最后发布智能体，通过 API 验证回答结果。', startMs: 95_000, endMs: 150_000, speaker: '讲者', isFinal: true },
      ],
      summary: {
        ...emptySummary(),
        headline: '完成知识库与问答智能体实操',
        topics: [
          { text: '知识库构建', sourceStartMs: 0 },
          { text: '智能体发布', sourceStartMs: 95_000 },
        ],
        keyPoints: [
          { text: '知识库文档需要先分块', sourceStartMs: 10_000 },
          { text: '发布后通过 API 验证结果', sourceStartMs: 110_000 },
        ],
        actions: [{ text: '补充设备运维知识库', sourceStartMs: 120_000 }],
      },
    })

    expect(guide.keywords).toEqual(expect.arrayContaining(['知识库', '智能体']))
    expect(guide.abstract).toContain('知识库')
    expect(guide.chapters).toHaveLength(2)
    expect(guide.chapters[1]).toMatchObject({ title: '智能体发布', startMs: 95_000 })
    expect(guide.reviews[0]).toMatchObject({ question: expect.any(String), answer: expect.any(String), sourceStartMs: expect.any(Number) })
    expect(guide.todos[0].text).toContain('设备运维')
    expect(guide.mindMap.children.map((item) => item.title)).toContain('知识库构建')
  })
})
