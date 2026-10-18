import type { LiveSummary, NoteMode, TranscriptSegment } from '../src/domain/types'
import type { DeckPlan, DeckSlidePlan } from './media-types'

interface DeckPlanInput {
  title: string
  mode: NoteMode
  durationMs: number
  segments: TranscriptSegment[]
  summary: LiveSummary
  sourceName: string
  hasVideo: boolean
}

const clean = (text: string) => text.trim().replace(/\s+/g, ' ')
const clampText = (text: string, max = 74) => clean(text).length > max ? `${clean(text).slice(0, max - 1)}…` : clean(text)
const clock = (milliseconds: number) => {
  const total = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((item) => String(item).padStart(2, '0')).join(':')
}

const noteLines = (segments: TranscriptSegment[]) => segments
  .filter((segment) => segment.isFinal)
  .map((segment) => `[${clock(segment.startMs)}] ${segment.speaker}：${clean(segment.text)}`)

/**
 * 将完整转写切分为可溯源章节，并生成稳定的可编辑 PPT 内容规划。
 * @author wuyc
 */
export function buildDeckPlan(input: DeckPlanInput): DeckPlan {
  const finals = input.segments.filter((segment) => segment.isFinal && clean(segment.text))
  const chapterCount = Math.min(10, Math.max(4, Math.ceil(input.durationMs / (8 * 60_000))))
  const chapterSpan = Math.max(1, input.durationMs / chapterCount)
  const chapterSlides: DeckSlidePlan[] = []
  const extractedMarkers = input.summary.topics
    .filter((topic) => topic.sourceStartMs >= 0 && topic.sourceStartMs < input.durationMs)
    .sort((left, right) => left.sourceStartMs - right.sourceStartMs)
    .filter((topic, index, all) => index === 0 || topic.sourceStartMs - all[index - 1].sourceStartMs >= 60_000)
    .slice(0, 10)
  const semanticMarkers = extractedMarkers.length >= 3
    ? (extractedMarkers[0].sourceStartMs > 60_000
        ? [{ text: '开场与目标', sourceStartMs: 0 }, ...extractedMarkers].slice(0, 10)
        : [{ ...extractedMarkers[0], sourceStartMs: 0 }, ...extractedMarkers.slice(1)])
    : extractedMarkers
  const ranges = semanticMarkers.length >= 3
    ? semanticMarkers.map((marker, index) => ({
        start: marker.sourceStartMs,
        end: semanticMarkers[index + 1]?.sourceStartMs || input.durationMs + 1,
        title: marker.text,
      }))
    : Array.from({ length: chapterCount }, (_, index) => ({
        start: Math.floor(index * chapterSpan),
        end: index === chapterCount - 1 ? input.durationMs + 1 : Math.floor((index + 1) * chapterSpan),
        title: '',
      }))

  for (const range of ranges) {
    const { start, end } = range
    const chapter = finals.filter((segment) => segment.startMs >= start && segment.startMs < end)
    if (!chapter.length) continue
    const stride = Math.max(1, Math.ceil(chapter.length / 5))
    const summarized = [
      ...input.summary.keyPoints,
      ...input.summary.examples,
      ...input.summary.decisions,
      ...input.summary.openQuestions,
    ].filter((item) => item.sourceStartMs >= start && item.sourceStartMs < end).map((item) => clampText(item.text))
    const transcriptBullets = chapter.filter((_, itemIndex) => itemIndex % stride === 0).slice(0, 5)
      .map((segment) => clampText(segment.text))
    const titleSource = chapter.find((segment) => /首先|接下来|然后|步骤|配置|创建|发布|总结|重点/.test(segment.text)) || chapter[0]
    chapterSlides.push({
      kind: 'chapter',
      title: `${String(chapterSlides.length + 1).padStart(2, '0')}  ${clampText(range.title || titleSource.text, 24)}`,
      subtitle: `${clock(chapter[0].startMs)} - ${clock(chapter.at(-1)?.endMs || end)}`,
      bullets: [...new Set([...summarized, ...transcriptBullets])].slice(0, 6),
      sourceStartMs: Math.max(start, chapter[Math.min(chapter.length - 1, Math.floor(chapter.length / 3))]?.startMs || start),
      notes: noteLines(chapter).join('\n'),
    })
  }

  const topics = input.summary.topics.length
    ? input.summary.topics.map((item) => clampText(item.text, 34)).slice(0, 8)
    : chapterSlides.map((slide) => slide.title.replace(/^\d+\s+/, '')).slice(0, 8)
  const keyPoints = input.summary.keyPoints.map((item) => clampText(item.text)).slice(0, 7)
  const actionItems = input.mode === 'meeting'
    ? [
        ...input.summary.decisions.map((item) => `结论：${clampText(item.text)}`),
        ...input.summary.actions.map((item) => `行动：${item.owner || '待认领'}｜${clampText(item.text, 56)}｜${item.due || '时间待定'}`),
        ...input.summary.openQuestions.map((item) => `待确认：${clampText(item.text)}`),
      ].slice(0, 8)
    : [
        ...input.summary.examples.map((item) => `示例：${clampText(item.text)}`),
        ...input.summary.openQuestions.map((item) => `复习：${clampText(item.text)}`),
      ].slice(0, 8)

  const slides: DeckSlidePlan[] = [
    { kind: 'cover', title: input.title, subtitle: `${input.mode === 'meeting' ? '会议纪要' : '课程笔记'}｜${clock(input.durationMs)}`, bullets: [], sourceStartMs: 0 },
    { kind: 'overview', title: '内容概览', subtitle: input.summary.headline, bullets: keyPoints.slice(0, 4), sourceStartMs: input.summary.keyPoints[0]?.sourceStartMs || 0 },
    { kind: 'agenda', title: '内容地图', bullets: topics, sourceStartMs: input.summary.topics[0]?.sourceStartMs || 0 },
    ...chapterSlides,
    { kind: 'summary', title: '关键要点回顾', bullets: keyPoints.length ? keyPoints : topics, sourceStartMs: input.summary.keyPoints[0]?.sourceStartMs || 0 },
  ]
  if (actionItems.length) {
    const pageSize = 4
    const pageCount = Math.ceil(actionItems.length / pageSize)
    for (let page = 0; page < pageCount; page += 1) {
      slides.push({
        kind: 'actions',
        title: `${input.mode === 'meeting' ? '结论、行动与待确认事项' : '示例与复习问题'}${pageCount > 1 ? `（${page + 1}/${pageCount}）` : ''}`,
        bullets: actionItems.slice(page * pageSize, (page + 1) * pageSize),
        sourceStartMs: input.summary.actions[page * pageSize]?.sourceStartMs || input.summary.examples[page * pageSize]?.sourceStartMs || 0,
      })
    }
  }
  slides.push({
    kind: 'source',
    title: '资料与溯源',
    bullets: [
      `来源文件：${input.sourceName}`,
      `素材类型：${input.hasVideo ? '视频（含关键画面）' : '音频'}`,
      `完整内容：同时生成 Word、PDF、Markdown、TXT、SRT 与 JSON，可按时间戳回溯原文。`,
      `生成原则：仅依据转写与摘要组织，不补充素材中不存在的事实。`,
    ],
    sourceStartMs: Math.max(0, input.durationMs - 1_000),
  })

  return {
    title: input.title,
    subtitle: input.summary.headline,
    slides,
    transcriptNotes: noteLines(finals),
  }
}
