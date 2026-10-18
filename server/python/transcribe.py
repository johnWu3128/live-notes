import argparse
import json
import os
import sys
import time

from faster_whisper import WhisperModel


def emit(payload):
    """以 UTF-8 JSONL 输出事件，供 Node 后台增量消费。"""
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def main():
    """使用本机 faster-whisper 转写长音视频音轨。"""
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("--model", default=os.environ.get("LIVE_NOTES_WHISPER_MODEL", "small"))
    parser.add_argument("--language", default=os.environ.get("LIVE_NOTES_LANGUAGE", "zh"))
    parser.add_argument("--initial-prompt", default=os.environ.get("LIVE_NOTES_INITIAL_PROMPT", ""))
    parser.add_argument("--threads", type=int, default=max(1, min(10, os.cpu_count() or 4)))
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    started = time.time()
    model = WhisperModel(args.model, device="cpu", compute_type="int8", cpu_threads=args.threads)
    emit({"type": "model", "model": args.model, "seconds": round(time.time() - started, 2)})
    segments, info = model.transcribe(
        args.input,
        language=None if args.language == "auto" else args.language,
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 450},
        condition_on_previous_text=True,
        initial_prompt=args.initial_prompt or None,
    )
    emit({"type": "metadata", "language": info.language, "duration": info.duration})
    for index, segment in enumerate(segments):
        emit({
            "type": "segment",
            "id": f"whisper-{index}",
            "text": segment.text.strip(),
            "startMs": round(segment.start * 1000),
            "endMs": round(segment.end * 1000),
            "confidence": round(min(1.0, max(0.0, pow(2.718281828, segment.avg_logprob))), 4),
        })
    emit({"type": "complete", "seconds": round(time.time() - started, 2)})


if __name__ == "__main__":
    main()
