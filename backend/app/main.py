"""FastAPI 應用程式進入點。

啟動：
    uv run fastapi dev app/main.py      # 開發模式
    uv run fastapi run app/main.py      # 正式模式
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import comics, files, line_webhook
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(line_webhook.router)
app.include_router(comics.router)
app.include_router(files.router)


@app.get("/health", tags=["system"])
async def health() -> dict:
    """健康檢查端點。"""
    return {"status": "ok", "app": settings.app_name}
