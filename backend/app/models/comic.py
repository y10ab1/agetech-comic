"""漫畫生成相關的資料模型。

圖片生成採「單張四格圖」策略（Vertex Nano Banana 2 一次生成一張含 2x2
四格的圖），而非四張獨立圖。為與前端保持向後相容，`ComicResult.panels`
仍是陣列，但正常情況只含 1 個元素（那張四格圖）。
"""

from typing import Literal

from pydantic import BaseModel, Field

# 心情：長輩每次都會選，是每週關懷小結最強的訊號（見 api-contract-additions.md §3）
Mood = Literal["happy", "calm", "tired"]


class DiaryEntry(BaseModel):
    """使用者描述當天做了什麼事情的一則日記。"""

    user_id: str = Field(..., description="LINE 使用者 ID")
    text: str = Field(..., description="使用者描述當天發生的事情（結構化 logline 或自由文字）")
    # 契約增補（P0）
    style: str | None = Field(
        None, description="畫風 id（見 GET /styles）。None＝預設畫風"
    )
    mood: Mood | None = Field(None, description="當天心情，週報關懷小結訊號")


class ComicPanel(BaseModel):
    """漫畫圖片。

    採單張四格圖策略時，整份結果只含一個 ComicPanel（order=1），其
    image_url 指向那張包含四格的圖；alt_text 為整張圖的無障礙口述。
    """

    order: int = Field(..., description="順序（單張四格圖時固定為 1）")
    image_url: str = Field(..., description="生成圖片的網址（四格漫畫）")
    caption: str = Field("", description="圖說文字")
    # 無障礙：供螢幕報讀器或口述影像使用的替代文字
    alt_text: str = Field("", description="供無障礙口述使用的畫面描述")


class ComicResult(BaseModel):
    """一天的完整漫畫總結結果。"""

    user_id: str
    summary: str = Field(..., description="當天事件的文字總結")
    panels: list[ComicPanel] = Field(default_factory=list)
    # 整篇漫畫的口述影像（無障礙）
    narration: str = Field("", description="整篇漫畫的無障礙口述內容")
    # 契約增補（P0）
    title: str = Field("", description="AI 依故事內容下的標題（集章存摺卡片顯示用）")
    tags: list[str] = Field(
        default_factory=list, description="限定 taxonomy 的 tag id（見 shared/tags.json）"
    )
    cover_url: str = Field("", description="封面圖網址（單張四格圖時＝該圖）")
    # 持久化後回傳的日記紀錄 id（未持久化時為 None）
    diary_id: str | None = Field(None, description="PocketBase 日記紀錄 id")


class DiaryRecord(BaseModel):
    """已持久化的日記紀錄（GET /me/diaries 回傳）。"""

    id: str
    user_id: str
    created_at: str
    title: str = ""
    tags: list[str] = Field(default_factory=list)
    mood: Mood | None = None
    style: str | None = None
    cover_url: str = ""
    logline: str = ""


class DiaryListResponse(BaseModel):
    """集章存摺頁用：某月的日記清單與進度。"""

    diaries: list[DiaryRecord] = Field(default_factory=list)
    total_count: int = Field(0, description="總日記數（集點卡進度）")
    recorded_today: bool = Field(False, description="今天是否已記錄")
