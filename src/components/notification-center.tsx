import { useMemo, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Dot,
  Settings2,
  Trash2,
  TriangleAlert,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAnnounceVerbosity, VERBOSITY_OPTIONS } from "@/lib/announce-verbosity";
import {
  ALL_CATEGORIES,
  NOTIFY_CATEGORIES,
  useNotifyCategories,
  type NotifyCategory,
} from "@/lib/notify-categories";
import {
  formatNotificationTime,
  useNotificationLog,
  type NotificationEntry,
} from "@/lib/notification-log";

const VERBOSITY_ICONS = { off: VolumeX, minimal: Volume1, full: Volume2 } as const;

const CATEGORY_LABEL: Record<NotifyCategory, string> = {
  risk_block: "Risk block",
  order_status: "Order status",
  backtest: "Backtest",
};

function absoluteTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function NotificationRow({
  entry,
  onToggleRead,
}: {
  entry: NotificationEntry;
  onToggleRead: (id: string, read: boolean) => void;
}) {
  return (
    <li
      className={`flex gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/50 ${
        entry.read ? "opacity-70" : ""
      }`}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {entry.level === "assertive" ? (
          <TriangleAlert className="h-4 w-4 text-warning" />
        ) : entry.read ? (
          <Check className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Dot className="h-4 w-4 text-primary" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${entry.read ? "" : "font-medium"}`}>{entry.message}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <time dateTime={new Date(entry.ts).toISOString()} title={absoluteTime(entry.ts)}>
            {formatNotificationTime(entry.ts)}
          </time>
          {entry.category ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{CATEGORY_LABEL[entry.category]}</span>
            </>
          ) : null}
          {entry.read ? null : (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              New
            </Badge>
          )}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 self-start px-2 text-[11px]"
        onClick={() => onToggleRead(entry.id, !entry.read)}
        aria-label={`Mark "${entry.message}" as ${entry.read ? "unread" : "read"}`}
      >
        {entry.read ? "Unread" : "Read"}
      </Button>
    </li>
  );
}

/**
 * Bell-triggered notifications center: a timestamped list of recent alerts
 * with per-item read/unread controls, plus the announcement settings that
 * used to live on the bell menu.
 */
export function NotificationCenter({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const { entries, unread, setRead, markAll, clear } = useNotificationLog();
  const { verbosity, setVerbosity } = useAnnounceVerbosity();
  const { categories, toggle, setAll } = useNotifyCategories();

  const allOn = categories.length === ALL_CATEGORIES.length;
  const filtered = !allOn;
  const VerbosityIcon = VERBOSITY_ICONS[verbosity];
  const active = VERBOSITY_OPTIONS.find((o) => o.value === verbosity);

  const visible = useMemo(
    () => (onlyUnread ? entries.filter((e) => !e.read) : entries),
    [entries, onlyUnread],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}${
            filtered ? `, filtered to ${categories.length} of ${ALL_CATEGORIES.length} types` : ""
          }`}
          title="Notifications"
        >
          <span className="relative">
            <Bell className="h-5 w-5" aria-hidden="true" />
            {unread > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : verbosity === "off" || categories.length === 0 ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-muted-foreground" />
            ) : filtered ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-caution" />
            ) : null}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-[11px] text-muted-foreground">
              {unread > 0 ? `${unread} unread` : "All caught up"} · {entries.length} recent
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setOnlyUnread((v) => !v)}
              aria-pressed={onlyUnread}
            >
              {onlyUnread ? "All" : "Unread"}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Notification settings"
                >
                  <Settings2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <VerbosityIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Announcements
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={verbosity}
                  onValueChange={(v) => setVerbosity(v as typeof verbosity)}
                >
                  {VERBOSITY_OPTIONS.map((o) => (
                    <DropdownMenuRadioItem key={o.value} value={o.value}>
                      {o.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                {active?.hint ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">{active.hint}</p>
                ) : null}

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center justify-between gap-2">
                  <span>Show types</span>
                  <button
                    type="button"
                    className="text-[11px] font-normal text-primary hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      setAll(!allOn);
                    }}
                  >
                    {allOn ? "None" : "All"}
                  </button>
                </DropdownMenuLabel>
                {NOTIFY_CATEGORIES.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.value}
                    checked={categories.includes(c.value)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(on) => toggle(c.value, Boolean(on))}
                  >
                    <span className="flex flex-col">
                      <span>{c.label}</span>
                      <span className="text-[11px] text-muted-foreground">{c.hint}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
                {categories.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    All notification types are hidden.
                  </p>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Separator />

        <ScrollArea className="max-h-80">
          {visible.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {entries.length === 0
                ? "No notifications yet. Order, risk and backtest events will show up here."
                : "Nothing unread."}
            </p>
          ) : (
            <ul className="space-y-0.5 p-1.5">
              {visible.map((entry) => (
                <NotificationRow key={entry.id} entry={entry} onToggleRead={setRead} />
              ))}
            </ul>
          )}
        </ScrollArea>

        {entries.length > 0 ? (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => markAll(unread > 0)}
              >
                <CheckCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                {unread > 0 ? "Mark all read" : "Mark all unread"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground"
                onClick={clear}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Clear
              </Button>
            </div>
          </>
        ) : null}

        <p aria-live="polite" className="sr-only">
          {`${unread} unread notifications.`}
        </p>
      </PopoverContent>
    </Popover>
  );
}
