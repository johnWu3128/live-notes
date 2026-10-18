import fs from 'node:fs/promises'
import path from 'node:path'
import { buildSpeedReadGuide } from '../server/speed-read-service'
import { generateSpeedReadArtifacts } from '../server/speed-read-export-service'
import { captureSpeedReadFrames } from '../server/media-processor'
import type { MediaJob } from '../server/media-types'

const jobId = process.argv[2]
if (!jobId || !/^[a-zA-Z0-9-]+$/.test(jobId)) throw new Error('用法：npm run regenerate:speed-read -- <任务ID>')

const outputDir = path.resolve('output', 'media-jobs', jobId)
const statePath = path.join(outputDir, 'job.json')
const job = JSON.parse(await fs.readFile(statePath, 'utf8')) as MediaJob
if (job.status !== 'completed' || !job.segments.length) throw new Error('任务尚未完成或没有转写内容')
if (!job.sourcePath || !await fs.stat(job.sourcePath).then((stat) => stat.isFile()).catch(() => false)) throw new Error('源音视频不存在')

const sourceTitle = path.basename(job.sourcePath, path.extname(job.sourcePath))
const title = sourceTitle || job.title
const guide = buildSpeedReadGuide({ title, mode: job.mode, durationMs: job.durationMs, segments: job.segments, summary: job.summary })
if (job.mediaKind === 'video') {
  console.log('正在批量提取速读画面...')
  guide.frames = await captureSpeedReadFrames(job.sourcePath, outputDir, job.durationMs, job.segments, guide.chapters)
}
console.log(`已提取 ${guide.frames.length} 个画面，正在生成五件套...`)
const artifacts = await generateSpeedReadArtifacts({
  title, mode: job.mode, durationMs: job.durationMs, segments: job.segments, summary: job.summary, guide,
}, outputDir)
Object.assign(job, { title, speedRead: guide, artifacts: { ...job.artifacts, ...artifacts }, updatedAt: new Date().toISOString() })
await fs.writeFile(statePath, JSON.stringify(job, null, 2), 'utf8')
console.log(JSON.stringify({ title, frames: guide.frames.length, artifacts }, null, 2))
