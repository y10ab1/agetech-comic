"""LINE Bot webhook 路由。

長輩在 LINE 傳一段文字日記 → 回覆一張四格漫畫＋故事文字＋旁白語音。

- 生成要十幾秒到半分鐘：webhook 先回 200（LINE 要求盡快回應），
  實際生成放背景工作；等待期間顯示 LINE 的「輸入中」動畫。
  Cloud Run 需 `--no-cpu-throttling`，回應後背景工作才有 CPU（見 deploy/gcp/deploy.sh）。
- 完成後先用 reply token 回覆（不占每月推播額度），token 失效才改 push。
- 重送事件（is_redelivery）略過，避免同一則日記生兩次。
- 每位使用者每小時上限 LINE_GENERATE_LIMIT_PER_USER_HOUR，全域額度與網頁共用。
"""

import logging

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from linebot.v3 import WebhookParser
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.messaging import (
    ApiException,
    AsyncApiClient,
    AsyncMessagingApi,
    AudioMessage,
    Configuration,
    ImageMessage,
    PushMessageRequest,
    ReplyMessageRequest,
    ShowLoadingAnimationRequest,
    TextMessage,
)
from linebot.v3.webhooks import MessageEvent, TextMessageContent

from app.core import rate_limit
from app.core.config import Settings, get_settings
from app.models.comic import ComicResult, DiaryEntry
from app.services.comic_generator import ComicGenerator

logger = logging.getLogger(__name__)
router = APIRouter(tags=["line"])

_MAX_TEXT = 500
MSG_NOT_TEXT = "請用文字告訴我您今天做了什麼，我幫您畫成四格漫畫喔！"
MSG_RATE_LIMIT = "今天已經畫了好多張囉，先休息一下，晚一點再來找我喔！"
MSG_FAILED = "不好意思，這次畫圖出了點問題，請再傳一次給我。"


@router.post("/webhook")
async def line_webhook(
    request: Request,
    background: BackgroundTasks,
    x_line_signature: str = Header(default=""),
) -> dict:
    """LINE Messaging API 的 webhook 進入點（驗簽後立即回 200，生成在背景）。"""
    settings = get_settings()
    if not settings.line_channel_secret or not settings.line_channel_access_token:
        raise HTTPException(status_code=503, detail="LINE channel 憑證未設定")

    body = (await request.body()).decode("utf-8")
    try:
        events = WebhookParser(settings.line_channel_secret).parse(body, x_line_signature)
    except InvalidSignatureError as exc:
        raise HTTPException(status_code=400, detail="Invalid signature") from exc

    for event in events:
        if not isinstance(event, MessageEvent):
            continue
        if event.delivery_context and event.delivery_context.is_redelivery:
            logger.info("略過 LINE 重送事件 %s", event.webhook_event_id)
            continue
        user_id = getattr(event.source, "user_id", None)
        if getattr(event.source, "type", "") != "user" or not user_id:
            continue  # 只處理一對一聊天（群組不生成）
        text = event.message.text if isinstance(event.message, TextMessageContent) else None
        background.add_task(handle_message, settings, user_id, event.reply_token, text)

    return {"status": "ok"}


def build_result_messages(result: ComicResult) -> list:
    """生成結果 → LINE 訊息（文字故事＋漫畫圖＋旁白語音，最多 5 則）。"""
    lines = [f"「{result.title}」" if result.title else "今天的四格漫畫"]
    if len(result.quadrant_captions) == 4:
        lines += [f"{n} {c}" for n, c in zip("①②③④", result.quadrant_captions)]
    else:
        lines.append(result.summary)
    messages: list = [TextMessage(text="\n".join(lines))]

    cover = result.cover_url
    if cover.startswith("https://"):  # LINE 只收 https 網址
        messages.append(
            ImageMessage(
                original_content_url=f"{cover}?variant=line",
                preview_image_url=f"{cover}?variant=line_preview",
            )
        )
    audio = result.narration_audio_url
    if audio and audio.startswith("https://") and result.narration_audio_duration_ms:
        messages.append(
            AudioMessage(original_content_url=audio, duration=result.narration_audio_duration_ms)
        )
    return messages


async def _send(api: AsyncMessagingApi, user_id: str, reply_token: str | None, messages: list) -> None:
    """先用 reply token（免費），失效（逾時／已用過）再 push。"""
    if reply_token:
        try:
            await api.reply_message(ReplyMessageRequest(reply_token=reply_token, messages=messages))
            return
        except ApiException as exc:
            logger.info("reply token 無法使用（%s），改用 push", exc.status)
    await api.push_message(PushMessageRequest(to=user_id, messages=messages))


async def handle_message(
    settings: Settings, user_id: str, reply_token: str | None, text: str | None
) -> None:
    """背景工作：生成漫畫並回覆。所有錯誤都在這裡收斂，不讓背景工作炸掉。"""
    config = Configuration(access_token=settings.line_channel_access_token)
    async with AsyncApiClient(config) as api_client:
        api = AsyncMessagingApi(api_client)
        try:
            await _generate_and_reply(api, settings, user_id, reply_token, text)
        except Exception:  # noqa: BLE001
            logger.exception("LINE 訊息處理失敗（user=%s）", user_id)


async def _generate_and_reply(
    api: AsyncMessagingApi,
    settings: Settings,
    user_id: str,
    reply_token: str | None,
    text: str | None,
) -> None:
    text = (text or "").strip()
    if not text:
        await _send(api, user_id, reply_token, [TextMessage(text=MSG_NOT_TEXT)])
        return

    key = f"line:{user_id}"
    per_user, total = settings.line_generate_limit_per_user_hour, settings.generate_limit_global_hour
    ts = rate_limit.consume(key, per_user, total) if (per_user > 0 or total > 0) else None
    if (per_user > 0 or total > 0) and ts is None:
        await _send(api, user_id, reply_token, [TextMessage(text=MSG_RATE_LIMIT)])
        return

    try:
        # 「輸入中」動畫最長 60 秒；收到訊息會自動消失
        await api.show_loading_animation(
            ShowLoadingAnimationRequest(chat_id=user_id, loading_seconds=60)
        )
    except ApiException as exc:
        logger.info("無法顯示 loading 動畫：%s", exc.status)

    try:
        result = await ComicGenerator(settings).create_comic(
            DiaryEntry(user_id=user_id, text=text[:_MAX_TEXT])
        )
    except Exception:  # noqa: BLE001 — 生圖／存檔／未預期錯誤都要回覆長輩，不能讓對方空等
        logger.exception("LINE 漫畫生成失敗（user=%s）", user_id)
        if ts is not None:
            rate_limit.release(key, ts)
        await _send(api, user_id, reply_token, [TextMessage(text=MSG_FAILED)])
        return

    await _send(api, user_id, reply_token, build_result_messages(result))
