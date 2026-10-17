# 听记 Live Notes

面向会议和听课场景的实时录音转写与结构化笔记工具。录音时同步显示临时/最终转写，立即提取关键要点，并可调用本机 OpenClaw 生成更完整的决策、行动项和复习笔记。

![听记桌面界面](docs/assets/live-notes-desktop.png)

## 核心能力

- Chrome / Edge 连续实时转写，保留原始录音并支持暂停、继续、结束。
- 会议与听课双模板：决策、负责人、截止时间、待确认问题；知识点、例子和复习问题。
- 本地增量摘要即时可用，OpenClaw 深度总结失败时自动降级且不丢已提取事实。
- 每条摘要关联转写时间戳，可点击回到对应文本或录音位置。
- 手动切换发言人、标记重点、全文搜索、异常会话恢复。
- 导出 Markdown、TXT、SRT、JSON 和原始 WebM 录音。
- 响应式双栏/单栏界面，桌面会议与移动记录都可用。

功能基线参考了[通义听悟](https://tingwu.aliyun.com/)的实时转写与章节/待办、[讯飞听见](https://www.iflyrec.com/html/products/apiv1.html)的角色/术语与学习整理，以及[飞书妙记](https://www.feishu.cn/product/minutes)的时间轴、结构化纪要和行动项。这里的“Top 3 基线”指三类头部产品共同能力覆盖，不代表未经统一语料评测的准确率排名。

## 快速开始

要求 Node.js 20+，推荐 Chrome 或 Edge。

```powershell
npm install
npm run build
npm start
```

打开 `http://127.0.0.1:8787`。也可以直接运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

停止后台服务：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop.ps1
```

## OpenClaw 总结

应用会自动寻找当前 Node 安装目录下的 `node_modules/openclaw/openclaw.mjs`，调用 `architect` 代理进行深度总结。可用环境变量覆盖入口：

```powershell
$env:OPENCLAW_ENTRY = 'D:\path\to\openclaw.mjs'
npm start
```

没有安装 OpenClaw、模型不可用或返回格式异常时，接口自动使用本地规则摘要，录音和实时转写不受影响。

## 隐私说明

- 会话文本和摘要默认保存在当前浏览器 `localStorage`，服务端不持久化。
- 录音仅保留为当前页面内的 Blob，刷新后不会上传或恢复。
- 浏览器语音识别可能使用浏览器厂商的在线服务，行为取决于浏览器和系统设置；敏感会议请先确认组织政策。
- OpenClaw 深度总结会把转写文本发送给你本机已配置的模型供应商；不点击“AI 深度整理”时不会调用该接口。

## 验证

```powershell
npm test
npm run lint
npm run build
```

当前自动化覆盖摘要去重、会议/课堂提取、暂停恢复、Markdown/SRT 导出、HTTP 校验、OpenClaw 解析与本地降级。浏览器验收覆盖演示转写、深度总结、会话恢复、桌面和 390px 移动布局。

## 已知边界

- 浏览器原生实时识别的语言与准确率由 Chrome / Edge 服务决定，嘈杂环境和方言需要接入专业 ASR 才能与商业引擎做公平比较。
- 当前提供手动发言人切换，不包含声纹级自动分离。
- 首版是单机工具，不含账号、云同步和多人协作。
