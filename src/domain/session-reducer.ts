import { emptySummary, type NoteMode, type NoteSession, type TranscriptSegment } from './types'
import { createSummary, mergeTranscriptSegments } from './summary-engine'

export type SessionAction =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'stop'; now: number }
  | { type: 'segment'; segment: TranscriptSegment }
  | { type: 'rename'; title: string }
  | { type: 'set-summary'; summary: NoteSession['summary'] }
  | { type: 'bookmark'; atMs: number; label?: string }
  | { type: 'restore'; session: NoteSession }

export const createSession = (mode: NoteMode, title = mode === 'meeting' ? '新会议' : '新课堂'): NoteSession => ({
  id: crypto.randomUUID(),
  title,
  mode,
  status: 'idle',
  elapsedMs: 0,
  segments: [],
  summary: emptySummary(),
  bookmarks: [],
})

const settleElapsed = (state: NoteSession, now: number) => state.activeSince == null
  ? state.elapsedMs
  : state.elapsedMs + Math.max(0, now - state.activeSince)

export function sessionReducer(state: NoteSession, action: SessionAction): NoteSession {
  switch (action.type) {
    case 'start':
      return { ...state, status: 'recording', startedAt: new Date(action.now).toISOString(), activeSince: action.now }
    case 'pause':
      return { ...state, status: 'paused', elapsedMs: settleElapsed(state, action.now), activeSince: undefined }
    case 'resume':
      return { ...state, status: 'recording', activeSince: action.now }
    case 'stop':
      return {
        ...state,
        status: 'stopped',
        elapsedMs: Math.max(settleElapsed(state, action.now), ...state.segments.map((segment) => segment.endMs), 0),
        activeSince: undefined,
      }
    case 'segment': { const segments = mergeTranscriptSegments(state.segments, action.segment); return { ...state, segments, summary: createSummary(state.mode, segments) } }
    case 'rename':
      return { ...state, title: action.title }
    case 'set-summary':
      return { ...state, summary: action.summary }
    case 'bookmark':
      return { ...state, bookmarks: [...state.bookmarks, { id: crypto.randomUUID(), atMs: action.atMs, label: action.label || `重点 ${state.bookmarks.length + 1}` }] }
    case 'restore':
      return action.session.status === 'recording' ? { ...action.session, status: 'paused', activeSince: undefined } : action.session
  }
}
