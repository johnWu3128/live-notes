import { expect, test } from '@playwright/test'

test('opens the media import workflow on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /纯代码/ })).toBeVisible()
  await page.getByRole('button', { name: /配置模型/ }).click()
  await expect(page.getByLabel('模型供应商')).toBeVisible()
  await expect(page.getByRole('button', { name: /OpenClaw/ })).toBeVisible()
  await page.getByRole('button', { name: /纯代码/ }).click()
  await page.getByRole('button', { name: '音视频速读' }).click()

  await expect(page.getByRole('heading', { name: '音视频速读' })).toBeVisible()
  await expect(page.getByText('原文 Word', { exact: true })).toBeVisible()
  await expect(page.getByText('思维导图 XMind', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '本机路径' }).click()
  await page.getByLabel('本机文件绝对路径').fill('D:\\Videos\\lesson.mp4')
  await expect(page.getByRole('button', { name: '开始生成' })).toBeEnabled()
  await page.screenshot({ path: 'output/playwright/media-import-desktop.png', fullPage: true })
})

test('offers microphone, computer audio and mixed realtime capture', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('radio', { name: '麦克风', exact: true })).toBeChecked()
  await expect(page.getByRole('radio', { name: '电脑声音', exact: true })).toBeVisible()
  await expect(page.getByRole('radio', { name: '麦克风和电脑声音', exact: true })).toBeVisible()
})

test('restores a media task and shows its transcript, speed-read guide and player', async ({ page }) => {
  const jobId = process.env.MEDIA_JOB_ID
  test.skip(!jobId, 'Set MEDIA_JOB_ID to exercise a live background task.')
  await page.addInitScript((id) => localStorage.setItem('live-notes.active-media-job.v1', id), jobId)
  await page.goto('/')

  await expect(page.getByText(/本地转写|结构化总结|生成 PPT|全部内容已生成/).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.segment').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('video')).toBeVisible()
  await expect(page.getByRole('tab', { name: '导读', exact: true })).toBeVisible()
  await expect(page.getByText('全文概要')).toBeVisible()
  await expect(page.getByText(/完成 100%|处理中/).first()).toBeVisible()
  await page.screenshot({ path: 'output/playwright/media-job-running.png', fullPage: true })
})

test('keeps the import flow usable at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '导入音视频' }).last().click()
  await expect(page.getByRole('heading', { name: '音视频速读' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'output/playwright/media-import-mobile.png', fullPage: true })
})

test('shows speed-read guide, mind map, notes and all benchmark exports', async ({ page }) => {
  const job = {
    id: 'speed-read-demo', title: '宝武智能体实操', mode: 'class', sourceName: 'demo.mp4', status: 'completed', stage: 'completed',
    progress: 100, message: '全部内容已生成', durationMs: 120_000, mediaKind: 'video', mediaUrl: '/demo.mp4',
    segments: [{ id: '1', text: '创建知识库并上传文档。', startMs: 0, endMs: 30_000, speaker: '讲者', isFinal: true }],
    summary: { headline: '知识库实操', topics: [], keyPoints: [], decisions: [], actions: [], openQuestions: [], examples: [], updatedAt: new Date().toISOString(), source: 'local' },
    speedRead: {
      keywords: ['知识库', '智能体'], abstract: '课程演示知识库与智能体配置。',
      chapters: [{ title: '知识库构建', summary: '上传文档并分块。', startMs: 0, endMs: 120_000, keyPoints: ['上传文档'] }],
      speakerSummaries: [{ speaker: '讲者', summary: '讲解知识库构建。', sourceStartMs: 0 }],
      reviews: [{ question: '如何构建知识库？', answer: '上传文档并分块。', sourceStartMs: 0 }], todos: [],
      mindMap: { title: '智能体实操', children: [{ title: '知识库构建', children: [{ title: '上传文档', children: [] }] }] }, notes: '',
      frames: [{ startMs: 0, endMs: 30_000, transcript: '创建知识库。', chapterIndex: 0 }],
    },
    artifacts: {
      transcriptDocx: '/api/transcript', guideDocx: '/api/guide', notesDocx: '/api/notes', extractedPptx: '/api/extracted', xmind: '/api/xmind',
      docx: '/api/docx', pdf: '/api/pdf', pptx: '/api/pptx', markdown: '/api/md', srt: '/api/srt',
    },
  }
  await page.route('**/api/media/jobs/speed-read-demo', (route) => route.fulfill({ json: job }))
  await page.addInitScript(() => localStorage.setItem('live-notes.active-media-job.v1', 'speed-read-demo'))
  await page.goto('/')

  await expect(page.getByRole('tab', { name: '导读', exact: true })).toBeVisible()
  await expect(page.getByText('课程演示知识库与智能体配置。')).toBeVisible()
  await page.getByRole('tab', { name: '脑图' }).click()
  await expect(page.getByText('上传文档', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '笔记' }).click()
  await expect(page.getByPlaceholder(/记录补充观点/)).toBeVisible()
  await page.getByRole('button', { name: /导出/ }).click()
  await expect(page.getByRole('heading', { name: '导出音视频速读成果' })).toBeVisible()
  await expect(page.getByText('原文', { exact: true })).toBeVisible()
  await expect(page.getByText('思维导图', { exact: true })).toBeVisible()
  await expect(page.getByText('提取 PPT', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'output/playwright/speed-read-export.png', fullPage: true })
})
