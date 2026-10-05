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

    async def _boom(self, summary, style):
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
    # issue #9：音檔欄位預留，尚無 TTS 時一律為 null
    assert data["narration_audio_url"] is None
    # fallback 情況下沒有圖，panels 為空
    assert data["panels"] == []


def test_diaries_requires_user(client) -> None:
    """未帶身分時 /me/diaries 回 401。"""
    response = client.get("/me/diaries")
    assert response.status_code == 401


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
