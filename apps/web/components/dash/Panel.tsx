"use client";

/**
 * A thin adaptation of the design system Panel.
 *
 * The workspace uses `Panel` from `@veritas/ui` directly. This wrapper exists
 * only so the older title/subtitle/badge call sites keep working, and it adds
 * nothing of its own beyond mapping those names onto the system's.
 */
import React from "react";
import { Panel as SystemPanel } from "@veritas/ui";

export function Panel({ title, subtitle, badge, children }: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  /** Accepted and ignored: the system panel is never collapsed. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div data-panel>
      <SystemPanel title={title} meta={subtitle} actions={badge}>
        {children}
      </SystemPanel>
    </div>
  );
}
