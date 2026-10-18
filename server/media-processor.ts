import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { exportMarkdown, exportSrt, formatClock } from '../src/domain/exporters'
import type { NoteSession, TranscriptSegment } from '../src/domain/types'
import { buildDeckPlan } from './media-plan'
import type { MediaProcessor, MediaProcessorInput } from './media-types'
import { generatePresentation } from './presentation-service'
import { generatePdfDocument, generateWordDocument } from './document-service'
import type { SummaryRequest, SummaryResult } from './summary-service'

const execFileAsync = promisify(execFile)
const serverDir = path.dirname(fileURLToPath(import.meta.url))
type Summarize = (request: SummaryRequest) => Promise<SummaryResult>

interface ProbeResult {
  format?: { duration?: string }
  streams?: Array<{ codec_type?: string }>
}

const safeName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '-').trim() || '音视频笔记'

const runFile = async (command: string, args: string[], timeout = 120_000) => {
  const result = await execFileAsync(command, args, { windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 })
  return result.stdout
}

const probeMedia = async (sourcePath: string) => {
  const output = await runFile(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', sourcePath])
  const parsed = JSON.parse(output) as ProbeResult
  const durationMs = Math.max(1, Math.round(Number(parsed.format?.duration || 0) * 1000))
  if (!Number.isFinite(durationMs) || durationMs <= 1) throw new Error('无法读取音视频时长')
  return { durationMs, hasVideo: parsed.streams?.some((stream) => stream.codec_type === 'video') || false }
}

const findPython = async () => {
  const candidates: Array<{ command: string; prefix: string[] }> = []
  if (process.env.LIVE_NOTES_PYTHON) candidates.push({ command: process.env.LIVE_NOTES_PYTHON, prefix: [] })
  if (process.env.LOCALAPPDATA) candidates.push({ command: path.join(process.env.LOCALAPPDATA, 'hermes', 'hermes-agent', 'venv', 'Scripts', 'python.exe'), prefix: [] })
  candidates.push({ command: 'python', prefix: [] }, { command: 'py', prefix: ['-3'] })
  for (const candidate of candidates) {
    try {
      await runFile(candidate.command, [...candidate.prefix, '-c', 'import faster_whisper; print("ok")'], 20_000)
      return candidate
    } catch { /* 继续尝试下一个本机 Python。 */ }
  }
  throw new Error('未找到安装 faster-whisper 的 Python。请运行 pip install -r requirements-media.txt')
}

const transcribeAudio = async (audioPath: string, input: MediaProcessorInput, durationMs: number, events: Parameters<MediaProcessor>[1]) => {
  const python = await findPython()
  const script = path.join(serverDir, 'python', 'transcribe.py')
  const initialPrompt = process.env.LIVE_NOTES_INITIAL_PROMPT || `${input.title}。${input.mode === 'class' ? '课程讲解、知识点、实操步骤、案例与复习问题。' : '会议议题、结论、行动项、负责人和截止时间。'}`
  const args = [...python.prefix, script, audioPath, '--model', process.env.LIVE_NOTES_WHISPER_MODEL || 'small', '--language', process.env.LIVE_NOTES_LANGUAGE || 'zh', '--initial-prompt', initialPrompt]
  const child = spawn(python.command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const segments: TranscriptSegment[] = []
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-8_000) })
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
  lines.on('line', (line) => {
    try {
      const event = JSON.parse(line) as Record<string, unknown>
      if (event.type === 'model') events.update({ message: `模型已加载，开始转写（${String(event.model)}）` })
      if (event.type === 'segment' && typeof event.text === 'string' && event.text.trim()) {
        const segment: TranscriptSegment = {
          id: `${input.jobId}-${String(event.id)}`,
          text: event.text.trim(),
          startMs: Number(event.startMs),
          endMs: Number(event.endMs),
          confidence: Number(event.confidence),
          speaker: input.mode === 'class' ? '讲者' : '说话人 1',
          isFinal: true,
        }
        segments.push(segment)
        events.segment(segment)
        events.update({ progress: Math.min(78, 12 + Math.round((segment.endMs / durationMs) * 66)), message: `正在转写 ${formatClock(segment.endMs)} / ${formatClock(durationMs)}` })
      }
    } catch { /* 忽略第三方库写入标准输出的非 JSON 行。 */ }
  })
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  if (exitCode !== 0) throw new Error(`本地转写失败：${stderr.trim() || `Python 退出码 ${exitCode}`}`)
  if (!segments.length) throw new Error('没有识别到可用语音内容')
  return segments
}

const captureFrames = async (sourcePath: string, outputDir: string, plan: ReturnType<typeof buildDeckPlan>) => {
  const chapterSlides = plan.slides.filter((slide) => slide.kind === 'chapter')
  const frameDir = path.join(outputDir, 'frames')
  await fs.mkdir(frameDir, { recursive: true })
  for (let index = 0; index < chapterSlides.length; index += 1) {
    const slide = chapterSlides[index]
    const framePath = path.join(frameDir, `chapter-${String(index + 1).padStart(2, '0')}.jpg`)
    try {
      await runFile(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-ss', String(slide.sourceStartMs / 1000), '-i', sourcePath, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '2', framePath], 120_000)
      slide.framePath = framePath
    } catch { /* 个别关键帧失败时仍生成纯文本章节页。 */ }
  }
}

const writeArtifacts = async (input: MediaProcessorInput, durationMs: number, segments: TranscriptSegment[], summary: SummaryResult['summary']) => {
  const base = safeName(input.title)
  const session: NoteSession = {
    id: input.jobId, title: input.title, mode: input.mode, status: 'stopped',
    elapsedMs: durationMs, segments, summary, bookmarks: [],
  }
  const markdown = path.join(input.outputDir, `${base}.md`)
  const text = path.join(input.outputDir, `${base}.txt`)
  const srt = path.join(input.outputDir, `${base}.srt`)
  const json = path.join(input.outputDir, `${base}.json`)
  await Promise.all([
    fs.writeFile(markdown, exportMarkdown(session), 'utf8'),
    fs.writeFile(text, segments.map((segment) => `[${formatClock(segment.startMs)}] ${segment.speaker}：${segment.text}`).join('\n'), 'utf8'),
    fs.writeFile(srt, exportSrt(segments), 'utf8'),
    fs.writeFile(json, JSON.stringify(session, null, 2), 'utf8'),
  ])
  return { markdown, text, srt, json }
}

/**
 * 创建本地长音视频处理器：音轨提取、增量转写、总结、关键帧和 PPT 一次完成。
 * @author wuyc
 */
export function createMediaProcessor(summarize: Summarize): MediaProcessor {
  return async (input, events) => {
    await fs.mkdir(input.outputDir, { recursive: true })
    events.update({ stage: 'probing', progress: 2, message: '正在读取媒体信息' })
    const { durationMs, hasVideo } = await probeMedia(input.sourcePath)
    events.update({ durationMs, mediaKind: hasVideo ? 'video' : 'audio', stage: 'extracting', progress: 5, message: '正在提取 16kHz 音轨' })
    const audioPath = path.join(input.outputDir, 'audio-16k.wav')
    await runFile(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-i', input.sourcePath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', audioPath], Math.max(120_000, Math.ceil(durationMs / 2)))

    events.update({ stage: 'transcribing', progress: 12, message: '正在加载本地语音模型' })
    const segments = await transcribeAudio(audioPath, input, durationMs, events)
    await fs.rm(audioPath, { force: true })

    events.update({ stage: 'summarizing', progress: 82, message: '正在生成结构化总结' })
    const summaryResult = await summarize({
      sessionId: input.jobId, mode: input.mode, segments,
      backend: input.summaryConfig?.backend || 'local', model: input.summaryConfig?.model,
    })
    const plan = buildDeckPlan({ title: input.title, mode: input.mode, durationMs, segments, summary: summaryResult.summary, sourceName: input.sourceName || path.basename(input.sourcePath), hasVideo })

    if (hasVideo) {
      events.update({ stage: 'capturing', progress: 88, message: '正在提取章节关键画面' })
      await captureFrames(input.sourcePath, input.outputDir, plan)
    }
    events.update({ stage: 'presenting', progress: 94, message: '正在生成可编辑 PPT 和完整笔记' })
    const artifacts = await writeArtifacts(input, durationMs, segments, summaryResult.summary)
    const pptx = path.join(input.outputDir, `${safeName(input.title)}.pptx`)
    await generatePresentation(plan, pptx)
    const docx = path.join(input.outputDir, `${safeName(input.title)}.docx`)
    const pdf = path.join(input.outputDir, `${safeName(input.title)}.pdf`)
    const session: NoteSession = {
      id: input.jobId, title: input.title, mode: input.mode, status: 'stopped', elapsedMs: durationMs,
      segments, summary: summaryResult.summary, bookmarks: [],
    }
    await Promise.all([generateWordDocument(session, docx), generatePdfDocument(session, pdf)])
    return { durationMs, mediaKind: hasVideo ? 'video' : 'audio', summary: summaryResult.summary, artifacts: { ...artifacts, docx, pdf, pptx } }
  }
}
