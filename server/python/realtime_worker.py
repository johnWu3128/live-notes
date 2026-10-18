"""常驻 faster-whisper 实时分块识别进程。@author wuyc"""

import json
import os
import sys
import time

from faster_whisper import WhisperModel


def emit(payload):
    """向 Node 服务发送 UTF-8 JSONL 事件。@author wuyc"""
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def main():
    """加载一次模型并顺序处理浏览器上传的独立 WAV 块。@author wuyc"""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    model_name = os.environ.get("LIVE_NOTES_WHISPER_MODEL", "small")
    language = os.environ.get("LIVE_NOTES_LANGUAGE", "zh")
    threads = max(1, min(10, os.cpu_count() or 4))
    started = time.time()
    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=threads)
    emit({"type": "ready", "model": model_name, "seconds": round(time.time() - started, 2)})
    contexts = {}

    for line in sys.stdin:
        try:
            request = json.loads(line)
            session_id = request["sessionId"]
            context = str(contexts.get(session_id, "") or "")
            domain_prompt = str(request.get("initialPrompt", "") or "")
            initial_prompt = "。".join(item for item in [domain_prompt, context] if item)
            segments, _ = model.transcribe(
                request["path"],
                language=None if language == "auto" else language,
                beam_size=5,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 350},
                condition_on_previous_text=False,
                initial_prompt=initial_prompt or None,
            )
            result = []
            for index, segment in enumerate(segments):
                text = segment.text.strip()
                if text:
                    result.append({
                        "id": f"realtime-{index}",
                        "text": text,
                        "startMs": round(segment.start * 1000),
                        "endMs": round(segment.end * 1000),
                        "confidence": round(min(1.0, max(0.0, pow(2.718281828, segment.avg_logprob))), 4),
                    })
            if result:
                contexts[session_id] = (context + " " + " ".join(item["text"] for item in result))[-600:]
            emit({"type": "result", "requestId": request["requestId"], "segments": result})
        except Exception as error:
            emit({"type": "error", "requestId": request.get("requestId", "") if "request" in locals() else "", "message": str(error)})


if __name__ == "__main__":
    main()
