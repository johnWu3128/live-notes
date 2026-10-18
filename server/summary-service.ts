import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { createSummary } from '../src/domain/summary-engine'
import type { LiveSummary, NoteMode, TranscriptSegment } from '../src/domain/types'

const execFileAsync = promisify(execFile)

const noteSchema = z.object({ text: z.string().min(1), sourceStartMs: z.number().nonnegative() })
const summarySchema = z.object({
  headline: z.union([z.string().min(1), noteSchema]),
  topics: z.array(noteSchema).default([]),
  keyPoints: z.array(noteSchema).default([]),
  decisions: z.array(noteSchema).default([]),
  actions: z.array(noteSchema.extend({ owner: z.string().optional(), due: z.string().optional() })).default([]),
  openQuestions: z.array(noteSchema).default([]),
  examples: z.array(noteSchema).default([]),
})

export interface SummaryRequest {
  sessionId: string
  mode: NoteMode
  segments: TranscriptSegment[]
  currentSummary?: LiveSummary
}
export interface SummaryResult { summary: LiveSummary; provider: 'openclaw' | 'local' }
export type OpenClawRunner = (prompt: string, sessionId: string) => Promise<string>
let resolvedAgentId = process.env.OPENCLAW_AGENT || 'architect'

const findText = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.includes('{') ? value : undefined
  if (Array.isArray(value)) {
    for (const item of value) { const found = findText(item); if (found) return found }
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) { const found = findText(child); if (found) return found }
  }
  return undefined
}

const parseOpenClawSummary = (raw: string, mode: NoteMode, segments: TranscriptSegment[]): LiveSummary => {
  let content = raw
  try { content = findText(JSON.parse(raw)) || raw } catch { /* 允许 CLI 直接返回模型文本。 */ }
  const jsonText = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || content.match(/\{[\s\S]*\}/)?.[0]
  if (!jsonText) throw new Error('OpenClaw response does not contain JSON')
  const parsed = summarySchema.parse(JSON.parse(jsonText))
  const starts = segments.map((item) => item.startMs)
  const nearestStart = (value: number) => starts.reduce((nearest, start) => Math.abs(start - value) < Math.abs(nearest - value) ? start : nearest, starts[0] || 0)
  const trace = <T extends { sourceStartMs: number }>(items: T[]) => items.map((item) => ({ ...item, sourceStartMs: nearestStart(item.sourceStartMs) }))
  const local = createSummary(mode, segments)
  const mergeNotes = <T extends { text: string; sourceStartMs: number }>(ai: T[], fallback: T[]) => {
    const combined = [...ai, ...fallback]
    return combined.filter((item, index) => combined.findIndex((other) => other.sourceStartMs === item.sourceStartMs && other.text.replace(/\W/g, '') === item.text.replace(/\W/g, '')) === index)
  }
  const aiActions = trace(parsed.actions).map((item) => {
    const fallback = local.actions.find((action) => action.sourceStartMs === item.sourceStartMs)
    return { ...item, owner: item.owner || fallback?.owner, due: item.due || fallback?.due }
  })
  return {
    headline: typeof parsed.headline === 'string' ? parsed.headline : parsed.headline.text,
    topics: trace(parsed.topics),
    keyPoints: mergeNotes(trace(parsed.keyPoints), local.keyPoints),
    decisions: mergeNotes(trace(parsed.decisions), local.decisions),
    actions: mergeNotes(aiActions, local.actions),
    openQuestions: mergeNotes(trace(parsed.openQuestions), local.openQuestions),
    examples: mergeNotes(trace(parsed.examples), local.examples),
    updatedAt: new Date().toISOString(),
    source: 'openclaw',
  }
}

const buildPrompt = ({ mode, segments }: SummaryRequest) => {
  const lines = segments.map((item) => `[ms=${item.startMs}][${item.speaker}] ${item.text}`)
  const stride = Math.max(1, Math.ceil(lines.join('\n').length / 90_000))
  const transcript = lines.filter((_, index) => index % stride === 0).join('\n')
  const scene = mode === 'meeting'
    ? '会议：重点提取议题、决策、行动项、负责人、截止时间、风险和待确认问题。'
    : '课堂：重点提取知识结构、核心概念、例子、易错点和复习问题；actions 与 decisions 可为空。'
  return `你是实时录音笔记整理器。${scene}\n仅依据下方转写，不补充不存在的事实。每个条目的 sourceStartMs 必须使用原文对应行的 ms。输出单个 JSON 对象，不要解释、不要 Markdown。headline 必须是字符串。字段固定为：headline, topics, keyPoints, decisions, actions, openQuestions, examples。topics/keyPoints/decisions/openQuestions/examples 的元素仅含 text 和 sourceStartMs；actions 的元素必须含 text、sourceStartMs，并尽量提取 owner 和 due。\n\n<transcript>\n${transcript}\n</transcript>`
}

export const runOpenClaw: OpenClawRunner = async (prompt, sessionId) => {
  const entry = process.env.OPENCLAW_ENTRY || path.join(path.dirname(process.execPath), 'node_modules', 'openclaw', 'openclaw.mjs')
  const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'default'
  const promptDir = await fs.mkdtemp(path.join(os.tmpdir(), 'live-notes-openclaw-'))
  const promptPath = path.join(promptDir, 'prompt.txt')
  await fs.writeFile(promptPath, prompt, { encoding: 'utf8', mode: 0o600 })
  const execute = async (agentId: string) => {
    const args = [entry, 'agent', '--agent', agentId, '--session-key', `agent:${agentId}:live-notes-${safeSession}`, '--message-file', promptPath, '--thinking', 'off', '--timeout', '180', '--json']
    return (await execFileAsync(process.execPath, args, { windowsHide: true, timeout: 210_000, maxBuffer: 8 * 1024 * 1024 })).stdout
  }
  try {
    try { return await execute(resolvedAgentId) }
    catch (firstError) {
      if (process.env.OPENCLAW_AGENT) throw firstError
      const { stdout } = await execFileAsync(process.execPath, [entry, 'agents', 'list', '--json'], { windowsHide: true, timeout: 45_000, maxBuffer: 2 * 1024 * 1024 })
      const agents = z.array(z.object({ id: z.string().min(1) })).parse(JSON.parse(stdout))
      const fallback = agents.find((agent) => agent.id === 'architect')?.id || agents.find((agent) => agent.id === 'coordinator')?.id || agents[0]?.id
      if (!fallback || fallback === resolvedAgentId) throw firstError
      resolvedAgentId = fallback
      return execute(fallback)
    }
  } finally { await fs.rm(promptDir, { recursive: true, force: true }) }
}

export function createSummaryService(runner: OpenClawRunner = runOpenClaw) {
  return async (request: SummaryRequest): Promise<SummaryResult> => {
    try {
      const raw = await runner(buildPrompt(request), request.sessionId)
      return { summary: parseOpenClawSummary(raw, request.mode, request.segments), provider: 'openclaw' }
    } catch {
      return { summary: createSummary(request.mode, request.segments), provider: 'local' }
    }
  }
}
