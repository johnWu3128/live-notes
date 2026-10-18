import { expect, test } from '@playwright/test'

test('opens the media import workflow on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: '导入音视频' }).first().click()

  await expect(page.getByRole('heading', { name: '导入音视频生成笔记与 PPT' })).toBeVisible()
  await expect(page.getByText('完整转写', { exact: true })).toBeVisible()
  await expect(page.getByText('可编辑 PPTX', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '本机路径' }).click()
  await page.getByLabel('本机文件绝对路径').fill('D:\\Videos\\lesson.mp4')
  await expect(page.getByRole('button', { name: '开始生成' })).toBeEnabled()
  await page.screenshot({ path: 'output/playwright/media-import-desktop.png', fullPage: true })
})

test('restores a media task and shows its transcript, summary and player', async ({ page }) => {
  const jobId = process.env.MEDIA_JOB_ID
  test.skip(!jobId, 'Set MEDIA_JOB_ID to exercise a live background task.')
  await page.addInitScript((id) => localStorage.setItem('live-notes.active-media-job.v1', id), jobId)
  await page.goto('/')

  await expect(page.getByText(/本地转写|结构化总结|生成 PPT|全部内容已生成/).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.segment').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('video')).toBeVisible()
  await expect(page.locator('.headline-card h2')).toBeVisible()
  await expect(page.getByText(/完成 100%|处理中/).first()).toBeVisible()
  await page.screenshot({ path: 'output/playwright/media-job-running.png', fullPage: true })
})

test('keeps the import flow usable at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '导入音视频' }).last().click()
  await expect(page.getByRole('heading', { name: '导入音视频生成笔记与 PPT' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'output/playwright/media-import-mobile.png', fullPage: true })
})
