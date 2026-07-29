import { Link } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";
import type { Crumb } from "@/lib/structured-data";

/**
 * Visible breadcrumb trail that mirrors the BreadcrumbList JSON-LD emitted by
 * `breadcrumbSchema()`. Google requires the markup to match on-page content,
 * so both are driven by the same `Crumb[]` list (Home is prepended here just
 * like the schema helper does).
 */
export function PageBreadcrumbs({
  crumbs,
  className = "",
}: {
  crumbs: Crumb[];
  className?: string;
}) {
  const trail: Crumb[] = [{ name: "Home", path: "/" }, ...crumbs];

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {trail.map((crumb, i) => {
          const isLast = i === trail.length - 1;
          return (
            <li key={`${crumb.path}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight aria-hidden className="h-3 w-3 shrink-0 opacity-60" />}
              {isLast ? (
                <span aria-current="page" className="max-w-[16rem] truncate text-foreground">
                  {crumb.name}
                </span>
              ) : (
                <Link
                  to={crumb.path}
                  className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                >
                  {i === 0 && <Home aria-hidden className="h-3 w-3" />}
                  <span className="max-w-[12rem] truncate">{crumb.name}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
