"""PocketBase DB / 檔案儲存層（後端以 HTTP 存取，前端不直接碰）。

- 以 superuser 密碼登入取得 token（bypass 所有 collection rules）。
- 日記紀錄寫入 `diaries` collection，並以 multipart 上傳四格漫畫圖檔。
- schema 由 pb_migrations/ 版控（見 pocketbase/pb_migrations）。
"""

import logging
from datetime import datetime, timezone

import httpx

from app.core.config import Settings
from app.models.comic import DiaryRecord

logger = logging.getLogger(__name__)

_DIARIES = "diaries"


class PocketBaseError(RuntimeError):
    """PocketBase 存取失敗。"""


class PocketBaseClient:
    """封裝後端對 PocketBase 的存取。"""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._base = settings.pocketbase_url.rstrip("/")
        # 回給前端的公開網址前綴（瀏覽器可連）；留空則用內部 base
        self._public_base = (
            settings.pocketbase_public_url.rstrip("/") or self._base
        )
        self._token: str | None = None

    async def _authenticate(self, client: httpx.AsyncClient) -> str:
        """以 superuser 登入取得 token（快取於實例）。"""
        if self._token:
            return self._token
        resp = await client.post(
            f"{self._base}/api/collections/_superusers/auth-with-password",
            json={
                "identity": self._settings.pocketbase_admin_email,
                "password": self._settings.pocketbase_admin_password,
            },
        )
        if resp.status_code != 200:
            raise PocketBaseError(f"PocketBase 登入失敗：{resp.status_code} {resp.text}")
        self._token = resp.json()["token"]
        return self._token

    def file_url(self, record: dict, filename: str) -> str:
        """組出圖檔的公開網址（用對外可達的 public base）。"""
        return f"{self._public_base}/api/files/{record['collectionId']}/{record['id']}/{filename}"

    async def create_diary(
        self,
        *,
        user_id: str,
        title: str,
        tags: list[str],
        mood: str | None,
        style: str | None,
        logline: str,
        image_bytes: bytes | None,
        image_filename: str = "comic.png",
    ) -> tuple[str, str]:
        """建立一筆日記紀錄，回傳 (record_id, cover_url)。"""
        data = {
            "user_id": user_id,
            "title": title,
            "tags": ",".join(tags),  # 以逗號字串儲存，讀取時再拆
            "logline": logline,
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        }
        if mood:
            data["mood"] = mood
        if style:
            data["style"] = style

        files = None
        if image_bytes:
            files = {"comic": (image_filename, image_bytes, "image/png")}

        async with httpx.AsyncClient(timeout=30.0) as client:
            token = await self._authenticate(client)
            resp = await client.post(
                f"{self._base}/api/collections/{_DIARIES}/records",
                headers={"Authorization": token},
                data=data,
                files=files,
            )
            if resp.status_code not in (200, 201):
                raise PocketBaseError(
                    f"建立日記失敗：{resp.status_code} {resp.text}"
                )
            record = resp.json()

        cover_url = ""
        if record.get("comic"):
            cover_url = self.file_url(record, record["comic"])
        return record["id"], cover_url

    async def list_diaries(
        self, *, user_id: str, month: str | None = None
    ) -> tuple[list[DiaryRecord], int, bool]:
        """列出某使用者的日記，回傳 (該月清單, 總數, 今天是否已記錄)。"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            token = await self._authenticate(client)
            headers = {"Authorization": token}

            # 該月清單
            month_filter = f'user_id="{user_id}"'
            if month:
                month_filter += f' && created_at~"{month}"'
            resp = await client.get(
                f"{self._base}/api/collections/{_DIARIES}/records",
                headers=headers,
                params={"filter": month_filter, "sort": "-created_at", "perPage": 100},
            )
            if resp.status_code != 200:
                raise PocketBaseError(f"讀取日記失敗：{resp.status_code} {resp.text}")
            items = resp.json().get("items", [])

            diaries = [self._to_record(it) for it in items]

            # 總數（集點卡進度）
            total_resp = await client.get(
                f"{self._base}/api/collections/{_DIARIES}/records",
                headers=headers,
                params={"filter": f'user_id="{user_id}"', "perPage": 1},
            )
            total_count = total_resp.json().get("totalItems", 0)

            # 今天是否已記錄
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            recorded_today = any(d.created_at.startswith(today) for d in diaries)

        return diaries, total_count, recorded_today

    def _to_record(self, item: dict) -> DiaryRecord:
        cover_url = ""
        if item.get("comic"):
            cover_url = self.file_url(item, item["comic"])
        tags_raw = item.get("tags", "")
        tags = [t for t in tags_raw.split(",") if t] if isinstance(tags_raw, str) else tags_raw
        return DiaryRecord(
            id=item["id"],
            user_id=item.get("user_id", ""),
            created_at=item.get("created_at", "") or item.get("created", ""),
            title=item.get("title", ""),
            tags=tags,
            mood=item.get("mood") or None,
            style=item.get("style") or None,
            cover_url=cover_url,
            logline=item.get("logline", ""),
        )
