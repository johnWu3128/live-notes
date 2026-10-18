---
name: live-meeting-notes
description: "启动、使用和排查本机听记 Live Notes，完成会议或课堂实时录音转写，也可把音频或视频生成增量摘要、完整笔记、字幕、关键画面和可编辑 PPT。用户提到录音转文字、实时会议纪要、听课笔记、音视频转 PPT、边听边总结、听记或 live-notes 时使用。"
---

# 实时会议笔记

使用本机 `听记` 完成一次可恢复、可追溯的实时记录。项目默认位于 `C:\Users\Administrator\Documents\Codex\2026-10-17\live-notes`，可用 `LIVE_NOTES_HOME` 覆盖。

## 启动

1. 运行 `scripts/launch.ps1`。脚本检查 Node.js 20+、依赖、构建产物和 `/api/health`，然后打开 `http://127.0.0.1:8787`。
2. 若只做状态检查，运行 `scripts/health.ps1`。
3. 不要代替用户静默开启麦克风。录音前说明浏览器语音识别可能使用在线服务，并让用户在页面中主动点击“开始录音”和授权。

## 记录流程

1. 选择“会议”或“听课”；有转写内容后不能直接切换，需新建记录。
2. 需要区分发言时，在顶部切换当前发言人。当前版本是手动标记，不要声称自动声纹分离。
3. 录音中可暂停、继续、结束和“标记重点”。临时识别结果颜色较淡，确认后进入正式转写与本地摘要。
4. 会议模式检查关键要点、决策、行动项、负责人/截止时间、待确认问题；听课模式检查知识点、例子和复习问题。
5. 内容稳定后点击“AI 深度整理”。出现 `OPENCLAW` 表示模型总结成功；若仍是“实时提取”，本地降级摘要仍可使用。
6. 点击摘要时间戳回到对应转写/录音位置。结束后按需导出 Markdown、TXT、SRT、JSON 或原始 WebM。

## 音视频转笔记与 PPT

1. 先选择“会议”或“听课”，再点击右上角“导入音视频”。
2. 普通素材选择文件；本机数百 MB 长视频优先使用“本机路径”，填写绝对路径后由服务端直读。
3. 后台依次执行媒体探测、16kHz 音轨提取、`faster-whisper` 增量转写、OpenClaw 总结、关键帧提取和 PPTX 生成。页面关闭不会主动取消已经开始的后台任务。
4. 处理中检查进度和新增转写；完成后从“导出”下载 PowerPoint、Markdown、TXT、SRT 和 JSON。
5. PPT 正文是可编辑文本，视频画面按章节时间戳嵌入；完整章节原文在演讲者备注，完整逐字稿同时保存在 Markdown/TXT/SRT/JSON。
6. 敏感素材默认只留在本机 `output/`。OpenClaw 深度总结仍会把转写发送到当前配置的模型供应商，应先确认组织政策。

## 验收

需要代用户验证时，先使用页面的“先看会议演示”或“先看课堂演示”，不要采集真实环境声音。按 `references/acceptance.md` 检查；真实麦克风验收必须由用户明确触发。

## 排查

- 页面打不开：运行 `scripts/health.ps1`，失败后运行项目目录下 `npm run build`、`npm start` 查看日志。
- 麦克风失败：确认使用最新版 Chrome/Edge、地址栏权限和 Windows 麦克风隐私设置。
- 转写无结果：浏览器识别依赖网络和浏览器服务；录音仍可结束并下载。
- 深度总结失败：检查本机 OpenClaw 是否可用、模型是否正常；应用会自动保留本地摘要，不要删除已有转写。
- 音视频任务失败：确认 `ffmpeg`、`ffprobe` 在 PATH 中，且某个 Python 能执行 `import faster_whisper`；可用 `LIVE_NOTES_PYTHON` 指定解释器。
- OpenClaw 升级后总结回退：运行 `openclaw config validate`、`openclaw agents list` 和 `openclaw gateway status --deep`。CLI 与 Gateway 版本必须一致，且 `architect` 代理必须存在。
- 转写较慢：默认 `small/int8` 适合 CPU；首次模型下载最慢。高精度可设置 `LIVE_NOTES_WHISPER_MODEL=medium`，但处理时间和内存都会增加。
- 专有名词识别不准：设置 `LIVE_NOTES_INITIAL_PROMPT` 提供逗号分隔的产品名、系统名和术语；需要指定总结代理时设置 `OPENCLAW_AGENT`。
- 会话意外关闭：重新打开后文本和摘要从浏览器本地存储恢复，正在录音的状态会恢复为暂停。

## 停止

由技能脚本启动的后台进程使用 `scripts/stop.ps1` 停止。不要结束其他 Node/OpenClaw 进程。
