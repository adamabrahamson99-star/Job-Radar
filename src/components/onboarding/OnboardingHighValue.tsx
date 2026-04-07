"use client";

import { Button } from "@/components/ui/Button";
import { TagInput } from "@/components/ui/TagInput";

interface OnboardingHighValueProps {
  highValueSkills: string[];
  highValueTitles: string[];
  onSkillsChange: (skills: string[]) => void;
  onTitlesChange: (titles: string[]) => void;
  onNext: () => void;
  onSkip: () => void;
}

export function OnboardingHighValue({
  highValueSkills,
  highValueTitles,
  onSkillsChange,
  onTitlesChange,
  onNext,
  onSkip,
}: OnboardingHighValueProps) {
  const hasData = highValueSkills.length > 0 || highValueTitles.length > 0;

  return (
    <div>
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span className="text-xs font-mono text-blue-400">STEP 3 — PRIORITIES</span>
        </div>
        <h1
          className="text-2xl font-bold text-text-primary mb-2"
          style={{ fontFamily: "Syne, sans-serif" }}
        >
          What matters most to you?
        </h1>
        <p className="text-text-secondary text-sm leading-relaxed">
          High-value skills and titles get extra weight in the match scoring algorithm.
          Jobs that mention these will rank higher in your feed.
        </p>
      </div>

      <div className="space-y-6 mb-8">
        <div className="bg-radar-surface border border-radar-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <h3 className="text-sm font-semibold text-text-primary">High-value skills</h3>
            <span className="text-xs text-text-muted font-mono ml-auto">
              These are your must-haves
            </span>
          </div>
          <TagInput
            tags={highValueSkills}
            onChange={onSkillsChange}
            placeholder="e.g. React, Python, AWS, GraphQL..."
            maxTags={20}
            variant="accent"
            hint="Press Enter or comma to add. These appear in blue throughout the app."
          />
        </div>

        <div className="bg-radar-surface border border-radar-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <h3 className="text-sm font-semibold text-text-primary">High-value job titles</h3>
            <span className="text-xs text-text-muted font-mono ml-auto">
              Roles you&apos;re actively targeting
            </span>
          </div>
          <TagInput
            tags={highValueTitles}
            onChange={onTitlesChange}
            placeholder="e.g. Staff Engineer, Senior PM, Data Lead..."
            maxTags={10}
            variant="accent"
            hint="Jobs matching these titles will be surfaced first."
          />
        </div>

        {/* Example preview */}
        {hasData && (
          <div className="bg-radar-elevated/50 border border-radar-border rounded-xl p-4">
            <p className="text-xs text-text-muted mb-3 font-mono">PREVIEW — HOW THEY APPEAR</p>
            <div className="flex flex-wrap gap-1.5">
              {highValueSkills.slice(0, 5).map((skill) => (
                <span
                  key={skill}
                  className="px-2 py-0.5 rounded-md text-xs bg-blue-500/15 text-blue-400 border border-blue-500/30"
                >
                  {skill}
                </span>
              ))}
              {highValueTitles.slice(0, 3).map((title) => (
                <span
                  key={title}
                  className="px-2 py-0.5 rounded-md text-xs bg-blue-500/15 text-blue-400 border border-blue-500/30 font-medium"
                >
                  {title}
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
        <Button size="lg" onClick={onNext} className="flex-1" data-testid="button-continue">
          Continue
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
