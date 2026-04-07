"use client";

import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { JobFilters } from "@/types/jobs";
import { isDefaultFilters } from "@/types/jobs";

// ─── Chip (multi-toggle) ──────────────────────────────────────────────────────

function Chip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-100 whitespace-nowrap",
        active
          ? color ?? "bg-blue-500/15 border-blue-500/40 text-blue-400"
          : "bg-radar-elevated border-radar-border text-text-secondary hover:text-text-primary hover:border-[#2E3B55]"
      )}
    >
      {label}
    </button>
  );
}

// ─── Multi-select dropdown ────────────────────────────────────────────────────

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (v: string) => {
    onChange(
      selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]
    );
  };

  const hasSelected = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all duration-100 whitespace-nowrap",
          hasSelected
            ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
            : "bg-radar-elevated border-radar-border text-text-secondary hover:text-text-primary"
        )}
      >
        {label}
        {hasSelected && (
          <span className="bg-blue-500 text-white text-[10px] font-mono px-1 rounded">
            {selected.length}
          </span>
        )}
        <svg className={cn("w-3 h-3 transition-transform", open && "rotate-180")} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-30 bg-radar-surface border border-radar-border rounded-xl shadow-xl min-w-[180px] max-h-60 overflow-auto py-1">
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-text-muted">No options yet</p>
          )}
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors",
                selected.includes(opt)
                  ? "text-blue-400 bg-blue-500/10"
                  : "text-text-secondary hover:text-text-primary hover:bg-radar-elevated"
              )}
            >
              <div className={cn(
                "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0",
                selected.includes(opt) ? "bg-blue-500 border-blue-500" : "border-radar-border"
              )}>
                {selected.includes(opt) && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sort dropdown ────────────────────────────────────────────────────────────

function SortDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const options = [
    { value: "match_score", label: "Best Match" },
    { value: "recent", label: "Most Recent" },
    { value: "company", label: "Company A–Z" },
  ];
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-radar-border bg-radar-elevated text-text-secondary hover:text-text-primary transition-all"
      >
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
          <path d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zM3 7a1 1 0 000 2h7a1 1 0 100-2H3zM3 11a1 1 0 100 2h4a1 1 0 100-2H3z" />
        </svg>
        {current.label}
        <svg className={cn("w-3 h-3 transition-transform", open && "rotate-180")} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1.5 z-30 bg-radar-surface border border-radar-border rounded-xl shadow-xl min-w-[150px] py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs transition-colors",
                opt.value === value
                  ? "text-blue-400 bg-blue-500/10"
                  : "text-text-secondary hover:text-text-primary hover:bg-radar-elevated"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main filter bar ──────────────────────────────────────────────────────────

const EXP_CHIPS = [
  { value: "ENTRY", label: "Entry" },
  { value: "MID", label: "Mid" },
  { value: "SENIOR", label: "Senior" },
  { value: "STAFF", label: "Staff" },
];

const SOURCE_CHIPS = [
  { value: "WATCHLIST", label: "Watchlist", color: "bg-blue-500/15 border-blue-500/40 text-blue-400" },
  { value: "GREENHOUSE", label: "Greenhouse", color: "bg-green-500/15 border-green-500/40 text-green-400" },
  { value: "LEVER", label: "Lever", color: "bg-slate-500/15 border-slate-500/40 text-slate-400" },
  { value: "ASHBY", label: "Ashby", color: "bg-purple-500/15 border-purple-500/40 text-purple-400" },
];

const STATUS_CHIPS = [
  { value: "NEW", label: "New" },
  { value: "SAVED", label: "Saved" },
  { value: "APPLIED", label: "Applied" },
  { value: "NOT_INTERESTED", label: "Passed" },
];

interface FilterBarProps {
  filters: JobFilters;
  onChange: (f: JobFilters) => void;
  roleCategories: string[];
  locations: string[];
}

export function FilterBar({ filters, onChange, roleCategories, locations }: FilterBarProps) {
  const set = <K extends keyof JobFilters>(key: K, val: JobFilters[K]) =>
    onChange({ ...filters, [key]: val });

  const toggleArray = (key: "experience_levels" | "sources" | "statuses", val: string) => {
    const arr = filters[key];
    set(key, arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  };

  const hasNonDefaults = !isDefaultFilters(filters);

  return (
    <div className="space-y-2">
      {/* Row 1: search + dropdowns + sort */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder="Search jobs, companies..."
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            className="w-full bg-radar-surface border border-radar-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/40 focus:border-blue-500/40"
            data-testid="filter-search"
          />
        </div>

        <MultiSelectDropdown
          label="Role"
          options={roleCategories}
          selected={filters.role_categories}
          onChange={(v) => set("role_categories", v)}
        />

        <MultiSelectDropdown
          label="Location"
          options={locations}
          selected={filters.locations}
          onChange={(v) => set("locations", v)}
        />

        <SortDropdown
          value={filters.sort}
          onChange={(v) => set("sort", v as JobFilters["sort"])}
        />
      </div>

      {/* Row 2: chip groups */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Experience */}
        <div className="flex items-center gap-1">
          {EXP_CHIPS.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              active={filters.experience_levels.includes(c.value)}
              onClick={() => toggleArray("experience_levels", c.value)}
            />
          ))}
        </div>

        <div className="w-px h-4 bg-radar-border" />

        {/* Source */}
        <div className="flex items-center gap-1">
          {SOURCE_CHIPS.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              active={filters.sources.includes(c.value)}
              onClick={() => toggleArray("sources", c.value)}
              color={c.color}
            />
          ))}
        </div>

        <div className="w-px h-4 bg-radar-border" />

        {/* Status */}
        <div className="flex items-center gap-1">
          {STATUS_CHIPS.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              active={filters.statuses.includes(c.value)}
              onClick={() => toggleArray("statuses", c.value)}
            />
          ))}
        </div>

        {hasNonDefaults && (
          <button
            type="button"
            onClick={() =>
              onChange({
                search: "",
                role_categories: [],
                experience_levels: [],
                locations: [],
                sources: [],
                statuses: [],
                sort: "match_score",
              })
            }
            className="ml-auto text-xs text-text-muted hover:text-red-400 transition-colors flex items-center gap-1"
            data-testid="button-clear-filters"
          >
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
