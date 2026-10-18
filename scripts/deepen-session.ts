import fs from 'node:fs/promises'
import path from 'node:path'
import type { NoteSession } from '../src/domain/types'
import { createSummaryService } from '../server/summary-service'

/**
 * 对已有完整转写执行 OpenClaw 深度整理，并保留整理前备份。
 * @author wuyc
 */
async function main() {
  const [requestedPath] = process.argv.slice(2)
  if (!requestedPath) throw new Error('用法：npm run deepen:session -- <session.json>')
  const sessionPath = path.resolve(requestedPath)
  const session = JSON.parse(await fs.readFile(sessionPath, 'utf8')) as NoteSession
  const result = await createSummaryService()({ sessionId: `${session.id}-deep`, mode: session.mode, segments: session.segments, currentSummary: session.summary })
  if (result.provider !== 'openclaw') throw new Error('OpenClaw 深度总结失败，原文件未修改')
  await fs.copyFile(sessionPath, `${sessionPath}.pre-openclaw.json`)
  session.summary = result.summary
  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf8')
  console.log(JSON.stringify({ provider: result.provider, headline: result.summary.headline, topics: result.summary.topics.length, keyPoints: result.summary.keyPoints.length }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
