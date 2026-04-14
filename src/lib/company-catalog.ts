/**
 * Radar — Static company catalog.
 *
 * Used for:
 *  1. The new "Add Company" search panel in the Watchlist tab (client-side search)
 *  2. ATS matching: when a user adds a company that appears here, the API stores
 *     ats_source + ats_slug so jobs_runner.py routes via the ATS client instead
 *     of the web scraper.
 *  3. Profile-based recommendations (sector + tag matching).
 *
 * Sources:
 *  - ATS companies: all entries from backend/ats_seed_data.py
 *  - Fortune 500 / big tech: career URLs for companies on non-supported ATS
 */

export type AtsSource = "GREENHOUSE" | "LEVER" | "ASHBY";

export interface CatalogCompany {
  name: string;
  /** Lowercase key for fuzzy matching */
  slug: string;
  sector: "AI" | "Tech" | "Finance" | "Healthcare" | "Consulting" | "Media" | "E-Commerce" | "Infrastructure";
  /** Keywords that align this company with candidate profile terms */
  tags: string[];
  ats_source?: AtsSource;
  ats_slug?: string;
  /** Fallback URL for companies not on a supported ATS */
  career_url?: string;
}

// ─── ATS-backed companies (Greenhouse) ────────────────────────────────────────

const GREENHOUSE: CatalogCompany[] = [
  // Tech
  { name: "Airbnb",           slug: "airbnb",          sector: "Tech",           tags: ["engineer", "product", "data", "design"],            ats_source: "GREENHOUSE", ats_slug: "airbnb" },
  { name: "Stripe",           slug: "stripe",          sector: "Finance",        tags: ["engineer", "product", "fintech", "payments"],        ats_source: "GREENHOUSE", ats_slug: "stripe" },
  { name: "Databricks",       slug: "databricks",      sector: "AI",             tags: ["engineer", "data", "ml", "infrastructure"],          ats_source: "GREENHOUSE", ats_slug: "databricks" },
  { name: "Figma",            slug: "figma",           sector: "Tech",           tags: ["engineer", "design", "product", "frontend"],         ats_source: "GREENHOUSE", ats_slug: "figma" },
  { name: "Notion",           slug: "notion",          sector: "Tech",           tags: ["engineer", "product", "design"],                     ats_source: "GREENHOUSE", ats_slug: "notion" },
  { name: "Discord",          slug: "discord",         sector: "Tech",           tags: ["engineer", "product", "infrastructure"],             ats_source: "GREENHOUSE", ats_slug: "discord" },
  { name: "Twilio",           slug: "twilio",          sector: "Infrastructure", tags: ["engineer", "product", "api", "communications"],      ats_source: "GREENHOUSE", ats_slug: "twilio" },
  { name: "Zendesk",          slug: "zendesk",         sector: "Tech",           tags: ["engineer", "product", "customer success"],           ats_source: "GREENHOUSE", ats_slug: "zendesk" },
  { name: "Elastic",          slug: "elastic",         sector: "Infrastructure", tags: ["engineer", "search", "infrastructure", "data"],      ats_source: "GREENHOUSE", ats_slug: "elastic" },
  { name: "HashiCorp",        slug: "hashicorp",       sector: "Infrastructure", tags: ["engineer", "devops", "infrastructure", "cloud"],     ats_source: "GREENHOUSE", ats_slug: "hashicorp" },
  { name: "Cloudflare",       slug: "cloudflare",      sector: "Infrastructure", tags: ["engineer", "security", "networking", "infrastructure"], ats_source: "GREENHOUSE", ats_slug: "cloudflare" },
  { name: "MongoDB",          slug: "mongodb",         sector: "Infrastructure", tags: ["engineer", "data", "database", "infrastructure"],    ats_source: "GREENHOUSE", ats_slug: "mongodb" },
  { name: "Confluent",        slug: "confluent",       sector: "Infrastructure", tags: ["engineer", "data", "streaming", "infrastructure"],   ats_source: "GREENHOUSE", ats_slug: "confluent" },
  { name: "Amplitude",        slug: "amplitude",       sector: "Tech",           tags: ["engineer", "data", "product", "analytics"],          ats_source: "GREENHOUSE", ats_slug: "amplitude" },
  { name: "Segment",          slug: "segment",         sector: "Tech",           tags: ["engineer", "data", "product"],                       ats_source: "GREENHOUSE", ats_slug: "segment" },
  { name: "Brex",             slug: "brex",            sector: "Finance",        tags: ["engineer", "fintech", "product", "finance"],         ats_source: "GREENHOUSE", ats_slug: "brex" },
  { name: "Rippling",         slug: "rippling",        sector: "Tech",           tags: ["engineer", "product", "hr", "payroll"],              ats_source: "GREENHOUSE", ats_slug: "rippling" },
  { name: "Lattice",          slug: "lattice",         sector: "Tech",           tags: ["engineer", "product", "hr", "people ops"],           ats_source: "GREENHOUSE", ats_slug: "lattice" },
  { name: "Gusto",            slug: "gusto",           sector: "Finance",        tags: ["engineer", "product", "payroll", "fintech"],         ats_source: "GREENHOUSE", ats_slug: "gusto" },
  { name: "Chime",            slug: "chime",           sector: "Finance",        tags: ["engineer", "product", "fintech", "banking"],         ats_source: "GREENHOUSE", ats_slug: "chime" },
  { name: "Uber",             slug: "uber",            sector: "Tech",           tags: ["engineer", "product", "data", "ml", "operations"],   ats_source: "GREENHOUSE", ats_slug: "uber" },
  { name: "Spotify",          slug: "spotify",         sector: "Media",          tags: ["engineer", "product", "data", "ml", "media"],        ats_source: "GREENHOUSE", ats_slug: "spotify" },
  { name: "DoorDash",         slug: "doordash",        sector: "E-Commerce",     tags: ["engineer", "product", "data", "ml", "operations"],   ats_source: "GREENHOUSE", ats_slug: "doordash" },
  // Finance
  { name: "Coinbase",         slug: "coinbase",        sector: "Finance",        tags: ["engineer", "product", "crypto", "fintech"],          ats_source: "GREENHOUSE", ats_slug: "coinbase" },
  { name: "Robinhood",        slug: "robinhood",       sector: "Finance",        tags: ["engineer", "product", "fintech", "trading"],         ats_source: "GREENHOUSE", ats_slug: "robinhood" },
  { name: "Plaid",            slug: "plaid",           sector: "Finance",        tags: ["engineer", "product", "fintech", "api"],             ats_source: "GREENHOUSE", ats_slug: "plaid" },
  { name: "Affirm",           slug: "affirm",          sector: "Finance",        tags: ["engineer", "product", "fintech", "lending"],         ats_source: "GREENHOUSE", ats_slug: "affirm" },
  { name: "Marqeta",          slug: "marqeta",         sector: "Finance",        tags: ["engineer", "product", "fintech", "payments"],        ats_source: "GREENHOUSE", ats_slug: "marqeta" },
  // Healthcare
  { name: "Hims & Hers",      slug: "hims",            sector: "Healthcare",     tags: ["engineer", "product", "health", "consumer"],         ats_source: "GREENHOUSE", ats_slug: "hims" },
  { name: "Teladoc Health",   slug: "teladoc",         sector: "Healthcare",     tags: ["engineer", "product", "health", "telehealth"],       ats_source: "GREENHOUSE", ats_slug: "teladoc" },
  { name: "Modern Health",    slug: "modernhealth",    sector: "Healthcare",     tags: ["engineer", "product", "mental health"],              ats_source: "GREENHOUSE", ats_slug: "modernhealth" },
  { name: "Collective Health", slug: "collectivehealth", sector: "Healthcare",   tags: ["engineer", "product", "health", "benefits"],         ats_source: "GREENHOUSE", ats_slug: "collectivehealth" },
  { name: "Flatiron Health",  slug: "flatiron",        sector: "Healthcare",     tags: ["engineer", "data", "health", "oncology"],            ats_source: "GREENHOUSE", ats_slug: "flatiron" },
  // Consulting / GTM
  { name: "Klaviyo",          slug: "klaviyo",         sector: "Tech",           tags: ["engineer", "product", "marketing", "data"],          ats_source: "GREENHOUSE", ats_slug: "klaviyo" },
  { name: "Gong",             slug: "gong",            sector: "Tech",           tags: ["engineer", "product", "sales", "ai"],                ats_source: "GREENHOUSE", ats_slug: "gong" },
  { name: "Outreach",         slug: "outreach",        sector: "Tech",           tags: ["engineer", "product", "sales"],                      ats_source: "GREENHOUSE", ats_slug: "outreach" },
  { name: "Salesloft",        slug: "salesloft",       sector: "Tech",           tags: ["engineer", "product", "sales"],                      ats_source: "GREENHOUSE", ats_slug: "salesloft" },
  { name: "Mixpanel",         slug: "mixpanel",        sector: "Tech",           tags: ["engineer", "product", "analytics", "data"],          ats_source: "GREENHOUSE", ats_slug: "mixpanel" },
];

// ─── ATS-backed companies (Lever) ─────────────────────────────────────────────

const LEVER: CatalogCompany[] = [
  { name: "Netflix",          slug: "netflix",         sector: "Media",          tags: ["engineer", "product", "ml", "data", "streaming"],    ats_source: "LEVER", ats_slug: "netflix" },
  { name: "Block (Square)",   slug: "square",          sector: "Finance",        tags: ["engineer", "product", "fintech", "payments"],        ats_source: "LEVER", ats_slug: "square" },
  { name: "Dropbox",          slug: "dropbox",         sector: "Tech",           tags: ["engineer", "product", "storage", "collaboration"],   ats_source: "LEVER", ats_slug: "dropbox" },
  { name: "Lyft",             slug: "lyft",            sector: "Tech",           tags: ["engineer", "product", "ml", "data", "operations"],   ats_source: "LEVER", ats_slug: "lyft" },
  { name: "Reddit",           slug: "reddit",          sector: "Media",          tags: ["engineer", "product", "ml", "data"],                 ats_source: "LEVER", ats_slug: "reddit" },
  { name: "Pinterest",        slug: "pinterest",       sector: "Media",          tags: ["engineer", "product", "ml", "design"],               ats_source: "LEVER", ats_slug: "pinterest" },
  { name: "Snap",             slug: "snap",            sector: "Media",          tags: ["engineer", "product", "ar", "camera", "ml"],         ats_source: "LEVER", ats_slug: "snap" },
  { name: "Duolingo",         slug: "duolingo",        sector: "Tech",           tags: ["engineer", "product", "ml", "education"],            ats_source: "LEVER", ats_slug: "duolingo" },
  { name: "Canva",            slug: "canva",           sector: "Tech",           tags: ["engineer", "product", "design", "frontend"],         ats_source: "LEVER", ats_slug: "canva" },
  { name: "Atlassian",        slug: "atlassian",       sector: "Tech",           tags: ["engineer", "product", "developer tools"],            ats_source: "LEVER", ats_slug: "atlassian" },
  { name: "HubSpot",          slug: "hubspot",         sector: "Tech",           tags: ["engineer", "product", "marketing", "crm"],           ats_source: "LEVER", ats_slug: "hubspot" },
  { name: "Asana",            slug: "asana",           sector: "Tech",           tags: ["engineer", "product", "project management"],         ats_source: "LEVER", ats_slug: "asana" },
  { name: "Intercom",         slug: "intercom",        sector: "Tech",           tags: ["engineer", "product", "customer success"],           ats_source: "LEVER", ats_slug: "intercom" },
  { name: "Coursera",         slug: "coursera",        sector: "Tech",           tags: ["engineer", "product", "education", "ml"],            ats_source: "LEVER", ats_slug: "coursera" },
  { name: "Udemy",            slug: "udemy",           sector: "Tech",           tags: ["engineer", "product", "education"],                  ats_source: "LEVER", ats_slug: "udemy" },
  { name: "NerdWallet",       slug: "nerdwallet",      sector: "Finance",        tags: ["engineer", "product", "fintech", "consumer"],        ats_source: "LEVER", ats_slug: "nerdwallet" },
  { name: "Betterment",       slug: "betterment",      sector: "Finance",        tags: ["engineer", "product", "fintech", "investing"],       ats_source: "LEVER", ats_slug: "betterment" },
  { name: "Wealthfront",      slug: "wealthfront",     sector: "Finance",        tags: ["engineer", "product", "fintech", "investing"],       ats_source: "LEVER", ats_slug: "wealthfront" },
  { name: "One Medical",      slug: "one-medical",     sector: "Healthcare",     tags: ["engineer", "product", "health", "primary care"],     ats_source: "LEVER", ats_slug: "one-medical" },
  { name: "Oscar Health",     slug: "oscar",           sector: "Healthcare",     tags: ["engineer", "product", "health", "insurance"],        ats_source: "LEVER", ats_slug: "oscar" },
  { name: "Zocdoc",           slug: "zocdoc",          sector: "Healthcare",     tags: ["engineer", "product", "health", "marketplace"],      ats_source: "LEVER", ats_slug: "zocdoc" },
  { name: "Carta",            slug: "carta",           sector: "Finance",        tags: ["engineer", "product", "fintech", "equity"],          ats_source: "LEVER", ats_slug: "carta" },
  { name: "Retool",           slug: "retool",          sector: "Tech",           tags: ["engineer", "product", "developer tools", "no-code"], ats_source: "LEVER", ats_slug: "retool" },
  { name: "Hex",              slug: "hex",             sector: "Tech",           tags: ["engineer", "data", "analytics", "developer tools"],  ats_source: "LEVER", ats_slug: "hex" },
];

// ─── ATS-backed companies (Ashby) ─────────────────────────────────────────────

const ASHBY: CatalogCompany[] = [
  { name: "Anthropic",        slug: "anthropic",       sector: "AI",             tags: ["engineer", "research", "ml", "safety", "ai"],        ats_source: "ASHBY", ats_slug: "anthropic" },
  { name: "OpenAI",           slug: "openai",          sector: "AI",             tags: ["engineer", "research", "ml", "safety", "ai"],        ats_source: "ASHBY", ats_slug: "openai" },
  { name: "Mistral AI",       slug: "mistral",         sector: "AI",             tags: ["engineer", "research", "ml", "ai"],                  ats_source: "ASHBY", ats_slug: "mistral" },
  { name: "Cohere",           slug: "cohere",          sector: "AI",             tags: ["engineer", "research", "ml", "nlp", "ai"],           ats_source: "ASHBY", ats_slug: "cohere" },
  { name: "Perplexity AI",    slug: "perplexity",      sector: "AI",             tags: ["engineer", "product", "ml", "search", "ai"],         ats_source: "ASHBY", ats_slug: "perplexity" },
  { name: "Anyscale",         slug: "anyscale",        sector: "AI",             tags: ["engineer", "ml", "infrastructure", "ai"],            ats_source: "ASHBY", ats_slug: "anyscale" },
  { name: "Modal",            slug: "modal",           sector: "Infrastructure", tags: ["engineer", "cloud", "infrastructure", "ml"],         ats_source: "ASHBY", ats_slug: "modal" },
  { name: "Replit",           slug: "replit",          sector: "Tech",           tags: ["engineer", "product", "developer tools", "ai"],      ats_source: "ASHBY", ats_slug: "replit" },
  { name: "Linear",           slug: "linear",          sector: "Tech",           tags: ["engineer", "product", "developer tools", "design"],  ats_source: "ASHBY", ats_slug: "linear" },
  { name: "Vercel",           slug: "vercel",          sector: "Infrastructure", tags: ["engineer", "frontend", "infrastructure", "developer tools"], ats_source: "ASHBY", ats_slug: "vercel" },
  { name: "Supabase",         slug: "supabase",        sector: "Infrastructure", tags: ["engineer", "database", "infrastructure", "open source"], ats_source: "ASHBY", ats_slug: "supabase" },
  { name: "Neon",             slug: "neon",            sector: "Infrastructure", tags: ["engineer", "database", "infrastructure"],            ats_source: "ASHBY", ats_slug: "neon" },
  { name: "Fly.io",           slug: "fly",             sector: "Infrastructure", tags: ["engineer", "cloud", "infrastructure", "devops"],     ats_source: "ASHBY", ats_slug: "fly" },
  { name: "Grafana Labs",     slug: "grafana",         sector: "Infrastructure", tags: ["engineer", "observability", "infrastructure", "open source"], ats_source: "ASHBY", ats_slug: "grafana" },
  { name: "Temporal",         slug: "temporal",        sector: "Infrastructure", tags: ["engineer", "infrastructure", "distributed systems"], ats_source: "ASHBY", ats_slug: "temporal" },
  { name: "dbt Labs",         slug: "dbt-labs",        sector: "Infrastructure", tags: ["engineer", "data", "analytics", "open source"],      ats_source: "ASHBY", ats_slug: "dbt-labs" },
  { name: "Dagster",          slug: "dagster",         sector: "Infrastructure", tags: ["engineer", "data", "infrastructure", "open source"], ats_source: "ASHBY", ats_slug: "dagster" },
  { name: "Prefect",          slug: "prefect",         sector: "Infrastructure", tags: ["engineer", "data", "infrastructure"],                ats_source: "ASHBY", ats_slug: "prefect" },
  { name: "Mercury",          slug: "mercury",         sector: "Finance",        tags: ["engineer", "product", "fintech", "banking"],         ats_source: "ASHBY", ats_slug: "mercury" },
  { name: "Ramp",             slug: "ramp",            sector: "Finance",        tags: ["engineer", "product", "fintech", "finance"],         ats_source: "ASHBY", ats_slug: "ramp" },
  { name: "Modern Treasury",  slug: "moderntreasury",  sector: "Finance",        tags: ["engineer", "product", "fintech", "payments"],        ats_source: "ASHBY", ats_slug: "moderntreasury" },
  { name: "Clerk",            slug: "clerk",           sector: "Infrastructure", tags: ["engineer", "developer tools", "auth", "api"],        ats_source: "ASHBY", ats_slug: "clerk" },
  { name: "Resend",           slug: "resend",          sector: "Infrastructure", tags: ["engineer", "developer tools", "api", "email"],       ats_source: "ASHBY", ats_slug: "resend" },
  { name: "Cal.com",          slug: "calcom",          sector: "Tech",           tags: ["engineer", "product", "open source", "developer tools"], ats_source: "ASHBY", ats_slug: "calcom" },
];

// ─── Career-URL companies (big tech + Fortune 500) ────────────────────────────

const CAREER_URL: CatalogCompany[] = [
  // Big Tech
  { name: "Google",           slug: "google",          sector: "Tech",           tags: ["engineer", "product", "ml", "research", "infrastructure"], career_url: "https://careers.google.com/jobs/results/" },
  { name: "Apple",            slug: "apple",           sector: "Tech",           tags: ["engineer", "product", "design", "hardware"],         career_url: "https://jobs.apple.com/en-us/search" },
  { name: "Microsoft",        slug: "microsoft",       sector: "Tech",           tags: ["engineer", "product", "cloud", "ai", "infrastructure"], career_url: "https://careers.microsoft.com/us/en/search-results" },
  { name: "Amazon",           slug: "amazon",          sector: "E-Commerce",     tags: ["engineer", "product", "operations", "cloud", "ml"],   career_url: "https://www.amazon.jobs/en/search" },
  { name: "Meta",             slug: "meta",            sector: "Tech",           tags: ["engineer", "product", "ml", "ar", "research"],        career_url: "https://www.metacareers.com/jobs" },
  { name: "Tesla",            slug: "tesla",           sector: "Tech",           tags: ["engineer", "hardware", "robotics", "energy"],         career_url: "https://www.tesla.com/careers/search" },
  { name: "Nvidia",           slug: "nvidia",          sector: "AI",             tags: ["engineer", "ml", "hardware", "research", "ai"],       career_url: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite" },
  { name: "Intel",            slug: "intel",           sector: "Tech",           tags: ["engineer", "hardware", "semiconductor", "research"],   career_url: "https://jobs.intel.com/en/search-jobs" },
  { name: "IBM",              slug: "ibm",             sector: "Tech",           tags: ["engineer", "product", "cloud", "consulting", "ai"],   career_url: "https://www.ibm.com/employment/" },
  { name: "Oracle",           slug: "oracle",          sector: "Infrastructure", tags: ["engineer", "product", "database", "cloud"],           career_url: "https://careers.oracle.com/jobs" },
  { name: "Salesforce",       slug: "salesforce",      sector: "Tech",           tags: ["engineer", "product", "crm", "sales", "cloud"],       career_url: "https://careers.salesforce.com/en/jobs/" },
  { name: "Adobe",            slug: "adobe",           sector: "Tech",           tags: ["engineer", "product", "design", "creative", "ml"],    career_url: "https://careers.adobe.com/us/en/search-results" },
  { name: "ServiceNow",       slug: "servicenow",      sector: "Tech",           tags: ["engineer", "product", "enterprise", "cloud"],         career_url: "https://careers.servicenow.com/jobs" },
  { name: "Workday",          slug: "workday",         sector: "Tech",           tags: ["engineer", "product", "hr", "enterprise", "cloud"],   career_url: "https://workday.wd5.myworkdayjobs.com/Workday" },
  { name: "Snowflake",        slug: "snowflake",       sector: "Infrastructure", tags: ["engineer", "data", "cloud", "infrastructure"],        career_url: "https://careers.snowflake.com/us/en/" },
  { name: "Palantir",         slug: "palantir",        sector: "AI",             tags: ["engineer", "data", "ml", "government"],              career_url: "https://www.palantir.com/careers/" },
  { name: "Datadog",          slug: "datadog",         sector: "Infrastructure", tags: ["engineer", "monitoring", "infrastructure", "devops"], career_url: "https://careers.datadoghq.com/" },
  { name: "CrowdStrike",      slug: "crowdstrike",     sector: "Tech",           tags: ["engineer", "security", "cybersecurity"],              career_url: "https://www.crowdstrike.com/careers/" },
  { name: "Zoom",             slug: "zoom",            sector: "Tech",           tags: ["engineer", "product", "video", "communications"],     career_url: "https://careers.zoom.us/jobs" },
  { name: "PayPal",           slug: "paypal",          sector: "Finance",        tags: ["engineer", "product", "fintech", "payments"],         career_url: "https://careers.pypl.com/home.html" },
  { name: "Shopify",          slug: "shopify",         sector: "E-Commerce",     tags: ["engineer", "product", "ecommerce", "developer tools"], career_url: "https://www.shopify.com/careers/search" },
  { name: "Twitch",           slug: "twitch",          sector: "Media",          tags: ["engineer", "product", "streaming", "gaming"],         career_url: "https://www.twitch.tv/jobs" },
  { name: "Roblox",           slug: "roblox",          sector: "Tech",           tags: ["engineer", "product", "gaming", "metaverse"],         career_url: "https://careers.roblox.com/jobs" },
  { name: "Epic Games",       slug: "epicgames",       sector: "Tech",           tags: ["engineer", "product", "gaming"],                      career_url: "https://www.epicgames.com/site/en-US/careers/jobs" },
  // Finance / Banking
  { name: "Goldman Sachs",    slug: "goldmansachs",    sector: "Finance",        tags: ["engineer", "quant", "finance", "trading", "data"],    career_url: "https://www.goldmansachs.com/careers/divisions/engineering/" },
  { name: "JPMorgan Chase",   slug: "jpmorgan",        sector: "Finance",        tags: ["engineer", "quant", "finance", "data", "banking"],    career_url: "https://careers.jpmorgan.com/us/en/jobs" },
  { name: "Morgan Stanley",   slug: "morganstanley",   sector: "Finance",        tags: ["engineer", "quant", "finance", "trading"],            career_url: "https://www.morganstanley.com/people-opportunities/students-graduates/programs" },
  { name: "Citadel",          slug: "citadel",         sector: "Finance",        tags: ["engineer", "quant", "finance", "trading", "hft"],     career_url: "https://www.citadel.com/careers/" },
  { name: "Jane Street",      slug: "janestreet",      sector: "Finance",        tags: ["engineer", "quant", "trading", "research"],           career_url: "https://www.janestreet.com/join-jane-street/open-roles/" },
  { name: "Two Sigma",        slug: "twosigma",        sector: "Finance",        tags: ["engineer", "quant", "data", "ml", "research"],        career_url: "https://careers.twosigma.com/careers/Careers" },
  { name: "Point72",          slug: "point72",         sector: "Finance",        tags: ["engineer", "quant", "data", "finance"],              career_url: "https://careers.point72.com/jobs" },
  { name: "Visa",             slug: "visa",            sector: "Finance",        tags: ["engineer", "product", "fintech", "payments"],         career_url: "https://careers.visa.com/jobs/" },
  { name: "Mastercard",       slug: "mastercard",      sector: "Finance",        tags: ["engineer", "product", "fintech", "payments"],         career_url: "https://careers.mastercard.com/us/en/" },
  // Consulting
  { name: "McKinsey & Company", slug: "mckinsey",      sector: "Consulting",     tags: ["consulting", "strategy", "data", "product"],         career_url: "https://www.mckinsey.com/careers/search-jobs" },
  { name: "Boston Consulting Group", slug: "bcg",      sector: "Consulting",     tags: ["consulting", "strategy", "engineer", "data"],         career_url: "https://careers.bcg.com/jobs" },
  { name: "Bain & Company",   slug: "bain",            sector: "Consulting",     tags: ["consulting", "strategy", "data"],                     career_url: "https://www.bain.com/careers/find-a-role/" },
  { name: "Deloitte",         slug: "deloitte",        sector: "Consulting",     tags: ["consulting", "engineer", "data", "finance"],          career_url: "https://apply.deloitte.com/careers/SearchJobs" },
  { name: "Accenture",        slug: "accenture",       sector: "Consulting",     tags: ["consulting", "engineer", "product", "cloud"],         career_url: "https://www.accenture.com/us-en/careers/jobsearch" },
  // Healthcare
  { name: "Epic Systems",     slug: "epic",            sector: "Healthcare",     tags: ["engineer", "product", "health", "ehr"],               career_url: "https://careers.epic.com/" },
  { name: "Veeva Systems",    slug: "veeva",           sector: "Healthcare",     tags: ["engineer", "product", "biotech", "life sciences"],    career_url: "https://careers.veeva.com/jobs" },
  { name: "CVS Health",       slug: "cvs",             sector: "Healthcare",     tags: ["engineer", "product", "health", "pharmacy"],          career_url: "https://jobs.cvshealth.com/us/en/search-results" },
  // E-commerce / Retail
  { name: "Instacart",        slug: "instacart",       sector: "E-Commerce",     tags: ["engineer", "product", "data", "operations"],          career_url: "https://instacart.careers/jobs/" },
  { name: "Wayfair",          slug: "wayfair",         sector: "E-Commerce",     tags: ["engineer", "product", "ecommerce", "data"],           career_url: "https://www.aboutwayfair.com/careers/jobs" },
];

// ─── Master catalog ────────────────────────────────────────────────────────────

export const COMPANY_CATALOG: CatalogCompany[] = [
  ...GREENHOUSE,
  ...LEVER,
  ...ASHBY,
  ...CAREER_URL,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise a string for fuzzy matching (lowercase, strip punctuation). */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Search the catalog by name. Returns entries whose name contains the query
 * as a substring (case-insensitive). ATS-backed companies are ranked first.
 */
export function searchCatalog(query: string): CatalogCompany[] {
  if (!query.trim()) return [];
  const q = normalize(query);
  return COMPANY_CATALOG
    .filter((c) => normalize(c.name).includes(q) || c.slug.includes(q.replace(/\s/g, "")))
    .sort((a, b) => {
      // ATS-backed first
      const aHasAts = a.ats_source ? -1 : 0;
      const bHasAts = b.ats_source ? -1 : 0;
      if (aHasAts !== bHasAts) return aHasAts - bHasAts;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Look up a company by exact name for layered sourcing.
 * Returns the first catalog match, or null.
 */
export function findCatalogCompany(name: string): CatalogCompany | null {
  const q = normalize(name);
  return (
    COMPANY_CATALOG.find((c) => normalize(c.name) === q) ??
    COMPANY_CATALOG.find((c) => c.slug === q.replace(/\s/g, "-")) ??
    null
  );
}

/**
 * Return recommended companies based on the user's profile keywords.
 * Filters to companies whose tags overlap with the profile terms.
 * ATS-backed companies are prioritised. Returns up to `limit` results.
 */
export function getRecommendations(
  profileKeywords: string[],
  existingNames: string[],
  limit = 12
): CatalogCompany[] {
  const existingSet = new Set(existingNames.map((n) => normalize(n)));
  const kwSet = new Set(profileKeywords.map((k) => k.toLowerCase()));

  const scored = COMPANY_CATALOG
    .filter((c) => !existingSet.has(normalize(c.name)))
    .map((c) => {
      const overlap = c.tags.filter((t) => kwSet.has(t) || [...kwSet].some((k) => t.includes(k) || k.includes(t))).length;
      const atsBonus = c.ats_source ? 1 : 0;
      return { company: c, score: overlap + atsBonus };
    })
    .sort((a, b) => b.score - a.score);

  // If no profile keywords, return a diverse set of well-known ATS companies
  if (kwSet.size === 0 || scored[0]?.score === 0) {
    return COMPANY_CATALOG
      .filter((c) => !existingSet.has(normalize(c.name)) && c.ats_source)
      .slice(0, limit);
  }

  return scored.slice(0, limit).map((s) => s.company);
}

/** Build the career page URL from ATS info (used when auto-generating career_page_url). */
export function atsCareerUrl(source: AtsSource, slug: string): string {
  switch (source) {
    case "GREENHOUSE": return `https://boards.greenhouse.io/${slug}`;
    case "LEVER":      return `https://jobs.lever.co/${slug}`;
    case "ASHBY":      return `https://jobs.ashbyhq.com/${slug}`;
  }
}
