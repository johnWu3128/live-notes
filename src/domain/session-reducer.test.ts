import { describe, expect, it } from 'vitest'
import { createSession, sessionReducer } from './session-reducer'

describe('sessionReducer', () => {
  it('supports recording, pausing, resuming and stopping without losing transcript', () => {
    let state = createSession('meeting', '周会')
    state = sessionReducer(state, { type: 'start', now: 1000 })
    state = sessionReducer(state, {
      type: 'segment',
      segment: { id: '1', text: '开始讨论', startMs: 0, endMs: 1000, speaker: '说话人 1', isFinal: true },
    })
    state = sessionReducer(state, { type: 'pause', now: 6000 })
    state = sessionReducer(state, { type: 'resume', now: 11_000 })
    state = sessionReducer(state, { type: 'stop', now: 16_000 })

    expect(state.status).toBe('stopped')
    expect(state.elapsedMs).toBe(10_000)
    expect(state.segments).toHaveLength(1)
  })
})
