"use client";

import type { ReactNode } from "react";
import type { Area, Level } from "@/lib/domain/permissions";
import { useCan } from "@/lib/store/usePermissions";
import { NoAccess } from "@/components/layout/NoAccess";

/** Renders the page only for a user who holds `level` in `area`. */
export function RequireAccess({
  area,
  level,
  children,
}: {
  area: Area;
  level: Level;
  children: ReactNode;
}) {
  return useCan(area, level) ? <>{children}</> : <NoAccess />;
}
