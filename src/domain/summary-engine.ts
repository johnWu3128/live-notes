import { emptySummary, type LiveSummary, type NoteMode, type TraceableNote, type TranscriptSegment } from './types'

const normalizeText = (text: string) => text.trim().replace(/[。！？!?，,；;：:\s]+$/g, '')

const uniqueNotes = (notes: TraceableNote[]) => {
  const seen = new Set<string>()
  return notes.filter((note) => {
    const key = normalizeText(note.text).replace(/\s/g, '')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function mergeTranscriptSegments(current: TranscriptSegment[], incoming: TranscriptSegment) {
  const sameId = current.findIndex((item) => item.id === incoming.id)
  if (sameId >= 0) return current.map((item, index) => (index === sameId ? incoming : item))

  const normalized = normalizeText(incoming.text).replace(/\s/g, '')
  if (incoming.isFinal && current.some((item) => item.isFinal && normalizeText(item.text).replace(/\s/g, '') === normalized)) {
    return current
  }
  return [...current, incoming].sort((a, b) => a.startMs - b.startMs)
}

const note = (segment: TranscriptSegment, text = segment.text): TraceableNote => ({
  text: normalizeText(text),
  sourceStartMs: segment.startMs,
})

const actionFrom = (segment: TranscriptSegment) => {
  const ownerMatch = segment.text.match(/^([\u4e00-\u9fa5A-Za-z]{1,10})(?:来)?负责/)
  const dueMatch = segment.text.match(/(今天|明天|后天|本周[一二三四五六日天]?|下周[一二三四五六日天]?|周[一二三四五六日天](?:前|完成)?|\d{1,2}月\d{1,2}日(?:前)?)/)
  return {
    ...note(segment, segment.text.replace(/^([\u4e00-\u9fa5A-Za-z]{1,10})(?:来)?负责/, '')),
    owner: ownerMatch?.[1],
    due: dueMatch?.[1],
  }
}

export function createSummary(mode: NoteMode, segments: TranscriptSegment[]): LiveSummary {
  const finals = segments.filter((item) => item.isFinal && normalizeText(item.text))
  if (!finals.length) return emptySummary()

  const keyPoints = finals.filter((item) => /重点|核心|关键|概念|结论|需要|表示|说明|意味着/.test(item.text)).map((item) => note(item))
  const questions = finals.filter((item) => /[？?]|是否|为什么|如何|待确认|需要确认|还需确认|思考的问题/.test(item.text)).map((item) => note(item))
  const examples = finals.filter((item) => /例如|比如|举例|案例|例题/.test(item.text)).map((item) => note(item))
  const topics = finals.filter((item) => /今天|议题|主题|讨论|首先|接下来|第二|第三/.test(item.text)).map((item) => note(item))
  const decisions = mode === 'meeting'
    ? finals.filter((item) => /决定|确定|确认|同意|结论|最终/.test(item.text) && !/[？?]|是否|为什么|如何|待确认|需要确认|还需确认/.test(item.text)).map((item) => note(item, item.text.replace(/^(决定|确定|确认|同意)[：:]?/, '')))
    : []
  const actions = mode === 'meeting'
    ? finals.filter((item) => /负责|待办|跟进|提交|交付|需要.+完成/.test(item.text)).map(actionFrom)
    : []

  const meetingPoints = mode === 'meeting' ? [...keyPoints, ...decisions, ...actions.map((item) => ({ text: item.text, sourceStartMs: item.sourceStartMs }))] : keyPoints
  const fallbackPoints = meetingPoints.length ? meetingPoints : finals.slice(-5).map((item) => note(item))
  const headlineText = mode === 'meeting'
    ? (decisions[0]?.text || fallbackPoints[0]?.text || '会议进行中')
    : (fallbackPoints[0]?.text || '课程进行中')

  return {
    headline: headlineText.slice(0, 72),
    topics: uniqueNotes(topics).slice(-8),
    keyPoints: uniqueNotes(fallbackPoints).slice(-12),
    decisions: uniqueNotes(decisions).slice(-8),
    actions: actions.filter((item, index, all) => all.findIndex((other) => other.text === item.text) === index).slice(-10),
    openQuestions: uniqueNotes(questions).slice(-10),
    examples: uniqueNotes(examples).slice(-8),
    updatedAt: new Date().toISOString(),
    source: 'local',
  }
}
