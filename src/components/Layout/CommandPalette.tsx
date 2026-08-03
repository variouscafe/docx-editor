import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Plus } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCommandStore } from "@/store/command";
import { listReports } from "@/api/reports";
import type { ReportListItem } from "@shared/report";

/** 글로벌 커맨드 팔레트(⌘K). 보고서 검색 · 이동 · 새 보고서. */
export function CommandPalette() {
  const open = useCommandStore((s) => s.open);
  const setOpen = useCommandStore((s) => s.setOpen);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ReportListItem[]>([]);

  // ⌘K / Ctrl+K 토글
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useCommandStore.getState().open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen]);

  // 열려 있을 때 검색(200ms 디바운스)
  useEffect(() => {
    if (!open) return;
    let active = true;
    const t = setTimeout(async () => {
      try {
        const items = await listReports(q || undefined);
        if (active) setResults(items);
      } catch {
        if (active) setResults([]);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [open, q]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>명령 팔레트</DialogTitle>
          <DialogDescription>보고서 검색 또는 이동</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder="보고서 검색 또는 명령..."
          />
          <CommandList>
            <CommandEmpty>결과가 없습니다.</CommandEmpty>
            <CommandGroup heading="바로가기">
              <CommandItem onSelect={() => go("/reports")}>
                <FileText /> 모든 보고서
              </CommandItem>
              <CommandItem onSelect={() => go("/reports/new")}>
                <Plus /> 새 보고서
              </CommandItem>
            </CommandGroup>
            {results.length > 0 && (
              <CommandGroup heading="보고서">
                {results.slice(0, 8).map((r) => (
                  <CommandItem key={r.id} onSelect={() => go(`/reports/${r.id}`)}>
                    <FileText /> {r.title || "(제목 없음)"}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
