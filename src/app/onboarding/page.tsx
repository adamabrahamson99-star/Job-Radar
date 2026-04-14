"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { RadarLogo } from "@/components/ui/RadarLogo";
import { Button } from "@/components/ui/Button";
import { OnboardingWelcome } from "@/components/onboarding/OnboardingWelcome";
import { OnboardingResume } from "@/components/onboarding/OnboardingResume";
import { OnboardingHighValue } from "@/components/onboarding/OnboardingHighValue";
import { OnboardingLocations } from "@/components/onboarding/OnboardingLocations";

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "resume", label: "Resume" },
  { id: "high-value", label: "Priorities" },
  { id: "locations", label: "Locations" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { update } = useSession();
  const [currentStep, setCurrentStep] = useState(0);
  const [completing, setCompleting] = useState(false);

  // Shared state across onboarding steps
  const [profileData, setProfileData] = useState({
    resumeUploaded: false,
    highValueSkills: [] as string[],
    highValueTitles: [] as string[],
    preferredLocations: [] as string[],
    includeRemote: false,
    includeHybrid: false,
    includeOnSite: false,
  });

  const goNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  const skipStep = () => {
    goNext();
  };

  const goBack = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      // Save high value data and location prefs if set
      if (
        profileData.highValueSkills.length > 0 ||
        profileData.highValueTitles.length > 0 ||
        profileData.preferredLocations.length > 0
      ) {
        await fetch("/api/profile/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            high_value_skills: profileData.highValueSkills,
            high_value_titles: profileData.highValueTitles,
            preferred_locations: [
              ...profileData.preferredLocations,
              ...(profileData.includeRemote  ? ["Remote"]  : []),
              ...(profileData.includeHybrid  ? ["Hybrid"]  : []),
              ...(profileData.includeOnSite  ? ["On-Site"] : []),
            ],
          }),
        });
      }

      // Mark onboarding complete
      await fetch("/api/onboarding/complete", { method: "POST" });

      // Update the session
      await update();
      router.push("/dashboard");
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      // Still redirect even if save failed
      router.push("/dashboard");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-radar-base grid-bg flex flex-col">
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-radar-border bg-radar-base/80 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
        <RadarLogo size="sm" />
        <div className="flex items-center gap-1.5">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center gap-1.5">
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono font-medium transition-all duration-300 ${
                  i < currentStep
                    ? "bg-blue-500 text-white"
                    : i === currentStep
                    ? "bg-blue-500/20 border border-blue-500 text-blue-400"
                    : "bg-radar-elevated border border-radar-border text-text-muted"
                }`}
              >
                {i < currentStep ? (
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-8 h-px transition-all duration-500 ${
                    i < currentStep ? "bg-blue-500" : "bg-radar-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="text-xs font-mono text-text-muted">
          {currentStep + 1} / {STEPS.length}
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-2xl animate-fade-in" key={currentStep}>
          {currentStep === 0 && (
            <OnboardingWelcome onNext={goNext} />
          )}
          {currentStep === 1 && (
            <OnboardingResume
              onNext={goNext}
              onSkip={skipStep}
              onUploaded={() =>
                setProfileData((d) => ({ ...d, resumeUploaded: true }))
              }
            />
          )}
          {currentStep === 2 && (
            <OnboardingHighValue
              highValueSkills={profileData.highValueSkills}
              highValueTitles={profileData.highValueTitles}
              onSkillsChange={(skills) =>
                setProfileData((d) => ({ ...d, highValueSkills: skills }))
              }
              onTitlesChange={(titles) =>
                setProfileData((d) => ({ ...d, highValueTitles: titles }))
              }
              onNext={goNext}
              onSkip={skipStep}
            />
          )}
          {currentStep === 3 && (
            <OnboardingLocations
              locations={profileData.preferredLocations}
              includeRemote={profileData.includeRemote}
              includeHybrid={profileData.includeHybrid}
              includeOnSite={profileData.includeOnSite}
              onLocationsChange={(locs) =>
                setProfileData((d) => ({ ...d, preferredLocations: locs }))
              }
              onRemoteToggle={() =>
                setProfileData((d) => ({ ...d, includeRemote: !d.includeRemote }))
              }
              onHybridToggle={() =>
                setProfileData((d) => ({ ...d, includeHybrid: !d.includeHybrid }))
              }
              onOnSiteToggle={() =>
                setProfileData((d) => ({ ...d, includeOnSite: !d.includeOnSite }))
              }
              onComplete={handleComplete}
              onSkip={handleComplete}
              completing={completing}
            />
          )}
        </div>
      </main>

      {/* Back navigation */}
      {currentStep > 0 && (
        <footer className="relative z-10 border-t border-radar-border px-6 py-4 flex items-center justify-between bg-radar-base/60 backdrop-blur-sm">
          <Button variant="ghost" size="sm" onClick={goBack}>
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back
          </Button>
          <p className="text-xs text-text-muted font-mono">
            STEP {currentStep + 1} — {STEPS[currentStep].label.toUpperCase()}
          </p>
        </footer>
      )}
    </div>
  );
}
