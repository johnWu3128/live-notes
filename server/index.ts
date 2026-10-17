import { createApp } from './app'
import { createSummaryService } from './summary-service'

const port = Number(process.env.PORT || 8787)
createApp(createSummaryService()).listen(port, '127.0.0.1', () => {
  console.log(`听记已启动：http://127.0.0.1:${port}`)
})
