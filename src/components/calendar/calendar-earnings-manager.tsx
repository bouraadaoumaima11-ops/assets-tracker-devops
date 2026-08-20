"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

import { HoldingSearch, type SearchResult } from "@/components/accounts/holding-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import type { SerializedCalendarEarningsWatch } from "@/lib/services/calendar-earnings-service";

type CalendarEarningsManagerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type TrackedStock = {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
};

export function CalendarEarningsManager({ open, onOpenChange }: CalendarEarningsManagerProps) {
  const t = useTranslations("calendar");
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  const [watch, setWatch] = useState<SerializedCalendarEarningsWatch[]>([]);
  const [tracked, setTracked] = useState<TrackedStock[]>([]);
  const [mutating, setMutating] = useState(false);

  const fetchData = useCallback(async () => {
    const [watchRes, stocksRes] = await Promise.all([
      fetch("/api/calendar-earnings-watch"),
      fetch("/api/stocks"),
    ]);
    if (!watchRes.ok || !stocksRes.ok) throw new Error("load failed");
    const watchBody = (await watchRes.json()) as { data: SerializedCalendarEarningsWatch[] };
    const stocksBody = (await stocksRes.json()) as { data: TrackedStock[] };
    return { watch: watchBody.data, tracked: stocksBody.data };
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchData();
      setWatch(data.watch);
      setTracked(data.tracked);
    } catch {
      toast.error(t("earningsWatch.loadFailed"));
    }
  }, [fetchData, t]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchData();
        if (!cancelled) {
          setWatch(data.watch);
          setTracked(data.tracked);
        }
      } catch {
        if (!cancelled) toast.error(t("earningsWatch.loadFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, fetchData, t]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function mutate(request: () => Promise<Response>) {
    setMutating(true);
    try {
      const response = await request();
      if (!response.ok) {
        toast.error(t("earningsWatch.mutationFailed"));
        return;
      }
      await load();
      refresh();
    } catch {
      toast.error(t("earningsWatch.mutationFailed"));
    } finally {
      setMutating(false);
    }
  }

  function addManual(result: SearchResult) {
    void mutate(() =>
      fetch("/api/calendar-earnings-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: result.symbol, name: result.name, source: "manual" }),
      }),
    );
  }

  function toggleTracked(stock: TrackedStock) {
    const watched = watch.some((item) => item.symbol === stock.symbol);
    if (watched) {
      void mutate(() =>
        fetch(`/api/calendar-earnings-watch?symbol=${encodeURIComponent(stock.symbol)}`, {
          method: "DELETE",
        }),
      );
    } else {
      void mutate(() =>
        fetch("/api/calendar-earnings-watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: stock.symbol, name: stock.name, source: "tracked" }),
        }),
      );
    }
  }

  function removeWatch(symbol: string) {
    void mutate(() =>
      fetch(`/api/calendar-earnings-watch?symbol=${encodeURIComponent(symbol)}`, {
        method: "DELETE",
      }),
    );
  }

  const content = (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t("earningsWatch.watchList")}</h3>
        {watch.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("earningsWatch.empty")}</p>
        ) : (
          <ul className="space-y-1">
            {watch.map((item) => (
              <li key={item.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{item.symbol}</span>
                    <Badge variant="secondary">
                      {item.source === "manual"
                        ? t("earningsWatch.manual")
                        : t("earningsWatch.tracked")}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.name}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  mobileTouch
                  disabled={mutating}
                  onClick={() => removeWatch(item.symbol)}
                  aria-label={t("earningsWatch.remove", { symbol: item.symbol })}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t("earningsWatch.addManual")}</h3>
        <HoldingSearch
          onSelect={addManual}
          label={t("earningsWatch.searchLabel")}
          placeholder={t("earningsWatch.searchPlaceholder")}
          allowedTypes={["STOCK"]}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t("earningsWatch.trackedStocks")}</h3>
        {tracked.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("earningsWatch.trackedEmpty")}</p>
        ) : (
          <ul className="space-y-1">
            {tracked.map((stock) => {
              const watched = watch.some((item) => item.symbol === stock.symbol);
              return (
                <li key={stock.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    mobileTouch
                    disabled={mutating}
                    onClick={() => toggleTracked(stock)}
                    aria-pressed={watched}
                    className="w-full justify-start gap-2"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        watched
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {watched && <Check className="size-3" />}
                    </span>
                    <span className="font-mono text-sm font-semibold">{stock.symbol}</span>
                    <span className="truncate text-muted-foreground">{stock.name}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );

  const title = t("earningsWatch.title");

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent showCloseButton={false} className="max-h-[90dvh]">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
