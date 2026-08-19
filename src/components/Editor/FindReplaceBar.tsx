import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { X, ArrowUp, ArrowDown, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFindState } from "./extensions/findReplace";

interface FindReplaceBarProps {
  editor: Editor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 찾기/바꾸기 플로팅 바 — ⌘F/Ctrl+F 또는 툴바 버튼으로 열림.
 * 매치 상태(수·활성 인덱스)는 findReplace 플러그인이 단일 소스 → 트랜잭션마다 읽어 표시.
 * 로컬 상태(query/replacement/대소문자)는 바를 닫아도 유지 — 재오픈 시 이어 검색(워드 동작).
 * 닫을 때 쿼리를 "" 로 dispatch 해 하이라이트만 제거한다(비영속 장식이므로 저장 무관).
 */
export default function FindReplaceBar({ editor, open, onOpenChange }: FindReplaceBarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // 트랜잭션마다 재렌더 — 매치 수/활성 인덱스 표시 갱신(RichTextToolbar 와 동일 패턴).
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const rerender = () => setTick((n) => n + 1);
    editor.on("transaction", rerender);
    return () => {
      editor.off("transaction", rerender);
    };
  }, [editor]);

  // ⌘F/Ctrl+F — 에디터 포커스 여부와 무관하게 열림(브라우저 기본 찾기 대체).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  // 열릴 때 — 이전 검색어로 복원(하이라이트 재적용) + 입력 전체 선택해 바로 덮어쓰기 가능.
  useEffect(() => {
    if (!open || !editor || editor.isDestroyed) return;
    if (query) editor.commands.setFindQuery(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editor]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (editor && !editor.isDestroyed) {
      // 닫힘 — 하이라이트 제거(로컬 query 는 유지).
      editor.commands.setFindQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!editor || !open) return null;

  const fs = getFindState(editor);
  const total = fs?.matches.length ?? 0;
  const active = fs && fs.activeIndex >= 0 && fs.activeIndex < total ? fs.activeIndex : -1;

  const runFind = (backward: boolean) => {
    editor.commands.findNextMatch(backward);
    inputRef.current?.focus();
  };

  const handleReplace = () => {
    editor.commands.replaceFindMatch(replacement);
    inputRef.current?.focus();
  };

  const handleReplaceAll = () => {
    if (!total) return;
    editor.commands.replaceAllFindMatches(replacement);
    toast.success(t("find.replacedCount", { count: total }));
  };

  const toggleCase = () => {
    const next = !caseSensitive;
    setCaseSensitive(next);
    editor.commands.setFindCaseSensitive(next);
    inputRef.current?.focus();
  };

  return (
    <div
      className="absolute right-2 top-2 z-40 w-[min(92vw,400px)] rounded-md border bg-background shadow-lg print:hidden"
      role="search"
    >
      <div className="flex items-center gap-1 p-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setShowReplace((v) => !v)}
          title={t("find.replaceToggle")}
          aria-label={t("find.replaceToggle")}
          aria-expanded={showReplace}
        >
          {showReplace ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            editor.commands.setFindQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runFind(e.shiftKey);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onOpenChange(false);
            }
          }}
          placeholder={t("find.placeholder")}
          className="h-8 flex-1 text-sm"
        />
        {/* 매치 카운트 — 쿼리 있을 때만. */}
        <span className="min-w-[52px] shrink-0 text-center text-xs text-muted-foreground">
          {query ? (total ? t("find.resultCount", { current: active + 1 || total, total }) : t("find.noResults")) : ""}
        </span>
        <Button
          variant={caseSensitive ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-1.5 text-xs font-semibold"
          onClick={toggleCase}
          title={t("find.matchCase")}
          aria-label={t("find.matchCase")}
          aria-pressed={caseSensitive}
        >
          Aa
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => runFind(true)}
          disabled={!total}
          title={t("find.prev")}
          aria-label={t("find.prev")}
        >
          <ArrowUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => runFind(false)}
          disabled={!total}
          title={t("find.next")}
          aria-label={t("find.next")}
        >
          <ArrowDown className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onOpenChange(false)}
          title={t("common.close")}
          aria-label={t("common.close")}
        >
          <X className="size-4" />
        </Button>
      </div>
      {showReplace && (
        <div className="flex items-center gap-1 border-t p-1.5">
          <Input
            type="text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleReplace();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onOpenChange(false);
              }
            }}
            placeholder={t("find.replacePlaceholder")}
            className="h-8 flex-1 text-sm"
          />
          <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={handleReplace} disabled={!total}>
            {t("find.replace")}
          </Button>
          <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={handleReplaceAll} disabled={!total}>
            {t("find.replaceAll")}
          </Button>
        </div>
      )}
    </div>
  );
}
