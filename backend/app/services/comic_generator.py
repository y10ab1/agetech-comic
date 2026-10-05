"""AI 漫畫生成服務（協調層）。

流程：日記文字 → 總結 → 生成單張四格漫畫圖（Vertex）→（可選）存 PocketBase
     → 產生無障礙口述 → 回傳 ComicResult。

目前總結（summarize）、標題（title）、tag 判斷、口述（narration）為輕量
規則式 / stub，待接 LLM 時再強化；圖片生成已接 Vertex Nano Banana 2。
"""

import io
import logging

import anyio

from PIL import Image

from app.core.config import Settings
from app.models.comic import ComicPanel, ComicResult, DiaryEntry
from app.services.image_generator import ImageGenerationError, VertexImageGenerator
from app.services.pocketbase_client import PocketBaseClient, PocketBaseError

logger = logging.getLogger(__name__)

# 結構化 logline 前兩段的合法 label（與 frontend/src/data/questions.ts 的
# mood／place 選項同步；tests/test_health.py 會比對前端檔案防漂移）
MOOD_LABELS = frozenset({"高興", "平靜", "有點累"})
PLACE_LABELS = frozenset({"菜市場", "公園散步", "樂齡中心", "待在家裡"})
_PLACE_CAPTIONS = {
    "公園散步": "今天去公園散步。",
    "待在家裡": "今天待在家裡。",
}


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

    async def summarize(self, text: str) -> str:
        """把當天描述總結成適合做漫畫的簡短敘事。

        TODO: 串接 LLM。目前直接沿用輸入（前端已送結構化 logline）。
        """
        return text.strip()[:200]

    async def build_title(self, summary: str) -> str:
        """為故事下標題。TODO: 交給 LLM。

        結構化 logline 與前端 buildTitle 同規則（「地點的一天：最後一件事」）；
        其餘取前段當標題。
        """
        parsed = self.parse_logline(summary)
        if parsed is not None:
            _, place, events = parsed
            return f"{place}的一天：{self._event_phrase(events[-1])}"[:40]
        head = summary.split("，")[0].split(" ")[0].strip()
        return head[:20] or "今天的故事"

    @staticmethod
    def parse_logline(summary: str) -> tuple[str, str, list[str]] | None:
        """解析前端圖卡流程送來的結構化 logline（見 frontend/src/data/logline.ts）。

        格式為「心情 + 地點 + 事件1 + 事件2…」，至少 3 段（對齊前端 isComplete：
        心情、地點皆選且至少一件事），且心情／地點須為白名單 label。
        不符合（自由文字、語音／拍照輸入）回 None。
        """
        if " + " not in summary:
            return None
        parts = [p.strip() for p in summary.split(" + ")]
        if len(parts) < 3 or any(not p for p in parts):
            return None
        if parts[0] not in MOOD_LABELS or parts[1] not in PLACE_LABELS:
            return None
        return parts[0], parts[1], parts[2:]

    @staticmethod
    def _event_phrase(label: str) -> str:
        """事件 label →圖說短句。「對象·行動」→「和對象行動」；單人事件原樣。"""
        if "·" in label:
            who, action = label.split("·", 1)
            return f"和{who}{action}"
        return label

    async def build_quadrant_captions(self, summary: str) -> list[str]:
        """四個象限的圖說（閱讀順序左上→右上→左下→右下，恰 4 筆；無法可靠分格時為空）。

        TODO: 交給 LLM 依實際生成畫面撰寫。目前規則式，且只用輸入裡**確實有**
        的資訊，不補任何使用者沒說的情節：
        心情 → 地點 → 第一件事 → 其餘的事（只有一件時以「記下今天」收尾）。
        非結構化輸入回空 list：前端照原旁白朗讀、不做象限同步。
        """
        parsed = self.parse_logline(summary)
        if parsed is None:
            return []
        mood, place, events = parsed
        phrases = [self._event_phrase(e) for e in events]
        place_caption = _PLACE_CAPTIONS.get(place, f"今天去了{place}。")
        last = (
            "還有" + "、".join(phrases[1:]) + "。"
            if len(phrases) > 1
            else "把今天的事記了下來。"
        )
        return [
            f"今天的心情：{mood}。",
            place_caption,
            f"{phrases[0]}。",
            last,
        ]

    @staticmethod
    def build_alt_text(summary: str, quadrant_captions: list[str]) -> str:
        """整張圖的短版 alt（契約 §1-1：依閱讀順序的短版總述；完整口述放 narration）。"""
        if len(quadrant_captions) == 4:
            return "四格漫畫，依序：" + "；".join(c.rstrip("。") for c in quadrant_captions)
        return f"四格漫畫：{summary[:80]}"

    async def build_narration(
        self, summary: str, quadrant_captions: list[str] | None = None
    ) -> str:
        """整張四格圖的無障礙口述影像。TODO: 交給 LLM 生成。

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
        """完整流程：日記 → 四格漫畫（→ 持久化）。"""
        summary = await self.summarize(entry.text)
        title = await self.build_title(summary)
        quadrant_captions = await self.build_quadrant_captions(summary)
        narration = await self.build_narration(summary, quadrant_captions)

        # 1) 生成單張四格漫畫圖
        image_bytes: bytes | None = None
        try:
            # 生圖與圖說共用同一份四格配置，畫面才對得上象限高亮
            image_bytes = await self._image_gen.generate_comic_image(
                summary, entry.style, panel_plan=quadrant_captions or None
            )
        except ImageGenerationError as exc:
            if not self._settings.image_gen_fallback:
                raise
            logger.warning("生圖失敗，改用佔位結果：%s", exc)

        # 2) 持久化（存圖 + 建日記紀錄）
        cover_url = ""
        image_url = ""
        diary_id: str | None = None
        # TODO(issue #9 後續)：後端 TTS 生成旁白音檔後以 audio_bytes 一併存入
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
                    tags=[],  # TODO: 由 LLM/前端帶入限定 taxonomy tag
                    mood=entry.mood,
                    style=entry.style,
                    logline=entry.text,
                    image_bytes=stored_bytes,
                    image_filename=stored_name,
                    image_mime=stored_mime,
                    narration=narration,
                )
                image_url = cover_url
            except PocketBaseError as exc:
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
            tags=[],
            cover_url=cover_url,
            diary_id=diary_id,
            narration_audio_url=narration_audio_url,
        )
