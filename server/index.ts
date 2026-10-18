import { createApp } from './app'
import path from 'node:path'
import { createMediaProcessor } from './media-processor'
import { MediaJobManager } from './media-job-manager'
import { createSummaryService } from './summary-service'

const port = Number(process.env.PORT || 8787)
const summarize = createSummaryService()
const outputRoot = path.resolve(process.env.LIVE_NOTES_DATA_DIR || path.join(process.cwd(), 'output'), 'media-jobs')
const mediaJobs = new MediaJobManager({ processor: createMediaProcessor(summarize), outputRoot })
createApp(summarize, mediaJobs).listen(port, '127.0.0.1', () => {
  console.log(`听记已启动：http://127.0.0.1:${port}`)
})
