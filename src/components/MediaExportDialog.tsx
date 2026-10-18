import { Download, FileAudio, FileText, FileVideo, Network, Presentation, X } from 'lucide-react'
import type { MediaArtifactKey, MediaJobView } from '../domain/media'

interface MediaExportDialogProps {
  job: MediaJobView
  onClose: () => void
}

const rows: Array<{ key: MediaArtifactKey; label: string; format: string; icon: typeof FileText }> = [
  { key: 'transcriptDocx', label: '原文', format: '.docx', icon: FileText },
  { key: 'guideDocx', label: '导读', format: '.docx', icon: FileText },
  { key: 'extractedPptx', label: '提取 PPT', format: '.pptx', icon: Presentation },
  { key: 'xmind', label: '思维导图', format: '.xmind', icon: Network },
  { key: 'notesDocx', label: '个人笔记', format: '.docx', icon: FileText },
  { key: 'docx', label: '完整结构化笔记', format: '.docx', icon: FileText },
  { key: 'pdf', label: '完整结构化笔记', format: '.pdf', icon: FileText },
  { key: 'pptx', label: '可编辑总结 PPT', format: '.pptx', icon: Presentation },
  { key: 'markdown', label: 'Markdown', format: '.md', icon: FileText },
  { key: 'srt', label: '字幕', format: '.srt', icon: FileText },
]

/**
 * 集中展示音视频速读与原有结构化成果，避免同名 PPT 的用途混淆。
 * @author wuyc
 */
export function MediaExportDialog({ job, onClose }: MediaExportDialogProps) {
  return <div className="modal-backdrop" role="presentation">
    <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
      <header><div><span className="eyebrow">EXPORT</span><h2 id="export-dialog-title">导出音视频速读成果</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button></header>
      <div className="export-list">
        {rows.filter((row) => job.artifacts[row.key]).map((row) => { const Icon = row.icon; return <a href={job.artifacts[row.key]} key={row.key}><Icon size={18} /><span><strong>{row.label}</strong><small>{row.format}</small></span><Download size={17} /></a> })}
        <a href={job.mediaUrl} download={job.sourceName}>{job.mediaKind === 'video' ? <FileVideo size={18} /> : <FileAudio size={18} />}<span><strong>原始音视频</strong><small>{job.sourceName}</small></span><Download size={17} /></a>
      </div>
    </section>
  </div>
}
