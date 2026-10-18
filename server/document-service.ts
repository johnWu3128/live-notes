import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import PDFDocument from 'pdfkit'
import { exportMarkdown, formatClock } from '../src/domain/exporters'
import type { NoteSession, TraceableNote } from '../src/domain/types'
import { buildDeckPlan } from './media-plan'
import { generatePresentation } from './presentation-service'

export interface SessionDocumentArtifacts {
  docx: string
  pdf: string
  pptx: string
  markdown: string
}

const safeName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '-').trim() || '听记笔记'
const sections = (session: NoteSession): Array<[string, TraceableNote[]]> => session.mode === 'meeting'
  ? [['关键要点', session.summary.keyPoints], ['决策结论', session.summary.decisions], ['行动项', session.summary.actions], ['待确认问题', session.summary.openQuestions]]
  : [['知识要点', session.summary.keyPoints], ['示例与讲解', session.summary.examples], ['复习问题', session.summary.openQuestions]]

const noteParagraphs = (items: TraceableNote[]) => items.length
  ? items.map((item) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun(`${item.text}  ${formatClock(item.sourceStartMs)}`)] }))
  : [new Paragraph('暂无')]

/**
 * 生成结构化、可编辑的 Word 会议纪要或课堂笔记。
 * @author wuyc
 */
export async function generateWordDocument(session: NoteSession, outputPath: string) {
  const children: Paragraph[] = [
    new Paragraph({ text: session.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: session.summary.headline, bold: true, size: 28 })] }),
    new Paragraph(`场景：${session.mode === 'meeting' ? '会议' : '听课'}    时长：${formatClock(session.elapsedMs)}`),
  ]
  for (const [title, items] of sections(session)) {
    children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }), ...noteParagraphs(items))
  }
  children.push(new Paragraph({ text: '完整转写', heading: HeadingLevel.HEADING_1 }))
  for (const segment of session.segments.filter((item) => item.isFinal)) {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `[${formatClock(segment.startMs)}] ${segment.speaker}  `, bold: true }),
        new TextRun(segment.text),
      ],
    }))
  }
  const document = new Document({
    creator: 'wuyc', title: session.title, description: '听记自动生成的结构化笔记',
    styles: { default: { document: { run: { font: 'Microsoft YaHei', size: 22 }, paragraph: { spacing: { after: 120, line: 320 } } } } },
    sections: [{ properties: {}, children }],
  })
  await fs.writeFile(outputPath, await Packer.toBuffer(document))
  return outputPath
}

const findPdfFont = () => [
  process.env.LIVE_NOTES_PDF_FONT,
  'C:\\Windows\\Fonts\\simhei.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
].find((candidate): candidate is string => Boolean(candidate && fsSync.existsSync(candidate)))

/**
 * 生成嵌入字体的 PDF，保证中文摘要和逐字稿可独立查看。
 * @author wuyc
 */
export async function generatePdfDocument(session: NoteSession, outputPath: string) {
  await new Promise<void>((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margins: { top: 50, right: 54, bottom: 50, left: 54 }, info: { Title: session.title, Author: 'wuyc' } })
    const stream = fsSync.createWriteStream(outputPath)
    document.pipe(stream)
    const font = findPdfFont()
    if (font) document.font(font)
    document.fontSize(22).text(session.title)
    document.moveDown(0.5).fontSize(13).text(session.summary.headline)
    document.moveDown(0.5).fontSize(10).fillColor('#66716C').text(`场景：${session.mode === 'meeting' ? '会议' : '听课'}    时长：${formatClock(session.elapsedMs)}`)
    document.fillColor('#17211D')
    for (const [title, items] of sections(session)) {
      document.moveDown().fontSize(15).text(title)
      document.fontSize(10)
      if (!items.length) document.text('暂无')
      for (const item of items) document.text(`- ${item.text}  ${formatClock(item.sourceStartMs)}`, { indent: 10 })
    }
    if (document.y > 650) document.addPage()
    else document.moveDown(1.2)
    document.fontSize(16).text('完整转写').moveDown(0.5).fontSize(9.5)
    for (const segment of session.segments.filter((item) => item.isFinal)) document.text(`[${formatClock(segment.startMs)}] ${segment.speaker}：${segment.text}`)
    document.end()
    stream.once('finish', resolve)
    stream.once('error', reject)
    document.once('error', reject)
  })
  return outputPath
}

/**
 * 一次生成 Word、PDF、PowerPoint 和 Markdown 四种常用成果。
 * @author wuyc
 */
export async function generateSessionDocuments(session: NoteSession, outputDir: string): Promise<SessionDocumentArtifacts> {
  await fs.mkdir(outputDir, { recursive: true })
  const base = safeName(session.title)
  const artifacts = {
    docx: path.join(outputDir, `${base}.docx`),
    pdf: path.join(outputDir, `${base}.pdf`),
    pptx: path.join(outputDir, `${base}.pptx`),
    markdown: path.join(outputDir, `${base}.md`),
  }
  const plan = buildDeckPlan({
    title: session.title, mode: session.mode, durationMs: session.elapsedMs, segments: session.segments,
    summary: session.summary, sourceName: '实时记录', hasVideo: false,
  })
  await Promise.all([
    generateWordDocument(session, artifacts.docx),
    generatePdfDocument(session, artifacts.pdf),
    generatePresentation(plan, artifacts.pptx),
    fs.writeFile(artifacts.markdown, exportMarkdown(session), 'utf8'),
  ])
  return artifacts
}
