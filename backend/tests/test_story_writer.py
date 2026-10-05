"""StoryWriter：模型輸出驗證、失敗退回規則式、與生圖共用四格企劃。"""

import asyncio

import pytest

from app.core.config import get_settings
from app.services import story_writer as sw

GOOD = {
    "title": "和老伴逛菜市場",
    "summary": "您今天心情很好，和老伴一起去菜市場買菜。",
    "panels": [
        {"caption": "今天您的心情好極了", "scene": "長輩在窗邊微笑伸懶腰"},
        {"caption": "您來到熱鬧的菜市場。", "scene": "長輩走進菜市場"},
        {"caption": "和老伴一起慢慢挑菜。", "scene": "長輩和老伴在菜攤前挑菜"},
        {"caption": "兩個人有說有笑，真好！", "scene": "長輩和老伴提著菜籃相視而笑"},
    ],
}


@pytest.fixture
def writer(monkeypatch):
    monkeypatch.setenv("STORY_LLM_ENABLED", "true")
    monkeypatch.setenv("STORY_LLM_TIMEOUT_S", "0.5")
    monkeypatch.setenv("VERTEX_PROJECT", "test")
    monkeypatch.setenv("VERTEX_TEXT_MODEL", "m1")  # 單一模型；備援鏈另測
    get_settings.cache_clear()
    yield sw.StoryWriter(get_settings())
    get_settings.cache_clear()


def _fake(monkeypatch, result=None, exc=None, delay=0.0):
    calls = []

    async def _call(self, model, text, mood, feedback=""):
        calls.append((text, mood, feedback, model))
        if isinstance(result, list):  # 依序回傳（測重寫）
            return result[len(calls) - 1]
        if delay:
            await asyncio.sleep(delay)
        if exc:
            raise exc
        return result

    monkeypatch.setattr(sw.StoryWriter, "_call_model", _call)
    return calls


def test_validate_normalizes() -> None:
    plan = sw.validate_story(GOOD, "x")
    assert plan.source == "llm"
    assert plan.title == "和老伴逛菜市場"
    assert plan.captions[0] == "今天您的心情好極了。"  # 補句號
    assert len(plan.scenes) == 4


@pytest.mark.parametrize(
    "bad",
    [
        {**GOOD, "panels": GOOD["panels"][:3]},  # 不是 4 格
        {**GOOD, "title": ""},
        {**GOOD, "title": "這是一個非常非常非常非常非常長的故事標題啊"},
        {**GOOD, "panels": [{"caption": "好" * 80, "scene": "s"}] * 4},
        {**GOOD, "panels": [{"caption": "好句子。", "scene": ""}] * 4},
        {"title": "x"},  # 缺欄位
    ],
)
def test_validate_rejects(bad) -> None:
    with pytest.raises(ValueError):
        sw.validate_story(bad, "x")


@pytest.mark.anyio
async def test_writer_uses_llm(writer, monkeypatch) -> None:
    calls = _fake(monkeypatch, result=GOOD)
    plan = await writer.write("高興 + 菜市場 + 老伴·買菜", "happy")
    assert plan.source == "llm" and plan.captions[2] == "和老伴一起慢慢挑菜。"
    assert calls and calls[0][0] == "高興 + 菜市場 + 老伴·買菜"


@pytest.mark.anyio
@pytest.mark.parametrize(
    "kwargs",
    [
        {"exc": RuntimeError("vertex down")},
        {"result": {"title": "x"}},
        {"result": GOOD, "delay": 2.0},  # 逾時
    ],
)
async def test_writer_falls_back_to_rules(writer, monkeypatch, kwargs) -> None:
    _fake(monkeypatch, **kwargs)
    plan = await writer.write("高興 + 菜市場 + 老伴·買菜", "happy")
    assert plan.source == "rules"
    assert plan.captions == sw.rules_captions("高興 + 菜市場 + 老伴·買菜")
    assert plan.title == "菜市場的一天：和老伴買菜"


@pytest.mark.anyio
async def test_structured_input_never_loses_quadrants(writer, monkeypatch) -> None:
    """模型對結構化輸入回 0 格時，採規則式圖說（象限同步不能消失）。"""
    _fake(monkeypatch, result={**GOOD, "panels": []})
    plan = await writer.write("高興 + 菜市場 + 老伴·買菜", "happy")
    assert plan.title == "和老伴逛菜市場"
    assert len(plan.captions) == 4 and plan.scenes == []


@pytest.mark.anyio
async def test_free_text_may_have_no_quadrants(writer, monkeypatch) -> None:
    _fake(monkeypatch, result={**GOOD, "panels": []})
    plan = await writer.write("今天在家休息。", None)
    assert plan.source == "llm" and plan.captions == []


@pytest.mark.anyio
async def test_disabled_skips_llm(monkeypatch) -> None:
    monkeypatch.setenv("STORY_LLM_ENABLED", "false")
    get_settings.cache_clear()
    calls = _fake(monkeypatch, result=GOOD)
    plan = await sw.StoryWriter(get_settings()).write("高興 + 菜市場 + 買菜")
    assert plan.source == "rules" and not calls


def test_user_prompt_structured_and_free_text() -> None:
    p = sw._user_prompt("有點累 + 待在家裡 + 老伴·一起吃飯 + 煮好菜", "tired")
    assert "心情：有點累" in p and "地點：待在家裡" in p and "和老伴一起吃飯、煮好菜" in p
    q = sw._user_prompt("今天去看醫生", "tired")
    assert "「今天去看醫生」" in q and "有點累" in q


@pytest.mark.anyio
async def test_create_comic_uses_scenes_for_image(monkeypatch) -> None:
    """生圖 prompt 用模型的畫面描述；回傳圖說用模型 caption。"""
    from app.services import comic_generator, image_generator

    monkeypatch.setenv("STORY_LLM_ENABLED", "true")
    monkeypatch.setenv("PERSIST_DIARIES", "false")
    monkeypatch.setenv("IMAGE_GEN_FALLBACK", "true")
    get_settings.cache_clear()
    _fake(monkeypatch, result=GOOD)
    seen = {}

    async def _img(self, summary, style, panel_plan=None):
        seen["plan"] = panel_plan
        raise image_generator.ImageGenerationError("no gcp")

    monkeypatch.setattr(image_generator.VertexImageGenerator, "generate_comic_image", _img)
    res = await comic_generator.ComicGenerator(get_settings()).create_comic(
        comic_generator.DiaryEntry(user_id="u", text="高興 + 菜市場 + 老伴·買菜", mood="happy")
    )
    assert seen["plan"] == [p["scene"] for p in GOOD["panels"]]
    assert res.title == "和老伴逛菜市場"
    assert res.quadrant_captions[2] == "和老伴一起慢慢挑菜。"
    assert all(c in res.narration for c in res.quadrant_captions)
    get_settings.cache_clear()


BAD_HOME = {**GOOD, "panels": GOOD["panels"][:3] + [{"caption": "下午開心地回到家。", "scene": "s"}]}


def test_find_fabrications() -> None:
    plan = sw.validate_story(BAD_HOME, "x")
    assert sw.find_fabrications(plan, "高興 + 菜市場 + 老伴·買菜") == ["下午", "回到家"]
    assert sw.find_fabrications(plan, "下午買完菜就回到家") == []
    # 換個說法的時間詞、餐別、畫面描述裡的編造也要抓到
    sneaky = {**GOOD, "title": "溫暖早晨", "panels": GOOD["panels"][:3] + [
        {"caption": "兩人一起吃晚餐。", "scene": "黃昏時分，長輩出門散步"}]}
    plan = sw.validate_story(sneaky, "x")
    assert sw.find_fabrications(plan, "高興 + 待在家裡 + 老伴·一起吃飯") == [
        "早晨", "黃昏", "晚餐", "出門"]
    # 輸入肯定提到的詞允許
    assert sw.find_fabrications(plan, "早晨黃昏都和老伴在一起，晚餐後出門") == []


def test_find_fabrications_negation() -> None:
    """輸入「沒有出門」：輸出照樣說「沒有出門」可以，寫成「出門走走」不行。"""
    src = "今天整天待在家裡休息，沒有出門。"
    ok = sw.validate_story({**GOOD, "panels": GOOD["panels"][:3] + [
        {"caption": "沒有出門，好好休息。", "scene": "長輩在沙發上休息"}]}, "x")
    assert sw.find_fabrications(ok, src) == []
    bad = sw.validate_story({**GOOD, "panels": GOOD["panels"][:3] + [
        {"caption": "下午出門走走。", "scene": "長輩在沙發上休息"}]}, "x")
    assert sw.find_fabrications(bad, src) == ["下午", "出門"]


@pytest.mark.anyio
async def test_writer_retries_once_on_fabrication(writer, monkeypatch) -> None:
    calls = _fake(monkeypatch, result=[BAD_HOME, GOOD])
    plan = await writer.write("高興 + 菜市場 + 老伴·買菜", "happy")
    assert plan.source == "llm" and "回到家" not in "".join(plan.captions)
    assert len(calls) == 2 and "回到家" in calls[1][2] and "下午" in calls[1][2]


@pytest.mark.anyio
async def test_writer_falls_back_when_retry_still_fabricates(writer, monkeypatch) -> None:
    calls = _fake(monkeypatch, result=[BAD_HOME, BAD_HOME])
    plan = await writer.write("高興 + 菜市場 + 老伴·買菜", "happy")
    assert plan.source == "rules" and len(calls) == 2


def test_validate_rejects_half_sentence() -> None:
    half = {**GOOD, "panels": GOOD["panels"][:2] + [{"caption": "好久不見的老朋友，", "scene": "s"}] + GOOD["panels"][3:]}
    with pytest.raises(ValueError):
        sw.validate_story(half, "x")
    broken = {**GOOD, "panels": GOOD["panels"][:2] + [{"caption": "好久不見的老朋友，。", "scene": "s"}] + GOOD["panels"][3:]}
    with pytest.raises(ValueError):
        sw.validate_story(broken, "x")


@pytest.mark.anyio
async def test_writer_retries_on_invalid_format(writer, monkeypatch) -> None:
    calls = _fake(monkeypatch, result=[{**GOOD, "panels": GOOD["panels"][:3]}, GOOD])
    plan = await writer.write("高興 + 菜市場 + 老伴·買菜", "happy")
    assert plan.source == "llm" and len(calls) == 2 and "格式不合格" in calls[1][2]


@pytest.mark.anyio
async def test_model_chain(monkeypatch) -> None:
    """快模型呼叫失敗或重寫後仍不合格 → 換下一個模型；全部不行 → 規則式。"""
    monkeypatch.setenv("STORY_LLM_ENABLED", "true")
    monkeypatch.setenv("VERTEX_TEXT_MODEL", "fast, better")
    get_settings.cache_clear()
    w = sw.StoryWriter(get_settings())
    tried = []

    async def _model(self, model, text, mood, feedback):
        tried.append(model)
        return BAD_HOME if model == "fast" else GOOD

    monkeypatch.setattr(sw.StoryWriter, "_call_model", _model)
    plan = await w.write("高興 + 菜市場 + 老伴·買菜", "happy")
    assert plan.source == "llm" and tried == ["fast", "fast", "better"]

    tried.clear()

    async def _down(self, model, text, mood, feedback):
        tried.append(model)
        if model == "fast":
            raise RuntimeError("404 NOT_FOUND")
        return BAD_HOME

    monkeypatch.setattr(sw.StoryWriter, "_call_model", _down)
    plan = await w.write("高興 + 菜市場 + 老伴·買菜", "happy")
    assert plan.source == "rules" and tried == ["fast", "better", "better"]
    get_settings.cache_clear()


def test_find_fabrications_synonyms() -> None:
    plan = sw.validate_story({**GOOD, "panels": GOOD["panels"][:3] + [
        {"caption": "一起吃午餐，早晨真好。", "scene": "s"}]}, "x")
    assert sw.find_fabrications(plan, "早上和老伴吃午飯") == []
    assert sw.find_fabrications(plan, "和老伴吃飯") == ["早晨", "午餐"]
