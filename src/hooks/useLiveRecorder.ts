import { useMemo, useRef, useState } from 'react'
import type { TranscriptSegment } from '../domain/types'

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
  speaker: string
  getElapsedMs: () => number
  onSegment: (segment: TranscriptSegment) => void
  onNotice: (message: string) => void
}

export function useLiveRecorder(options: RecorderOptions) {
  const { speaker, getElapsedMs, onSegment, onNotice } = options
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const activeRef = useRef(false)
  const resultStartsRef = useRef(new Map<number, number>())
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
        onSegment({
          id: `speech-${index}`,
          text,
          startMs,
          endMs: getElapsedMs(),
          speaker,
          isFinal: result.isFinal,
          confidence: result[0].confidence,
        })
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
      if (activeRef.current) {
        window.setTimeout(() => {
          try { recognition.start() } catch { /* 浏览器可能仍处于结束过渡。 */ }
        }, 250)
      }
    }
    recognitionRef.current = recognition
    return recognition
  }

  const start = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) { setError('当前浏览器无法访问麦克风。'); return false }
    if (!Recognition) { setError('请使用最新版 Chrome 或 Edge 获得实时转写。'); return false }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      streamRef.current = stream
      chunksRef.current = []
      const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : undefined)
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = () => setAudioUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl)
        return URL.createObjectURL(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      })
      recorder.start(1000)
      recorderRef.current = recorder
      activeRef.current = true
      resultStartsRef.current.clear()
      setupRecognition()?.start()
      onNotice('录音和实时转写已开始。')
      return true
    } catch {
      setError('无法启动麦克风，请检查系统与浏览器权限。')
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
      setupRecognition()?.start()
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
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    onNotice('记录已结束，音频、转写和摘要可导出。')
  }

  const reset = () => {
    stop()
    setAudioUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl)
      return ''
    })
    setError('')
    chunksRef.current = []
  }

  return { supported: Boolean(Recognition), error, audioUrl, start, pause, resume, stop, reset }
}
