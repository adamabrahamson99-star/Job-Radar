"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { TagInput } from "@/components/ui/TagInput";
import { cn } from "@/lib/utils";

const TIER_LOCATION_LIMITS: Record<string, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 3,
  UNLIMITED: Infinity,
};

interface DiscoverySettings {
  greenhouse_enabled: boolean;
  lever_enabled: boolean;
  ashby_enabled: boolean;
  location_keywords: string[];
  role_keywords: string[];
}

// ─── ATS source definitions ───────────────────────────────────────────────────

interface AtsOption {
  key: "greenhouse_enabled" | "lever_enabled" | "ashby_enabled";
  name: string;
  desc: string;
  coverage: string;
  color: string;       // dot accent
  logo: React.ReactNode;
}

const ATS_OPTIONS: AtsOption[] = [
  {
    key: "greenhouse_enabled",
    name: "Greenhouse",
    desc: "Tech, finance & consulting — Airbnb, Stripe, Figma, Databricks and 30+ more",
    coverage: "30+ companies",
    color: "#24A148",
    logo: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="5" fill="#24A148" />
        <circle cx="12" cy="10" r="3.5" fill="white" />
        <path d="M6.5 18c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" stroke="white" strokeWidth="1.5" fill="none" />
      </svg>
    ),
  },
  {
    key: "lever_enabled",
    name: "Lever",
    desc: "High-growth startups & mid-size — Netflix, Lyft, Reddit, Atlassian and 30+ more",
    coverage: "30+ companies",
    color: "#3B82F6",
    logo: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="5" fill="#0A2342" />
        <path d="M6 7l6 5 6-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 12l6 5 6-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "ashby_enabled",
    name: "Ashby",
    desc: "AI labs & developer tools — Anthropic, OpenAI, Vercel, Ramp and 35+ more",
    coverage: "35+ companies",
    color: "#8B5CF6",
    logo: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="5" fill="#5C30B0" />
        <path d="M12 5L7 19h2.5l1-3h3l1 3H17L12 5z" fill="white" />
      </svg>
    ),
  },
];

// ─── Custom source entry ──────────────────────────────────────────────────────

function CustomSourceField() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const validate = (v: string) => {
    try { new URL(v); return true; } catch { return false; }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border border-dashed border-radar-border hover:border-blue-500/40 hover:bg-blue-500/5 transition-all group"
      >
        <div className="w-6 h-6 rounded-md bg-radar-elevated border border-radar-border flex items-center justify-center">
          <svg className="w-3 h-3 text-text-muted group-hover:text-blue-400 transition-colors" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        </div>
        <span className="text-sm text-text-muted group-hover:text-text-secondary transition-colors">
          Add custom ATS source by URL
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">Add custom ATS source</p>
        <button onClick={() => { setOpen(false); setUrl(""); setError(""); }} className="text-text-muted hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      <p className="text-xs text-text-muted">
        Paste the URL of any public job board (e.g. <span className="font-mono">https://boards.greenhouse.io/yourco</span>). Radar will add it to your watchlist companies and scrape it on each check.
      </p>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(""); }}
          placeholder="https://jobs.lever.co/yourcompany"
          className={cn(
            "flex-1 bg-radar-base border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 transition-colors",
            error ? "border-red-500/50 focus:ring-red-500/30" : "border-radar-border focus:ring-blue-500/30 focus:border-blue-500/50"
          )}
        />
        <Button
          size="sm"
          onClick={() => {
            if (!validate(url)) { setError("Enter a valid URL (include https://)"); return; }
            // Direct user to add via the Watchlist tab with this URL pre-filled
            const params = new URLSearchParams({ prefill_url: url });
            window.location.href = `/dashboard/sources?${params}`;
          }}
        >
          Add
        </Button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DiscoveryTabProps {
  tier: string;
}

export function DiscoveryTab({ tier }: DiscoveryTabProps) {
  const [settings, setSettings] = useState<DiscoverySettings>({
    greenhouse_enabled: false,
    lever_enabled: false,
    ashby_enabled: false,
    location_keywords: [],
    role_keywords: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  const isPaidTier = tier !== "FREE";
  const locationLimit = TIER_LOCATION_LIMITS[tier] ?? 0;

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/discovery");
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
    } catch {
      console.error("Failed to load discovery settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const toggleAts = (key: AtsOption["key"]) => {
    if (!isPaidTier) return;
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = ATS_OPTIONS.filter((o) => settings[o.key]).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Locked state banner */}
      {!isPaidTier && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-300">ATS Discovery requires Starter or above</p>
            <p className="text-xs text-blue-400/70 mt-0.5">
              Upgrade to automatically pull jobs from Greenhouse, Lever, and Ashby — hundreds of companies, pre-filtered to your profile.
            </p>
          </div>
        </div>
      )}

      {/* ATS source selector */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary" style={{ fontFamily: "Syne, sans-serif" }}>
            ATS Sources
          </h2>
          {enabledCount > 0 && (
            <span className="text-xs font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5">
              {enabledCount} active
            </span>
          )}
        </div>

        <div className="space-y-2">
          {ATS_OPTIONS.map((opt) => {
            const isEnabled = settings[opt.key];
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => toggleAts(opt.key)}
                disabled={!isPaidTier}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-150 text-left",
                  !isPaidTier
                    ? "opacity-60 cursor-not-allowed border-radar-border bg-radar-surface"
                    : isEnabled
                    ? "border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/8"
                    : "border-radar-border bg-radar-surface hover:border-radar-border/80 hover:bg-radar-elevated/40"
                )}
                data-testid={`toggle-${opt.key}`}
                aria-checked={isEnabled}
                role="checkbox"
              >
                {/* Logo */}
                {opt.logo}

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{opt.name}</span>
                    {!isPaidTier && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-text-muted bg-radar-elevated border border-radar-border rounded px-1.5 py-0.5">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        STARTER+
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5 truncate">{opt.desc}</p>
                </div>

                {/* Checkbox */}
                <div className={cn(
                  "flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-150",
                  isEnabled && isPaidTier
                    ? "border-blue-500 bg-blue-500"
                    : "border-radar-border bg-transparent"
                )}>
                  {isEnabled && isPaidTier && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}

          {/* Custom source entry */}
          {isPaidTier && (
            <div className="pt-1">
              <CustomSourceField />
            </div>
          )}
        </div>
      </div>

      {/* Location keywords */}
      <div className="bg-radar-surface border border-radar-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-text-primary">Location filter</h3>
          {locationLimit !== Infinity && (
            <span className="text-xs font-mono text-text-muted">
              {locationLimit === 0 ? "Upgrade to add locations" : `Up to ${locationLimit} location${locationLimit > 1 ? "s" : ""}`}
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted mb-3">
          Only jobs matching these locations are shown. Include &quot;Remote&quot; to match remote roles.
        </p>
        <TagInput
          tags={settings.location_keywords}
          onChange={(locs) => setSettings((s) => ({ ...s, location_keywords: locs }))}
          placeholder={!isPaidTier ? "Upgrade to set locations" : "e.g. San Francisco, Remote, New York..."}
          maxTags={locationLimit === Infinity ? 999 : locationLimit}
          hint={!isPaidTier ? "Requires Starter plan or above" : undefined}
        />
      </div>

      {/* Role keywords */}
      <div className="bg-radar-surface border border-radar-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-1">Role keyword filter</h3>
        <p className="text-xs text-text-muted mb-3">
          Only jobs whose titles contain one of these keywords are shown. Pre-populated from your target roles.
        </p>
        <TagInput
          tags={settings.role_keywords}
          onChange={(kws) => setSettings((s) => ({ ...s, role_keywords: kws }))}
          placeholder="e.g. Engineer, Product Manager, Data Scientist..."
        />
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {saveStatus === "saved" && (
            <span className="text-green-400 font-mono flex items-center gap-1.5 animate-fade-in">
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              SETTINGS SAVED
            </span>
          )}
          {saveStatus === "error" && <span className="text-red-400 font-mono">SAVE FAILED</span>}
        </div>
        <Button onClick={handleSave} loading={saving} data-testid="button-save-discovery">
          Save settings
        </Button>
      </div>
    </div>
  );
}
