import type { LiveSummary, NoteMode, TranscriptSegment } from './types'

export type MediaArtifactKey = 'docx' | 'pdf' | 'pptx' | 'markdown' | 'text' | 'srt' | 'json'

export interface MediaJobView {
  id: string
  title: string
  mode: NoteMode
  sourceName: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  stage: string
  progress: number
  message: string
  durationMs: number
  mediaKind?: 'audio' | 'video'
  segments: TranscriptSegment[]
  summary: LiveSummary
  artifacts: Partial<Record<MediaArtifactKey, string>>
  mediaUrl: string
  error?: string
}

export const mediaStageLabel: Record<string, string> = {
  queued: '排队中', probing: '读取媒体', extracting: '提取音轨', transcribing: '本地转写',
  summarizing: '结构化总结', capturing: '提取画面', presenting: '生成 PPT', completed: '已完成', failed: '失败',
}
