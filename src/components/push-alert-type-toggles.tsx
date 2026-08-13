// Per-alert-type push notification toggles (momentum / strategy / portfolio).
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PUSH_ALERT_TYPES,
  setPushAlertType,
  usePushAlertTypes,
} from "@/lib/push-alert-types";

export function PushAlertTypeToggles({ className }: { className?: string }) {
  const prefs = usePushAlertTypes();
  const on = PUSH_ALERT_TYPES.filter((t) => prefs[t.value]).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-7 text-[11px] ${className ?? ""}`}
        >
          <SlidersHorizontal className="mr-1 h-3 w-3" aria-hidden />
          Alert types · {on}/{PUSH_ALERT_TYPES.length}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <p className="text-sm font-semibold">Notification types</p>
          <p className="text-[11px] text-muted-foreground">
            Choose which alerts reach this device. Applies to push and in-app delivery.
          </p>
        </div>
        <div className="space-y-3">
          {PUSH_ALERT_TYPES.map((t) => (
            <div key={t.value} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor={`push-type-${t.value}`} className="text-xs font-medium">
                  {t.label}
                </Label>
                <p className="text-[11px] leading-snug text-muted-foreground">{t.hint}</p>
              </div>
              <Switch
                id={`push-type-${t.value}`}
                checked={prefs[t.value]}
                onCheckedChange={(v) => setPushAlertType(t.value, v)}
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
