# FastAPI 後端（用 uv 管理依賴）
FROM python:3.12-slim

# 安裝 uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# 先複製依賴宣告，利用 layer 快取
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# 複製應用程式
COPY app ./app

EXPOSE 8000

# 正式模式啟動
CMD ["uv", "run", "--no-dev", "fastapi", "run", "app/main.py", "--host", "0.0.0.0", "--port", "8000"]
