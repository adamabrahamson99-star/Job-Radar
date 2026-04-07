"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TagInput } from "@/components/ui/TagInput";
import { cn } from "@/lib/utils";

interface Education {
  degree: string;
  field: string;
  institution: string;
  year: number | string;
}

interface CandidateProfile {
  id?: string;
  experience_level: string;
  years_of_experience: number;
  skills: string[];
  target_roles: string[];
  education: Education[];
  high_value_skills: string[];
  high_value_titles: string[];
  preferred_locations: string[];
  parsed_at?: string;
}

const EXPERIENCE_LEVELS = [
  { value: "ENTRY", label: "Entry Level", desc: "0–2 years" },
  { value: "MID", label: "Mid Level", desc: "3–5 years" },
  { value: "SENIOR", label: "Senior", desc: "6–10 years" },
  { value: "STAFF", label: "Staff / Principal", desc: "10+ years" },
];

const LOCATION_PRESETS = ["Remote", "Hybrid", "On-site"];

function SectionHeader({ title, desc, badge }: { title: string; desc?: string; badge?: string }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2
          className="text-base font-semibold text-text-primary"
          style={{ fontFamily: "Syne, sans-serif" }}
        >
          {title}
        </h2>
        {desc && <p className="text-xs text-text-muted mt-0.5">{desc}</p>}
      </div>
      {badge && (
        <span className="text-[10px] font-mono bg-radar-elevated border border-radar-border text-text-muted px-2 py-0.5 rounded">
          {badge}
        </span>
      )}
    </div>
  );
}

function EducationCard({
  edu,
  index,
  onChange,
  onRemove,
}: {
  edu: Education;
  index: number;
  onChange: (idx: number, updated: Education) => void;
  onRemove: (idx: number) => void;
}) {
  const update = (field: keyof Education, val: string | number) =>
    onChange(index, { ...edu, [field]: val });

  return (
    <div className="bg-radar-elevated border border-radar-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-text-muted">EDUCATION #{index + 1}</span>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-text-muted hover:text-red-400 transition-colors"
          data-testid={`button-remove-education-${index}`}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Degree"
          placeholder="B.S., M.S., Ph.D..."
          value={edu.degree}
          onChange={(e) => update("degree", e.target.value)}
        />
        <Input
          label="Field of study"
          placeholder="Computer Science"
          value={edu.field}
          onChange={(e) => update("field", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Institution"
          placeholder="University name"
          value={edu.institution}
          onChange={(e) => update("institution", e.target.value)}
        />
        <Input
          label="Year"
          type="number"
          placeholder="2020"
          value={edu.year?.toString() || ""}
          onChange={(e) => update("year", parseInt(e.target.value) || 0)}
        />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<CandidateProfile>({
    experience_level: "ENTRY",
    years_of_experience: 0,
    skills: [],
    target_roles: [],
    education: [],
    high_value_skills: [],
    high_value_titles: [],
    preferred_locations: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "parsing" | "success" | "error">("idle");
  const [notifPrefs, setNotifPrefs] = useState({ email_enabled: true, instant_alert_threshold: 75 });
  const [notifSaving, setNotifSaving] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile/get");
      const data = await res.json();
      if (data.profile) {
        setProfile({
          ...data.profile,
          education: Array.isArray(data.profile.education)
            ? data.profile.education
            : typeof data.profile.education === "string"
            ? JSON.parse(data.profile.education)
            : [],
        });
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetch("/api/notifications/preferences")
      .then((r) => r.json())
      .then((d) => { if (d.preferences) setNotifPrefs(d.preferences); })
      .catch(() => {});
  }, [fetchProfile]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experience_level: profile.experience_level,
          years_of_experience: profile.years_of_experience,
          skills: profile.skills,
          target_roles: profile.target_roles,
          education: profile.education,
          high_value_skills: profile.high_value_skills,
          high_value_titles: profile.high_value_titles,
          preferred_locations: profile.preferred_locations,
        }),
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

  const handleResumeUpload = async (file: File) => {
    if (file.type !== "application/pdf") {
      setUploadError("Only PDF files are accepted.");
      setUploadState("error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File must be under 10MB.");
      setUploadState("error");
      return;
    }

    setUploadState("uploading");
    setUploadError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploadState("parsing");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/profile/upload-resume`,
        { method: "POST", body: formData, credentials: "include" }
      );

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Upload failed");
      }

      // Refresh profile after parsing
      await fetchProfile();
      setUploadState("success");
      setTimeout(() => setUploadState("idle"), 4000);
    } catch (err: any) {
      setUploadError(err.message || "Upload failed.");
      setUploadState("error");
    }
  };

  const addEducation = () => {
    setProfile((p) => ({
      ...p,
      education: [
        ...p.education,
        { degree: "", field: "", institution: "", year: new Date().getFullYear() },
      ],
    }));
  };

  const updateEducation = (idx: number, updated: Education) => {
    setProfile((p) => ({
      ...p,
      education: p.education.map((e, i) => (i === idx ? updated : e)),
    }));
  };

  const removeEducation = (idx: number) => {
    setProfile((p) => ({
      ...p,
      education: p.education.filter((_, i) => i !== idx),
    }));
  };

  const toggleLocationPreset = (preset: string) => {
    setProfile((p) => ({
      ...p,
      preferred_locations: p.preferred_locations.includes(preset)
        ? p.preferred_locations.filter((l) => l !== preset)
        : [...p.preferred_locations, preset],
    }));
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-xs text-text-muted font-mono">LOADING PROFILE...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1
            className="text-2xl font-bold text-text-primary mb-1"
            style={{ fontFamily: "Syne, sans-serif" }}
          >
            Candidate Profile
          </h1>
          <p className="text-sm text-text-secondary">
            Keep this up to date for accurate match scoring.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === "saved" && (
            <span className="text-xs text-green-400 font-mono flex items-center gap-1.5 animate-fade-in">
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              SAVED
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-xs text-red-400 font-mono">SAVE FAILED</span>
          )}
          <Button
            onClick={handleSave}
            loading={saving}
            data-testid="button-save-profile"
          >
            Save changes
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Resume Section */}
        <div className="bg-radar-surface border border-radar-border rounded-2xl p-6">
          <SectionHeader
            title="Resume"
            desc="Upload a new PDF to re-parse your profile"
            badge={profile.parsed_at ? `Parsed ${new Date(profile.parsed_at).toLocaleDateString()}` : "Not uploaded"}
          />

          <div className="flex items-center gap-4">
            {uploadState === "success" ? (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Resume re-parsed successfully
              </div>
            ) : uploadState === "uploading" || uploadState === "parsing" ? (
              <div className="flex items-center gap-2 text-text-secondary text-sm">
                <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                {uploadState === "parsing" ? "Parsing with Claude AI..." : "Uploading..."}
              </div>
            ) : (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleResumeUpload(file);
                  }}
                  data-testid="input-resume-upload"
                />
                <span className="inline-flex items-center gap-2 bg-radar-elevated border border-radar-border rounded-lg px-4 py-2 text-sm text-text-secondary hover:border-blue-500/40 hover:text-text-primary transition-all cursor-pointer">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  Upload new PDF
                </span>
              </label>
            )}

            {uploadError && (
              <p className="text-xs text-red-400">{uploadError}</p>
            )}
          </div>
        </div>

        {/* Experience */}
        <div className="bg-radar-surface border border-radar-border rounded-2xl p-6">
          <SectionHeader title="Experience" desc="Your seniority level and total years in the field" />

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Experience level
              </label>
              <div className="grid grid-cols-2 gap-2">
                {EXPERIENCE_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() =>
                      setProfile((p) => ({ ...p, experience_level: level.value }))
                    }
                    className={cn(
                      "text-left p-3 rounded-xl border text-sm transition-all",
                      profile.experience_level === level.value
                        ? "bg-blue-500/15 border-blue-500/50 text-blue-400"
                        : "bg-radar-elevated border-radar-border text-text-secondary hover:border-blue-500/30"
                    )}
                    data-testid={`button-exp-${level.value.toLowerCase()}`}
                  >
                    <div className="font-medium">{level.label}</div>
                    <div className="text-xs opacity-70 font-mono">{level.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Input
                label="Years of experience"
                type="number"
                min={0}
                max={50}
                value={profile.years_of_experience}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    years_of_experience: parseInt(e.target.value) || 0,
                  }))
                }
                hint="Total professional experience"
                data-testid="input-years-experience"
              />
            </div>
          </div>
        </div>

        {/* Skills */}
        <div className="bg-radar-surface border border-radar-border rounded-2xl p-6">
          <SectionHeader
            title="Skills"
            desc="All technical and soft skills from your background"
            badge={`${profile.skills.length} skills`}
          />
          <TagInput
            tags={profile.skills}
            onChange={(skills) => setProfile((p) => ({ ...p, skills }))}
            placeholder="Add a skill and press Enter..."
            maxTags={40}
            hint="Up to 40 skills. Press Enter or comma to add."
          />
        </div>

        {/* Target Roles */}
        <div className="bg-radar-surface border border-radar-border rounded-2xl p-6">
          <SectionHeader
            title="Target roles"
            desc="Job titles you&apos;re targeting or open to"
            badge={`${profile.target_roles.length} roles`}
          />
          <TagInput
            tags={profile.target_roles}
            onChange={(target_roles) => setProfile((p) => ({ ...p, target_roles }))}
            placeholder="e.g. Senior Engineer, Data Scientist..."
            maxTags={8}
          />
        </div>

        {/* High Value — Blue accent section */}
        <div className="bg-radar-surface border border-blue-500/20 rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <h2
              className="text-base font-semibold text-text-primary"
              style={{ fontFamily: "Syne, sans-serif" }}
            >
              High-value priorities
            </h2>
          </div>
          <p className="text-xs text-text-muted mb-5">
            These boost your match score — jobs mentioning these will rank higher
          </p>

          <div className="space-y-4">
            <TagInput
              label="High-value skills"
              tags={profile.high_value_skills}
              onChange={(high_value_skills) =>
                setProfile((p) => ({ ...p, high_value_skills }))
              }
              placeholder="Your must-have skills..."
              maxTags={20}
              variant="accent"
              hint="Rendered in electric blue throughout the app"
            />
            <TagInput
              label="High-value job titles"
              tags={profile.high_value_titles}
              onChange={(high_value_titles) =>
                setProfile((p) => ({ ...p, high_value_titles }))
              }
              placeholder="Target titles..."
              maxTags={10}
              variant="accent"
              hint="Jobs matching these titles are surfaced first"
            />
          </div>
        </div>

        {/* Education */}
        <div className="bg-radar-surface border border-radar-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2
                className="text-base font-semibold text-text-primary"
                style={{ fontFamily: "Syne, sans-serif" }}
              >
                Education
              </h2>
              <p className="text-xs text-text-muted mt-0.5">Degrees and institutions</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={addEducation}
              data-testid="button-add-education"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add education
            </Button>
          </div>

          {profile.education.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-radar-border rounded-xl">
              <p className="text-sm text-text-muted">No education entries yet</p>
              <p className="text-xs text-text-muted mt-1">Click "Add education" to add a degree</p>
            </div>
          ) : (
            <div className="space-y-3">
              {profile.education.map((edu, idx) => (
                <EducationCard
                  key={idx}
                  edu={edu}
                  index={idx}
                  onChange={updateEducation}
                  onRemove={removeEducation}
                />
              ))}
            </div>
          )}
        </div>

        {/* Location Preferences */}
        <div className="bg-radar-surface border border-radar-border rounded-2xl p-6">
          <SectionHeader title="Location preferences" desc="Cities, regions, and work arrangements" />

          {/* Work arrangement toggles */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {LOCATION_PRESETS.map((preset) => {
              const active = profile.preferred_locations.includes(preset);
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => toggleLocationPreset(preset)}
                  className={cn(
                    "px-4 py-2 rounded-xl border text-sm font-medium transition-all",
                    active
                      ? "bg-blue-500/15 border-blue-500/50 text-blue-400"
                      : "bg-radar-elevated border-radar-border text-text-secondary hover:border-blue-500/30"
                  )}
                  data-testid={`button-location-${preset.toLowerCase()}`}
                >
                  {preset}
                  {active && (
                    <svg className="inline w-3.5 h-3.5 ml-1.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* City input */}
          <TagInput
            tags={profile.preferred_locations.filter((l) => !LOCATION_PRESETS.includes(l))}
            onChange={(locs) =>
              setProfile((p) => ({
                ...p,
                preferred_locations: [
                  ...p.preferred_locations.filter((l) => LOCATION_PRESETS.includes(l)),
                  ...locs,
                ],
              }))
            }
            placeholder="Add cities or regions..."
            hint="San Francisco, New York, Austin, etc."
          />
        </div>


        {/* Notification preferences */}
        <div className="bg-radar-surface border border-radar-border rounded-2xl p-6">
          <SectionHeader title="Notification Preferences" desc="Control how Radar contacts you about new matches" />
          <div className="space-y-4">
            {/* Email toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">Email notifications</p>
                <p className="text-xs text-text-muted mt-0.5">Receive digests and alerts via email</p>
              </div>
              <button
                type="button"
                onClick={() => setNotifPrefs((p) => ({ ...p, email_enabled: !p.email_enabled }))}
                className={cn(
                  "w-11 h-6 rounded-full transition-all duration-200 relative",
                  notifPrefs.email_enabled ? "bg-blue-500" : "bg-radar-elevated border border-radar-border"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200",
                  notifPrefs.email_enabled ? "left-[22px]" : "left-0.5"
                )} />
              </button>
            </div>

            {/* Alert threshold (PRO/UNLIMITED) */}
            <div>
              <p className="text-sm text-text-primary mb-1">Instant alert threshold</p>
              <p className="text-xs text-text-muted mb-2">Only alert for matches above this score (PRO/Unlimited)</p>
              <div className="flex gap-2">
                {[75, 80, 90].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNotifPrefs((p) => ({ ...p, instant_alert_threshold: t }))}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-xs font-mono transition-all",
                      notifPrefs.instant_alert_threshold === t
                        ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                        : "bg-radar-elevated border-radar-border text-text-secondary hover:border-blue-500/20"
                    )}
                  >
                    {t}%+
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={async () => {
                setNotifSaving(true);
                try {
                  await fetch("/api/notifications/preferences", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(notifPrefs),
                  });
                } finally {
                  setNotifSaving(false);
                }
              }}
              disabled={notifSaving}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              {notifSaving ? "Saving..." : "Save notification settings"}
            </button>
          </div>
        </div>
        {/* Bottom save bar */}
        <div className="sticky bottom-6 bg-radar-base/90 backdrop-blur-sm border border-radar-border rounded-2xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            UNSAVED CHANGES
          </div>
          <Button
            onClick={handleSave}
            loading={saving}
            size="lg"
            data-testid="button-save-profile-bottom"
          >
            Save profile
          </Button>
        </div>
      </div>
    </div>
  );
}
