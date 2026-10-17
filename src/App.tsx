import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import {
  Bookmark, BookOpen, Check, ChevronDown, CircleStop, Clock3, Download, FileText,
  GraduationCap, Highlighter, ListChecks, Mic, Pause, Play, RotateCcw, Search,
  ShieldCheck, Sparkles, Users, Volume2, WandSparkles,
} from 'lucide-react'
import './App.css'
import { exportMarkdown, exportSrt, formatClock } from './domain/exporters'
import { createSession, sessionReducer } from './domain/session-reducer'
import type { LiveSummary, NoteMode, NoteSession, TraceableNote } from './domain/types'
import { useLiveRecorder } from './hooks/useLiveRecorder'

const STORAGE_KEY = 'live-notes.active-session.v1'

const restoreSession = (): NoteSession => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return sessionReducer(createSession('meeting'), { type: 'restore', session: JSON.parse(saved) as NoteSession })
  } catch { /* 损坏的本地草稿不应阻止应用启动。 */ }
  return createSession('meeting')
}

const demoMeeting = [
  '今天讨论移动端第一版的发布范围。',
  '决定本周五发布第一版，先覆盖登录、消息和离线缓存。',
  '小王负责接口联调，周四前完成。',
  '李敏负责回归测试，周五上午给出报告。',
  '弱网下的同步冲突如何处理还需要确认？',
]
const demoClass = [
  '今天的核心概念是剩余部分乘法，它表示先确定一类再确定另一类。',
  '例如把七九六十三改写为六十三等于七乘九。',
  '重点是余数必须小于除数，否则还可以继续相减。',
  '为什么余数一定小于除数？这是课后需要思考的问题。',
]

const saveText = (name: string, text: string, type = 'text/plain;charset=utf-8') => {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type }))
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

const noteRows = (items: TraceableNote[], onJump: (atMs: number) => void, empty: string) => items.length
  ? items.map((item, index) => (
    <button className="note-row" key={`${item.text}-${index}`} onClick={() => onJump(item.sourceStartMs)}>
      <span className="note-dot" /><span>{item.text}</span><time>{formatClock(item.sourceStartMs)}</time>
    </button>
  ))
  : <p className="empty-note">{empty}</p>

function App() {
  const [session, dispatch] = useReducer(sessionReducer, undefined, restoreSession)
  const [now, setNow] = useState(() => new Date().getTime())
  const [query, setQuery] = useState('')
  const [currentSpeaker, setCurrentSpeaker] = useState('说话人 1')
  const [exportOpen, setExportOpen] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [notice, setNotice] = useState('笔记仅保存在当前浏览器；语音识别服务取决于浏览器设置。')
  const transcriptRef = useRef<HTMLDivElement>(null)
  const elapsedRef = useRef(0)
  const elapsed = Math.max(0, session.status === 'recording' && session.activeSince != null
    ? session.elapsedMs + now - session.activeSince
    : session.elapsedMs)

  const recorder = useLiveRecorder({
    speaker: currentSpeaker,
    getElapsedMs: () => elapsedRef.current,
    onSegment: (segment) => dispatch({ type: 'segment', segment }),
    onNotice: setNotice,
  })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => { elapsedRef.current = elapsed }, [elapsed])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, activeSince: undefined, status: session.status === 'recording' ? 'paused' : session.status }))
  }, [session])
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [session.segments])

  const filteredSegments = useMemo(
    () => session.segments.filter((item) => item.text.toLowerCase().includes(query.toLowerCase())),
    [query, session.segments],
  )

  const changeMode = (mode: NoteMode) => {
    if (session.status === 'recording' || session.segments.length) return
    dispatch({ type: 'restore', session: createSession(mode) })
  }
  const start = async () => {
    dispatch({ type: 'start', now: Date.now() })
    if (!await recorder.start()) dispatch({ type: 'pause', now: Date.now() })
  }
  const pause = () => { recorder.pause(); dispatch({ type: 'pause', now: Date.now() }) }
  const resume = async () => { dispatch({ type: 'resume', now: Date.now() }); await recorder.resume() }
  const stop = () => { recorder.stop(); dispatch({ type: 'stop', now: Date.now() }) }

  const runDemo = async () => {
    if (session.status === 'idle') dispatch({ type: 'start', now: Date.now() })
    const lines = session.mode === 'meeting' ? demoMeeting : demoClass
    const baseMs = Math.max(0, elapsedRef.current)
    for (let index = 0; index < lines.length; index += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 350))
      const startMs = baseMs + index * 4000
      dispatch({ type: 'segment', segment: { id: `demo-${Date.now()}-${index}`, text: lines[index], startMs, endMs: startMs + 3500, speaker: currentSpeaker, isFinal: true, confidence: 1 } })
    }
    dispatch({ type: 'stop', now: Date.now() })
    setNotice('演示记录已生成，可检查摘要、时间戳和导出。')
  }

  const deepenSummary = async () => {
    if (!session.segments.some((item) => item.isFinal)) return
    setAiBusy(true)
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, mode: session.mode, segments: session.segments.filter((item) => item.isFinal), currentSummary: session.summary }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json() as { summary: LiveSummary; provider: string }
      dispatch({ type: 'set-summary', summary: result.summary })
      setNotice(result.provider === 'openclaw' ? 'OpenClaw 深度总结已更新。' : '已使用本地引擎整理摘要。')
    } catch {
      setNotice('AI 深度整理暂不可用，实时本地摘要仍可正常使用。')
    } finally { setAiBusy(false) }
  }

  const jumpTo = (atMs: number) => {
    const audio = document.querySelector<HTMLAudioElement>('.audio-player')
    if (audio && recorder.audioUrl) audio.currentTime = atMs / 1000
    document.querySelector(`[data-start="${atMs}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const reset = () => {
    recorder.reset()
    dispatch({ type: 'restore', session: createSession(session.mode) })
    setNotice('已新建空白记录。')
  }
  const exportSession = (kind: 'md' | 'txt' | 'srt' | 'json') => {
    const base = session.title.replace(/[\\/:*?"<>|]/g, '-') || '实时笔记'
    const completed = { ...session, elapsedMs: elapsed }
    if (kind === 'md') saveText(`${base}.md`, exportMarkdown(completed), 'text/markdown;charset=utf-8')
    if (kind === 'txt') saveText(`${base}.txt`, session.segments.map((item) => `[${formatClock(item.startMs)}] ${item.speaker}：${item.text}`).join('\n'))
    if (kind === 'srt') saveText(`${base}.srt`, exportSrt(session.segments))
    if (kind === 'json') saveText(`${base}.json`, JSON.stringify(completed, null, 2), 'application/json;charset=utf-8')
    setExportOpen(false)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Volume2 size={18} /></span><strong>听记</strong><span>实时录音笔记</span></div>
        <div className="privacy"><ShieldCheck size={15} /> 笔记本机保存</div>
        <div className="top-actions">
          <button className="ghost-button" onClick={reset} title="新建记录"><RotateCcw size={17} /> 新建</button>
          <div className="export-wrap">
            <button className="primary-small" onClick={() => setExportOpen((value) => !value)} disabled={!session.segments.length}><Download size={17} /> 导出 <ChevronDown size={14} /></button>
            {exportOpen && <div className="export-menu">
              <button onClick={() => exportSession('md')}>Markdown 笔记</button>
              <button onClick={() => exportSession('txt')}>纯文本</button>
              <button onClick={() => exportSession('srt')}>SRT 字幕</button>
              <button onClick={() => exportSession('json')}>JSON 数据</button>
              {recorder.audioUrl && <a href={recorder.audioUrl} download={`${session.title}.webm`}>原始录音 WebM</a>}
            </div>}
          </div>
        </div>
      </header>

      <section className="session-bar">
        <input aria-label="笔记标题" value={session.title} onChange={(event) => dispatch({ type: 'rename', title: event.target.value })} />
        <div className="mode-switch" aria-label="记录场景">
          <button className={session.mode === 'meeting' ? 'active' : ''} onClick={() => changeMode('meeting')}><Users size={16} /> 会议</button>
          <button className={session.mode === 'class' ? 'active' : ''} onClick={() => changeMode('class')}><GraduationCap size={16} /> 听课</button>
        </div>
        <label className="speaker-select">当前发言人<select value={currentSpeaker} onChange={(event) => setCurrentSpeaker(event.target.value)}><option>说话人 1</option><option>说话人 2</option><option>老师</option><option>学生</option><option>主持人</option></select></label>
        <span className={`live-state ${session.status}`}><i />{session.status === 'recording' ? '正在记录' : session.status === 'paused' ? '已暂停' : session.status === 'stopped' ? '已结束' : '准备就绪'}</span>
      </section>

      <div className="workspace">
        <section className="transcript-pane">
          <div className="pane-heading"><div><span className="eyebrow">LIVE TRANSCRIPT</span><h1>实时转写</h1></div><label className="search"><Search size={16} /><input aria-label="搜索转写" placeholder="搜索内容" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
          <div className="transcript" ref={transcriptRef} aria-live="polite">
            {!filteredSegments.length && <div className="empty-state"><span><Mic size={28} /></span><h2>开始记录这段重要内容</h2><p>允许麦克风后，临时识别结果会立即出现，确认后的句子自动进入笔记。</p><button className="demo-button" onClick={runDemo}><WandSparkles size={16} /> 先看{session.mode === 'meeting' ? '会议' : '课堂'}演示</button></div>}
            {filteredSegments.map((item) => <article className={`segment ${item.isFinal ? '' : 'interim'}`} key={item.id} data-start={item.startMs}>
              <button className="avatar" onClick={() => jumpTo(item.startMs)}>{item.speaker.slice(0, 1)}</button>
              <div><div className="segment-meta"><strong>{item.speaker}</strong><time><Clock3 size={13} />{formatClock(item.startMs)}</time>{!item.isFinal && <span>识别中</span>}</div><p>{item.text}</p></div>
            </article>)}
          </div>
          {recorder.audioUrl && <audio src={recorder.audioUrl} controls className="audio-player" />}
          <div className="wave-strip" aria-hidden="true">{Array.from({ length: 52 }, (_, index) => <i key={index} style={{ height: session.status === 'recording' ? `${12 + ((index * 17) % 28)}px` : '5px' }} />)}</div>
          <div className="record-controls">
            <div className="timer"><Clock3 size={17} /><strong>{formatClock(elapsed)}</strong><span>{session.segments.filter((item) => item.isFinal).length} 段</span></div>
            <div className="main-controls">
              {session.status === 'idle' && <button className="record-button" onClick={start}><Mic size={22} /> 开始录音</button>}
              {session.status === 'recording' && <button className="round-button pause" onClick={pause} title="暂停"><Pause size={22} /></button>}
              {session.status === 'paused' && <button className="round-button play" onClick={resume} title="继续"><Play size={22} /></button>}
              {(session.status === 'recording' || session.status === 'paused') && <button className="round-button stop" onClick={stop} title="结束"><CircleStop size={22} /></button>}
            </div>
            <button className="bookmark-button" disabled={session.status === 'idle'} onClick={() => dispatch({ type: 'bookmark', atMs: elapsed })}><Bookmark size={17} /> 标记重点</button>
          </div>
        </section>

        <aside className="summary-pane">
          <div className="pane-heading summary-heading"><div><span className="eyebrow">LIVE NOTES</span><h1>实时总结</h1></div><button className="ai-button" onClick={deepenSummary} disabled={aiBusy || !session.segments.length}><Sparkles size={16} /> {aiBusy ? '整理中...' : 'AI 深度整理'}</button></div>
          <div className="summary-scroll">
            <section className="headline-card"><span>{session.summary.source === 'openclaw' ? 'OPENCLAW' : '实时提取'}</span><h2>{session.summary.headline}</h2><p>最近更新 {new Date(session.summary.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</p></section>
            <SummarySection icon={<Highlighter size={17} />} title={session.mode === 'meeting' ? '关键要点' : '知识要点'} count={session.summary.keyPoints.length}>{noteRows(session.summary.keyPoints, jumpTo, '内容出现后自动提炼')}</SummarySection>
            {session.mode === 'meeting' ? <>
              <SummarySection icon={<Check size={17} />} title="决策结论" count={session.summary.decisions.length}>{noteRows(session.summary.decisions, jumpTo, '尚未识别到明确决策')}</SummarySection>
              <SummarySection icon={<ListChecks size={17} />} title="行动项" count={session.summary.actions.length}>{session.summary.actions.length ? session.summary.actions.map((item, index) => <button className="action-row" key={`${item.text}-${index}`} onClick={() => jumpTo(item.sourceStartMs)}><span className="check-box" /><div><strong>{item.text}</strong><p>{item.owner || '待认领'} · {item.due || '时间待定'}</p></div><time>{formatClock(item.sourceStartMs)}</time></button>) : <p className="empty-note">提到负责人或待办时自动生成</p>}</SummarySection>
            </> : <SummarySection icon={<BookOpen size={17} />} title="例子与讲解" count={session.summary.examples.length}>{noteRows(session.summary.examples, jumpTo, '讲解示例会出现在这里')}</SummarySection>}
            <SummarySection icon={<FileText size={17} />} title={session.mode === 'meeting' ? '待确认问题' : '复习问题'} count={session.summary.openQuestions.length}>{noteRows(session.summary.openQuestions, jumpTo, '尚未识别到问题')}</SummarySection>
            {!!session.bookmarks.length && <SummarySection icon={<Bookmark size={17} />} title="手动重点" count={session.bookmarks.length}>{session.bookmarks.map((item) => <button className="note-row" key={item.id} onClick={() => jumpTo(item.atMs)}><span className="note-dot manual" /><span>{item.label}</span><time>{formatClock(item.atMs)}</time></button>)}</SummarySection>}
          </div>
        </aside>
      </div>
      <footer className="statusbar"><span className={recorder.error ? 'error' : ''}>{recorder.error || notice}</span><span>{recorder.supported ? 'Chrome / Edge 实时识别可用' : '当前浏览器不支持实时识别，可使用演示能力'}</span></footer>
    </main>
  )
}

function SummarySection({ icon, title, count, children }: { icon: ReactNode; title: string; count: number; children: ReactNode }) {
  return <section className="summary-section"><header>{icon}<h3>{title}</h3><span>{count}</span></header><div>{children}</div></section>
}

export default App
