"""故事撰寫（Vertex 文字模型）。

把長輩當天的輸入（圖卡結構化 logline 或自由文字）寫成：標題、一句話總結、
四格（每格：念給長輩聽的圖說 caption＋給生圖模型的畫面描述 scene）。

- 只用輸入裡有的資訊：不新增人物、地點、活動、時間、結果（見 _SYSTEM）。
- 輸出經結構驗證；模型失敗／逾時／格式不符時退回規則式（本檔 rules_*），
  生成流程不會因文字模型而中斷。
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Literal

import anyio
from pydantic import BaseModel, ValidationError

from app.core.config import Settings

logger = logging.getLogger(__name__)

# 結構化 logline 前兩段的合法 label（與 frontend/src/data/questions.ts 的
# mood／place 選項同步；tests/test_health.py 會比對前端檔案防漂移）
MOOD_LABELS = frozenset({"高興", "平靜", "有點累"})
PLACE_LABELS = frozenset({"菜市場", "公園散步", "樂齡中心", "待在家裡"})
_PLACE_CAPTIONS = {
    "公園散步": "今天去公園散步。",
    "待在家裡": "今天待在家裡。",
}

_MOOD_ID_LABELS = {"happy": "高興", "calm": "平靜", "tired": "有點累"}
_MAX_CAPTION = 60
_MAX_SCENE = 300
_MAX_TITLE = 20
_SENTENCE_END = "。！？"


@dataclass
class StoryPlan:
    """一則故事的文字企劃（四格圖說與生圖畫面同源）。"""

    title: str
    summary: str
    # 恰 4 筆或空（無法可靠分格）；閱讀順序左上→右上→左下→右下
    captions: list[str] = field(default_factory=list)
    # 與 captions 一一對應的畫面描述（給生圖 prompt）；空時生圖改用 captions
    scenes: list[str] = field(default_factory=list)
    source: Literal["llm", "rules"] = "rules"


# ---- 規則式（fallback；也是 LLM 輸入的結構化來源） ----


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


def event_phrase(label: str) -> str:
    """事件 label →短句。「對象·行動」→「和對象行動」；單人事件原樣。"""
    if "·" in label:
        who, action = label.split("·", 1)
        return f"和{who}{action}"
    return label


def rules_title(summary: str) -> str:
    """結構化 logline 與前端 buildTitle 同規則（「地點的一天：最後一件事」）；其餘取前段。"""
    parsed = parse_logline(summary)
    if parsed is not None:
        _, place, events = parsed
        return f"{place}的一天：{event_phrase(events[-1])}"[:40]
    head = summary.split("，")[0].split(" ")[0].strip()
    return head[:20] or "今天的故事"


def rules_captions(summary: str) -> list[str]:
    """規則式四格圖說：只用輸入確實有的資訊；非結構化輸入回空 list。"""
    parsed = parse_logline(summary)
    if parsed is None:
        return []
    mood, place, events = parsed
    phrases = [event_phrase(e) for e in events]
    place_caption = _PLACE_CAPTIONS.get(place, f"今天去了{place}。")
    last = "還有" + "、".join(phrases[1:]) + "。" if len(phrases) > 1 else "把今天的事記了下來。"
    return [f"今天的心情：{mood}。", place_caption, f"{phrases[0]}。", last]


def rules_plan(text: str) -> StoryPlan:
    summary = text.strip()[:200]
    return StoryPlan(
        title=rules_title(summary),
        summary=summary,
        captions=rules_captions(summary),
        source="rules",
    )


# ---- Vertex 文字模型 ----

_SYSTEM = """你是「樂齡漫畫日記」的說書人，幫台灣長輩把今天的小事寫成溫暖的四格漫畫故事。

【語氣】
- 繁體中文、台灣日常口語，像晚輩溫柔地說給長輩聽，稱呼用「您」。
- 句子短、好懂：每格 1～2 句，每句不超過 20 個字，每句以「。」「！」或「？」結尾。
- 不用表情符號、英文、艱澀詞、網路用語；不說教、不給建議。

【絕對不能編造】
- 只能使用輸入裡有的資訊：心情、地點、人物、做的事。
- 不可新增輸入沒有的人物、地點、活動、天氣、時間點、物品名稱或結果。
  例：沒說出門，就不能寫「回到家」；只說「買菜」，不能寫買了什麼菜；沒說和誰，就不能加人。
- 不寫移動或轉場（出門、出發、離開、回到家），除非輸入有寫。
- 不加入輸入沒有的物品（例如收音機、手機、菜名），除非那件事本身就需要（講電話可以有電話）。
- 可以描寫和輸入一致的感受與動作（例如「買菜」可以寫「慢慢挑」），但不可與輸入矛盾。
- 心情要忠於輸入：「有點累」就溫柔體貼地寫，不可寫成很興奮或很開心。

【四格結構】（閱讀順序：左上→右上→左下→右下）
1. 開場：今天的心情。
2. 地點：今天在哪裡。
3. 主要的事：第一件做的事。
4. 收尾：其餘的事；若只有一件事，就用心情溫柔地回味今天，不可加新事件。
若輸入太少，無法不編造地分成四格，panels 回傳空陣列 []。

【欄位】
- title：溫暖、有畫面的故事標題，不超過 14 個字，不加引號或標點。
- summary：一句話總結今天（不超過 40 字），只含輸入有的資訊。
- panels[i].caption：該格要念給長輩聽的完整句子（不可以逗號結尾、不可只有半句）。
- panels[i].scene：給插畫家的畫面描述（中文，不超過 80 字）：主角是同一位台灣長輩，
  寫出這一格的場景、動作、表情與輸入中出現的人物；不可出現文字、招牌字或對話框。
  畫面描述同樣不能編造：不可加入輸入沒有、會和主角互動的人物，不可指定時間點（早晨、夕陽等）。"""


class _Panel(BaseModel):
    caption: str
    scene: str


class _Story(BaseModel):
    title: str
    summary: str
    panels: list[_Panel]


def _user_prompt(text: str, mood: str | None) -> str:
    parsed = parse_logline(text)
    if parsed is not None:
        m, place, events = parsed
        things = "、".join(event_phrase(e) for e in events)
        return (
            "長輩用圖卡選了今天的內容：\n"
            f"- 心情：{m}\n- 地點：{place}\n- 做的事（依序）：{things}\n"
            "（「和某人＋動作」表示和那個人一起做；沒有寫「和」就是自己一個人。）"
        )
    mood_label = _MOOD_ID_LABELS.get(mood or "")
    mood_line = f"\n- 長輩選的心情：{mood_label}" if mood_label else ""
    return f"長輩自己說的今天：\n「{text.strip()[:500]}」{mood_line}"


def _ensure_end(sentence: str) -> str:
    s = sentence.strip()
    if s and s[-1] in "，、,；;：:":
        # 以逗號結尾＝半句話，不補句號硬湊，交給驗證退件
        raise ValueError(f"caption 是半句：{s!r}")
    return s if s and s[-1] in _SENTENCE_END else f"{s}。"


def _clean(s: str) -> str:
    # 去掉模型偶爾加的引號／前後空白與換行
    return re.sub(r"\s+", "", s).strip("「」\"'『』")


def validate_story(raw: dict, fallback_summary: str) -> StoryPlan:
    """驗證並正規化模型輸出；不合格拋 ValueError。"""
    story = _Story.model_validate(raw)
    title = _clean(story.title).rstrip("。！？，")
    if not 1 <= len(title) <= _MAX_TITLE:
        raise ValueError(f"title 長度不符：{title!r}")
    panels = story.panels
    if len(panels) not in (0, 4):
        raise ValueError(f"panels 需為 4 或 0 格，得到 {len(panels)}")
    captions = [_ensure_end(_clean(p.caption)) for p in panels]
    scenes = [p.scene.strip() for p in panels]
    for c, sc in zip(captions, scenes):
        if re.search(r"[，、,][。！？]", c):
            raise ValueError(f"caption 標點不完整：{c!r}")
        if len(c) <= 1 or len(c) > _MAX_CAPTION:
            raise ValueError(f"caption 長度不符：{c!r}")
        if not sc or len(sc) > _MAX_SCENE:
            raise ValueError("scene 長度不符")
    summary = _clean(story.summary) or fallback_summary
    return StoryPlan(
        title=title,
        summary=summary[:200],
        captions=captions,
        scenes=scenes,
        source="llm",
    )


# 模型最常「順手補」的情節：時間點、餐別、移動／轉場。出現在輸出、但輸入沒有 → 視為編造。
# 圖說／標題／總結（念給長輩聽）與畫面描述（決定畫什麼）都檢查。
_GUARDED_TERMS = (
    # 時間點
    "一大早", "一早", "清晨", "早晨", "早上", "上午", "中午", "午後", "下午",
    "傍晚", "黃昏", "天黑", "晚上", "今晚", "夜裡", "夜晚", "深夜", "半夜",
    # 餐別（輸入只說「吃飯」時不可指定是哪一餐）
    "早餐", "早飯", "午餐", "午飯", "晚餐", "晚飯",
    # 移動／轉場
    "回到家", "回家", "出門", "出發", "離開",
)


_NEGATIONS = ("沒有", "沒", "不想", "不用", "不必", "不", "別", "未")


def _affirmed(text: str, term: str) -> bool:
    """term 是否以「肯定」語意出現（前面緊接否定詞的「沒有出門」不算）。"""
    start = text.find(term)
    while start != -1:
        before = text[max(0, start - 3) : start]
        if not any(before.endswith(n) for n in _NEGATIONS):
            return True
        start = text.find(term, start + 1)
    return False


def find_fabrications(plan: StoryPlan, source_text: str) -> list[str]:
    """回傳輸出以肯定語意寫出、但輸入沒有肯定提到的受控詞（空 list＝通過）。

    例：輸入「沒有出門」→ 輸出「沒有出門」可以，「出門走走」不行。
    """
    out = plan.title + plan.summary + "".join(plan.captions) + "".join(plan.scenes)
    return [t for t in _GUARDED_TERMS if _affirmed(out, t) and not _affirmed(source_text, t)]


class StoryWriter:
    """以 Vertex 文字模型撰寫故事，失敗時退回規則式。"""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = None

    def _get_client(self):
        if self._client is None:
            from google import genai

            if not self._settings.vertex_project:
                raise RuntimeError("未設定 VERTEX_PROJECT")
            self._client = genai.Client(
                vertexai=True,
                project=self._settings.vertex_project,
                location=self._settings.vertex_location,
            )
        return self._client

    async def _call_model(self, model: str, text: str, mood: str | None, feedback: str) -> dict:
        from google.genai.types import GenerateContentConfig, ThinkingConfig

        client = self._get_client()
        prompt = _user_prompt(text, mood)
        if feedback:
            prompt += f"\n\n【上一版有問題，請重寫】{feedback}"
        resp = await client.aio.models.generate_content(
            model=model,
            contents=prompt,
            config=GenerateContentConfig(
                system_instruction=_SYSTEM,
                response_mime_type="application/json",
                response_schema=_Story,
                temperature=0.5,
                # 短文案不需要長推理：限制思考預算壓低延遲（生圖已要 30 秒以上）
                thinking_config=ThinkingConfig(thinking_budget=512),
            ),
        )
        return json.loads(resp.text)

    async def _attempt(
        self, model: str, text: str, mood: str | None, summary: str, feedback: str = ""
    ) -> tuple[StoryPlan | None, str]:
        """呼叫一次並檢查；回傳 (plan, 問題描述)，問題為空字串＝合格。"""
        raw = await self._call_model(model, text, mood, feedback)
        try:
            plan = validate_story(raw, summary)
        except (ValidationError, ValueError) as exc:
            return None, f"格式不合格（{str(exc)[:80]}）：每格要是完整句子、四格或零格、標題 14 字內。"
        bad = find_fabrications(plan, text)
        if bad:
            return plan, f"輸入沒有提到「{'、'.join(bad)}」，不可以寫進標題、總結、圖說或畫面描述。"
        return plan, ""

    async def _write_with(self, model: str, text: str, mood: str | None, summary: str) -> StoryPlan:
        """單一模型：寫一次，不合格就帶具體問題重寫一次；仍不合格拋 ValueError。"""
        plan, problem = await self._attempt(model, text, mood, summary)
        if problem:
            logger.info("故事（%s）需要重寫：%s", model, problem)
            plan, problem = await self._attempt(model, text, mood, summary, problem)
        if problem or plan is None:
            raise ValueError(f"{model} 重寫後仍不合格：{problem}")
        return plan

    async def write(self, text: str, mood: str | None = None) -> StoryPlan:
        """依 VERTEX_TEXT_MODEL 順序嘗試（逗號分隔；快的在前、品質好的備援），
        全部失敗／逾時退回規則式。"""
        fallback = rules_plan(text)
        if not self._settings.story_llm_enabled or not text.strip():
            return fallback
        models = [m.strip() for m in self._settings.vertex_text_model.split(",") if m.strip()]
        plan: StoryPlan | None = None
        try:
            with anyio.fail_after(self._settings.story_llm_timeout_s):
                for model in models:
                    try:
                        plan = await self._write_with(model, text, mood, fallback.summary)
                        break
                    except (ValidationError, ValueError, json.JSONDecodeError) as exc:
                        logger.warning("故事模型 %s 輸出不可用：%s", model, exc)
                    except Exception as exc:  # noqa: BLE001 — GCP／網路錯誤（含模型下架 404）
                        logger.warning("故事模型 %s 呼叫失敗：%s", model, exc)
        except TimeoutError:
            logger.warning("故事模型逾時（%ss），改用規則式", self._settings.story_llm_timeout_s)
        if plan is None:
            logger.warning("故事改用規則式")
            return fallback
        # 結構化輸入一定要能分四格；模型回空時採規則式圖說（標題／總結仍用模型的）
        if not plan.captions and fallback.captions:
            plan.captions, plan.scenes = fallback.captions, []
        return plan
