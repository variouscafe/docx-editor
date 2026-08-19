import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileText, Plus, Languages } from "lucide-react";
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
import { LANGUAGES } from "@/i18n";
import type { ReportListItem } from "@shared/report";

/** 글로벌 커맨드 팔레트(⌘K). 보고서 검색 · 이동 · 새 보고서. */
export function CommandPalette() {
  const { t, i18n } = useTranslation();
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

  const changeLang = (lng: string) => {
    void i18n.changeLanguage(lng);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("commandPalette.title")}</DialogTitle>
          <DialogDescription>{t("commandPalette.desc")}</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder={t("commandPalette.placeholder")}
          />
          <CommandList>
            <CommandEmpty>{t("commandPalette.empty")}</CommandEmpty>
            <CommandGroup heading={t("commandPalette.shortcuts")}>
              <CommandItem onSelect={() => go("/reports")}>
                <FileText /> {t("commandPalette.allReports")}
              </CommandItem>
              <CommandItem onSelect={() => go("/reports/new")}>
                <Plus /> {t("commandPalette.newReport")}
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading={t("commandPalette.switchLanguage")}>
              {LANGUAGES.map((lng) => (
                <CommandItem key={lng} onSelect={() => changeLang(lng)}>
                  <Languages /> {t(`language.name.${lng}` as const)}
                </CommandItem>
              ))}
            </CommandGroup>
            {results.length > 0 && (
              <CommandGroup heading={t("commandPalette.reports")}>
                {results.slice(0, 8).map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`${r.title} ${r.snippet ?? ""}`}
                    onSelect={() => go(`/reports/${r.id}`)}
                  >
                    <FileText />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {r.title || t("common.untitled")}
                      </span>
                      {/* 본문 hit 시 매치 발췌 1줄(제목만 hit 하면 서버가 null 을 내려줌) */}
                      {r.snippet && (
                        <span className="block truncate text-xs font-normal text-muted-foreground">
                          {r.snippet}
                        </span>
                      )}
                    </span>
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
