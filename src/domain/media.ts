import type { LiveSummary, NoteMode, TranscriptSegment } from './types'

export type MediaArtifactKey = 'docx' | 'pdf' | 'pptx' | 'markdown' | 'text' | 'srt' | 'json'
  | 'transcriptDocx' | 'guideDocx' | 'notesDocx' | 'extractedPptx' | 'xmind'

export interface MindMapNode {
  title: string
  children: MindMapNode[]
}

export interface SpeedReadGuide {
  keywords: string[]
  abstract: string
  chapters: Array<{ title: string; summary: string; startMs: number; endMs: number; keyPoints: string[] }>
  speakerSummaries: Array<{ speaker: string; summary: string; sourceStartMs: number }>
  reviews: Array<{ question: string; answer: string; sourceStartMs: number }>
  todos: Array<{ text: string; owner?: string; due?: string; sourceStartMs: number }>
  mindMap: MindMapNode
  notes: string
  frames: Array<{ startMs: number; endMs: number; transcript: string; chapterIndex: number; imageUrl?: string }>
}

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
  speedRead?: SpeedReadGuide
  artifacts: Partial<Record<MediaArtifactKey, string>>
  mediaUrl: string
  error?: string
}

export const mediaStageLabel: Record<string, string> = {
  queued: '排队中', probing: '读取媒体', extracting: '提取音轨', transcribing: '本地转写',
  summarizing: '结构化总结', capturing: '提取画面', presenting: '生成 PPT', completed: '已完成', failed: '失败',
}
