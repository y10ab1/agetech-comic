/**
 * 後端 API 串接工具。
 *
 * 後端預設跑在 http://localhost:8000（見 backend/ 說明）。
 * 可透過環境變數 NEXT_PUBLIC_API_BASE_URL 覆寫。
 *
 * 型別與後端契約對齊（見 backend/app/models/comic.py 與
 * docs/api-contract-additions.md）：DiaryEntry 支援 style/mood；
 * ComicResult 回傳 title/tags/cover_url/diary_id。
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/** 當天心情（週報關懷小結訊號），對齊後端 Mood。 */
export type Mood = "happy" | "calm" | "tired";

export interface DiaryEntry {
  user_id: string;
  text: string;
  /** 畫風 id（見 GET /styles）。省略＝預設畫風 */
  style?: string;
  /** 當天心情，週報關懷小結訊號 */
  mood?: Mood;
}

export interface ComicPanel {
  order: number;
  image_url: string;
  caption: string;
  /** 供無障礙口述影像使用的畫面描述 */
  alt_text: string;
}

export interface ComicResult {
  user_id: string;
  summary: string;
  panels: ComicPanel[];
  /** 整篇漫畫的無障礙口述內容 */
  narration: string;
  /** AI 依故事內容下的標題（集章存摺卡片顯示用） */
  title: string;
  /** 限定 taxonomy 的 tag id（見 shared/tags.json） */
  tags: string[];
  /** 封面圖網址（單張四格圖時＝該圖） */
  cover_url: string;
  /** 已持久化的日記紀錄 id（未持久化時為 null） */
  diary_id: string | null;
}

/**
 * dev 模式下可用 X-Debug-User 標頭帶入假 user_id（跳過 LINE 驗證，
 * 對齊後端 comics.py 的 _resolve_user）。正式版改為驗證 LINE token。
 */
export interface GenerateComicOptions {
  debugUser?: string;
}

/** 呼叫後端，把一天的日記文字轉成漫畫。 */
export async function generateComic(
  entry: DiaryEntry,
  options: GenerateComicOptions = {},
): Promise<ComicResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.debugUser) {
    headers["X-Debug-User"] = options.debugUser;
  }

  const res = await fetch(`${API_BASE_URL}/comics/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify(entry),
  });

  if (!res.ok) {
    throw new Error(`漫畫生成失敗：${res.status}`);
  }

  return res.json();
}
