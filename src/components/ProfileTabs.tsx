"use client";

import { useState, type ReactNode } from "react";

export interface ProfileTab {
  id: string;
  label: string;
  content: ReactNode;
}

// Per the project owner's feedback (2026-07-22): the previous single long
// scrolling page with anchor links was "nice, but" needed to be split into
// tabs/sidebar/separate pages. Chose top tabs over new routes to avoid
// re-adding the nav clutter the earlier permission-filtering PR removed —
// TopBar's UserMenu dropdown still links to `/profile#<id>`, so the initial
// tab is read from the URL hash via useState's lazy initializer (client-only,
// runs once on first render) rather than an effect + setState, which would
// trigger an avoidable extra render.
export function ProfileTabs({ tabs }: { tabs: ProfileTab[] }) {
  const [activeId, setActiveId] = useState(() => {
    if (typeof window === "undefined") return tabs[0]?.id;
    const hash = window.location.hash.replace("#", "");
    return hash && tabs.some((tab) => tab.id === hash) ? hash : tabs[0]?.id;
  });

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <div>
      <div className="sru-profile-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active?.id}
            className={`sru-profile-tab${tab.id === active?.id ? " active" : ""}`}
            onClick={() => {
              setActiveId(tab.id);
              window.history.replaceState(null, "", `#${tab.id}`);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="sru-profile-tab-panel" role="tabpanel">
        {active?.content}
      </div>
    </div>
  );
}
