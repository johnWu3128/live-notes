import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { emptySummary } from '../src/domain/types'
import { createSummary } from '../src/domain/summary-engine'
import type { MediaArtifactKey, MediaJob, MediaJobInput, MediaProcessor } from './media-types'
import { generateSpeedReadNotesDocument } from './speed-read-export-service'

interface MediaJobManagerOptions {
  processor: MediaProcessor
  outputRoot: string
  persist?: boolean
}

/**
 * 管理长音视频任务，保证转写过程中可持续轮询且失败信息不会丢失。
 * @author wuyc
 */
export class MediaJobManager {
  private readonly jobs = new Map<string, MediaJob>()
  private readonly processor: MediaProcessor
  private readonly outputRoot: string
  private readonly persistEnabled: boolean
  private queue: Promise<void> = Promise.resolve()

  constructor(options: MediaJobManagerOptions) {
    this.processor = options.processor
    this.outputRoot = options.outputRoot
    this.persistEnabled = options.persist !== false
    this.loadExistingJobs()
  }

  async create(input: MediaJobInput) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const job: MediaJob = {
      id,
      title: input.title,
      mode: input.mode,
      sourceName: input.sourceName || path.basename(input.sourcePath),
      sourcePath: input.sourcePath,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      message: '任务已创建，等待处理',
      createdAt: now,
      updatedAt: now,
      durationMs: 0,
      segments: [],
      summary: emptySummary(),
      artifacts: {},
    }
    this.jobs.set(id, job)
    this.persist(job)
    this.queue = this.queue.then(() => this.run(job, input))
    return this.publicJob(job)
  }

  get(id: string) {
    const job = this.jobs.get(id)
    return job ? this.publicJob(job) : undefined
  }

  getArtifact(id: string, key: MediaArtifactKey) {
    return this.jobs.get(id)?.artifacts[key]
  }

  getSource(id: string) {
    return this.jobs.get(id)?.sourcePath
  }

  getSpeedReadFrame(id: string, index: number) {
    return this.jobs.get(id)?.speedRead?.frames[index]?.imagePath
  }

  async updateNotes(id: string, notes: string) {
    const job = this.jobs.get(id)
    if (!job?.speedRead || job.status !== 'completed') return undefined
    job.speedRead.notes = notes
    job.updatedAt = new Date().toISOString()
    const target = job.artifacts.notesDocx
    if (target) {
      await generateSpeedReadNotesDocument({
        title: job.title, mode: job.mode, durationMs: job.durationMs, segments: job.segments,
        summary: job.summary, guide: job.speedRead,
      }, target)
    }
    this.persist(job)
    return this.publicJob(job)
  }

  private async run(job: MediaJob, input: MediaJobInput) {
    job.status = 'processing'
    job.updatedAt = new Date().toISOString()
    try {
      const result = await this.processor({ ...input, jobId: job.id, outputDir: path.resolve(this.outputRoot, job.id) }, {
        update: (change) => {
          const previousStage = job.stage
          Object.assign(job, change, { status: 'processing', updatedAt: new Date().toISOString() })
          if (change.stage && change.stage !== previousStage) this.persist(job)
        },
        segment: (segment) => {
          job.segments.push(segment)
          job.summary = createSummary(job.mode, job.segments)
          job.updatedAt = new Date().toISOString()
          if (job.segments.length % 25 === 0) this.persist(job)
        },
      })
      Object.assign(job, result, {
        status: 'completed',
        stage: 'completed',
        progress: 100,
        message: '全部内容已生成',
        updatedAt: new Date().toISOString(),
      })
      this.persist(job)
    } catch (error) {
      Object.assign(job, {
        status: 'failed',
        stage: 'failed',
        message: '处理失败',
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      })
      this.persist(job)
    }
  }

  private persist(job: MediaJob) {
    if (!this.persistEnabled) return
    const directory = path.resolve(this.outputRoot, job.id)
    fs.mkdirSync(directory, { recursive: true })
    const target = path.join(directory, 'job.json')
    const temporary = `${target}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(job, null, 2), 'utf8')
    fs.renameSync(temporary, target)
  }

  private loadExistingJobs() {
    if (!this.persistEnabled || !fs.existsSync(this.outputRoot)) return
    for (const entry of fs.readdirSync(this.outputRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const statePath = path.join(this.outputRoot, entry.name, 'job.json')
      if (!fs.existsSync(statePath)) continue
      try {
        const job = JSON.parse(fs.readFileSync(statePath, 'utf8')) as MediaJob
        if (!job.id || !Array.isArray(job.segments) || !job.summary) continue
        if (job.status === 'queued' || job.status === 'processing') {
          Object.assign(job, { status: 'failed', stage: 'failed', message: '服务重启导致任务中断，请重新导入素材', error: '任务处理中服务被关闭', updatedAt: new Date().toISOString() })
        }
        this.jobs.set(job.id, job)
        if (job.status === 'failed' && job.error === '任务处理中服务被关闭') this.persist(job)
      } catch { /* 损坏的单个任务状态不应阻止服务启动。 */ }
    }
  }

  private publicJob(job: MediaJob) {
    const { sourcePath: _sourcePath, ...visible } = job
    return {
      ...visible,
      artifacts: Object.fromEntries(Object.keys(job.artifacts).map((key) => [key, `/api/media/jobs/${job.id}/artifacts/${key}`])),
      speedRead: job.speedRead ? {
        ...job.speedRead,
        frames: job.speedRead.frames.map(({ imagePath: _imagePath, ...frame }, index) => ({
          ...frame,
          imageUrl: _imagePath ? `/api/media/jobs/${job.id}/frames/${index}` : undefined,
        })),
      } : undefined,
      mediaUrl: `/api/media/jobs/${job.id}/media`,
    }
  }
}
