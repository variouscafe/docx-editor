import { create } from "zustand";

/** 커맨드 팔레트(⌘K) 열림 상태. AppShell 헤더 버튼과 글로벌 키 리스너가 공유. */
interface CommandState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useCommandStore = create<CommandState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
