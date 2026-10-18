import { describe, expect, it } from 'vitest'
import { emptySummary, type TranscriptSegment } from '../src/domain/types'
import { buildDeckPlan } from './media-plan'

const segments: TranscriptSegment[] = Array.from({ length: 18 }, (_, index) => ({
  id: `segment-${index}`,
  text: `第${index + 1}段讲解智能体实操步骤、配置方法和验证结果。`,
  startMs: index * 60_000,
  endMs: index * 60_000 + 45_000,
  speaker: '讲者',
  isFinal: true,
}))

describe('media presentation plan', () => {
  it('creates traceable chapter slides without dropping the transcript', () => {
    const summary = {
      ...emptySummary(),
      headline: '介绍智能体配置、调用和验证的完整实操流程',
      keyPoints: [
        { text: '先完成模型配置，再创建智能体。', sourceStartMs: 60_000 },
        { text: '发布前需要执行真实调用验证。', sourceStartMs: 600_000 },
      ],
    }

    const plan = buildDeckPlan({
      title: '宝武智能体实操',
      mode: 'class',
      durationMs: 18 * 60_000,
      segments,
      summary,
      sourceName: 'training.mp4',
      hasVideo: true,
    })

    expect(plan.slides[0]).toMatchObject({ kind: 'cover', title: '宝武智能体实操' })
    expect(plan.slides.filter((slide) => slide.kind === 'chapter').length).toBeGreaterThanOrEqual(4)
    expect(plan.slides.every((slide) => slide.sourceStartMs >= 0)).toBe(true)
    expect(plan.transcriptNotes.join('\n')).toContain('第18段讲解')
    expect(plan.slides.at(-1)?.kind).toBe('source')
  })

  it('uses OpenClaw topic timestamps as semantic chapter boundaries', () => {
    const summary = {
      ...emptySummary(),
      headline: '智能体实操流程',
      topics: [
        { text: '平台入口与案例说明', sourceStartMs: 0 },
        { text: '知识库准备', sourceStartMs: 5 * 60_000 },
        { text: '智能体配置', sourceStartMs: 10 * 60_000 },
        { text: '发布与验证', sourceStartMs: 15 * 60_000 },
      ],
      keyPoints: [{ text: '发布前执行真实调用。', sourceStartMs: 16 * 60_000 }],
    }
    const plan = buildDeckPlan({ title: '实操', mode: 'class', durationMs: 18 * 60_000, segments, summary, sourceName: 'demo.mp4', hasVideo: true })
    const chapters = plan.slides.filter((slide) => slide.kind === 'chapter')

    expect(chapters.map((slide) => slide.title).join('|')).toContain('知识库准备')
    expect(chapters.at(-1)?.bullets.join('')).toContain('发布前执行真实调用')
    expect(chapters.at(-1)?.sourceStartMs).toBeGreaterThanOrEqual(15 * 60_000)
  })

  it('paginates long examples so presentation content stays inside the slide', () => {
    const summary = {
      ...emptySummary(),
      examples: Array.from({ length: 8 }, (_, index) => ({
        text: `第${index + 1}个完整实操案例，包含配置、执行、异常排查和结果验证。`,
        sourceStartMs: index * 60_000,
      })),
    }

    const plan = buildDeckPlan({ title: '实操', mode: 'class', durationMs: 18 * 60_000, segments, summary, sourceName: 'demo.mp4', hasVideo: true })
    const actionSlides = plan.slides.filter((slide) => slide.kind === 'actions')

    expect(actionSlides).toHaveLength(2)
    expect(actionSlides.every((slide) => slide.bullets.length <= 4)).toBe(true)
    expect(actionSlides.map((slide) => slide.title)).toEqual(['示例与复习问题（1/2）', '示例与复习问题（2/2）'])
  })
})
