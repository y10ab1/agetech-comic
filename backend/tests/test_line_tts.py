"""旁白 TTS、LINE webhook、檔案代理 Range／JPEG 變體（全部 mock，不碰外部服務）。"""

import base64
import hashlib
import hmac
import io
import json
import math
import struct
import wave
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.models.comic import ComicResult


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    get_settings.cache_clear()
    for k, v in {
        "PERSIST_DIARIES": "false",
        "IMAGE_GEN_FALLBACK": "true",
        "ENV": "dev",
        "STORY_LLM_ENABLED": "false",
        "TTS_ENABLED": "false",
        "LINE_CHANNEL_SECRET": "s3cret",
        "LINE_CHANNEL_ACCESS_TOKEN": "tok",
    }.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    from app.core import rate_limit

    rate_limit.reset()
    yield
    rate_limit.reset()
    get_settings.cache_clear()


def _wav(seconds: float = 0.5, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        n = int(seconds * rate)
        w.writeframes(
            b"".join(struct.pack("<h", int(8000 * math.sin(i / 10))) for i in range(n))
        )
    return buf.getvalue()


# ---- TTS ----


def test_wav_to_mp3() -> None:
    from app.services.tts import wav_to_mp3

    mp3, ms = wav_to_mp3(_wav(0.5))
    assert ms == 500
    assert mp3[:3] == b"ID3" or mp3[0] == 0xFF  # MP3 frame sync
    assert 0 < len(mp3) < len(_wav(0.5))


@pytest.mark.anyio
async def test_tts_fallback_chain(monkeypatch) -> None:
    """第一個模型失敗換下一個；全部失敗回 None；停用時不呼叫。"""
    from app.services.tts import NarrationTTS

    monkeypatch.setenv("TTS_ENABLED", "true")
    monkeypatch.setenv("VERTEX_TTS_MODEL", "bad,good")
    get_settings.cache_clear()
    tts = NarrationTTS(get_settings())
    calls = []

    async def _syn(model, text):
        calls.append(model)
        if model == "bad":
            raise RuntimeError("404")
        return _wav(0.2)

    monkeypatch.setattr(tts, "_synthesize_wav", _syn)
    audio = await tts.synthesize(["第一格，今天很高興。"])
    assert calls == ["bad", "good"]
    assert audio and audio.mime == "audio/mpeg" and audio.duration_ms == 200
    assert audio.marks_ms == [0]

    async def _all_fail(model, text):
        raise RuntimeError("down")

    monkeypatch.setattr(tts, "_synthesize_wav", _all_fail)
    assert await tts.synthesize(["x"]) is None
    assert await tts.synthesize(["   "]) is None

    monkeypatch.setenv("TTS_ENABLED", "false")
    get_settings.cache_clear()
    assert await NarrationTTS(get_settings()).synthesize(["x"]) is None


@pytest.mark.anyio
async def test_tts_segments_marks(monkeypatch) -> None:
    """四格各念一段、依序接起來，marks 為各段起始毫秒（含段間停頓）；任一段失敗整份 None。"""
    from app.services import tts as mod

    monkeypatch.setenv("TTS_ENABLED", "true")
    monkeypatch.setenv("VERTEX_TTS_MODEL", "m")
    get_settings.cache_clear()
    tts = mod.NarrationTTS(get_settings())
    lengths = {"一": 0.4, "二": 0.2, "三": 0.6, "四": 0.1}

    async def _syn(model, text):
        return _wav(lengths[text])

    monkeypatch.setattr(tts, "_synthesize_wav", _syn)
    audio = await tts.synthesize(["一", "二", "三", "四"])
    gap = mod._GAP_MS
    assert audio.marks_ms == [0, 400 + gap, 600 + 2 * gap, 1200 + 3 * gap]
    assert audio.duration_ms == 1300 + 3 * gap

    async def _third_fails(model, text):
        if text == "三":
            raise RuntimeError("down")
        return _wav(0.1)

    monkeypatch.setattr(tts, "_synthesize_wav", _third_fails)
    assert await tts.synthesize(["一", "二", "三", "四"]) is None


@pytest.mark.anyio
async def test_tts_request_shape(monkeypatch) -> None:
    """風格放 speech_metadata（不混進要念的文字）、聲音取 TTS_VOICE。"""
    from app.services.tts import NarrationTTS

    monkeypatch.setenv("TTS_VOICE", "Kore")
    get_settings.cache_clear()
    seen = {}

    async def _gen(model, contents, config):
        seen.update(model=model, contents=contents, config=config)
        part = SimpleNamespace(inline_data=SimpleNamespace(data=b"wav"))
        return SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[part]))])

    tts = NarrationTTS(get_settings())
    tts._client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=_gen)))
    assert await tts._synthesize_wav("m", "念這段") == b"wav"
    part = seen["contents"][0]["parts"][0]
    assert part["text"] == "念這段" and part["speech_metadata"]["style"]
    assert seen["config"]["response_modalities"] == ["AUDIO"]
    assert seen["config"]["speech_config"]["voice_config"]["voice"] == "Kore"


@pytest.mark.anyio
async def test_create_comic_stores_narration_audio(monkeypatch) -> None:
    """旁白音檔與圖一起存進日記，回傳音檔網址與長度。"""
    from app.services import comic_generator as cg
    from app.services.tts import NarrationAudio

    monkeypatch.setenv("PERSIST_DIARIES", "true")
    get_settings.cache_clear()
    gen = cg.ComicGenerator(get_settings())
    seen = {}

    async def _img(summary, style, panel_plan=None):
        return b"png"

    async def _speak(texts):
        seen["spoken"] = texts
        return NarrationAudio(b"mp3", "audio/mpeg", "narration.mp3", 4321, [0, 1, 2, 3])

    async def _create(**kw):
        seen.update(kw)
        return "r1", "https://be/api/files/c/r1/comic.webp", "https://be/api/files/c/r1/n.mp3"

    monkeypatch.setattr(gen._image_gen, "generate_comic_image", _img)
    monkeypatch.setattr(gen._tts, "synthesize", _speak)
    monkeypatch.setattr(gen._pb, "create_diary", _create)
    monkeypatch.setattr(cg, "compress_comic", lambda b: (b, "comic.png", "image/png"))

    r = await gen.create_comic(cg.DiaryEntry(user_id="u", text="高興 + 菜市場 + 買菜"))
    assert seen["audio_bytes"] == b"mp3" and seen["audio_mime"] == "audio/mpeg"
    # 念的是劇場逐格顯示的四格圖說（才能逐格高亮）
    assert seen["spoken"] == r.quadrant_captions and len(r.quadrant_captions) == 4
    assert r.narration_audio_url.endswith("n.mp3") and r.narration_audio_duration_ms == 4321
    assert r.narration_audio_marks_ms == [0, 1, 2, 3]
    # 規則式：依地點給 tag，存進日記
    assert r.tags == ["market"] and seen["tags"] == ["market"]


# ---- 檔案代理 ----


def _patch_pb_files(monkeypatch, handler):
    import httpx

    from app.api import files as mod

    real = httpx.AsyncClient

    class _Client(real):
        def __init__(self, *a, **kw):
            super().__init__(*a, transport=httpx.MockTransport(handler), **kw)

    monkeypatch.setattr(mod.httpx, "AsyncClient", _Client)


def test_file_proxy_range(monkeypatch) -> None:
    import httpx

    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req.headers.get("range"))
        return httpx.Response(
            206,
            content=b"ab",
            headers={"content-type": "audio/mpeg", "content-range": "bytes 0-1/10"},
        )

    _patch_pb_files(monkeypatch, handler)
    r = TestClient(app).get("/api/files/c/r/n.mp3", headers={"Range": "bytes=0-1"})
    assert r.status_code == 206 and r.content == b"ab"
    assert r.headers["content-range"] == "bytes 0-1/10"
    assert r.headers["accept-ranges"] == "bytes"
    assert seen == ["bytes=0-1"]


def test_file_proxy_jpeg_variant(monkeypatch) -> None:
    import httpx
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (2000, 2000), "orange").save(buf, "WEBP")

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=buf.getvalue(), headers={"content-type": "image/webp"})

    _patch_pb_files(monkeypatch, handler)
    c = TestClient(app)
    r = c.get("/api/files/c/r/comic.webp?variant=line_preview")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    with Image.open(io.BytesIO(r.content)) as im:
        assert im.format == "JPEG" and max(im.size) == 480
    assert c.get("/api/files/c/r/comic.webp?variant=huge").status_code == 404


# ---- LINE webhook ----


def _signed(body: dict) -> tuple[str, dict]:
    raw = json.dumps(body)
    sig = base64.b64encode(hmac.new(b"s3cret", raw.encode(), hashlib.sha256).digest()).decode()
    return raw, {"X-Line-Signature": sig, "Content-Type": "application/json"}


def _text_event(text="今天去公園散步", redelivery=False, source_type="user"):
    return {
        "type": "message",
        "mode": "active",
        "timestamp": 1,
        "webhookEventId": "e1",
        "deliveryContext": {"isRedelivery": redelivery},
        "replyToken": "rt",
        "source": {"type": source_type, "userId": "U1", "groupId": "G1"},
        "message": {"type": "text", "id": "m1", "text": text, "quoteToken": "q"},
    }


def test_webhook_signature_and_dispatch(monkeypatch) -> None:
    from app.api import line_webhook as mod

    calls = []

    async def _handle(settings, user_id, reply_token, text):
        calls.append((user_id, reply_token, text))

    monkeypatch.setattr(mod, "handle_message", _handle)
    c = TestClient(app)
    assert c.post("/webhook", content="{}", headers={"X-Line-Signature": "bad"}).status_code == 400

    events = [
        _text_event(),
        _text_event(redelivery=True),  # 重送：略過
        _text_event(source_type="group"),  # 群組：略過
    ]
    raw, h = _signed({"destination": "x", "events": events})
    r = c.post("/webhook", content=raw, headers=h)
    assert r.status_code == 200
    assert calls == [("U1", "rt", "今天去公園散步")]


def test_webhook_503_without_credentials(monkeypatch) -> None:
    monkeypatch.setenv("LINE_CHANNEL_SECRET", "")
    get_settings.cache_clear()
    assert TestClient(app).post("/webhook", content="{}").status_code == 503


def test_build_result_messages() -> None:
    from linebot.v3.messaging import AudioMessage, ImageMessage, TextMessage

    from app.api.line_webhook import build_result_messages

    r = ComicResult(
        user_id="U1",
        summary="s",
        title="菜市場的一天",
        quadrant_captions=["一。", "二。", "三。", "四。"],
        cover_url="https://be/api/files/c/r/comic.webp",
        narration_audio_url="https://be/api/files/c/r/n.mp3",
        narration_audio_duration_ms=12000,
    )
    text, image, audio = build_result_messages(r)
    assert isinstance(text, TextMessage) and "菜市場的一天" in text.text and "④ 四。" in text.text
    assert isinstance(image, ImageMessage)
    assert image.original_content_url.endswith("?variant=line")
    assert image.preview_image_url.endswith("?variant=line_preview")
    assert isinstance(audio, AudioMessage) and audio.duration == 12000

    # 沒圖、沒音檔（或非 https）只回文字
    bare = ComicResult(user_id="U1", summary="今天很好", cover_url="http://localhost/x.webp")
    msgs = build_result_messages(bare)
    assert len(msgs) == 1 and "今天很好" in msgs[0].text


class _FakeApi:
    def __init__(self, reply_fails=False):
        self.replies, self.pushes, self.loading = [], [], 0
        self.reply_fails = reply_fails

    async def reply_message(self, req):
        from linebot.v3.messaging import ApiException

        if self.reply_fails:
            raise ApiException(status=400, reason="Invalid reply token")
        self.replies.append(req.messages)

    async def push_message(self, req):
        self.pushes.append((req.to, req.messages))

    async def show_loading_animation(self, req):
        self.loading += 1


@pytest.mark.anyio
async def test_line_generate_reply_push_and_limit(monkeypatch) -> None:
    from app.api import line_webhook as mod
    from app.services import comic_generator as cg

    monkeypatch.setenv("LINE_GENERATE_LIMIT_PER_USER_HOUR", "1")
    get_settings.cache_clear()
    s = get_settings()

    async def _ok(self, entry):
        return ComicResult(user_id=entry.user_id, summary=entry.text, title="t")

    monkeypatch.setattr(cg.ComicGenerator, "create_comic", _ok)

    # 1) 正常：loading → reply token 回覆
    api = _FakeApi()
    await mod._generate_and_reply(api, s, "U1", "rt", "今天很好")
    assert api.loading == 1 and len(api.replies) == 1 and not api.pushes

    # 2) 超過每人上限：回休息提示、不生成
    api = _FakeApi()
    await mod._generate_and_reply(api, s, "U1", "rt", "再一張")
    assert api.replies[0][0].text == mod.MSG_RATE_LIMIT and api.loading == 0

    # 3) 別人不受影響；reply token 失效改 push
    api = _FakeApi(reply_fails=True)
    await mod._generate_and_reply(api, s, "U2", "rt", "今天很好")
    assert api.pushes and api.pushes[0][0] == "U2"

    # 4) 非文字訊息：提示用文字
    api = _FakeApi()
    await mod._generate_and_reply(api, s, "U3", "rt", None)
    assert api.replies[0][0].text == mod.MSG_NOT_TEXT


@pytest.mark.anyio
async def test_line_generate_failure_refunds_quota(monkeypatch) -> None:
    from app.api import line_webhook as mod
    from app.services import comic_generator as cg

    monkeypatch.setenv("LINE_GENERATE_LIMIT_PER_USER_HOUR", "1")
    get_settings.cache_clear()
    s = get_settings()

    async def _boom(self, entry):
        raise RuntimeError("vertex down")

    monkeypatch.setattr(cg.ComicGenerator, "create_comic", _boom)
    for _ in range(3):  # 失敗不消耗額度：每次都會再嘗試並回失敗訊息
        api = _FakeApi()
        await mod._generate_and_reply(api, s, "U1", "rt", "今天很好")
        assert api.replies[0][0].text == mod.MSG_FAILED and api.loading == 1
