/** 表情鍵，對應立繪檔名 smile / laugh / tired */
export type Expression = "smile" | "laugh" | "tired";

/** 導引問題的一個選項 */
export interface QuestionOption {
  /** 結構化 key（打包進 Logline），如 mood:happy */
  value: string;
  label: string;
  icon: string;
}

/** 一個導引問題（一頁一問題） */
export interface Question {
  id: string;
  slug: string;
  /** 問句；可含 {稱呼}/{說書人} placeholder */
  title: string;
  options: QuestionOption[];
  allowCustom?: boolean;
  customHint?: string;
}

/** 使用者單選步驟結果（key = question.id） */
export type Selections = Record<string, QuestionOption>;

/** 字幕分段：一句話 + 立繪表情 + 高亮象限 */
export interface ScriptSegment {
  text: string;
  expression: Expression;
  /** 單張四格圖的高亮象限 0–3（閱讀順序：左上→右上→左下→右下） */
  panelIndex?: number;
  accent?: boolean;
}

/** 四個象限的圖說（閱讀順序左上→右上→左下→右下，恰 4 筆） */
export type QuadrantCaptions = [string, string, string, string];

/** 前端顯示用的漫畫格 */
export interface DisplayPanel {
  src: string;
  alt: string;
  caption: string;
  /** 佔位圖（非真 2×2 四格圖）：不畫象限高亮框，圖說與朗讀照常 */
  placeholder?: boolean;
}

/** 前端顯示用的完整腳本（由 mock 或 API 結果轉出） */
export interface DisplayScript {
  loglineText: string;
  /** 故事標題（正式由後端 AI 下標；demo 用樣板） */
  title: string;
  narratorId: string;
  narratorName: string;
  /** 單張四格圖策略（api-contract-additions.md §1-1）：正常僅 1 個元素 */
  panels: DisplayPanel[];
  /** 四個象限的圖說（依閱讀順序）；後端未提供時省略，改顯示 panels[0].caption */
  quadrantCaptions?: QuadrantCaptions;
  segments: ScriptSegment[];
}

/** 集章存摺的一枚印章 */
export interface StampRecord {
  id: string;
  createdAt: string;
  loglineText: string;
  narratorName: string;
  coverSrc: string;
  /** 成就類型，Phase 2 擴充健康類 */
  kind: "diary";
  /** 固定 taxonomy 的 tag id（見 data/tags.ts；舊資料缺漏時讀取時補推導） */
  tags?: string[];
  /** 生成時選用的畫風 id（見 data/rewards.ts STYLES） */
  styleId?: string;
  /** 故事標題（正式由後端 AI 下標；舊資料缺漏時退回 logline） */
  title?: string;
  /** 當天劇場的逐句腳本（落章時寫入；舊資料缺漏時內頁改用回憶重述樣板） */
  segments?: ScriptSegment[];
  /** 當天的漫畫格（落章時寫入；舊資料缺漏時內頁顯示封面佔位圖） */
  panels?: DisplayPanel[];
  /** 單張四格圖的象限圖說（落章時寫入；panels 為多張的舊資料不適用） */
  quadrantCaptions?: QuadrantCaptions;
}
