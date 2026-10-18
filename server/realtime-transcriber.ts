import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import type { NoteMode, TranscriptSegment } from '../src/domain/types'

export interface RealtimeChunkInput {
  sessionId: string
  mode: NoteMode
  speaker: string
  offsetMs: number
  audio: Buffer
}

export interface RealtimeTranscriptionService {
  transcribeChunk(input: RealtimeChunkInput): Promise<TranscriptSegment[]>
}

interface WorkerResponse {
  type: 'ready' | 'result' | 'error'
  requestId?: string
  message?: string
  segments?: Array<Omit<TranscriptSegment, 'speaker' | 'isFinal'>>
}

interface PendingRequest {
  input: RealtimeChunkInput
  path: string
  resolve: (segments: TranscriptSegment[]) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

const serverDir = path.dirname(fileURLToPath(import.meta.url))

const findPython = async () => {
  const candidates = [
    process.env.LIVE_NOTES_PYTHON,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'hermes', 'hermes-agent', 'venv', 'Scripts', 'python.exe') : undefined,
    'python',
  ].filter(Boolean) as string[]
  for (const command of candidates) {
    try {
      const check = spawn(command, ['-c', 'import faster_whisper'], { windowsHide: true })
      const code = await new Promise<number | null>((resolve) => check.once('close', resolve))
      if (code === 0) return command
    } catch { /* 继续检查下一个 Python。 */ }
  }
  throw new Error('未找到安装 faster-whisper 的 Python')
}

/**
 * 维护单个常驻 Whisper 工作进程，避免每个实时音频块重复加载模型。
 * @author wuyc
 */
export class WhisperRealtimeTranscriber implements RealtimeTranscriptionService {
  private child?: ChildProcessWithoutNullStreams
  private starting?: Promise<ChildProcessWithoutNullStreams>
  private readonly pending = new Map<string, PendingRequest>()
  private readonly tempRoot = path.join(os.tmpdir(), 'live-notes-realtime')

  private async worker() {
    if (this.child && !this.child.killed) return this.child
    if (this.starting) return this.starting
    this.starting = (async () => {
      const python = await findPython()
      await fs.mkdir(this.tempRoot, { recursive: true })
      const child = spawn(python, [path.join(serverDir, 'python', 'realtime_worker.py')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
      lines.on('line', (line) => this.handleLine(line))
      child.stderr.on('data', () => { /* 不把可能包含本机路径的 Python 日志回传给浏览器。 */ })
      child.once('exit', () => {
        this.child = undefined
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timeout)
          void fs.rm(pending.path, { force: true })
          pending.reject(new Error('实时转写进程已退出'))
        }
        this.pending.clear()
      })
      this.child = child
      return child
    })().finally(() => { this.starting = undefined })
    return this.starting
  }

  private handleLine(line: string) {
    let response: WorkerResponse
    try { response = JSON.parse(line) as WorkerResponse } catch { return }
    if (!response.requestId) return
    const pending = this.pending.get(response.requestId)
    if (!pending) return
    clearTimeout(pending.timeout)
    this.pending.delete(response.requestId)
    void fs.rm(pending.path, { force: true })
    if (response.type === 'error') { pending.reject(new Error(response.message || '实时转写失败')); return }
    const offset = pending.input.offsetMs
    pending.resolve((response.segments || []).map((segment, index) => ({
      ...segment,
      id: `${pending.input.sessionId}-${response.requestId}-${index}`,
      startMs: offset + segment.startMs,
      endMs: offset + segment.endMs,
      speaker: pending.input.speaker,
      isFinal: true,
    })))
  }

  async transcribeChunk(input: RealtimeChunkInput) {
    const child = await this.worker()
    const requestId = crypto.randomUUID()
    const safeSession = input.sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'session'
    const chunkPath = path.join(this.tempRoot, `${safeSession}-${requestId}.wav`)
    await fs.writeFile(chunkPath, input.audio, { mode: 0o600 })
    return new Promise<TranscriptSegment[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId)
        void fs.rm(chunkPath, { force: true })
        reject(new Error('实时转写超时'))
      }, 120_000)
      this.pending.set(requestId, { input, path: chunkPath, resolve, reject, timeout })
      child.stdin.write(`${JSON.stringify({
        requestId, path: chunkPath, sessionId: safeSession,
        initialPrompt: input.mode === 'class' ? '课程讲解、知识点、实操步骤和例子' : '会议议题、结论、行动项、负责人和截止时间',
      })}\n`)
    })
  }
}
