"""應用程式設定。

透過環境變數（或 .env 檔）載入設定。
複製 .env.example 為 .env 並填入實際值。
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 應用程式
    app_name: str = "AgeTech Comic Backend"
    debug: bool = False
    # 開發模式：允許以 X-Debug-User 標頭帶入假 user_id（跳過 LINE 驗證）
    env: str = "dev"

    # LINE Bot 憑證（於 LINE Developers Console 取得）
    line_channel_access_token: str = ""
    line_channel_secret: str = ""

    # Vertex AI（圖片生成）
    # 認證走 GCP ADC（gcloud auth application-default login），不需 API key。
    vertex_project: str = ""
    vertex_location: str = "global"
    # 生圖：Nano Banana 2 Lite（gemini-3.1-flash-lite-image），最大 1K（設 2K 會 400）。
    # 換回 Nano Banana Pro（gemini-3-pro-image）時可設 VERTEX_IMAGE_SIZE=2K
    vertex_image_model: str = "gemini-3.1-flash-lite-image"
    vertex_image_size: str = "1K"
    # 故事文字（標題／四格圖說／畫面描述）。逗號分隔＝依序嘗試：快的 GA 模型在前，
    # 不合格（含重寫一次後）或呼叫失敗換下一個；全部失敗或逾時退回規則式
    vertex_text_model: str = "gemini-2.5-flash,gemini-3-flash-preview"
    story_llm_enabled: bool = True
    story_llm_timeout_s: float = 45.0  # 含重寫與備援模型
    # 生圖失敗時是否回傳佔位結果（不中斷流程），供本機無 GCP 權限時開發
    image_gen_fallback: bool = True

    # PocketBase（DB + 圖檔儲存層，後端以 HTTP 存取）
    pocketbase_url: str = "http://localhost:8090"
    # 回給前端的圖檔公開網址前綴（瀏覽器可連）。留空則沿用 pocketbase_url。
    # compose 內部主機名（pocketbase:8090）瀏覽器連不到，正式部署務必設對外位址。
    pocketbase_public_url: str = ""
    pocketbase_admin_email: str = ""
    pocketbase_admin_password: str = ""
    # 關閉持久化時（如純生圖測試），/comics/generate 不寫 DB
    persist_diaries: bool = True

    # 生成次數上限（每執行個體、每小時；0＝不限）。LINE 驗證上線前防止公開端點被濫用燒 Vertex 費用
    generate_limit_per_ip_hour: int = 0
    generate_limit_global_hour: int = 0

    # CORS：允許前端存取的來源
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    """回傳快取後的設定實例。"""
    return Settings()
