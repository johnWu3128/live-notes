import { useMemo, useRef, useState } from 'react'
import { encodeWav, resampleMono } from '../domain/audio'
import type { NoteMode, TranscriptSegment } from '../domain/types'

export type CaptureSource = 'microphone' | 'system' | 'mixed'

interface SpeechRecognitionResultLike { isFinal: boolean; 0: { transcript: string; confidence: number } }
interface SpeechRecognitionEventLike { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> }
interface SpeechRecognitionErrorLike { error: string }
interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

interface RecorderOptions {
  sessionId: string
  mode: NoteMode
  speaker: string
  captureSource: CaptureSource
  getElapsedMs: () => number
  onSegment: (segment: TranscriptSegment) => void
  onNotice: (message: string) => void
}

/**
 * 录制麦克风或电脑声音，并按来源选择浏览器识别或本地 Whisper 分块识别。
 * @author wuyc
 */
export function useAudioCapture(options: RecorderOptions) {
  const { sessionId, mode, speaker, captureSource, getElapsedMs, onSegment, onNotice } = options
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamsRef = useRef<MediaStream[]>([])
  const chunksRef = useRef<Blob[]>([])
  const activeRef = useRef(false)
  const resultStartsRef = useRef(new Map<number, number>())
  const audioContextRef = useRef<AudioContext | null>(null)
  const mixContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const pcmRef = useRef<Float32Array[]>([])
  const pcmLengthRef = useRef(0)
  const chunkStartRef = useRef(0)
  const uploadQueueRef = useRef(Promise.resolve())
  const Recognition = useMemo(() => window.SpeechRecognition || window.webkitSpeechRecognition, [])

  const setupRecognition = () => {
    if (!Recognition) return null
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'zh-CN'
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const text = result[0].transcript.trim()
        if (!text) continue
        if (!resultStartsRef.current.has(index)) resultStartsRef.current.set(index, getElapsedMs())
        const startMs = resultStartsRef.current.get(index) ?? getElapsedMs()
        onSegment({ id: `speech-${index}`, text, startMs, endMs: getElapsedMs(), speaker, isFinal: result.isFinal, confidence: result[0].confidence })
      }
    }
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      const messages: Record<string, string> = {
        'not-allowed': '麦克风权限被拒绝，请在浏览器地址栏允许后重试。',
        network: '语音识别网络暂不可用，录音仍会保留。',
        'audio-capture': '没有检测到可用麦克风。',
      }
      setError(messages[event.error] || `语音识别异常：${event.error}`)
    }
    recognition.onend = () => {
      if (activeRef.current && captureSource === 'microphone') window.setTimeout(() => { try { recognition.start() } catch { /* 浏览器仍在结束过渡。 */ } }, 250)
    }
    recognitionRef.current = recognition
    return recognition
  }

  const uploadPcm = (samples: Float32Array, sourceRate: number, offsetMs: number) => {
    const wav = encodeWav(resampleMono(samples, sourceRate, 16_000), 16_000)
    uploadQueueRef.current = uploadQueueRef.current.then(async () => {
      const form = new FormData()
      form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'chunk.wav')
      form.append('sessionId', sessionId)
      form.append('mode', mode)
      form.append('speaker', captureSource === 'system' ? '系统声音' : speaker)
      form.append('offsetMs', String(offsetMs))
      const response = await fetch('/api/realtime/transcribe', { method: 'POST', body: form })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json() as { segments: TranscriptSegment[] }
      payload.segments.forEach(onSegment)
      if (payload.segments.length) onNotice('本地 Whisper 已更新实时转写与摘要。')
    }).catch(() => onNotice('当前音频块识别失败，录音仍会继续保留。'))
  }

  const flushPcm = (sourceRate: number) => {
    if (!pcmLengthRef.current) return
    const joined = new Float32Array(pcmLengthRef.current)
    let offset = 0
    for (const chunk of pcmRef.current) { joined.set(chunk, offset); offset += chunk.length }
    const startedAt = chunkStartRef.current
    pcmRef.current = []
    pcmLengthRef.current = 0
    chunkStartRef.current = getElapsedMs()
    uploadPcm(joined, sourceRate, startedAt)
  }

  const startPcmCapture = (stream: MediaStream) => {
    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    const processor = context.createScriptProcessor(4096, 1, 1)
    const silent = context.createGain()
    silent.gain.value = 0
    chunkStartRef.current = getElapsedMs()
    processor.onaudioprocess = (event) => {
      if (!activeRef.current) return
      const chunk = new Float32Array(event.inputBuffer.getChannelData(0))
      pcmRef.current.push(chunk)
      pcmLengthRef.current += chunk.length
      if (pcmLengthRef.current >= context.sampleRate * 12) flushPcm(context.sampleRate)
    }
    source.connect(processor)
    processor.connect(silent)
    silent.connect(context.destination)
    audioContextRef.current = context
    processorRef.current = processor
  }

  const acquireStream = async () => {
    if (captureSource === 'microphone') {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      streamsRef.current = [microphone]
      return microphone
    }
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    if (!display.getAudioTracks().length) {
      display.getTracks().forEach((track) => track.stop())
      throw new Error('请选择支持共享音频的标签页或屏幕，并勾选共享音频。')
    }
    if (captureSource === 'system') {
      streamsRef.current = [display]
      return new MediaStream(display.getAudioTracks())
    }
    const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    const context = new AudioContext()
    const destination = context.createMediaStreamDestination()
    context.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(destination)
    context.createMediaStreamSource(microphone).connect(destination)
    mixContextRef.current = context
    streamsRef.current = [display, microphone, destination.stream]
    return destination.stream
  }

  const start = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) { setError('当前浏览器无法访问录音设备。'); return false }
    if (captureSource === 'microphone' && !Recognition) { setError('请使用最新版 Chrome 或 Edge 获得实时转写。'); return false }
    try {
      const stream = await acquireStream()
      chunksRef.current = []
      const audioOnly = new MediaStream(stream.getAudioTracks())
      const recorder = new MediaRecorder(audioOnly, MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : undefined)
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = () => setAudioUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl)
        return URL.createObjectURL(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      })
      recorder.start(1_000)
      recorderRef.current = recorder
      activeRef.current = true
      resultStartsRef.current.clear()
      if (captureSource === 'microphone') setupRecognition()?.start()
      else startPcmCapture(audioOnly)
      onNotice(captureSource === 'microphone' ? '麦克风录音和实时转写已开始。' : '电脑声音正在录制，本地 Whisper 将按约 12 秒分块更新。')
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法启动录音，请检查系统与浏览器权限。')
      return false
    }
  }

  const pause = () => {
    activeRef.current = false
    recognitionRef.current?.stop()
    if (recorderRef.current?.state === 'recording') recorderRef.current.pause()
    onNotice('录音已暂停，可随时继续。')
  }

  const resume = async () => {
    setError('')
    activeRef.current = true
    if (recorderRef.current?.state === 'paused') recorderRef.current.resume()
    try {
      if (captureSource === 'microphone') setupRecognition()?.start()
      else chunkStartRef.current = getElapsedMs()
      onNotice('继续录音与转写。')
      return true
    } catch {
      setError('实时识别恢复失败，请结束后重新开始。')
      return false
    }
  }

  const stop = () => {
    activeRef.current = false
    recognitionRef.current?.stop()
    if (audioContextRef.current) flushPcm(audioContextRef.current.sampleRate)
    processorRef.current?.disconnect()
    void audioContextRef.current?.close()
    void mixContextRef.current?.close()
    processorRef.current = null
    audioContextRef.current = null
    mixContextRef.current = null
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    streamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
    streamsRef.current = []
    onNotice('记录已结束，音频、转写、摘要和文档可导出。')
  }

  const reset = () => {
    stop()
    setAudioUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl)
      return ''
    })
    setError('')
    chunksRef.current = []
    pcmRef.current = []
    pcmLengthRef.current = 0
  }

  return { supported: captureSource === 'microphone' ? Boolean(Recognition) : Boolean(navigator.mediaDevices?.getDisplayMedia), error, audioUrl, start, pause, resume, stop, reset }
}
