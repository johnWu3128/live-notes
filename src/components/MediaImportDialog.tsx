import { useState, type FormEvent } from 'react'
import { FileAudio, FileVideo, FolderOpen, ShieldCheck, Upload, X } from 'lucide-react'
import type { MediaJobView } from '../domain/media'
import type { NoteMode } from '../domain/types'
import type { SummaryConfig } from '../domain/ai'

interface MediaImportDialogProps {
  mode: NoteMode
  onClose: () => void
  onCreated: (job: MediaJobView) => void
  summaryConfig: SummaryConfig
}

/**
 * 提供大文件上传和本机绝对路径两种导入方式，并显示上传进度。
 * @author wuyc
 */
export function MediaImportDialog({ mode, onClose, onCreated, summaryConfig }: MediaImportDialogProps) {
  const [sourceMode, setSourceMode] = useState<'file' | 'path'>('file')
  const [file, setFile] = useState<File>()
  const [localPath, setLocalPath] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (sourceMode === 'path') {
        const response = await fetch('/api/media/jobs/path', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: localPath, title: title || undefined, mode, summaryConfig }),
        })
        if (!response.ok) throw new Error(response.status === 404 ? '找不到文件，或格式不受支持。' : '创建任务失败。')
        onCreated(await response.json() as MediaJobView)
        return
      }
      if (!file) throw new Error('请先选择音频或视频文件。')
      const form = new FormData()
      form.append('media', file)
      form.append('mode', mode)
      if (title.trim()) form.append('title', title.trim())
      form.append('summaryConfig', JSON.stringify(summaryConfig))
      const job = await new Promise<MediaJobView>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/media/jobs/upload')
        xhr.upload.onprogress = (uploadEvent) => {
          if (uploadEvent.lengthComputable) setProgress(Math.round((uploadEvent.loaded / uploadEvent.total) * 100))
        }
        xhr.onerror = () => reject(new Error('上传连接失败。'))
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300
          ? resolve(JSON.parse(xhr.responseText) as MediaJobView)
          : reject(new Error('上传失败，请检查文件大小和格式。'))
        xhr.send(form)
      })
      onCreated(job)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入失败。')
      setBusy(false)
    }
  }

  return <div className="modal-backdrop" role="presentation">
    <section className="media-dialog" role="dialog" aria-modal="true" aria-labelledby="media-dialog-title">
      <header><div><span className="eyebrow">MEDIA SPEED READ</span><h2 id="media-dialog-title">音视频速读</h2><p>音频和视频转文字、导读、脑图、笔记与 PPT</p></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button></header>
      <div className="source-tabs">
        <button type="button" className={sourceMode === 'file' ? 'active' : ''} onClick={() => setSourceMode('file')}><Upload size={16} /> 选择文件</button>
        <button type="button" className={sourceMode === 'path' ? 'active' : ''} onClick={() => setSourceMode('path')}><FolderOpen size={16} /> 本机路径</button>
      </div>
      <form onSubmit={submit}>
        {sourceMode === 'file' ? <label className="file-drop">
          <input type="file" accept="audio/*,video/*,.mkv,.m4a,.flac" onChange={(event) => { const selected = event.target.files?.[0]; setFile(selected); if (selected && !title) setTitle(selected.name.replace(/\.[^.]+$/, '')) }} />
          {file?.type.startsWith('audio/') ? <FileAudio size={30} /> : <FileVideo size={30} />}
          <strong>{file?.name || '选择 MP4、MP3、WAV、M4A 等文件'}</strong>
          <span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '支持长视频，上传后在后台处理'}</span>
        </label> : <label className="field-label">本机文件绝对路径<input value={localPath} onChange={(event) => setLocalPath(event.target.value)} placeholder="D:\\Videos\\meeting.mp4" required /></label>}
        <label className="field-label">成果标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="留空时使用文件名" /></label>
        <div className="media-deliverables"><span>原文 Word</span><span>导读 Word</span><span>思维导图 XMind</span><span>提取 PPT</span><span>个人笔记</span><span>PDF / MD / SRT</span></div>
        <p className="privacy-note"><ShieldCheck size={15} /> 媒体与转写保存在本机；当前使用{summaryConfig.backend === 'local' ? '纯代码总结，不调用外部模型' : summaryConfig.backend === 'model' ? '直连模型总结，API Key 不落盘' : '本机 OpenClaw 总结'}。</p>
        {busy && sourceMode === 'file' && <div className="upload-progress"><i style={{ width: `${progress}%` }} /><span>正在上传 {progress}%</span></div>}
        {error && <p className="form-error">{error}</p>}
        <footer><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-small import-submit" disabled={busy || (sourceMode === 'file' ? !file : !localPath.trim())}>{busy ? '正在创建任务...' : '开始生成'}</button></footer>
      </form>
    </section>
  </div>
}
