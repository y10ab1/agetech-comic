/**
 * 說書人設定 —— 名字集中管理（單一事實來源）。
 * 視覺改由 `components/AmiCat.tsx`（會呼吸的貓臉插圖）承擔，
 * 本檔只負責身分與名字；要改名只改這裡（全 App 同步）。
 */
export interface Narrator {
  id: string;
  name: string;
}

export const NARRATORS: Record<string, Narrator> = {
  ami: {
    id: "ami",
    name: "阿咪",
  },
};

export const DEFAULT_NARRATOR_ID = "ami";

export function getNarrator(id: string): Narrator {
  return NARRATORS[id] ?? NARRATORS[DEFAULT_NARRATOR_ID];
}
