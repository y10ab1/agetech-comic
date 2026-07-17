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

/**
 * 事件圖卡（v3）：「對象先行」兩步式——先選跟誰（步驟A），再選做什麼（步驟B）。
 * 行動依對象白名單過濾（WHO_ACTION 矩陣），不做自由笛卡兒積，
 * 消滅複合句贅字（「跟」「了」），單卡 2–4 字；每頁 3–6 顆，維持一頁一問題。
 */

/** 步驟A問句（{稱呼} 於 render 時代入）與輔助說明 */
export const WHO_TITLE = "{稱呼}，今天跟誰在一起呀？";
export const WHO_HINT = "一個人也很好，選「自己一個人」就可以。";

export const WHO_OPTIONS: QuestionOption[] = [
  { value: "who:grandchild", label: "孫子/孫女", icon: "👶" },
  { value: "who:children", label: "兒女", icon: "👨‍👩‍👧" },
  { value: "who:parents", label: "爸媽", icon: "🧓" },
  { value: "who:spouse", label: "老伴", icon: "💑" },
  { value: "who:friend", label: "朋友", icon: "🤝" },
  { value: "who:solo", label: "自己一個人", icon: "🙂" },
];

/** 步驟B問句 —— 依對象客製：對上一輩用「陪」；solo 分支避開「跟」 */
export const ACTION_TITLE: Record<string, string> = {
  "who:grandchild": "跟孫子/孫女做了什麼呀？",
  "who:children": "跟兒女做了什麼呀？",
  "who:parents": "陪爸媽做了什麼呀？",
  "who:spouse": "跟老伴做了什麼呀？",
  "who:friend": "跟朋友做了什麼呀？",
  "who:solo": "自己一個人做了什麼呀？",
};

/**
 * 對象×行動組合 —— scene/hook/tags 的單一事實來源
 * （說書腳本與分享鉤子皆由此讀取，取代舊 EVENT_SCENE/EVENT_HOOK 雙字典）。
 * value 為穩定 id（event:對象.行動）；label 供 chip 與 logline（solo 只顯示行動）。
 * scene 接在阿咪腳本「您」之後，不含結尾標點、不以「您」開頭。
 * hook 為長輩第一人稱，家人一句話或貼圖即可回。
 */
export interface EventCombo extends QuestionOption {
  /** 所屬對象（who:xxx） */
  who: string;
  /** 行動卡文案（步驟B按鈕顯示用；label 是組合後的顯示） */
  actionLabel: string;
  /** 對應 tag id（tags.ts 的 OPTION_TAG_MAP／LABEL_TAG_MAP 由此推導） */
  tags: string[];
  /** 阿咪說書句 */
  scene: string;
  /** 分享問候鉤子 */
  hook: string;
}

export const WHO_ACTION: EventCombo[] = [
  { value: "event:grandchild.call", who: "who:grandchild", actionLabel: "講電話", icon: "📞", label: "孫子·講電話", tags: ["grandchild"], scene: "拿起手機和孫子孫女聊了好久，笑聲都藏不住", hook: "今天跟你講完電話，我開心一整天。" },
  { value: "event:grandchild.photo", who: "who:grandchild", actionLabel: "看照片", icon: "🖼️", label: "孫子·看照片", tags: ["grandchild"], scene: "翻看著孫子孫女的照片，臉上滿是溫柔", hook: "看你的照片看得笑瞇瞇，什麼時候再拍新的給我？" },
  { value: "event:grandchild.meet", who: "who:grandchild", actionLabel: "見面玩", icon: "🎈", label: "孫子·見面玩", tags: ["grandchild"], scene: "和孫子孫女見了面，牽著小手捨不得放", hook: "今天見到你太開心了，下次什麼時候再來？" },
  { value: "event:children.meal", who: "who:children", actionLabel: "一起吃飯", icon: "🍚", label: "兒女·一起吃飯", tags: ["children"], scene: "和兒女圍著餐桌吃飯，邊吃邊聊近況", hook: "今天一起吃飯真開心，下次想吃什麼跟我說。" },
  { value: "event:children.call", who: "who:children", actionLabel: "講電話", icon: "📞", label: "兒女·講電話", tags: ["children"], scene: "和兒女講了通電話，聽聽近況，心就安了", hook: "今天聽到你的聲音真高興，有空再打給我喔。" },
  { value: "event:children.chat", who: "who:children", actionLabel: "聊聊天", icon: "💬", label: "兒女·聊聊天", tags: ["children"], scene: "和兒女坐下來聊聊天，大事小事都說給彼此聽", hook: "今天跟你聊得真開心，還有話留著下次說。" },
  { value: "event:parents.chat", who: "who:parents", actionLabel: "說說話", icon: "💬", label: "爸媽·說說話", tags: ["parents"], scene: "陪爸媽坐著說說話，聽他們講以前的故事", hook: "今天陪阿祖說了好多話，改天講給你聽。" },
  { value: "event:parents.meal", who: "who:parents", actionLabel: "一起吃飯", icon: "🍚", label: "爸媽·一起吃飯", tags: ["parents"], scene: "陪爸媽好好吃了頓飯，飯桌上熱熱鬧鬧", hook: "今天陪阿祖吃飯，他胃口很好，你放心。" },
  { value: "event:parents.walk", who: "who:parents", actionLabel: "散散步", icon: "🌳", label: "爸媽·散散步", tags: ["parents", "walk"], scene: "牽著爸媽的手慢慢散步，像小時候換了個位置", hook: "今天陪阿祖散步，他走得比我還快呢！" },
  { value: "event:spouse.walk", who: "who:spouse", actionLabel: "散散步", icon: "🌳", label: "老伴·散散步", tags: ["spouse", "walk"], scene: "和老伴牽著手出門散步，走走停停", hook: "我們兩個都被畫進去了，你看像不像？" },
  { value: "event:spouse.market", who: "who:spouse", actionLabel: "買菜", icon: "🧺", label: "老伴·買菜", tags: ["spouse", "market"], scene: "和老伴一起上市場，你挑菜我提籃，默契十足", hook: "我們兩個去買菜，猜猜晚上加什麼菜？" },
  { value: "event:spouse.meal", who: "who:spouse", actionLabel: "一起吃飯", icon: "🍚", label: "老伴·一起吃飯", tags: ["spouse"], scene: "和老伴面對面吃飯，簡簡單單卻很暖心", hook: "今天我們兩個好好吃了一頓，下次你們回來一起吃。" },
  { value: "event:friend.tea", who: "who:friend", actionLabel: "泡茶聊天", icon: "🍵", label: "朋友·泡茶聊天", tags: ["friend"], scene: "和老朋友圍著茶桌泡茶、話家常", hook: "跟老朋友泡茶聊了一下午，猜猜我們聊到誰？" },
  { value: "event:friend.visit", who: "who:friend", actionLabel: "去家裡坐坐", icon: "🚶", label: "朋友·去家裡坐坐", tags: ["friend"], scene: "到朋友家坐坐，聊得欲罷不能", hook: "去朋友家坐坐，聊得欲罷不能，改天說給你聽。" },
  { value: "event:friend.reunion", who: "who:friend", actionLabel: "久別重逢", icon: "🎉", label: "朋友·久別重逢", tags: ["friend"], scene: "巧遇了好久不見的老朋友，兩人又驚又喜", hook: "遇到好久不見的老朋友，你一定猜不到是誰！" },
  { value: "event:friend.walk", who: "who:friend", actionLabel: "散散步", icon: "🌳", label: "朋友·散散步", tags: ["friend", "walk"], scene: "和朋友邊走邊聊，路都變短了", hook: "今天和朋友散步聊天，走好遠都不覺得累！" },
  { value: "event:solo.stroll", who: "who:solo", actionLabel: "散散步", icon: "🌳", label: "散散步", tags: ["walk"], scene: "到外面走走，呼吸新鮮空氣", hook: "今天外面天氣真好，你那邊呢？" },
  { value: "event:solo.exercise", who: "who:solo", actionLabel: "運動", icon: "🤸", label: "運動", tags: ["exercise"], scene: "伸展筋骨動一動，全身都舒暢了起來", hook: "我今天有做運動喔，幫我按個讚！" },
  { value: "event:solo.market", who: "who:solo", actionLabel: "買菜", icon: "🥬", label: "買菜", tags: ["market"], scene: "挑了幾樣最新鮮的菜，打算晚上露一手", hook: "買了新鮮的菜，猜猜晚上要煮什麼？" },
  { value: "event:solo.cook", who: "who:solo", actionLabel: "煮好菜", icon: "🍳", label: "煮好菜", tags: ["food"], scene: "進廚房露了一手，煮了一道拿手好菜", hook: "煮了一道拿手菜，下次回來煮給你吃好不好？" },
  { value: "event:solo.food", who: "who:solo", actionLabel: "買好吃的", icon: "🍜", label: "買好吃的", tags: ["food"], scene: "買到了心心念念的美味，笑得合不攏嘴", hook: "買到好吃的，猜猜是什麼？猜對請你吃。" },
  { value: "event:solo.music", who: "who:solo", actionLabel: "聽老歌", icon: "🎶", label: "聽老歌", tags: ["music"], scene: "聽著熟悉的老歌，跟著輕輕哼唱", hook: "聽了老歌，這首你們小時候我常放，還記得嗎？" },
];

export const COMBO_BY_VALUE: Record<string, EventCombo> = Object.fromEntries(
  WHO_ACTION.map((c) => [c.value, c]),
);

/** 某對象下尚可選的行動（已選的自動消失） */
export function actionsForWho(
  who: string,
  chosen: Set<string>,
): EventCombo[] {
  return WHO_ACTION.filter((c) => c.who === who && !chosen.has(c.value));
}

/** 事件選項池（扁平版）—— 供「幫我想」自動補段與去重使用 */
export const EVENT_POOL: QuestionOption[] = WHO_ACTION.map(
  ({ value, label, icon }) => ({ value, label, icon }),
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
