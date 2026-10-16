"""AI 漫畫生成服務（協調層）。

流程：日記文字 → 故事企劃（Vertex 文字模型：標題／總結／四格圖說＋畫面；
     失敗退回規則式，見 story_writer.py）→ 依同一份四格企劃生成單張四格漫畫圖
     （Vertex 生圖），同時把口述念成旁白 MP3（Gemini TTS，見 tts.py）
     →（可選）存 PocketBase → 回傳 ComicResult。
"""

import io
import logging

import anyio

from PIL import Image

from app.core.config import Settings
from app.models.comic import ComicPanel, ComicResult, DiaryEntry
from app.services.image_generator import ImageGenerationError, VertexImageGenerator
from app.services.pocketbase_client import PocketBaseClient, PocketBaseError
from app.services.tts import NarrationAudio, NarrationTTS
from app.services.story_writer import (  # noqa: F401 — MOOD/PLACE_LABELS 供外部引用
    MOOD_LABELS,
    PLACE_LABELS,
    StoryWriter,
    event_phrase,
    parse_logline,
    rules_captions,
    rules_title,
)

logger = logging.getLogger(__name__)

def compress_comic(image_bytes: bytes) -> tuple[bytes, str, str]:
    """生圖原檔（PNG 約 7MB）轉 WebP q85（約 0.8MB），長輩手機與 LINE 分享載得動。

    回傳 (bytes, filename, mime)；轉檔失敗時原樣回傳 PNG，不中斷流程。
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as im:
            out = io.BytesIO()
            im.convert("RGB").save(out, "WEBP", quality=85, method=4)
        return out.getvalue(), "comic.webp", "image/webp"
    except Exception as exc:  # noqa: BLE001
        logger.warning("漫畫圖轉 WebP 失敗，改存原檔：%s", exc)
        return image_bytes, "comic.png", "image/png"


class ComicGenerator:
    """將日記文字轉為漫畫並（可選）持久化。"""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._image_gen = VertexImageGenerator(settings)
        self._pb = PocketBaseClient(settings) if settings.persist_diaries else None
        self._writer = StoryWriter(settings)
        self._tts = NarrationTTS(settings)

    # ---- 規則式（story_writer 的 fallback；保留方法供測試與外部呼叫） ----

    async def summarize(self, text: str) -> str:
        return text.strip()[:200]

    async def build_title(self, summary: str) -> str:
        return rules_title(summary)

    parse_logline = staticmethod(parse_logline)
    _event_phrase = staticmethod(event_phrase)

    async def build_quadrant_captions(self, summary: str) -> list[str]:
        """規則式四格圖說（只用輸入確實有的資訊；非結構化輸入回空 list）。"""
        return rules_captions(summary)

    @staticmethod
    def build_alt_text(summary: str, quadrant_captions: list[str]) -> str:
        """整張圖的短版 alt（契約 §1-1：依閱讀順序的短版總述；完整口述放 narration）。"""
        if len(quadrant_captions) == 4:
            return "四格漫畫，依序：" + "；".join(c.rstrip("。") for c in quadrant_captions)
        return f"四格漫畫：{summary[:80]}"

    async def build_narration(
        self, summary: str, quadrant_captions: list[str] | None = None
    ) -> str:
        """口述影像的規則式備援（文字模型沒寫 narration 時）。

        有象限圖說時由其組成逐格口述，與劇場高亮同步的內容一致。
        """
        if quadrant_captions and len(quadrant_captions) == 4:
            body = "".join(
                f"第{num}格，{caption}"
                for num, caption in zip("一二三四", quadrant_captions)
            )
            return f"這是一張四格漫畫，描繪您今天的故事。{body}"
        return f"這是一張四格漫畫，描繪您今天的故事：{summary}"

    async def create_comic(self, entry: DiaryEntry) -> ComicResult:
        """完整流程：日記 → 四格漫畫＋旁白語音（→ 持久化）。"""
        plan = await self._writer.write(entry.text, entry.mood)
        summary, title, quadrant_captions = plan.summary, plan.title, plan.captions
        # 口述影像：優先用文字模型寫的（逐格描述畫面）；規則式／缺漏時由圖說組成
        narration = plan.narration or await self.build_narration(summary, quadrant_captions)
        # 旁白語音念劇場逐句顯示的文字（與前端 adaptComicResult 同規則），才能逐格高亮
        spoken = quadrant_captions if len(quadrant_captions) == 4 else [narration or summary]
        logger.info("故事企劃來源：%s（%d 格）", plan.source, len(quadrant_captions))

        # 1) 生成單張四格漫畫圖，同時念旁白（旁白不依賴圖，並行省時間；語音失敗＝無音檔）
        image_bytes: bytes | None = None
        audio: NarrationAudio | None = None
        image_error: ImageGenerationError | None = None

        async def _image() -> None:
            nonlocal image_bytes, image_error
            try:
                # 生圖與圖說共用同一份四格企劃（有畫面描述用畫面描述），對得上象限高亮
                image_bytes = await self._image_gen.generate_comic_image(
                    summary, entry.style, panel_plan=(plan.scenes or quadrant_captions) or None
                )
            except ImageGenerationError as exc:
                image_error = exc

        async def _speech() -> None:
            nonlocal audio
            audio = await self._tts.synthesize(spoken)

        async with anyio.create_task_group() as tg:
            tg.start_soon(_image)
            tg.start_soon(_speech)
        if image_error is not None:
            if not self._settings.image_gen_fallback:
                raise image_error
            logger.warning("生圖失敗，改用佔位結果：%s", image_error)

        # 2) 持久化（存圖＋音檔＋建日記紀錄）
        cover_url = ""
        image_url = ""
        diary_id: str | None = None
        narration_audio_url: str | None = None
        if self._pb is not None:
            # 轉檔約 0.4 秒 CPU，丟 threadpool 免卡住其他請求
            stored_bytes, stored_name, stored_mime = (
                await anyio.to_thread.run_sync(compress_comic, image_bytes)
                if image_bytes
                else (None, "comic.png", "image/png")
            )
            try:
                diary_id, cover_url, narration_audio_url = await self._pb.create_diary(
                    user_id=entry.user_id,
                    title=title,
                    tags=plan.tags,
                    mood=entry.mood,
                    style=entry.style,
                    logline=entry.text,
                    image_bytes=stored_bytes,
                    image_filename=stored_name,
                    image_mime=stored_mime,
                    narration=narration,
                    audio_bytes=audio.data if audio else None,
                    audio_filename=audio.filename if audio else "narration.mp3",
                    audio_mime=audio.mime if audio else "audio/mpeg",
                )
                image_url = cover_url
            except PocketBaseError as exc:
                # 正式（不允許 fallback）：沒存成功就沒有可公開的圖片網址，
                # 回錯讓前端顯示「再試一次」，而不是回一份沒有圖的漫畫去落章
                if not self._settings.image_gen_fallback:
                    raise
                logger.warning("日記持久化失敗（不中斷生成）：%s", exc)

        # 3) 組回傳結果（單張四格圖 → panels 只放 1 元素）
        panels: list[ComicPanel] = []
        if image_url:
            panels.append(
                ComicPanel(
                    order=1,
                    image_url=image_url,
                    caption=title,
                    alt_text=self.build_alt_text(summary, quadrant_captions),
                )
            )

        return ComicResult(
            user_id=entry.user_id,
            summary=summary,
            panels=panels,
            narration=narration,
            quadrant_captions=quadrant_captions,
            title=title,
            tags=plan.tags,
            greeting=plan.greeting,
            cover_url=cover_url,
            diary_id=diary_id,
            narration_audio_url=narration_audio_url,
            narration_audio_duration_ms=audio.duration_ms if narration_audio_url and audio else None,
            narration_audio_marks_ms=audio.marks_ms if narration_audio_url and audio else [],
        )
