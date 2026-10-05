"""PocketBase 檔案的公開代理（正式部署用）。

正式環境 PocketBase 只在 VPC 內網，瀏覽器連不到；後端以同一路徑
`/api/files/{collection}/{record}/{filename}` 轉發，讓
`POCKETBASE_PUBLIC_URL` 直接設成後端對外網址即可（`file_url` 不必改）。

只轉發檔案讀取（GET），不暴露 PocketBase 其他 API。檔名含 PocketBase
產生的隨機後綴、內容不會變，故可長快取。
"""

import re

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.core.config import get_settings

router = APIRouter(tags=["files"])

_SEGMENT = re.compile(r"^[A-Za-z0-9_.\-]{1,200}$")
_PASS_HEADERS = ("content-type", "etag", "last-modified")


@router.get("/api/files/{collection}/{record}/{filename}")
async def proxy_file(collection: str, record: str, filename: str) -> Response:
    for seg in (collection, record, filename):
        if not _SEGMENT.match(seg) or seg in (".", ".."):
            raise HTTPException(status_code=404)
    base = get_settings().pocketbase_url.rstrip("/")
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(f"{base}/api/files/{collection}/{record}/{filename}")
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="檔案服務暫時無法連線") from exc
    if resp.status_code != 200:
        raise HTTPException(status_code=404 if resp.status_code < 500 else 502)
    headers = {k: v for k, v in resp.headers.items() if k.lower() in _PASS_HEADERS}
    headers["cache-control"] = "public, max-age=31536000, immutable"
    return Response(content=resp.content, headers=headers)
