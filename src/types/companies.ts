export interface Company {
  id: string;
  company_name: string;
  career_page_url: string;
  is_active: boolean;
  last_checked_at: string | null;
  posting_count: number;
  created_at: string;
}
