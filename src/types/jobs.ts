export interface JobPosting {
  id: string;
  user_id: string;
  company_id: string | null;
  external_id: string;
  title: string;
  company_name: string;
  location: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_raw: string | null;
  description_raw: string;
  description_summary: string | null;
  match_score: number;
  match_explanation: string | null;
  experience_level: "ENTRY" | "MID" | "SENIOR" | "STAFF" | null;
  role_category: string | null;
  apply_url: string;
  source: "WATCHLIST" | "GREENHOUSE" | "LEVER" | "ASHBY";
  status: "NEW" | "SAVED" | "APPLIED" | "NOT_INTERESTED";
  is_new_since_last_visit: boolean;
  posted_at: string | null;
  first_seen_at: string;
  last_verified_at: string;
  is_active: boolean;
  created_at: string;
}

export interface JobStats {
  total_active: number;
  new_today: number;
  applied_count: number;
  saved_count: number;
  avg_match_score: number;
}

export interface JobFilters {
  search: string;
  role_categories: string[];
  experience_levels: string[];
  locations: string[];
  sources: string[];
  statuses: string[];
  sort: "match_score" | "recent" | "company";
}

export const DEFAULT_FILTERS: JobFilters = {
  search: "",
  role_categories: [],
  experience_levels: [],
  locations: [],
  sources: [],
  statuses: [],
  sort: "match_score",
};

export function isDefaultFilters(f: JobFilters): boolean {
  return (
    !f.search &&
    f.role_categories.length === 0 &&
    f.experience_levels.length === 0 &&
    f.locations.length === 0 &&
    f.sources.length === 0 &&
    f.statuses.length === 0 &&
    f.sort === "match_score"
  );
}
