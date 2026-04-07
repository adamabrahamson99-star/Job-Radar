"use client";

import { useState, useEffect, useCallback } from "react";
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

interface AtsSource {
  key: "greenhouse_enabled" | "lever_enabled" | "ashby_enabled";
  name: string;
  desc: string;
  coverage: string;
  logo: React.ReactNode;
}

const ATS_SOURCES: AtsSource[] = [
  {
    key: "greenhouse_enabled",
    name: "Greenhouse",
    desc: "One of the most widely used ATS platforms in tech.",
    coverage: "Airbnb, Stripe, Figma, Databricks, Cloudflare and 30+ more",
    logo: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#24A148" />
        <circle cx="12" cy="10" r="4" fill="white" />
        <path d="M6 18c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="white" strokeWidth="1.5" fill="none" />
      </svg>
    ),
  },
  {
    key: "lever_enabled",
    name: "Lever",
    desc: "Popular ATS used by high-growth startups and mid-size companies.",
    coverage: "Netflix, Lyft, Reddit, Atlassian, HubSpot and 30+ more",
    logo: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#0A2342" />
        <path d="M6 7l6 5 6-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 12l6 5 6-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "ashby_enabled",
    name: "Ashby",
    desc: "Modern ATS popular with AI labs, developer tools, and fintech.",
    coverage: "Anthropic, OpenAI, Perplexity, Vercel, Ramp and 35+ more",
    logo: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#5C30B0" />
        <path d="M12 5L7 19h2.5l1-3h3l1 3H17L12 5z" fill="white" />
      </svg>
    ),
  },
];

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

  const handleToggle = (key: AtsSource["key"]) => {
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
      const data = await res.json();
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
        console.error(data.error);
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Locked state banner for FREE tier */}
      {!isPaidTier && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-300">ATS Discovery requires Starter or above</p>
            <p className="text-xs text-blue-400/70 mt-0.5">
              Upgrade to automatically pull jobs from Greenhouse, Lever, and Ashby boards — hundreds of companies, filtered to your profile.
            </p>
          </div>
        </div>
      )}

      {/* ATS Sources */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-3" style={{ fontFamily: "Syne, sans-serif" }}>
          ATS Sources
        </h2>
        <div className="space-y-3">
          {ATS_SOURCES.map((src) => {
            const isEnabled = settings[src.key];
            return (
              <div
                key={src.key}
                className={cn(
                  "bg-radar-surface border rounded-xl p-4 transition-all duration-200",
                  !isPaidTier ? "opacity-60 cursor-not-allowed" : "hover:border-radar-border",
                  isEnabled && isPaidTier ? "border-blue-500/30" : "border-radar-border"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">{src.logo}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-semibold text-text-primary">{src.name}</h3>
                      {!isPaidTier && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-text-muted bg-radar-elevated border border-radar-border rounded px-1.5 py-0.5">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                          </svg>
                          STARTER+
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary mb-1">{src.desc}</p>
                    <p className="text-[11px] text-text-muted font-mono">{src.coverage}</p>
                  </div>
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggle(src.key)}
                    disabled={!isPaidTier}
                    className={cn(
                      "flex-shrink-0 w-11 h-6 rounded-full transition-all duration-200 relative",
                      isEnabled && isPaidTier ? "bg-blue-500" : "bg-radar-elevated border border-radar-border",
                      !isPaidTier && "cursor-not-allowed"
                    )}
                    aria-checked={isEnabled}
                    role="switch"
                    data-testid={`toggle-${src.key}`}
                  >
                    <div className={cn(
                      "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200",
                      isEnabled && isPaidTier ? "left-[22px]" : "left-0.5"
                    )} />
                  </button>
                </div>
              </div>
            );
          })}
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
