import type { Question, QuestionOption } from "./types";

/** 顯示時預設的稱呼（未選時的 fallback） */
export const DEFAULT_SALUTATION = "阿公阿嬤";

/**
 * 稱呼選擇設定 —— 只在初次註冊(/welcome)與設定(/settings)出現，
 * 不屬於每則日記流程。問句含 {說書人} placeholder。
 */
export const SALUTATION_TITLE = "想讓{說書人}怎麼稱呼您呢？";
export const SALUTATION_HINT =
  "也可以自己填想被叫的稱呼，例如：阿明伯、美惠阿姨";
export const SALUTATION_OPTIONS: QuestionOption[] = [
  { value: "sal:阿公", label: "阿公", icon: "👴" },
  { value: "sal:阿嬤", label: "阿嬤", icon: "👵" },
  { value: "sal:叔叔", label: "叔叔", icon: "🧑" },
  { value: "sal:阿姨", label: "阿姨", icon: "👩" },
  { value: "sal:大哥", label: "大哥", icon: "🧔" },
  { value: "sal:大姊", label: "大姊", icon: "👩‍🦱" },
];

/**
 * 每則日記的導引圖卡步驟 —— 心情 → 地點（稱呼已移出）。
 * 事件為可串接（見 EVENT_POOL 與事件串接頁）。
 * 問句中的 {稱呼} 於 render 時代入。
 */
export const QUESTIONS: Question[] = [
  {
    id: "mood",
    slug: "mood",
    title: "{稱呼}，今天心情怎麼樣？",
    options: [
      { value: "mood:happy", label: "高興", icon: "😄" },
      { value: "mood:calm", label: "平靜", icon: "🙂" },
      { value: "mood:tired", label: "有點累", icon: "😌" },
    ],
  },
  {
    id: "place",
    slug: "place",
    title: "今天去了哪裡呀？",
    options: [
      { value: "place:market", label: "菜市場", icon: "🧺" },
      { value: "place:park", label: "公園散步", icon: "🌳" },
      { value: "place:center", label: "樂齡中心", icon: "🏫" },
      { value: "place:home", label: "待在家裡", icon: "🏠" },
    ],
  },
];

/** 事件分組（v2）：三小節降低認知負荷；每個非保留 tag 至少有一個產生選項 */
export interface EventGroup {
  title: string;
  options: QuestionOption[];
}

export const EVENT_GROUPS: EventGroup[] = [
  {
    title: "跟家人朋友",
    options: [
      { value: "event:grandchild", label: "跟孫子/孫女講電話", icon: "📞" },
      { value: "event:photo", label: "看孫子/孫女的照片", icon: "🖼️" },
      { value: "event:children", label: "跟兒女吃飯聊天", icon: "🍚" },
      { value: "event:parents", label: "陪爸媽說說話", icon: "🧓" },
      { value: "event:spouse-walk", label: "跟老伴一起散步", icon: "💑" },
      { value: "event:tea", label: "跟朋友泡茶聊天", icon: "🍵" },
      { value: "event:oldfriend", label: "遇到好久不見的老朋友", icon: "🤝" },
    ],
  },
  {
    title: "出門活動",
    options: [
      { value: "event:stroll", label: "出去散散步", icon: "🌳" },
      { value: "event:exercise", label: "做了運動", icon: "🤸" },
      { value: "event:veggie", label: "買了新鮮的菜", icon: "🥬" },
      { value: "event:visit", label: "去朋友家坐坐", icon: "🚶" },
    ],
  },
  {
    title: "生活樂趣",
    options: [
      { value: "event:food", label: "買到好吃的", icon: "🍜" },
      { value: "event:cook", label: "自己煮了一道好菜", icon: "🍳" },
      { value: "event:music", label: "聽了老歌", icon: "🎶" },
    ],
  },
];

/** 事件選項池（扁平版）—— 供「幫我想」自動補段與去重使用 */
export const EVENT_POOL: QuestionOption[] = EVENT_GROUPS.flatMap(
  (g) => g.options,
);

/** 事件串接上限（避免無邊界，維持認知負荷可控） */
export const MAX_EVENTS = 4;

/** 把 {稱呼}、{說書人} 代入問句 */
export function renderTitle(
  title: string,
  salutation: string,
  narratorName: string,
): string {
  return title
    .replace("{稱呼}", salutation || DEFAULT_SALUTATION)
    .replace("{說書人}", narratorName);
}

export const QUESTION_BY_SLUG = Object.fromEntries(
  QUESTIONS.map((q) => [q.slug, q]),
);

/** 下一步 slug；最後一步（place）回傳 null，由呼叫端導向 /events */
export function nextSlug(slug: string): string | null {
  const idx = QUESTIONS.findIndex((q) => q.slug === slug);
  if (idx === -1 || idx === QUESTIONS.length - 1) return null;
  return QUESTIONS[idx + 1].slug;
}

/** 上一步 slug；第一步回傳 null */
export function prevSlug(slug: string): string | null {
  const idx = QUESTIONS.findIndex((q) => q.slug === slug);
  if (idx <= 0) return null;
  return QUESTIONS[idx - 1].slug;
}
