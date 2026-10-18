import { describe, expect, it } from 'vitest'
import { encodeWav, resampleMono } from './audio'

describe('realtime audio chunks', () => {
  it('resamples mono PCM and writes a valid 16 kHz WAV header', () => {
    const source = Float32Array.from({ length: 48_000 }, (_, index) => Math.sin(index / 20))
    const samples = resampleMono(source, 48_000, 16_000)
    const wav = encodeWav(samples, 16_000)
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)

    expect(samples.length).toBe(16_000)
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE')
    expect(view.getUint32(24, true)).toBe(16_000)
  })
})
