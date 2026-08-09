"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CirclePlay, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startPublicDemoAction, type DemoActionState } from "@/app/demo/actions";

const INITIAL_DEMO_ACTION_STATE: DemoActionState = { errorCode: null };

export function DemoLoginButton({ variant = "start" }: { variant?: "start" | "restart" }) {
  const t = useTranslations("demo.login");
  const [state, action, pending] = useActionState(startPublicDemoAction, INITIAL_DEMO_ACTION_STATE);
  return (
    <form action={action} className="space-y-2">
      <Button
        type="submit"
        variant="default"
        disabled={pending}
        className={cn(
          "h-auto min-h-14 w-full rounded-xl bg-[var(--primary-ink)] px-4 py-2.5 text-background shadow-sm shadow-primary/30 hover:bg-[color-mix(in_oklab,var(--primary-ink)_90%,var(--foreground))]",
          pending && "disabled:!opacity-100",
        )}
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <CirclePlay className="size-5" aria-hidden="true" />
        )}
        <span className="flex min-w-0 flex-col items-start text-left leading-tight">
          <span>
            {pending ? t("preparing") : t(variant === "restart" ? "restartButton" : "button")}
          </span>
          <span aria-hidden="true" className="mt-1 text-xs font-normal text-background">
            {t("metadata")}
          </span>
        </span>
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t("description")}</p>
      {state.errorCode ? (
        <p role="alert" className="text-center text-xs text-destructive">
          {t(`errors.${state.errorCode}`)}
        </p>
      ) : null}
    </form>
  );
}
