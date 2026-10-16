"""旁白語音（Vertex Gemini 3.8 TTS）。

把整張四格漫畫的口述（narration）念成音檔，供：
- 網頁劇場／回憶內頁播放（LIFF WebView 沒有 speechSynthesis，見 issue #9）
- LINE Bot 回覆的語音訊息（LINE AudioMessage 只收 mp3/m4a）

念的內容＝劇場逐句顯示的文字（有四格時＝四格圖說），讓播放時能逐格高亮：
每格各合成一段（並行，不增加等待），接成一個檔並記下每段起始毫秒（marks_ms）。

Gemini TTS 回傳 WAV（16-bit PCM、24 kHz、mono），這裡轉成 MP3（約 48 kbps，
30 秒約 180KB）。每段依 VERTEX_TTS_MODEL 順序嘗試；任一段全部失敗即整份回 None，
生成流程不因語音中斷（前端退回瀏覽器 TTS）。
"""

from __future__ import annotations

import io
import logging
import wave
from dataclasses import dataclass

import anyio

from app.core.config import Settings

logger = logging.getLogger(__name__)

# 念給長輩聽：慢、溫柔、清楚；台灣口音國語。風格放 speech_metadata（放進 text 會被念出來）
_STYLE = "溫柔、緩慢、咬字清楚，像晚輩親切地說故事給家中長輩聽；台灣口音的國語"
_MP3_KBPS = 48
_GAP_MS = 350  # 段與段之間的停頓


class TTSError(RuntimeError):
    """語音生成失敗。"""


@dataclass
class NarrationAudio:
    data: bytes
    mime: str
    filename: str
    duration_ms: int
    # 每段（每格）在音檔中的起始毫秒，與輸入 texts 一一對應
    marks_ms: list[int]


def _read_pcm(wav_bytes: bytes) -> tuple[bytes, int, int]:
    with wave.open(io.BytesIO(wav_bytes)) as w:
        if w.getsampwidth() != 2:
            raise TTSError(f"不支援的取樣寬度：{w.getsampwidth()}")
        return w.readframes(w.getnframes()), w.getframerate(), w.getnchannels()


def concat_wavs(wavs: list[bytes], gap_ms: int = _GAP_MS) -> tuple[bytes, list[int]]:
    """把多段 WAV 接成一段（中間補靜音），回傳 (WAV bytes, 各段起始毫秒)。"""
    pcms = [_read_pcm(w) for w in wavs]
    rate, channels = pcms[0][1], pcms[0][2]
    if any(r != rate or c != channels for _, r, c in pcms):
        raise TTSError("各段音訊格式不一致")
    frame = 2 * channels
    silence = b"\x00" * (rate * gap_ms // 1000 * frame)
    out, marks, frames = bytearray(), [], 0
    for i, (pcm, _, _) in enumerate(pcms):
        if i:
            out += silence
            frames += len(silence) // frame
        marks.append(round(frames * 1000 / rate))
        out += pcm
        frames += len(pcm) // frame
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(out))
    return buf.getvalue(), marks


def wav_to_mp3(wav_bytes: bytes, kbps: int = _MP3_KBPS) -> tuple[bytes, int]:
    """WAV（16-bit PCM）→ MP3，回傳 (mp3 bytes, 長度毫秒)。"""
    import lameenc

    pcm, rate, channels = _read_pcm(wav_bytes)
    frames = len(pcm) // (2 * channels)
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(rate)
    enc.set_channels(channels)
    enc.set_quality(2)
    mp3 = enc.encode(pcm) + enc.flush()
    return bytes(mp3), round(frames * 1000 / rate)


class NarrationTTS:
    """以 Vertex Gemini TTS 生成旁白 MP3。"""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = None

    def _get_client(self):
        if self._client is None:
            from google import genai

            if not self._settings.vertex_project:
                raise TTSError("未設定 VERTEX_PROJECT")
            # Gemini 3.8 TTS 只在 global
            self._client = genai.Client(
                vertexai=True, project=self._settings.vertex_project, location="global"
            )
        return self._client

    async def _synthesize_wav(self, model: str, text: str) -> bytes:
        client = self._get_client()
        resp = await client.aio.models.generate_content(
            model=model,
            contents=[
                {"role": "user", "parts": [{"text": text, "speech_metadata": {"style": _STYLE}}]}
            ],
            config={
                "response_modalities": ["AUDIO"],
                "speech_config": {"voice_config": {"voice": self._settings.tts_voice}},
            },
        )
        for part in resp.candidates[0].content.parts:
            if getattr(part, "inline_data", None) is not None and part.inline_data.data:
                return part.inline_data.data
        raise TTSError("回應中找不到音訊")

    async def _segment(self, models: list[str], text: str) -> bytes:
        last: Exception | None = None
        for model in models:
            try:
                return await self._synthesize_wav(model, text)
            except Exception as exc:  # noqa: BLE001 — GCP／網路錯誤，換下一個
                logger.warning("TTS 模型 %s 失敗：%s", model, exc)
                last = exc
        raise TTSError(f"所有 TTS 模型都失敗：{last}")

    async def synthesize(self, texts: list[str]) -> NarrationAudio | None:
        """把各段念成一個 MP3；停用、無內容或任一段失敗時回 None（不拋例外）。"""
        texts = [t.strip() for t in texts if t.strip()]
        if not self._settings.tts_enabled or not texts:
            return None
        models = [m.strip() for m in self._settings.vertex_tts_model.split(",") if m.strip()]
        wavs: list[bytes | None] = [None] * len(texts)

        async def _one(i: int) -> None:
            wavs[i] = await self._segment(models, texts[i])

        try:
            with anyio.fail_after(self._settings.tts_timeout_s):
                async with anyio.create_task_group() as tg:
                    for i in range(len(texts)):
                        tg.start_soon(_one, i)
            wav, marks = await anyio.to_thread.run_sync(concat_wavs, wavs)
            mp3, duration_ms = await anyio.to_thread.run_sync(wav_to_mp3, wav)
        except TimeoutError:
            logger.warning("TTS 逾時（%ss）", self._settings.tts_timeout_s)
            return None
        except Exception as exc:  # noqa: BLE001 — 含 task group 的 ExceptionGroup
            logger.warning("旁白語音失敗：%s", exc)
            return None
        logger.info("旁白語音：%d 段、%d ms、%d bytes", len(texts), duration_ms, len(mp3))
        return NarrationAudio(mp3, "audio/mpeg", "narration.mp3", duration_ms, marks)
