"""簡易生成次數上限（LINE 身分驗證上線前的費用防護）。

每個 Cloud Run 執行個體各自計數（記憶體、滑動一小時視窗），搭配
--max-instances 估算總上限。設定為 0 表示不限制（本機開發預設）。
"""

import time
from collections import deque
from collections.abc import Iterator
from threading import Lock

from fastapi import HTTPException, Request

from app.core.config import get_settings

_WINDOW = 3600.0
_lock = Lock()
_per_ip: dict[str, deque[float]] = {}
_global: deque[float] = deque()


def _client_ip(request: Request) -> str:
    # Cloud Run 會把實際連線的來源 IP「附加」在 X-Forwarded-For 最後；
    # 前面的值可由用戶端偽造，所以取最後一個
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[-1].strip() or (request.client.host if request.client else "?")


def _trim(q: deque[float], now: float) -> None:
    while q and now - q[0] > _WINDOW:
        q.popleft()


def consume(key: str, per_key: int, total: int) -> float | None:
    """嘗試取一次額度；成功回傳時間戳（失敗時拿去 release 退回），超過上限回 None。

    key 為來源識別（網頁＝IP、LINE＝"line:{userId}"），全域額度兩者共用。
    """
    now = time.monotonic()
    with _lock:
        _trim(_global, now)
        q = _per_ip.setdefault(key, deque())
        _trim(q, now)
        if (per_key > 0 and len(q) >= per_key) or (total > 0 and len(_global) >= total):
            return None
        q.append(now)
        _global.append(now)
        if len(_per_ip) > 10_000:  # 防記憶體無限成長
            for k in [k for k, v in _per_ip.items() if not v]:
                del _per_ip[k]
    return now


def release(key: str, ts: float) -> None:
    """退回 consume 取得的額度（生成失敗時用）。"""
    with _lock:
        for dq in (_per_ip.get(key), _global):
            if dq is None:
                continue
            try:
                dq.remove(ts)
            except ValueError:
                pass


def check_generation_quota(request: Request) -> Iterator[None]:
    """超過上限時拋 429（結構化錯誤，見 api-contract §8）。

    FastAPI yield dependency：生成失敗（例外）時退回這次額度，
    避免 Vertex 暫時故障時使用者連按「再試一次」把額度耗盡。
    """
    s = get_settings()
    per_ip, total = s.generate_limit_per_ip_hour, s.generate_limit_global_hour
    if per_ip <= 0 and total <= 0:
        yield
        return
    ip = _client_ip(request)
    ts = consume(ip, per_ip, total)
    if ts is None:
        raise HTTPException(status_code=429, detail={"code": "RATE_LIMIT"})
    try:
        yield
    except Exception:
        release(ip, ts)
        raise


def reset() -> None:
    """測試用。"""
    with _lock:
        _per_ip.clear()
        _global.clear()
