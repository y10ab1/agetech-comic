import {
  generateComic as apiGenerateComic,
  type ComicResult,
  type Mood,
} from "@/lib/api";
import { buildLogline } from "./logline";
import { COMBO_BY_VALUE, DEFAULT_SALUTATION } from "./questions";
import { DEFAULT_NARRATOR_ID, getNarrator } from "./narrator";
import type {
  DisplayScript,
  Expression,
  QuestionOption,
  ScriptSegment,
  Selections,
} from "./types";

/** 生成腳本所需的流程快照 */
export interface FlowSnapshot {
  userId: string | null;
  salutation: string;
  selections: Selections;
  events: QuestionOption[];
  narratorId: string;
  /** 畫風 id（rewards.ts STYLES；空＝預設）。真 API 路徑帶入 DiaryEntry.style */
  styleId?: string;
}

/**
 * 是否走純前端 mock。
 * 預設 true，讓沒有後端也能 demo；後端就緒後設 NEXT_PUBLIC_USE_MOCK=false。
 */
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

const VALID_MOODS: readonly Mood[] = ["happy", "calm", "tired"];

/** 從 mood 選項 value（如 "mood:happy"）解析出後端 Mood；無效則回 undefined。 */
function resolveMood(selections: Selections): Mood | undefined {
  const raw = selections.mood?.value?.split(":")[1];
  return VALID_MOODS.includes(raw as Mood) ? (raw as Mood) : undefined;
}

/**
 * 前端唯一的漫畫生成入口。
 * 走真後端時：POST /comics/generate（見 lib/api.ts）→ 轉成顯示模型；
 * 失敗或 mock 模式時：退回本地 mock，維持可展示。
 */
export async function createComic(flow: FlowSnapshot): Promise<DisplayScript> {
  if (!USE_MOCK) {
    try {
      const result = await apiGenerateComic({
        user_id: flow.userId ?? "demo-user",
        text: buildLogline(flow.selections, flow.events),
        style: flow.styleId || undefined,
        mood: resolveMood(flow.selections),
      });
      return adaptComicResult(result, flow);
    } catch {
      // 後端出錯時退回 mock，避免展示中斷
    }
  }
  await delay(1600);
  return generateMockScript(flow);
}

/** 模擬非同步延遲 */
function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ---- 後端結果 → 顯示模型 ----

/** 把 narration 依句號切成字幕分段，最後一句作為高潮 accent */
function splitNarration(narration: string): string[] {
  return narration
    .split(/(?<=[。！？])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 故事標題樣板（正式由後端 AI 下標：TODO(後端契約) ComicResult.title） */
export function buildTitle(
  selections: Selections,
  events: QuestionOption[],
): string {
  const mood = selections.mood?.label ?? "美好";
  const place = selections.place?.label ?? "今天";
  const lastEvent = events[events.length - 1]?.label;
  return lastEvent ? `${place}的一天：${lastEvent}` : `${place}的${mood}時光`;
}

export function adaptComicResult(
  result: ComicResult,
  flow: FlowSnapshot,
): DisplayScript {
  const narrator = getNarrator(flow.narratorId || DEFAULT_NARRATOR_ID);
  const panels = result.panels
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      src: p.image_url || "/assets/comics/panel-placeholder.svg",
      alt: p.alt_text || p.caption || "漫畫分格",
      caption: p.caption,
    }));

  const sentences = splitNarration(result.narration || result.summary);
  const segments: ScriptSegment[] = sentences.map((text, i) => {
    const isLast = i === sentences.length - 1;
    return {
      text,
      expression: isLast ? "laugh" : "smile",
      panelIndex: Math.min(
        i,
        Math.max(0, panels.length - 1),
      ),
      accent: isLast,
    };
  });

  return {
    loglineText: buildLogline(flow.selections, flow.events),
    // 優先採用後端 AI 下的標題；後端未提供時退回本地樣板
    title: result.title?.trim() || buildTitle(flow.selections, flow.events),
    narratorId: narrator.id,
    narratorName: narrator.name,
    panels,
    segments,
  };
}

// ---- 本地 mock（進階多段落樣板，供離線 demo）----

const PLACE_SCENE: Record<string, string> = {
  菜市場: "熱鬧的菜市場，攤位上擺滿新鮮蔬果",
  公園散步: "綠意盎然的公園步道，陽光灑落",
  樂齡中心: "溫馨的樂齡中心教室，長輩們圍坐一起",
  待在家裡: "舒適的家中客廳，窗邊灑進午後陽光",
};

/**
 * @deprecated v3 起事件敘事收進 WHO_ACTION 矩陣（questions.ts）單一來源；
 * 本表僅供舊 value（localStorage 殘存日記）fallback，下個版本清除。
 */
const EVENT_SCENE_LEGACY: Record<string, string> = {
  "event:grandchild": "拿起手機和孫子孫女開心地聊了好久",
  "event:photo": "翻看著孫子孫女的照片，臉上滿是溫柔",
  "event:children": "和兒女圍著餐桌吃飯，邊吃邊聊近況",
  "event:parents": "陪爸媽坐著說說話，聽他們講以前的故事",
  "event:spouse-walk": "和老伴牽著手出門散步，走走停停",
  "event:tea": "和老朋友圍著茶桌泡茶、話家常",
  "event:oldfriend": "巧遇了好久不見的老朋友，兩人又驚又喜",
  "event:stroll": "到外面走走，呼吸新鮮空氣",
  "event:exercise": "伸展筋骨動一動，全身都舒暢了起來",
  "event:veggie": "挑了幾樣最新鮮的菜，打算晚上露一手",
  "event:visit": "到朋友家坐坐，聊得欲罷不能",
  "event:food": "買到了心心念念的美味，笑得合不攏嘴",
  "event:cook": "進廚房露了一手，煮了一道拿手好菜",
  "event:music": "聽著熟悉的老歌，跟著輕輕哼唱",
};

/** 地點敘事片語 —— 以 value（穩定 id）為 key；place:home 不適用「出門來到」句型 */
const PLACE_NARRATIVE: Record<string, string> = {
  "place:home": "在家裡好好休息",
};

function moodExpression(mood: string): Expression {
  return mood === "有點累" ? "tired" : "smile";
}

export function generateMockScript(flow: FlowSnapshot): DisplayScript {
  const { selections, events } = flow;
  const salutation = flow.salutation || DEFAULT_SALUTATION;
  const narrator = getNarrator(flow.narratorId || DEFAULT_NARRATOR_ID);
  const name = narrator.name;
  const mood = selections.mood?.label ?? "好";
  const place = selections.place?.label ?? "外面";
  const placeScene = PLACE_SCENE[place] ?? `${place}的一天`;
  const placeNarrative =
    PLACE_NARRATIVE[selections.place?.value ?? ""] ?? `出門來到了${place}`;
  const eventList = events.length
    ? events
    : [{ value: "event:default", label: "做了件開心的事", icon: "✨" }];
  const eventScenes = eventList.map(
    (e) => COMBO_BY_VALUE[e.value]?.scene ?? EVENT_SCENE_LEGACY[e.value] ?? e.label,
  );
  const eventCaption = eventList.map((e) => e.label).join("、");

  const panels = [
    {
      src: "/assets/comics/panel-1.svg",
      alt: `${salutation}的AI故事漫畫第一格：早晨起床，心情${mood}`,
      caption: `第一格：今天一早醒來，心情${mood}。`,
    },
    {
      src: "/assets/comics/panel-2.svg",
      alt: `${salutation}的AI故事漫畫第二格：${placeNarrative}，${placeScene}`,
      caption: `第二格：${placeNarrative}。`,
    },
    {
      src: "/assets/comics/panel-3.svg",
      alt: `${salutation}的AI故事漫畫第三格：${eventScenes.join("，接著")}`,
      caption: `第三格：${eventCaption}，好開心。`,
    },
    {
      src: "/assets/comics/panel-4.svg",
      alt: `${salutation}的AI故事漫畫第四格：滿足地回到家，為今天畫下句點`,
      caption: `第四格：滿足地回到家，真是美好的一天。`,
    },
  ];

  const segments: ScriptSegment[] = [];
  segments.push({
    text: `${salutation}，今天讓${name}來說說您的故事。`,
    expression: "smile",
    panelIndex: 0,
  });
  segments.push({
    text: `今天一早醒來，您的心情${mood}。`,
    expression: moodExpression(mood),
    panelIndex: 0,
  });
  segments.push({
    text: `後來您${placeNarrative}，${placeScene}。`,
    expression: "smile",
    panelIndex: 1,
  });
  eventScenes.forEach((scene, i) => {
    const isLast = i === eventScenes.length - 1;
    segments.push({
      text: isLast ? `最棒的是，您${scene}，真是太好了！` : `您${scene}。`,
      expression: isLast ? "laugh" : "smile",
      panelIndex: 2,
      accent: isLast,
    });
  });
  segments.push({
    text: `滿足地回到家，今天真是美好的一天。這麼好的故事，也讓家人看看好嗎？下次再說給${name}聽。`,
    expression: "smile",
    panelIndex: 3,
  });

  return {
    loglineText: buildLogline(selections, events),
    title: buildTitle(selections, events),
    narratorId: narrator.id,
    narratorName: name,
    panels,
    segments,
  };
}

/** 模擬 LLM「幫我想一段」—— 依已選事件從池中挑合理接續，不打字、0 token */
export function suggestNextEvent(
  current: QuestionOption[],
  pool: QuestionOption[],
): QuestionOption | null {
  const chosen = new Set(current.map((e) => e.value));
  const remaining = pool.filter((e) => !chosen.has(e.value));
  if (remaining.length === 0) return null;
  return remaining[current.length % remaining.length];
}

/** 模擬 LINE 一鍵登入（純前端，不需個資） */
export async function mockLineLogin(existing: string | null): Promise<string> {
  await delay(700);
  if (existing) return existing;
  return "LINE-U" + Date.now().toString(36).toUpperCase();
}

// ---- 分享問候語（家人在 LINE 看到的文字）----
// 二段式：一句自然近況（心情＋地點）＋一句依最後一個事件挑選的回應鉤子，
// 讓家人「有話可接、一句話就能回」。皆以 value 為 key。

/** 心情敘事化（含收尾標點） */
const MOOD_FEEL: Record<string, string> = {
  "mood:happy": "心情真好！",
  "mood:calm": "心裡很自在。",
  "mood:tired": "人有點累，心倒是很舒服。",
};

/** 地點敘事化（「今天」之後的片語） */
const PLACE_PHRASE: Record<string, string> = {
  "place:market": "去菜市場",
  "place:park": "去公園散步",
  "place:center": "去樂齡中心",
  "place:home": "待在家裡",
};

/**
 * @deprecated v3 起分享鉤子收進 WHO_ACTION 矩陣（questions.ts）單一來源；
 * 本表僅供舊 value fallback，下個版本清除。
 */
const EVENT_HOOK_LEGACY: Record<string, string> = {
  "event:grandchild": "今天跟你講完電話，我開心一整天。",
  "event:photo": "看你的照片看得笑瞇瞇，什麼時候再拍新的給我？",
  "event:children": "今天一起吃飯真開心，下次想吃什麼跟我說。",
  "event:parents": "今天陪阿祖說了好多話，改天講給你聽。",
  "event:spouse-walk": "我們兩個都被畫進去了，你看像不像？",
  "event:tea": "跟老朋友泡茶聊了一下午，猜猜我們聊到誰？",
  "event:oldfriend": "遇到好久不見的老朋友，你一定猜不到是誰！",
  "event:stroll": "今天外面天氣真好，你那邊呢？",
  "event:exercise": "我今天有做運動喔，幫我按個讚！",
  "event:veggie": "買了新鮮的菜，猜猜晚上要煮什麼？",
  "event:visit": "去朋友家坐坐，聊得欲罷不能，改天說給你聽。",
  "event:food": "買到好吃的，猜猜是什麼？猜對請你吃。",
  "event:cook": "煮了一道拿手菜，下次回來煮給你吃好不好？",
  "event:music": "聽了老歌，這首你們小時候我常放，還記得嗎？",
};

/** 沒有對應鉤子時的通用收尾（不施壓、貼圖即可回） */
const FALLBACK_HOOK = "看完跟我說好不好看？";

/** 組出以長輩第一人稱發出的問候語（TODO(後端契約)：正式版由後端 AI 生成 ComicResult.greeting） */
export function buildGreeting(
  selections: Selections,
  events: QuestionOption[],
  narratorName: string,
): string {
  const moodFeel =
    MOOD_FEEL[selections.mood?.value ?? ""] ?? "過得很充實。";
  const placePhrase =
    PLACE_PHRASE[selections.place?.value ?? ""] ??
    (selections.place ? `去${selections.place.label}` : "出去走走");
  const lastEvent = events[events.length - 1];
  const hook =
    (lastEvent &&
      (COMBO_BY_VALUE[lastEvent.value]?.hook ??
        EVENT_HOOK_LEGACY[lastEvent.value])) ||
    FALLBACK_HOOK;
  return `今天${placePhrase}，${moodFeel}${narratorName}把今天畫成漫畫了——${hook}`;
}

/** 模擬分享到 LINE 家族群組，回傳溫暖問候語 */
export async function mockLineShare(
  selections: Selections,
  events: QuestionOption[],
  narratorName: string,
): Promise<{ ok: boolean; greeting: string }> {
  await delay(900);
  return {
    ok: true,
    greeting: buildGreeting(selections, events, narratorName),
  };
}
