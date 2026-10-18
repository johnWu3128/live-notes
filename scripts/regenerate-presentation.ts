import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { exportMarkdown, exportSrt, formatClock } from '../src/domain/exporters'
import type { NoteSession } from '../src/domain/types'
import { buildDeckPlan } from '../server/media-plan'
import { generatePdfDocument, generateWordDocument } from '../server/document-service'
import { generatePresentation } from '../server/presentation-service'
import type { MediaArtifactKey, MediaJob } from '../server/media-types'

const execFileAsync = promisify(execFile)

/**
 * 基于已有完整转写重新提取主题关键帧并生成 PPT，避免重复执行语音识别。
 * @author wuyc
 */
async function main() {
  const [sessionPath, mediaPath, requestedOutput] = process.argv.slice(2)
  if (!sessionPath || !mediaPath) throw new Error('用法：npm run regenerate:ppt -- <session.json> <media> [output.pptx]')
  const session = JSON.parse(await fs.readFile(path.resolve(sessionPath), 'utf8')) as NoteSession
  const hasVideo = /\.(mp4|mkv|mov|avi|webm)$/i.test(mediaPath)
  const outputPath = path.resolve(requestedOutput || path.join(path.dirname(sessionPath), `${session.title}.pptx`))
  const basePath = path.join(path.dirname(sessionPath), session.title.replace(/[\\/:*?"<>|]/g, '-'))
  await Promise.all([
    fs.writeFile(`${basePath}.md`, exportMarkdown(session), 'utf8'),
    fs.writeFile(`${basePath}.txt`, session.segments.map((segment) => `[${formatClock(segment.startMs)}] ${segment.speaker}：${segment.text}`).join('\n'), 'utf8'),
    fs.writeFile(`${basePath}.srt`, exportSrt(session.segments), 'utf8'),
    generateWordDocument(session, `${basePath}.docx`),
    generatePdfDocument(session, `${basePath}.pdf`),
  ])
  const plan = buildDeckPlan({
    title: session.title, mode: session.mode, durationMs: session.elapsedMs, segments: session.segments,
    summary: session.summary, sourceName: path.basename(mediaPath), hasVideo,
  })
  if (hasVideo) {
    const frameDir = path.join(path.dirname(outputPath), 'frames-semantic')
    await fs.mkdir(frameDir, { recursive: true })
    const chapters = plan.slides.filter((slide) => slide.kind === 'chapter')
    for (let index = 0; index < chapters.length; index += 1) {
      const framePath = path.join(frameDir, `chapter-${String(index + 1).padStart(2, '0')}.jpg`)
      await execFileAsync(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-ss', String(chapters[index].sourceStartMs / 1000), '-i', path.resolve(mediaPath), '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '2', framePath], { windowsHide: true, timeout: 120_000 })
      chapters[index].framePath = framePath
    }
  }
  await generatePresentation(plan, outputPath)
  const artifactCandidates: Record<MediaArtifactKey, string> = {
    docx: `${basePath}.docx`,
    pdf: `${basePath}.pdf`,
    pptx: outputPath,
    markdown: `${basePath}.md`,
    text: `${basePath}.txt`,
    srt: `${basePath}.srt`,
    json: path.resolve(sessionPath),
  }
  const artifacts: MediaJob['artifacts'] = {}
  for (const [key, artifactPath] of Object.entries(artifactCandidates) as Array<[MediaArtifactKey, string]>) {
    try { await fs.access(artifactPath); artifacts[key] = artifactPath } catch { /* 仅登记实际存在的成果。 */ }
  }
  const state: MediaJob = {
    id: session.id,
    title: session.title,
    mode: session.mode,
    sourceName: path.basename(mediaPath),
    sourcePath: path.resolve(mediaPath),
    status: 'completed',
    stage: 'completed',
    progress: 100,
    message: '全部内容已生成',
    createdAt: session.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    durationMs: session.elapsedMs,
    mediaKind: hasVideo ? 'video' : 'audio',
    segments: session.segments,
    summary: session.summary,
    artifacts,
  }
  await fs.writeFile(path.join(path.dirname(sessionPath), 'job.json'), JSON.stringify(state, null, 2), 'utf8')
  console.log(outputPath)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
