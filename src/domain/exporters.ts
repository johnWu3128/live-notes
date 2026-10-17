import type { NoteSession, TranscriptSegment } from './types'

export const formatClock = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
    : [minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

const srtClock = (milliseconds: number) => {
  const ms = Math.max(0, Math.floor(milliseconds))
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  const remainder = ms % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(remainder).padStart(3, '0')}`
}

export function exportSrt(segments: TranscriptSegment[]) {
  return segments.filter((item) => item.isFinal).map((item, index) => [
    index + 1,
    `${srtClock(item.startMs)} --> ${srtClock(item.endMs)}`,
    `${item.speaker}: ${item.text}`,
  ].join('\n')).join('\n\n')
}

const noteList = (items: { text: string; sourceStartMs: number }[]) =>
  items.length ? items.map((item) => `- [${formatClock(item.sourceStartMs)}] ${item.text}`).join('\n') : '- 暂无'

export function exportMarkdown(session: NoteSession) {
  const actionList = session.summary.actions.length
    ? session.summary.actions.map((item) => `- [${formatClock(item.sourceStartMs)}] ${item.owner || '待认领'} - ${item.due || '待定'} - ${item.text}`).join('\n')
    : '- 暂无'
  const transcript = session.segments.filter((item) => item.isFinal)
    .map((item) => `- [${formatClock(item.startMs)}] **${item.speaker}**：${item.text}`).join('\n')

  return `# ${session.title}\n\n- 场景：${session.mode === 'meeting' ? '会议' : '听课'}\n- 时长：${formatClock(session.elapsedMs)}\n- 生成时间：${new Date().toLocaleString('zh-CN')}\n\n## 一句话摘要\n\n${session.summary.headline}\n\n## 关键要点\n\n${noteList(session.summary.keyPoints)}\n\n## 决策结论\n\n${noteList(session.summary.decisions)}\n\n## 行动项\n\n${actionList}\n\n## 待确认问题\n\n${noteList(session.summary.openQuestions)}\n\n## 完整转写\n\n${transcript || '- 暂无'}\n`
}
