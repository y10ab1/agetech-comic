"""Vertex AI 圖片生成服務（Nano Banana 2 / Gemini 3 Pro Image）。

一次生成「一張」包含 2x2 四格的漫畫圖（非四張獨立圖），同步等待。
認證走 GCP ADC，不需 API key。
"""

import logging

from app.core.config import Settings

logger = logging.getLogger(__name__)

# 畫風 id → prompt 描述（對應前端 /styles；未知或 None 用預設日系）
_STYLE_PROMPTS = {
    "japanese": "溫暖的日系漫畫風格，柔和線條",
    "american": "美式漫畫風格，鮮明色彩與粗線條",
    "korean": "韓式網路漫畫（webtoon）風格，細膩柔和",
    "watercolor": "溫暖水彩畫風，柔和暈染",
}
_DEFAULT_STYLE = "japanese"


class ImageGenerationError(RuntimeError):
    """生圖失敗。"""


class VertexImageGenerator:
    """呼叫 Vertex AI 生成單張四格漫畫。"""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = None  # 延遲初始化（避免無 GCP 環境時 import 就爆）

    def _get_client(self):
        if self._client is None:
            from google import genai

            if not self._settings.vertex_project:
                raise ImageGenerationError(
                    "未設定 VERTEX_PROJECT，無法初始化 Vertex client"
                )
            # 明確指定 vertexai=True + project + location，避免被環境變數
            # （如 GOOGLE_API_KEY/GEMINI_API_KEY）誤導成 API key 模式。
            self._client = genai.Client(
                vertexai=True,
                project=self._settings.vertex_project,
                location=self._settings.vertex_location,
            )
        return self._client

    def build_prompt(self, summary: str, style: str | None) -> str:
        """把當天故事總結組成四格漫畫的生圖 prompt。"""
        style_desc = _STYLE_PROMPTS.get(style or _DEFAULT_STYLE, _STYLE_PROMPTS[_DEFAULT_STYLE])
        return (
            "請生成一張圖，內含 2x2 排列的四格漫畫（四格連環漫畫），"
            "描繪一位台灣長輩今天的溫馨日常故事。\n"
            f"故事內容：{summary}\n"
            f"畫風：{style_desc}。\n"
            "要求：四格之間有清楚的分隔線；角色造型在四格中保持一致；"
            "溫暖正向、適合長輩觀看；畫面乾淨、無文字或僅極少文字。"
        )

    async def generate_comic_image(self, summary: str, style: str | None) -> bytes:
        """生成單張四格漫畫圖，回傳 PNG bytes。

        同步呼叫 Vertex（generate_content 本身同步），以 threadpool 包裝避免
        阻塞事件迴圈。
        """
        import anyio

        from google.genai.types import GenerateContentConfig, Modality

        prompt = self.build_prompt(summary, style)

        def _call() -> bytes:
            client = self._get_client()
            response = client.models.generate_content(
                model=self._settings.vertex_image_model,
                contents=prompt,
                config=GenerateContentConfig(
                    response_modalities=[Modality.TEXT, Modality.IMAGE],
                ),
            )
            for part in response.candidates[0].content.parts:
                if getattr(part, "inline_data", None) is not None:
                    return part.inline_data.data
            raise ImageGenerationError("回應中找不到圖片資料")

        try:
            return await anyio.to_thread.run_sync(_call)
        except ImageGenerationError:
            raise
        except Exception as exc:  # noqa: BLE001 — 收斂各種 GCP/網路錯誤
            raise ImageGenerationError(f"Vertex 生圖失敗：{exc}") from exc
