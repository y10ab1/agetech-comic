"""PocketBase DB / 檔案儲存層（後端以 HTTP 存取，前端不直接碰）。

- 以 superuser 密碼登入取得 token（bypass 所有 collection rules）。
- 日記紀錄寫入 `diaries` collection，並以 multipart 上傳四格漫畫圖檔
  （及可選的旁白音檔 narration_audio）。
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
        image_mime: str = "image/png",
        narration: str = "",
        audio_bytes: bytes | None = None,
        audio_filename: str = "narration.mp3",
        audio_mime: str = "audio/mpeg",
    ) -> tuple[str, str, str | None]:
        """建立一筆日記紀錄，回傳 (record_id, cover_url, narration_audio_url)。

        audio_bytes 為後端 TTS 旁白音檔（issue #9）；目前尚未實作 TTS，
        呼叫端不帶時音檔欄位留空、narration_audio_url 回 None。
        """
        data = {
            "user_id": user_id,
            "title": title,
            "tags": ",".join(tags),  # 以逗號字串儲存，讀取時再拆
            "logline": logline,
            "narration": narration,
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        }
        if mood:
            data["mood"] = mood
        if style:
            data["style"] = style

        files: dict[str, tuple[str, bytes, str]] = {}
        if image_bytes:
            files["comic"] = (image_filename, image_bytes, image_mime)
        if audio_bytes:
            files["narration_audio"] = (audio_filename, audio_bytes, audio_mime)

        async with httpx.AsyncClient(timeout=30.0) as client:
            token = await self._authenticate(client)
            url = f"{self._base}/api/collections/{_DIARIES}/records"
            resp = await client.post(
                url, headers={"Authorization": token}, data=data, files=files or None
            )
            if (
                resp.status_code == 400
                and "narration_audio" in files
                and self._rejected_field(resp) == "narration_audio"
            ):
                # 音檔被拒（格式/大小不符白名單）不該連圖與日記一起丟：去掉音檔重試
                logger.warning(
                    "旁白音檔被 PocketBase 拒絕（%s），改存不含音檔的日記", resp.text
                )
                files.pop("narration_audio")
                resp = await client.post(
                    url, headers={"Authorization": token}, data=data, files=files or None
                )
            if resp.status_code not in (200, 201):
                raise PocketBaseError(
                    f"建立日記失敗：{resp.status_code} {resp.text}"
                )
            record = resp.json()

        cover_url = ""
        if record.get("comic"):
            cover_url = self.file_url(record, record["comic"])
        return record["id"], cover_url, self._audio_url(record)

    @staticmethod
    def _rejected_field(resp: httpx.Response) -> str | None:
        """PocketBase 400 驗證錯誤中唯一被拒的欄位名（多欄或無法解析時回 None）。"""
        try:
            fields = list((resp.json().get("data") or {}).keys())
        except ValueError:
            return None
        return fields[0] if len(fields) == 1 else None

    def _audio_url(self, record: dict) -> str | None:
        """旁白音檔公開網址；沒有音檔（含 migration 前的舊紀錄）時回 None。"""
        filename = record.get("narration_audio")
        return self.file_url(record, filename) if filename else None

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
            narration=item.get("narration", "") or "",
            narration_audio_url=self._audio_url(item),
        )
