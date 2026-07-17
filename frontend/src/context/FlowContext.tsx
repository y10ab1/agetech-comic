"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { QuestionOption, Selections } from "@/data/types";
import { DEFAULT_NARRATOR_ID } from "@/data/narrator";
import { loadProfile, saveSalutation } from "@/data/profile";

interface FlowState {
  userId: string | null;
  salutation: string;
  narratorId: string;
  /** 本次日記選用的畫風 id（見 rewards.ts STYLES；空字串＝預設畫風） */
  styleId: string;
  selections: Selections;
  events: QuestionOption[];
  login: (userId: string) => void;
  logout: () => void;
  setSalutation: (s: string) => void;
  setNarrator: (id: string) => void;
  setStyle: (id: string) => void;
  choose: (questionId: string, option: QuestionOption) => void;
  addEvent: (option: QuestionOption) => void;
  removeLastEvent: () => void;
  /** 開新故事：清 selections/events/styleId，保留 salutation 與 narratorId */
  reset: () => void;
}

const FlowCtx = createContext<FlowState | null>(null);

const USER_KEY = "llsg_user_id";

export function FlowProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [salutation, setSalutationState] = useState("");
  const [narratorId, setNarratorId] = useState(DEFAULT_NARRATOR_ID);
  const [styleId, setStyleId] = useState("");
  const [selections, setSelections] = useState<Selections>({});
  const [events, setEvents] = useState<QuestionOption[]>([]);

  // 掛載後從 profile 水合稱呼（已註冊用戶直接進主流程仍有稱呼）
  useEffect(() => {
    // 掛載後才讀 localStorage（避免 SSR/hydration 不一致）
    const p = loadProfile();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p?.salutation) setSalutationState(p.salutation);
  }, []);

  const value = useMemo<FlowState>(
    () => ({
      userId,
      salutation,
      narratorId,
      styleId,
      selections,
      events,
      login: (id) => {
        if (typeof window !== "undefined") localStorage.setItem(USER_KEY, id);
        setUserId(id);
      },
      logout: () => {
        if (typeof window !== "undefined") localStorage.removeItem(USER_KEY);
        setUserId(null);
      },
      setSalutation: (s) => {
        setSalutationState(s);
        saveSalutation(s); // 持久化到 profile
      },
      setNarrator: (id) => setNarratorId(id),
      setStyle: (id) => setStyleId(id),
      choose: (questionId, option) =>
        setSelections((prev) => ({ ...prev, [questionId]: option })),
      addEvent: (option) =>
        setEvents((prev) =>
          prev.some((e) => e.value === option.value)
            ? prev
            : [...prev, option],
        ),
      removeLastEvent: () => setEvents((prev) => prev.slice(0, -1)),
      reset: () => {
        setSelections({});
        setEvents([]);
        setStyleId("");
      },
    }),
    [userId, salutation, narratorId, styleId, selections, events],
  );

  return <FlowCtx.Provider value={value}>{children}</FlowCtx.Provider>;
}

export function useFlow(): FlowState {
  const ctx = useContext(FlowCtx);
  if (!ctx) throw new Error("useFlow 必須在 FlowProvider 內使用");
  return ctx;
}
