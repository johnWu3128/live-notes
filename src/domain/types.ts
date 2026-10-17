export type NoteMode = 'meeting' | 'class'
export type SessionStatus = 'idle' | 'recording' | 'paused' | 'stopped'

export interface TranscriptSegment {
  id: string
  text: string
  startMs: number
  endMs: number
  speaker: string
  isFinal: boolean
  confidence?: number
}

export interface TraceableNote {
  text: string
  sourceStartMs: number
}

export interface ActionNote extends TraceableNote {
  owner?: string
  due?: string
}

export interface LiveSummary {
  headline: string
  topics: TraceableNote[]
  keyPoints: TraceableNote[]
  decisions: TraceableNote[]
  actions: ActionNote[]
  openQuestions: TraceableNote[]
  examples: TraceableNote[]
  updatedAt: string
  source: 'local' | 'openclaw'
}

export interface Bookmark {
  id: string
  label: string
  atMs: number
}

export interface NoteSession {
  id: string
  title: string
  mode: NoteMode
  status: SessionStatus
  startedAt?: string
  elapsedMs: number
  activeSince?: number
  segments: TranscriptSegment[]
  summary: LiveSummary
  bookmarks: Bookmark[]
}

export const emptySummary = (): LiveSummary => ({
  headline: '等待内容',
  topics: [],
  keyPoints: [],
  decisions: [],
  actions: [],
  openQuestions: [],
  examples: [],
  updatedAt: new Date().toISOString(),
  source: 'local',
})
