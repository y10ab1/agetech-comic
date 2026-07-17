/**
 * 使用者 profile 儲存 —— 區分「初次註冊」與「已註冊」。
 * Phase：純前端 localStorage；日後換後端 user record。
 * onboardedAt 有值＝已完成新手引導＝已註冊用戶。
 */
export interface Profile {
  salutation: string;
  onboardedAt: string | null;
}

const PROFILE_KEY = "llsg_profile";

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function save(p: Profile) {
  if (typeof window !== "undefined") {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  }
}

/** 是否已完成新手引導（＝已註冊用戶） */
export function isOnboarded(): boolean {
  return Boolean(loadProfile()?.onboardedAt);
}

/** 設定/更新稱呼（保留既有 onboardedAt） */
export function saveSalutation(salutation: string) {
  const prev = loadProfile();
  save({ salutation, onboardedAt: prev?.onboardedAt ?? null });
}

/** 標記完成新手引導；createdAt 由呼叫端傳入 */
export function markOnboarded(at: string) {
  const prev = loadProfile();
  save({ salutation: prev?.salutation ?? "", onboardedAt: at });
}
