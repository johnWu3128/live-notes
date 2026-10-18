import { useState } from 'react'
import { CheckCircle2, FilePenLine, ListTree, MessageSquareText, Presentation, Save, Tags } from 'lucide-react'
import { formatClock } from '../domain/exporters'
import type { MediaJobView, MindMapNode } from '../domain/media'

interface SpeedReadPanelProps {
  job: MediaJobView
  onJump: (atMs: number) => void
  onUpdated: (job: MediaJobView) => void
  onNotice: (message: string) => void
}

const MindMapBranch = ({ node, depth = 0 }: { node: MindMapNode; depth?: number }) => <li>
  <span>{node.title}</span>
  {!!node.children.length && <ul>{node.children.map((child, index) => <MindMapBranch key={`${child.title}-${index}`} node={child} depth={depth + 1} />)}</ul>}
</li>

/**
 * 展示音视频导读、脑图和个人笔记，并保留所有内容的时间溯源能力。
 * @author wuyc
 */
export function SpeedReadPanel({ job, onJump, onUpdated, onNotice }: SpeedReadPanelProps) {
  const guide = job.speedRead
  const [tab, setTab] = useState<'guide' | 'mindmap' | 'notes'>('guide')
  const [guideTab, setGuideTab] = useState<'chapters' | 'speakers' | 'reviews' | 'todos' | 'slides'>('chapters')
  const [notes, setNotes] = useState(guide?.notes || '')
  const [saving, setSaving] = useState(false)
  if (!guide) return null

  const saveNotes = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/media/jobs/${job.id}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }),
      })
      if (!response.ok) throw new Error(String(response.status))
      onUpdated(await response.json() as MediaJobView)
      onNotice('笔记已保存，并重新生成笔记 Word。')
    } catch { onNotice('笔记保存失败，请检查后台服务。') }
    finally { setSaving(false) }
  }

  return <aside className="summary-pane speed-read-pane">
    <div className="speed-read-tabs" role="tablist" aria-label="音视频速读">
      <button role="tab" aria-selected={tab === 'guide'} className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}>导读</button>
      <button role="tab" aria-selected={tab === 'mindmap'} className={tab === 'mindmap' ? 'active' : ''} onClick={() => setTab('mindmap')}>脑图</button>
      <button role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>笔记</button>
    </div>
    <div className="speed-read-scroll">
      {tab === 'guide' && <>
        <section className="guide-overview">
          <h2><Tags size={17} /> 关键词</h2><div className="keyword-list">{guide.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
          <h2>全文概要</h2><p>{guide.abstract}</p>
        </section>
        <div className="guide-subtabs" role="tablist" aria-label="导读内容">
          {([['chapters', '章节速览'], ['speakers', '发言总结'], ['reviews', '要点回顾'], ['todos', '待办事项'], ['slides', '提取PPT']] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={guideTab === value} className={guideTab === value ? 'active' : ''} onClick={() => setGuideTab(value)}>{label}</button>)}
        </div>
        <div className="guide-content">
          {guideTab === 'chapters' && guide.chapters.map((chapter) => <button className="chapter-row" key={`${chapter.startMs}-${chapter.title}`} onClick={() => onJump(chapter.startMs)}><time>{formatClock(chapter.startMs)}</time><span><strong>{chapter.title}</strong><p>{chapter.summary}</p></span></button>)}
          {guideTab === 'speakers' && guide.speakerSummaries.map((speaker) => <button className="guide-row" key={`${speaker.speaker}-${speaker.sourceStartMs}`} onClick={() => onJump(speaker.sourceStartMs)}><MessageSquareText size={17} /><span><strong>{speaker.speaker}</strong><p>{speaker.summary}</p></span></button>)}
          {guideTab === 'reviews' && guide.reviews.map((review, index) => <button className="review-row" key={`${review.sourceStartMs}-${index}`} onClick={() => onJump(review.sourceStartMs)}><strong>{review.question}</strong><span>{review.answer}</span><time>{formatClock(review.sourceStartMs)}</time></button>)}
          {guideTab === 'todos' && (guide.todos.length ? guide.todos.map((todo, index) => <button className="guide-row" key={`${todo.sourceStartMs}-${index}`} onClick={() => onJump(todo.sourceStartMs)}><CheckCircle2 size={17} /><span><strong>{todo.text}</strong><p>{todo.owner || '待认领'} · {todo.due || '时间待定'}</p></span></button>) : <p className="empty-note">未识别到明确待办</p>)}
          {guideTab === 'slides' && <div className="frame-grid">{guide.frames.map((frame, index) => <button key={`${frame.startMs}-${index}`} onClick={() => onJump(frame.startMs)}>{frame.imageUrl ? <img src={frame.imageUrl} alt={`${formatClock(frame.startMs)} 视频画面`} loading="lazy" /> : <span className="frame-placeholder"><Presentation /></span>}<strong>{formatClock(frame.startMs)}</strong><p>{frame.transcript || '该画面附近暂无转写'}</p></button>)}</div>}
        </div>
      </>}
      {tab === 'mindmap' && <section className="mindmap-view"><h2><ListTree size={18} /> {guide.mindMap.title}</h2><ul>{guide.mindMap.children.map((node, index) => <MindMapBranch key={`${node.title}-${index}`} node={node} />)}</ul></section>}
      {tab === 'notes' && <section className="notes-editor"><h2><FilePenLine size={18} /> 我的笔记</h2><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="记录补充观点、问题、结论或复习计划..." /><button className="primary-small" onClick={() => void saveNotes()} disabled={saving}><Save size={16} /> {saving ? '保存中...' : '保存并更新 Word'}</button></section>}
    </div>
  </aside>
}
