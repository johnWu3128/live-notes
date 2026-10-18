import type { LiveSummary, NoteMode, TranscriptSegment } from '../src/domain/types'
import type { SummaryConfig } from '../src/domain/ai'

export type MediaJobStage = 'queued' | 'probing' | 'extracting' | 'transcribing' | 'summarizing' | 'capturing' | 'presenting' | 'completed' | 'failed'
export type MediaJobStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type MediaArtifactKey = 'docx' | 'pdf' | 'pptx' | 'markdown' | 'text' | 'srt' | 'json'
  | 'transcriptDocx' | 'guideDocx' | 'notesDocx' | 'extractedPptx' | 'xmind'

export interface MindMapNode {
  title: string
  children: MindMapNode[]
}

export interface SpeedReadChapter {
  title: string
  summary: string
  startMs: number
  endMs: number
  keyPoints: string[]
}

export interface SpeedReadFrame {
  startMs: number
  endMs: number
  transcript: string
  chapterIndex: number
  imagePath?: string
  imageUrl?: string
}

export interface SpeedReadGuide {
  keywords: string[]
  abstract: string
  chapters: SpeedReadChapter[]
  speakerSummaries: Array<{ speaker: string; summary: string; sourceStartMs: number }>
  reviews: Array<{ question: string; answer: string; sourceStartMs: number }>
  todos: Array<{ text: string; owner?: string; due?: string; sourceStartMs: number }>
  mindMap: MindMapNode
  notes: string
  frames: SpeedReadFrame[]
}

export interface MediaJobInput {
  sourcePath: string
  mode: NoteMode
  title: string
  sourceName?: string
  deleteSourceOnFinish?: boolean
  summaryConfig?: SummaryConfig
}

export interface MediaProcessorInput extends MediaJobInput {
  jobId: string
  outputDir: string
}

export interface MediaProcessorEvents {
  update: (change: Partial<Pick<MediaJob, 'stage' | 'progress' | 'message' | 'durationMs' | 'mediaKind'>>) => void
  segment: (segment: TranscriptSegment) => void
}

export interface MediaProcessorResult {
  durationMs: number
  mediaKind: 'audio' | 'video'
  summary: LiveSummary
  speedRead?: SpeedReadGuide
  artifacts: Partial<Record<MediaArtifactKey, string>>
}

export type MediaProcessor = (input: MediaProcessorInput, events: MediaProcessorEvents) => Promise<MediaProcessorResult>

export interface MediaJob {
  id: string
  title: string
  mode: NoteMode
  sourceName: string
  sourcePath: string
  status: MediaJobStatus
  stage: MediaJobStage
  progress: number
  message: string
  createdAt: string
  updatedAt: string
  durationMs: number
  mediaKind?: 'audio' | 'video'
  segments: TranscriptSegment[]
  summary: LiveSummary
  speedRead?: SpeedReadGuide
  artifacts: Partial<Record<MediaArtifactKey, string>>
  error?: string
}

export interface DeckSlidePlan {
  kind: 'cover' | 'overview' | 'agenda' | 'chapter' | 'summary' | 'actions' | 'source'
  title: string
  subtitle?: string
  bullets: string[]
  sourceStartMs: number
  framePath?: string
  notes?: string
}

export interface DeckPlan {
  title: string
  subtitle: string
  slides: DeckSlidePlan[]
  transcriptNotes: string[]
}
