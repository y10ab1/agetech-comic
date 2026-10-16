"""PocketBase 檔案的公開代理（正式部署用）。

正式環境 PocketBase 只在 VPC 內網，瀏覽器連不到；後端以同一路徑
`/api/files/{collection}/{record}/{filename}` 轉發，讓
`POCKETBASE_PUBLIC_URL` 直接設成後端對外網址即可（`file_url` 不必改）。

只轉發檔案讀取（GET），不暴露 PocketBase 其他 API。檔名含 PocketBase
產生的隨機後綴、內容不會變，故可長快取。

- HTTP Range：轉發給 PocketBase、回 206（iOS `<audio>` 播旁白音檔需要）。
- `?variant=line|line_preview`：圖片轉 JPEG（LINE 圖片訊息只收 JPEG/PNG，
  我們存的是 WebP）；只開放這兩種固定尺寸，避免被當任意縮圖服務。
"""

import io
import re

import anyio
import httpx
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import Response
from PIL import Image

from app.core.config import get_settings

router = APIRouter(tags=["files"])

_SEGMENT = re.compile(r"^[A-Za-z0-9_.\-]{1,200}$")
_PASS_HEADERS = ("content-type", "etag", "last-modified", "content-range", "accept-ranges")
# LINE 規格：原圖 ≤10MB、預覽圖 ≤1MB
_VARIANTS = {"line": (1024, 88), "line_preview": (480, 80)}


def to_jpeg(data: bytes, max_side: int, quality: int) -> bytes:
    with Image.open(io.BytesIO(data)) as im:
        im = im.convert("RGB")
        im.thumbnail((max_side, max_side))
        out = io.BytesIO()
        im.save(out, "JPEG", quality=quality, optimize=True)
    return out.getvalue()


@router.get("/api/files/{collection}/{record}/{filename}")
async def proxy_file(
    collection: str,
    record: str,
    filename: str,
    variant: str | None = None,
    range_: str | None = Header(default=None, alias="range"),
) -> Response:
    for seg in (collection, record, filename):
        if not _SEGMENT.match(seg) or seg in (".", ".."):
            raise HTTPException(status_code=404)
    if variant is not None and variant not in _VARIANTS:
        raise HTTPException(status_code=404)
    base = get_settings().pocketbase_url.rstrip("/")
    headers = {"range": range_} if range_ and variant is None else {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(
                f"{base}/api/files/{collection}/{record}/{filename}", headers=headers
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="檔案服務暫時無法連線") from exc
    if resp.status_code == 416:
        raise HTTPException(status_code=416)
    if resp.status_code not in (200, 206):
        raise HTTPException(status_code=404 if resp.status_code < 500 else 502)
    cache = {"cache-control": "public, max-age=31536000, immutable"}

    if variant is not None:
        if not resp.headers.get("content-type", "").startswith("image/"):
            raise HTTPException(status_code=404)
        max_side, quality = _VARIANTS[variant]
        try:
            jpeg = await anyio.to_thread.run_sync(to_jpeg, resp.content, max_side, quality)
        except Exception as exc:  # noqa: BLE001 — 壞圖
            raise HTTPException(status_code=404) from exc
        return Response(content=jpeg, media_type="image/jpeg", headers=cache)

    out_headers = {k: v for k, v in resp.headers.items() if k.lower() in _PASS_HEADERS}
    out_headers.setdefault("accept-ranges", "bytes")
    return Response(content=resp.content, status_code=resp.status_code, headers=out_headers | cache)
