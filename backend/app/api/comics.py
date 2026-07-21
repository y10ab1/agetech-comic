"""供前端（Next.js / LIFF）使用的漫畫與日記 API 路由。"""

from fastapi import APIRouter, Header, HTTPException

from app.core.config import get_settings
from app.models.comic import ComicResult, DiaryEntry, DiaryListResponse
from app.services.comic_generator import ComicGenerator
from app.services.pocketbase_client import PocketBaseClient, PocketBaseError

router = APIRouter(tags=["comics"])


def _resolve_user(x_debug_user: str | None) -> str | None:
    """開發模式下允許用 X-Debug-User 標頭帶入假 user_id。

    正式版應改為驗證 LINE access token（見 api-contract-additions.md §4）。
    """
    settings = get_settings()
    if settings.env == "dev" and x_debug_user:
        return x_debug_user
    return None


@router.post("/comics/generate", response_model=ComicResult)
async def generate_comic(
    entry: DiaryEntry,
    x_debug_user: str | None = Header(default=None),
) -> ComicResult:
    """從日記文字生成單張四格漫畫（同步等待），並持久化日記。"""
    debug_user = _resolve_user(x_debug_user)
    if debug_user:
        entry.user_id = debug_user
    generator = ComicGenerator(get_settings())
    return await generator.create_comic(entry)


@router.get("/me/diaries", response_model=DiaryListResponse)
async def list_my_diaries(
    month: str | None = None,
    x_debug_user: str | None = Header(default=None),
) -> DiaryListResponse:
    """集章存摺頁：列出當前使用者的日記（可依月份篩選 YYYY-MM）。"""
    settings = get_settings()
    user_id = _resolve_user(x_debug_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="缺少身分（開發模式請帶 X-Debug-User）")
    if not settings.persist_diaries:
        raise HTTPException(status_code=503, detail="日記持久化未啟用")

    pb = PocketBaseClient(settings)
    try:
        diaries, total, recorded_today = await pb.list_diaries(
            user_id=user_id, month=month
        )
    except PocketBaseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return DiaryListResponse(
        diaries=diaries, total_count=total, recorded_today=recorded_today
    )
