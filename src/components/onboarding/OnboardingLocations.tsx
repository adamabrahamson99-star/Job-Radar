"use client";

import { Button } from "@/components/ui/Button";
import { TagInput } from "@/components/ui/TagInput";
import { cn } from "@/lib/utils";

interface OnboardingLocationsProps {
  locations: string[];
  includeRemote: boolean;
  includeHybrid: boolean;
  onLocationsChange: (locs: string[]) => void;
  onRemoteToggle: () => void;
  onHybridToggle: () => void;
  onComplete: () => void;
  onSkip: () => void;
  completing: boolean;
}

function ToggleChip({
  label,
  active,
  icon,
  onClick,
}: {
  label: string;
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200",
        active
          ? "bg-blue-500/15 border-blue-500/50 text-blue-400"
          : "bg-radar-surface border-radar-border text-text-secondary hover:border-blue-500/30 hover:text-text-primary"
      )}
    >
      {icon}
      {label}
      {active && (
        <svg className="w-3.5 h-3.5 ml-1" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}

export function OnboardingLocations({
  locations,
  includeRemote,
  includeHybrid,
  onLocationsChange,
  onRemoteToggle,
  onHybridToggle,
  onComplete,
  onSkip,
  completing,
}: OnboardingLocationsProps) {
  const hasPreferences = locations.length > 0 || includeRemote || includeHybrid;

  return (
    <div>
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span className="text-xs font-mono text-blue-400">STEP 4 — LOCATIONS</span>
        </div>
        <h1
          className="text-2xl font-bold text-text-primary mb-2"
          style={{ fontFamily: "Syne, sans-serif" }}
        >
          Where do you want to work?
        </h1>
        <p className="text-text-secondary text-sm leading-relaxed">
          Set your location preferences to filter jobs by geography. Radar uses these
          to weight match scores and surface relevant postings.
        </p>
      </div>

      <div className="space-y-5 mb-8">
        {/* Work arrangement chips */}
        <div className="bg-radar-surface border border-radar-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Work arrangement</h3>
          <div className="flex gap-3 flex-wrap">
            <ToggleChip
              label="Remote"
              active={includeRemote}
              onClick={onRemoteToggle}
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              }
            />
            <ToggleChip
              label="Hybrid"
              active={includeHybrid}
              onClick={onHybridToggle}
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              }
            />
          </div>
        </div>

        {/* City tags */}
        <div className="bg-radar-surface border border-radar-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Preferred cities</h3>
          <p className="text-xs text-text-muted mb-3">
            Add specific cities or metro areas you&apos;re open to
          </p>
          <TagInput
            tags={locations}
            onChange={onLocationsChange}
            placeholder="e.g. San Francisco, New York, Austin..."
            maxTags={10}
            hint="Add cities or regions. Press Enter or comma to add each one."
          />
        </div>

        {hasPreferences && (
          <div className="bg-radar-elevated/50 border border-blue-500/20 rounded-xl p-4">
            <p className="text-xs text-blue-400 font-mono mb-2">YOUR LOCATION PREFERENCES</p>
            <div className="flex flex-wrap gap-1.5">
              {includeRemote && (
                <span className="px-2 py-0.5 rounded-md text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Remote
                </span>
              )}
              {includeHybrid && (
                <span className="px-2 py-0.5 rounded-md text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Hybrid
                </span>
              )}
              {locations.map((loc) => (
                <span key={loc} className="px-2 py-0.5 rounded-md text-xs bg-radar-elevated text-text-secondary border border-radar-border">
                  {loc}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="lg" onClick={onSkip} data-testid="button-skip">
          Skip
        </Button>
        <Button
          size="lg"
          onClick={onComplete}
          className="flex-1"
          loading={completing}
          data-testid="button-finish"
        >
          Go to dashboard
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
