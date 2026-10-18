import fs from 'node:fs/promises'
import path from 'node:path'
import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from 'docx'
import JSZip from 'jszip'
import PptxGenJS from 'pptxgenjs'
import { formatClock } from '../src/domain/exporters'
import type { LiveSummary, NoteMode, TranscriptSegment } from '../src/domain/types'
import type { MediaArtifactKey, SpeedReadFrame, SpeedReadGuide } from './media-types'

interface SpeedReadExportInput {
  title: string
  mode: NoteMode
  durationMs: number
  segments: TranscriptSegment[]
  summary: LiveSummary
  guide: SpeedReadGuide
}

export type SpeedReadArtifacts = Record<'transcriptDocx' | 'guideDocx' | 'notesDocx' | 'extractedPptx' | 'xmind', string>

const safeName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '-').trim() || '音视频速读'
const xml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const finalSegments = (segments: TranscriptSegment[]) => segments.filter((segment) => segment.isFinal && segment.text.trim())

const imageParagraph = async (frame: SpeedReadFrame) => {
  if (!frame.imagePath) return undefined
  try {
    const data = await fs.readFile(frame.imagePath)
    const type = path.extname(frame.imagePath).toLowerCase() === '.png' ? 'png' as const : 'jpg' as const
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 160 },
      children: [new ImageRun({ data, type, transformation: { width: 560, height: 315 } })],
    })
  } catch { return undefined }
}

const baseDocument = (title: string, description: string, children: Paragraph[]) => new Document({
  creator: 'wuyc', title, description,
  styles: {
    default: { document: { run: { font: 'Microsoft YaHei', size: 21 }, paragraph: { spacing: { after: 110, line: 320 } } } },
    paragraphStyles: [
      { id: 'GuideTag', name: 'Guide Tag', basedOn: 'Normal', run: { color: '3157D5', bold: true, size: 19 }, paragraph: { spacing: { after: 80 } } },
    ],
  },
  sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }],
})

const titleRows = (input: SpeedReadExportInput, suffix: string) => [
  new Paragraph({ text: `${input.title}_${suffix}`, heading: HeadingLevel.TITLE }),
  new Paragraph({ children: [new TextRun(`生成时间：${new Date().toLocaleString('zh-CN')}    时长：${formatClock(input.durationMs)}`)] }),
]

const writeTranscriptDocx = async (input: SpeedReadExportInput, target: string) => {
  const children = titleRows(input, '原文')
  const frames = [...input.guide.frames].sort((left, right) => left.startMs - right.startMs)
  let frameIndex = 0
  for (const segment of finalSegments(input.segments)) {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${segment.speaker}  ${formatClock(segment.startMs)}\n`, bold: true, color: '3157D5' }),
        new TextRun(segment.text),
      ],
    }))
    while (frames[frameIndex] && frames[frameIndex].startMs <= segment.endMs) {
      const frame = frames[frameIndex]
      const image = await imageParagraph(frame)
      if (image) children.push(image)
      frameIndex += 1
    }
  }
  while (frames[frameIndex]) {
    const image = await imageParagraph(frames[frameIndex])
    if (image) children.push(image)
    frameIndex += 1
  }
  await fs.writeFile(target, await Packer.toBuffer(baseDocument(input.title, '听记音视频速读原文', children)))
}

const addBulletRows = (children: Paragraph[], values: string[]) => {
  for (const value of values) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(value)] }))
  if (!values.length) children.push(new Paragraph('暂无'))
}

const mindMapRows = (node: SpeedReadGuide['mindMap'], level = 0): Paragraph[] => [
  new Paragraph({ text: node.title, bullet: level ? { level: Math.min(8, level - 1) } : undefined }),
  ...node.children.flatMap((child) => mindMapRows(child, level + 1)),
]

const writeGuideDocx = async (input: SpeedReadExportInput, target: string) => {
  const children = titleRows(input, '导读')
  children.push(new Paragraph({ text: '关键词', heading: HeadingLevel.HEADING_1 }))
  children.push(new Paragraph({ style: 'GuideTag', text: input.guide.keywords.join('  ·  ') || '暂无' }))
  children.push(new Paragraph({ text: '全文概要', heading: HeadingLevel.HEADING_1 }), new Paragraph(input.guide.abstract || '暂无'))
  children.push(new Paragraph({ text: '章节速览', heading: HeadingLevel.HEADING_1 }))
  for (const chapter of input.guide.chapters) {
    children.push(new Paragraph({ text: `${formatClock(chapter.startMs)}  ${chapter.title}`, heading: HeadingLevel.HEADING_2 }), new Paragraph(chapter.summary))
    addBulletRows(children, chapter.keyPoints)
  }
  children.push(new Paragraph({ text: '思维导图', heading: HeadingLevel.HEADING_1 }), ...mindMapRows(input.guide.mindMap))
  children.push(new Paragraph({ text: '发言总结', heading: HeadingLevel.HEADING_1 }))
  for (const speaker of input.guide.speakerSummaries) children.push(new Paragraph({ children: [new TextRun({ text: `${speaker.speaker}  ${formatClock(speaker.sourceStartMs)}\n`, bold: true }), new TextRun(speaker.summary)] }))
  children.push(new Paragraph({ text: '要点回顾', heading: HeadingLevel.HEADING_1 }))
  for (const review of input.guide.reviews) children.push(new Paragraph({ children: [new TextRun({ text: `${review.question}\n`, bold: true }), new TextRun(`${review.answer}  ${formatClock(review.sourceStartMs)}`)] }))
  children.push(new Paragraph({ text: '提取 PPT', heading: HeadingLevel.HEADING_1 }))
  for (const frame of input.guide.frames) {
    children.push(new Paragraph({ children: [new TextRun({ text: `${formatClock(frame.startMs)}  ${frame.transcript}`, bold: true })] }))
    const image = await imageParagraph(frame)
    if (image) children.push(image)
  }
  children.push(new Paragraph({ text: '待办事项', heading: HeadingLevel.HEADING_1 }))
  addBulletRows(children, input.guide.todos.map((item) => `${item.text}${item.owner ? `｜负责人：${item.owner}` : ''}${item.due ? `｜截止：${item.due}` : ''}  ${formatClock(item.sourceStartMs)}`))
  await fs.writeFile(target, await Packer.toBuffer(baseDocument(input.title, '听记音视频速读导读', children)))
}

export const generateSpeedReadNotesDocument = async (input: SpeedReadExportInput, target: string) => {
  const children = [...titleRows(input, '笔记'), new Paragraph({ text: '我的笔记', heading: HeadingLevel.HEADING_1 })]
  for (const line of (input.guide.notes || '').split(/\r?\n/).filter(Boolean)) children.push(new Paragraph(line))
  if (!input.guide.notes.trim()) children.push(new Paragraph('暂无个人笔记，可在听记的“笔记”页签中补充。'))
  await fs.writeFile(target, await Packer.toBuffer(baseDocument(input.title, '听记音视频速读笔记', children)))
}

const writeExtractedPptx = async (input: SpeedReadExportInput, target: string) => {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'QWEN_SAMPLE', width: 13.09, height: 7.5 })
  pptx.layout = 'QWEN_SAMPLE'
  pptx.author = 'wuyc'
  pptx.subject = '按时间提取的视频画面与逐字稿'
  pptx.title = `${input.title}_PPT`
  const frames = input.guide.frames.length ? input.guide.frames : [{ startMs: 0, endMs: input.durationMs, transcript: input.guide.abstract, chapterIndex: 0 }]
  for (const frame of frames) {
    const slide = pptx.addSlide()
    slide.background = { color: '111111' }
    if (frame.imagePath) slide.addImage({ path: frame.imagePath, x: 0, y: 0, w: 13.09, h: 7.5 })
    else slide.addText(input.title, { x: 0.8, y: 2.8, w: 11.5, h: 0.9, fontFace: 'Microsoft YaHei', fontSize: 30, color: 'FFFFFF', bold: true, align: 'center', fit: 'shrink' })
    slide.addNotes(`[${formatClock(frame.startMs)}] ${frame.transcript}`)
  }
  await pptx.writeFile({ fileName: target, compression: true })
}

let xmindSequence = 0
const xmindTopic = (node: SpeedReadGuide['mindMap'], root = false): string => {
  const id = `topic-${Date.now()}-${xmindSequence += 1}`
  const children = node.children.length ? `<children><topics type="attached">${node.children.map((child) => xmindTopic(child)).join('')}</topics></children>` : ''
  return `<topic id="${id}"${root ? ' structure-class="org.xmind.ui.logic.right"' : ''}><title>${xml(node.title)}</title>${children}</topic>`
}

const writeXmind = async (input: SpeedReadExportInput, target: string) => {
  xmindSequence = 0
  const zip = new JSZip()
  const content = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0"><sheet id="sheet-1"><title>${xml(input.title)}</title>${xmindTopic(input.guide.mindMap, true)}</sheet></xmap-content>`
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="no"?><xmap-styles xmlns="urn:xmind:xmap:xmlns:style:2.0"/>'
  const meta = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><meta xmlns="urn:xmind:xmap:xmlns:meta:2.0"><Creator>wuyc</Creator><Create-Time>${new Date().toISOString()}</Create-Time></meta>`
  const manifest = '<?xml version="1.0" encoding="UTF-8" standalone="no"?><manifest xmlns="urn:xmind:xmap:xmlns:manifest:1.0"><file-entry full-path="content.xml" media-type="text/xml"/><file-entry full-path="styles.xml" media-type="text/xml"/><file-entry full-path="meta.xml" media-type="text/xml"/></manifest>'
  zip.file('content.xml', content)
  zip.file('styles.xml', styles)
  zip.file('meta.xml', meta)
  zip.file('META-INF/manifest.xml', manifest)
  await fs.writeFile(target, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

/**
 * 生成与主流音视频速读产品一致的原文、导读、笔记、抽帧 PPT 和 XMind 五件套。
 * @author wuyc
 */
export async function generateSpeedReadArtifacts(input: SpeedReadExportInput, outputDir: string): Promise<SpeedReadArtifacts> {
  await fs.mkdir(outputDir, { recursive: true })
  const base = safeName(input.title)
  const artifacts: SpeedReadArtifacts = {
    transcriptDocx: path.join(outputDir, `${base}_原文.docx`),
    guideDocx: path.join(outputDir, `${base}_导读.docx`),
    notesDocx: path.join(outputDir, `${base}_笔记.docx`),
    extractedPptx: path.join(outputDir, `${base}_PPT.pptx`),
    xmind: path.join(outputDir, `${base}_思维导图.xmind`),
  }
  await Promise.all([
    writeTranscriptDocx(input, artifacts.transcriptDocx),
    writeGuideDocx(input, artifacts.guideDocx),
    generateSpeedReadNotesDocument(input, artifacts.notesDocx),
    writeExtractedPptx(input, artifacts.extractedPptx),
    writeXmind(input, artifacts.xmind),
  ])
  return artifacts
}

export const speedReadArtifactKeys = Object.freeze(['transcriptDocx', 'guideDocx', 'notesDocx', 'extractedPptx', 'xmind'] satisfies MediaArtifactKey[])
