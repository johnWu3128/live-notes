/**
 * 将单声道 PCM 线性重采样到目标采样率。
 * @author wuyc
 */
export function resampleMono(input: Float32Array, sourceRate: number, targetRate: number) {
  if (sourceRate === targetRate) return input.slice()
  const ratio = sourceRate / targetRate
  const output = new Float32Array(Math.max(1, Math.round(input.length / ratio)))
  for (let index = 0; index < output.length; index += 1) {
    const position = index * ratio
    const left = Math.floor(position)
    const right = Math.min(input.length - 1, left + 1)
    const fraction = position - left
    output[index] = input[left] * (1 - fraction) + input[right] * fraction
  }
  return output
}

/**
 * 将浮点 PCM 编码为标准 16 位单声道 WAV，供本地 Whisper 分块识别。
 * @author wuyc
 */
export function encodeWav(samples: Float32Array, sampleRate: number) {
  const output = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(output.buffer)
  const write = (offset: number, value: string) => value.split('').forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)))
  write(0, 'RIFF')
  view.setUint32(4, output.length - 8, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 0x8000 : 0x7fff)), true))
  return output
}
