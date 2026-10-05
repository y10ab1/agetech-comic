"""AI 漫畫生成服務（協調層）。

流程：日記文字 → 總結 → 生成單張四格漫畫圖（Vertex）→（可選）存 PocketBase
     → 產生無障礙口述 → 回傳 ComicResult。

目前總結（summarize）、標題（title）、tag 判斷、口述（narration）為輕量
規則式 / stub，待接 LLM 時再強化；圖片生成已接 Vertex Nano Banana 2。
"""

import logging

from app.core.config import Settings
from app.models.comic import ComicPanel, ComicResult, DiaryEntry
from app.services.image_generator import ImageGenerationError, VertexImageGenerator
from app.services.pocketbase_client import PocketBaseClient, PocketBaseError

logger = logging.getLogger(__name__)


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
        """為故事下標題。TODO: 交給 LLM。目前取前段當標題。"""
        head = summary.split("，")[0].split(" ")[0].strip()
        return head[:20] or "今天的故事"

    @staticmethod
    def parse_logline(summary: str) -> tuple[str, str, list[str]] | None:
        """解析前端圖卡流程送來的結構化 logline（見 frontend/src/data/logline.ts）。

        格式為「心情 + 地點 + 事件1 + 事件2…」，至少 3 段（對齊前端 isComplete：
        心情、地點皆選且至少一件事）。不符合（自由文字、語音／拍照輸入）回 None。
        """
        if " + " not in summary:
            return None
        parts = [p.strip() for p in summary.split(" + ")]
        if len(parts) < 3 or any(not p for p in parts):
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
        place_caption = "今天待在家裡。" if place == "待在家裡" else f"今天去了{place}。"
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
        if self._pb is not None:
            try:
                diary_id, cover_url = await self._pb.create_diary(
                    user_id=entry.user_id,
                    title=title,
                    tags=[],  # TODO: 由 LLM/前端帶入限定 taxonomy tag
                    mood=entry.mood,
                    style=entry.style,
                    logline=entry.text,
                    image_bytes=image_bytes,
                )
                image_url = cover_url
            except PocketBaseError as exc:
                logger.warning("日記持久化失敗（不中斷生成）：%s", exc)

        # 3) 組回傳結果（單張四格圖 → panels 只放 1 元素）
        panels: list[ComicPanel] = []
        if image_url:
            panels.append(
                ComicPanel(order=1, image_url=image_url, caption=title, alt_text=narration)
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
        )
