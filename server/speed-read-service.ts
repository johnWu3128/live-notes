import type { LiveSummary, NoteMode, TranscriptSegment } from '../src/domain/types'
import type { MindMapNode, SpeedReadGuide } from './media-types'

interface SpeedReadInput {
  title: string
  durationMs: number
  mode: NoteMode
  segments: TranscriptSegment[]
  summary: LiveSummary
}

const clean = (value: string) => value.replace(/\s+/g, ' ').trim()
const shorten = (value: string, limit = 96) => clean(value).length > limit ? `${clean(value).slice(0, limit - 1)}…` : clean(value)
const DOMAIN_TERMS = [
  '知识库', '智能体', '工作流', '文档', '上传', '分块', '向量化', '模型', '语义检索', '全文检索',
  '混合检索', 'API', '提示词', '图片', '召回', '问答', '设备运维', '知识服务', '角色', '输出',
  '发布', '参数', '审核', '接口', '测试', '会议', '课程', '部署', '数据', '安全',
]

const rangeSegments = (segments: TranscriptSegment[], startMs: number, endMs: number) => segments
  .filter((segment) => segment.isFinal && segment.startMs >= startMs && segment.startMs < endMs)

const chapterTitle = (value: string, index: number) => {
  const normalized = clean(value).replace(/^\d+[.、\s]+/, '')
  if (!normalized) return `第 ${index + 1} 章`
  return normalized.length <= 28 ? normalized : `${normalized.slice(0, 27)}…`
}

const createQuestion = (text: string) => {
  const subject = shorten(text.replace(/[。！？?]+$/, ''), 42)
  return subject.endsWith('什么') ? `${subject}？` : `如何理解“${subject}”？`
}

const topicNodes = (guide: Pick<SpeedReadGuide, 'chapters'>): MindMapNode[] => guide.chapters.map((chapter) => ({
  title: chapter.title,
  children: chapter.keyPoints.slice(0, 6).map((title) => ({ title: shorten(title, 36), children: [] })),
}))

/**
 * 仅依据转写与摘要生成可追溯的音视频导读，模型不可用时也能稳定产出。
 * @author wuyc
 */
export function buildSpeedReadGuide(input: SpeedReadInput): SpeedReadGuide {
  const segments = input.segments.filter((segment) => segment.isFinal && clean(segment.text))
  const transcript = segments.map((segment) => segment.text).join(' ')
  const topicMarkers = input.summary.topics
    .filter((topic) => topic.sourceStartMs >= 0 && topic.sourceStartMs < input.durationMs)
    .sort((left, right) => left.sourceStartMs - right.sourceStartMs)
    .filter((topic, index, all) => index === 0 || topic.sourceStartMs - all[index - 1].sourceStartMs >= 30_000)
    .slice(0, 16)
  const fallbackChapterCount = Math.min(12, Math.max(1, Math.ceil(input.durationMs / 5 / 60_000)))
  const markers = topicMarkers.length
    ? topicMarkers.map((topic, index) => ({ ...topic, sourceStartMs: index === 0 ? 0 : topic.sourceStartMs }))
    : Array.from({ length: fallbackChapterCount }, (_, index) => {
        const startMs = Math.floor((input.durationMs / fallbackChapterCount) * index)
        const segment = segments.find((item) => item.startMs >= startMs) || segments.at(-1)
        return { text: segment ? shorten(segment.text, 28) : `第 ${index + 1} 章`, sourceStartMs: startMs }
      })

  const chapters = markers.map((marker, index) => {
    const startMs = marker.sourceStartMs
    const endMs = markers[index + 1]?.sourceStartMs ?? input.durationMs
    const chapterSegments = rangeSegments(segments, startMs, endMs)
    const notes = [...input.summary.keyPoints, ...input.summary.examples, ...input.summary.decisions]
      .filter((item) => item.sourceStartMs >= startMs && item.sourceStartMs < endMs)
      .map((item) => shorten(item.text, 70))
    const stride = Math.max(1, Math.ceil(chapterSegments.length / 5))
    const excerpts = chapterSegments.filter((_, itemIndex) => itemIndex % stride === 0).slice(0, 5).map((item) => shorten(item.text, 70))
    const keyPoints = [...new Set([...notes, ...excerpts])].slice(0, 6)
    return {
      title: chapterTitle(marker.text, index),
      summary: shorten(keyPoints.slice(0, 2).join('；') || marker.text, 140),
      startMs,
      endMs,
      keyPoints,
    }
  })

  const keywordCandidates = [
    ...DOMAIN_TERMS.filter((term) => `${input.title} ${transcript} ${input.summary.headline}`.includes(term)),
    ...input.summary.topics.flatMap((topic) => clean(topic.text).split(/[、，,：:\s/]+/)).filter((term) => term.length >= 2 && term.length <= 8),
  ]
  const keywords = [...new Set(keywordCandidates)].slice(0, 24)
  const abstractParts = [input.summary.headline, ...chapters.slice(0, 4).map((chapter) => `${chapter.title}：${chapter.summary}`)]
    .filter((item) => clean(item) && item !== '等待内容')
  const abstract = shorten(abstractParts.join('。'), 420) || shorten(transcript, 420)

  const speakers = [...new Set(segments.map((segment) => segment.speaker))]
  const speakerSummaries = speakers.map((speaker) => {
    const spoken = segments.filter((segment) => segment.speaker === speaker)
    const start = spoken[0]?.startMs || 0
    const related = input.summary.keyPoints.filter((item) => spoken.some((segment) => item.sourceStartMs >= segment.startMs && item.sourceStartMs <= segment.endMs))
    return { speaker, summary: shorten((related.map((item) => item.text).join('；') || spoken.slice(0, 4).map((item) => item.text).join('；')), 220), sourceStartMs: start }
  })

  const reviewSource = input.summary.keyPoints.length ? input.summary.keyPoints : segments.slice(0, 12).map((segment) => ({ text: segment.text, sourceStartMs: segment.startMs }))
  const reviews = reviewSource.slice(0, 24).map((item) => ({
    question: createQuestion(item.text),
    answer: shorten(item.text, 180),
    sourceStartMs: item.sourceStartMs,
  }))
  const todos = [
    ...input.summary.actions.map((item) => ({ text: item.text, owner: item.owner, due: item.due, sourceStartMs: item.sourceStartMs })),
    ...input.summary.openQuestions.map((item) => ({ text: `待确认：${item.text}`, sourceStartMs: item.sourceStartMs })),
  ].slice(0, 30)
  const mindMap = { title: input.title, children: topicNodes({ chapters }) }

  return { keywords, abstract, chapters, speakerSummaries, reviews, todos, mindMap, notes: '', frames: [] }
}
