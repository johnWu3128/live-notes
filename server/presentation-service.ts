import fs from 'node:fs/promises'
import path from 'node:path'
import PptxGenJS from 'pptxgenjs'
import type { DeckPlan, DeckSlidePlan } from './media-types'

const COLORS = {
  ink: '17211D', muted: '66716C', line: 'DCE5E0', paper: 'F7FAF8',
  green: '087A58', mint: 'DFF2E9', teal: '176B74', amber: 'C17B18', white: 'FFFFFF',
}
const FONT = 'Microsoft YaHei'

const addFooter = (slide: PptxGenJS.Slide, index: number, total: number, sourceStartMs: number) => {
  slide.addShape('line', { x: 0.65, y: 7.08, w: 12.03, h: 0, line: { color: COLORS.line, width: 1 } })
  slide.addText('听记 · 音视频智能笔记', { x: 0.68, y: 7.12, w: 3.4, h: 0.18, fontFace: FONT, fontSize: 8, color: COLORS.muted, margin: 0 })
  slide.addText(`${new Date().toLocaleDateString('zh-CN')}  ·  ${Math.floor(sourceStartMs / 60_000)}:${String(Math.floor(sourceStartMs / 1000) % 60).padStart(2, '0')}  ·  ${index}/${total}`, {
    x: 9.2, y: 7.12, w: 3.45, h: 0.18, fontFace: FONT, fontSize: 8, color: COLORS.muted, align: 'right', margin: 0,
  })
}

const addBullets = (slide: PptxGenJS.Slide, bullets: string[], options: { x: number; y: number; w: number; h: number; fontSize?: number }) => {
  const lines = bullets.length ? bullets : ['暂无可提取内容，请结合完整转写复核。']
  slide.addText(lines.map((text) => ({ text, options: { bullet: { indent: 18 }, breakLine: true } })), {
    ...options,
    fontFace: FONT,
    fontSize: options.fontSize || 18,
    color: COLORS.ink,
    breakLine: true,
    paraSpaceAfter: 12,
    valign: 'top',
    margin: 4,
    fit: 'shrink',
    lineSpacingMultiple: 1.12,
  })
}

const addStandardSlide = (pptx: PptxGenJS, item: DeckSlidePlan, index: number, total: number) => {
  const slide = pptx.addSlide()
  slide.background = { color: COLORS.paper }
  const titleFontSize = item.kind === 'chapter' && item.title.length > 22 ? 22 : 28
  slide.addText(item.title, { x: 0.68, y: 0.32, w: 11.8, h: 0.86, fontFace: FONT, fontSize: titleFontSize, bold: true, color: COLORS.ink, margin: 0, fit: 'shrink', valign: 'middle' })
  if (item.subtitle) slide.addText(item.subtitle, { x: 0.7, y: 1.2, w: 11.6, h: 0.28, fontFace: FONT, fontSize: 12, color: COLORS.teal, margin: 0, fit: 'shrink' })
  slide.addShape('rect', { x: 0, y: 0, w: 0.14, h: 7.5, line: { color: COLORS.green, transparency: 100 }, fill: { color: COLORS.green } })

  if (item.kind === 'chapter' && item.framePath) {
    addBullets(slide, item.bullets, { x: 0.72, y: 1.66, w: 5.35, h: 4.76, fontSize: 17 })
    slide.addImage({ path: item.framePath, x: 6.42, y: 1.64, w: 6.16, h: 3.8, transparency: 0 })
    slide.addShape('rect', { x: 6.42, y: 5.48, w: 6.16, h: 0.52, line: { color: COLORS.line, width: 1 }, fill: { color: COLORS.white } })
    slide.addText(`关键画面 · ${item.subtitle || ''}`, { x: 6.62, y: 5.63, w: 5.75, h: 0.18, fontFace: FONT, fontSize: 9, color: COLORS.muted, margin: 0 })
  } else {
    slide.addShape('rect', { x: 0.72, y: 1.58, w: 11.86, h: 4.92, line: { color: COLORS.line, width: 1 }, fill: { color: COLORS.white } })
    addBullets(slide, item.bullets, { x: 1.05, y: 1.86, w: 11.2, h: 4.35, fontSize: item.kind === 'agenda' ? 20 : 18 })
  }
  addFooter(slide, index, total, item.sourceStartMs)
  if (item.notes) slide.addNotes(item.notes)
  return slide
}

/**
 * 根据结构化规划生成可编辑 PPTX，章节原文写入演讲者备注便于追溯。
 * @author wuyc
 */
export async function generatePresentation(plan: DeckPlan, outputPath: string) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'wuyc'
  pptx.subject = '听记音视频智能笔记'
  pptx.title = plan.title
  pptx.company = 'Live Notes'
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT }

  plan.slides.forEach((item, itemIndex) => {
    if (item.kind !== 'cover') {
      addStandardSlide(pptx, item, itemIndex + 1, plan.slides.length)
      return
    }
    const slide = pptx.addSlide()
    slide.background = { color: COLORS.paper }
    slide.addShape('rect', { x: 0, y: 0, w: 4.55, h: 7.5, line: { color: COLORS.green, transparency: 100 }, fill: { color: COLORS.green } })
    slide.addText('LIVE NOTES', { x: 0.72, y: 0.7, w: 2.5, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: COLORS.mint, charSpacing: 2, margin: 0 })
    slide.addText('音视频智能笔记', { x: 0.72, y: 1.16, w: 3.1, h: 0.42, fontFace: FONT, fontSize: 21, bold: true, color: COLORS.white, margin: 0 })
    slide.addText('完整转写\n实时总结\n关键画面\n可编辑演示文稿', { x: 0.72, y: 3.72, w: 3.15, h: 2.1, fontFace: FONT, fontSize: 18, color: COLORS.white, breakLine: true, paraSpaceAfter: 11, margin: 0.03 })
    slide.addText(item.title, { x: 5.25, y: 1.72, w: 7.25, h: 1.55, fontFace: FONT, fontSize: 36, bold: true, color: COLORS.ink, margin: 0, fit: 'shrink', valign: 'middle' })
    slide.addText(item.subtitle || plan.subtitle, { x: 5.28, y: 3.52, w: 6.9, h: 0.75, fontFace: FONT, fontSize: 18, color: COLORS.teal, margin: 0, fit: 'shrink' })
    slide.addShape('line', { x: 5.28, y: 4.62, w: 1.3, h: 0, line: { color: COLORS.amber, width: 4 } })
    slide.addText('由听记基于本地转写自动生成', { x: 5.28, y: 5.02, w: 4.3, h: 0.35, fontFace: FONT, fontSize: 12, color: COLORS.muted, margin: 0 })
    addFooter(slide, 1, plan.slides.length, 0)
  })

  await pptx.writeFile({ fileName: outputPath, compression: true })
  const bytes = await fs.readFile(outputPath)
  if (bytes.length < 10_000 || bytes.subarray(0, 2).toString() !== 'PK') throw new Error('PPTX 文件校验失败')
  return outputPath
}
