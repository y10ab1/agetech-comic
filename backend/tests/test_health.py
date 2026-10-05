"""基本 API 測試（不依賴 Vertex / PocketBase，外部依賴以設定關閉或 mock）。"""

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app


@pytest.fixture(autouse=True)
def _isolate_external(monkeypatch):
    """關閉持久化、開啟生圖 fallback，讓測試不碰 Vertex / PocketBase。"""
    get_settings.cache_clear()
    monkeypatch.setenv("PERSIST_DIARIES", "false")
    monkeypatch.setenv("IMAGE_GEN_FALLBACK", "true")
    monkeypatch.setenv("ENV", "dev")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client(_isolate_external):
    return TestClient(app)


def test_health(client) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_generate_comic_contract_fields(client, monkeypatch) -> None:
    """生圖失敗時 fallback，仍回傳含契約欄位的結果。"""
    # 讓 Vertex 生圖丟錯 → 走 fallback（不產圖、不持久化）
    from app.services import image_generator

    async def _boom(self, summary, style, panel_plan=None):
        raise image_generator.ImageGenerationError("test: no GCP")

    monkeypatch.setattr(
        image_generator.VertexImageGenerator, "generate_comic_image", _boom
    )

    response = client.post(
        "/comics/generate",
        json={
            "user_id": "test-user",
            "text": "今天去公園散步，還餵了鴿子。",
            "mood": "happy",
            "style": "japanese",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == "test-user"
    assert data["narration"]
    # 契約增補欄位存在
    assert "title" in data
    assert "tags" in data
    assert "cover_url" in data
    # 自由文字無可靠分格：不給象限圖說，旁白保留原文
    assert data["quadrant_captions"] == []
    assert "今天去公園散步，還餵了鴿子。" in data["narration"]
    # issue #9：音檔欄位預留，尚無 TTS 時一律為 null
    assert data["narration_audio_url"] is None
    # fallback 情況下沒有圖，panels 為空
    assert data["panels"] == []


def test_diaries_requires_user(client) -> None:
    """未帶身分時 /me/diaries 回 401。"""
    response = client.get("/me/diaries")
    assert response.status_code == 401


def _gen():
    from app.services.comic_generator import ComicGenerator

    return ComicGenerator(get_settings())


@pytest.mark.anyio
async def test_quadrant_captions_structured_logline() -> None:
    """結構化 logline：恰 4 筆，只用輸入內容；narration 由其組成。"""
    gen = _gen()
    caps = await gen.build_quadrant_captions("高興 + 樂齡中心 + 朋友·泡茶聊天 + 運動")
    assert caps == [
        "今天的心情：高興。",
        "今天去了樂齡中心。",
        "和朋友泡茶聊天。",
        "還有運動。",
    ]
    narration = await gen.build_narration("x", caps)
    assert all(c in narration for c in caps)


@pytest.mark.anyio
@pytest.mark.parametrize(
    "text",
    [
        "今天整天待在家裡休息，沒有出門。",
        "高興 + 菜市場",
        "高興 +  + 運動",
        "",
        "蘋果 + 香蕉 + 橘子",
    ],
)
async def test_quadrant_captions_no_fabrication(text) -> None:
    """非結構化或不完整輸入：不捏造情節，回空 list、旁白保留原文。"""
    gen = _gen()
    assert await gen.build_quadrant_captions(text) == []
    narration = await gen.build_narration(text, [])
    assert "出門走走" not in narration and "回到家" not in narration
    assert text in narration


@pytest.mark.anyio
async def test_home_logline_has_no_outing() -> None:
    """待在家裡＋單一事件：不出現出門／回家等輸入沒有的情節。"""
    caps = await _gen().build_quadrant_captions("有點累 + 待在家裡 + 煮好菜")
    joined = "".join(caps)
    assert caps[1] == "今天待在家裡。"
    assert "出門" not in joined and "回到家" not in joined and "開心" not in joined


def test_prompt_shares_panel_plan() -> None:
    """生圖 prompt 帶入與圖說同源的四格配置。"""
    from app.services.image_generator import VertexImageGenerator

    plan = ["a", "b", "c", "d"]
    prompt = VertexImageGenerator(get_settings()).build_prompt("s", None, plan)
    for pos, text in zip(["左上", "右上", "左下", "右下"], plan):
        assert f"（{pos}）：{text}" in prompt
    assert "左上" not in VertexImageGenerator(get_settings()).build_prompt("s", None)


def test_to_record_narration_fields() -> None:
    """issue #9：_to_record 帶出 narration／narration_audio_url；舊紀錄缺欄位時為空值。"""
    from app.core.config import get_settings
    from app.services.pocketbase_client import PocketBaseClient

    pb = PocketBaseClient(get_settings())
    base = {"id": "r1", "collectionId": "c1", "user_id": "u", "created_at": "2026-10-05"}

    legacy = pb._to_record(base)
    assert legacy.narration == ""
    assert legacy.narration_audio_url is None

    with_audio = pb._to_record(
        {**base, "narration": "今天去公園。", "narration_audio": "narration_abc.mp3"}
    )
    assert with_audio.narration == "今天去公園。"
    assert with_audio.narration_audio_url.endswith("/api/files/c1/r1/narration_abc.mp3")


def test_logline_whitelist_matches_frontend() -> None:
    """後端 mood／place 白名單需與前端 questions.ts 選項一致（防漂移）。"""
    import re
    from pathlib import Path

    from app.services.comic_generator import MOOD_LABELS, PLACE_LABELS

    src = Path(__file__).resolve().parents[2] / "frontend/src/data/questions.ts"
    if not src.exists():
        pytest.skip("frontend 原始碼不在此環境（如 backend 容器）")
    text = src.read_text(encoding="utf-8")
    for kind, expected in (("mood", MOOD_LABELS), ("place", PLACE_LABELS)):
        labels = set(re.findall(rf'value: "{kind}:[^"]+", label: "([^"]+)"', text))
        assert labels == expected, kind


def test_alt_text_is_short_summary() -> None:
    """alt_text 為短版總述，不是完整 narration。"""
    from app.services.comic_generator import ComicGenerator

    caps = ["今天的心情：高興。", "今天去了菜市場。", "買菜。", "把今天的事記了下來。"]
    alt = ComicGenerator.build_alt_text("x", caps)
    assert alt == "四格漫畫，依序：今天的心情：高興；今天去了菜市場；買菜；把今天的事記了下來"


@pytest.mark.anyio
async def test_title_structured_matches_frontend_rule() -> None:
    gen = _gen()
    assert await gen.build_title("高興 + 樂齡中心 + 朋友·泡茶聊天 + 運動") == "樂齡中心的一天：運動"
    assert await gen.build_title("平靜 + 公園散步 + 老伴·散散步") == "公園散步的一天：和老伴散散步"
    assert await gen.build_title("今天去公園，很開心") == "今天去公園"
