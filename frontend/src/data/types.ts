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

/** 字幕分段：一句話 + 立繪表情 + 高亮漫畫格 */
export interface ScriptSegment {
  text: string;
  expression: Expression;
  panelIndex?: number;
  accent?: boolean;
}

/** 前端顯示用的漫畫格 */
export interface DisplayPanel {
  src: string;
  alt: string;
  caption: string;
}

/** 前端顯示用的完整腳本（由 mock 或 API 結果轉出） */
export interface DisplayScript {
  loglineText: string;
  /** 故事標題（正式由後端 AI 下標；demo 用樣板） */
  title: string;
  narratorId: string;
  narratorName: string;
  panels: DisplayPanel[];
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
}
