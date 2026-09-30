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

    async def build_quadrant_captions(self, summary: str) -> list[str]:
        """四個象限的圖說（閱讀順序左上→右上→左下→右下，恰 4 筆）。

        TODO: 交給 LLM 依實際生成畫面撰寫。目前規則式：前端送來的
        結構化 logline（「心情 + 地點 + 事件…」）依「晨起心情→出門
        地點→當日事件→滿足收尾」的固定四格敘事分配；非結構化輸入
        （自由文字）各欄位缺漏時退回通用句。
        """
        parts = [p.strip() for p in summary.split("+") if p.strip()]
        mood = parts[0] if parts else ""
        place = parts[1] if len(parts) > 1 else ""
        events = "、".join(parts[2:])
        if place == "待在家裡":
            place_caption = "在家裡好好休息。"
        elif place:
            place_caption = f"出門來到了{place}。"
        else:
            place_caption = "出門走走，看看外面的風景。"
        return [
            f"今天一早醒來，心情{mood}。" if mood else "今天一早醒來，精神很好。",
            place_caption,
            f"{events}，好開心。" if events else "做了幾件開心的事。",
            "滿足地回到家，真是美好的一天。",
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
            image_bytes = await self._image_gen.generate_comic_image(summary, entry.style)
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
