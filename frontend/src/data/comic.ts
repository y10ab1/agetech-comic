import { generateComic as apiGenerateComic, type ComicResult } from "@/lib/api";
import { buildLogline } from "./logline";
import { DEFAULT_SALUTATION } from "./questions";
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
  /** 畫風 id（rewards.ts STYLES；空＝預設）。
   *  TODO(後端契約)：DiaryEntry 需增加可選 style 欄位後，真 API 路徑帶入。 */
  styleId?: string;
}

/**
 * 是否走純前端 mock。
 * 預設 true，讓沒有後端也能 demo；後端就緒後設 NEXT_PUBLIC_USE_MOCK=false。
 */
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

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
    // TODO(後端契約)：改用 ComicResult.title；目前後端未提供故用樣板
    title: buildTitle(flow.selections, flow.events),
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

const EVENT_SCENE: Record<string, string> = {
  跟孫子講電話: "拿起手機和孫子開心地聊了好久",
  買到好吃的: "買到了心心念念的美味，笑得合不攏嘴",
  跟朋友泡茶: "和老朋友圍著茶桌泡茶、話家常",
  遇到好久不見的老朋友: "巧遇了好久不見的老朋友，兩人又驚又喜",
  去朋友家坐坐: "到朋友家坐坐，聊得欲罷不能",
  買了新鮮的菜: "挑了幾樣最新鮮的菜，打算晚上露一手",
  看孫子的照片: "翻看著孫子的照片，臉上滿是溫柔",
  聽了老歌: "聽著熟悉的老歌，跟著輕輕哼唱",
  做了運動: "伸展筋骨動一動，全身都舒暢了起來",
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
  const eventList = events.length
    ? events
    : [{ value: "event:default", label: "做了件開心的事", icon: "✨" }];
  const eventScenes = eventList.map((e) => EVENT_SCENE[e.label] ?? e.label);
  const eventCaption = eventList.map((e) => e.label).join("、");

  const panels = [
    {
      src: "/assets/comics/panel-1.svg",
      alt: `${salutation}的AI故事漫畫第一格：早晨起床，心情${mood}`,
      caption: `第一格：今天一早醒來，心情${mood}。`,
    },
    {
      src: "/assets/comics/panel-2.svg",
      alt: `${salutation}的AI故事漫畫第二格：來到${place}，${placeScene}`,
      caption: `第二格：出門來到${place}。`,
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
    text: `後來您出門，來到了${place}，${placeScene}。`,
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
    text: `滿足地回到家，今天真是美好的一天。下次再說給${name}聽好嗎？`,
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

/** 模擬分享到 LINE 家族群組，回傳溫暖問候語 */
export async function mockLineShare(
  loglineText: string,
): Promise<{ ok: boolean; greeting: string }> {
  await delay(900);
  return {
    ok: true,
    greeting: `我今天的故事：${loglineText}。做成漫畫送給你們看，記得回我喔！`,
  };
}
