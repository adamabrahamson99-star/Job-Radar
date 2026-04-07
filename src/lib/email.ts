import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY ?? "");

const FROM = process.env.EMAIL_FROM ?? "Radar <notifications@radar.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.RAILWAY_STATIC_URL ?? "http://localhost:3000";

// ─── Shared styles ────────────────────────────────────────────────────────────

const emailBase = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Radar</title>
  <style>
    body { margin:0; padding:0; background:#0F1623; font-family: 'Helvetica Neue', Arial, sans-serif; color:#F0F4FF; }
    .container { max-width:600px; margin:0 auto; padding:32px 24px; }
    .header { display:flex; align-items:center; gap:10px; margin-bottom:32px; padding-bottom:20px; border-bottom:1px solid #263047; }
    .logo-text { font-size:20px; font-weight:700; color:#F0F4FF; letter-spacing:-0.5px; }
    .dot { width:8px; height:8px; border-radius:50%; background:#3B82F6; display:inline-block; }
    .card { background:#141C2E; border:1px solid #263047; border-radius:12px; padding:20px; margin-bottom:12px; }
    .score-badge { display:inline-block; padding:2px 10px; border-radius:6px; font-size:12px; font-weight:600; font-family:monospace; }
    .score-a { background:rgba(34,197,94,0.15); color:#86efac; border:1px solid rgba(34,197,94,0.3); }
    .score-b { background:rgba(234,179,8,0.15); color:#fde047; border:1px solid rgba(234,179,8,0.3); }
    .score-c { background:rgba(249,115,22,0.15); color:#fdba74; border:1px solid rgba(249,115,22,0.3); }
    .score-d { background:rgba(148,163,184,0.15); color:#94a3b8; border:1px solid rgba(148,163,184,0.3); }
    .job-title { font-size:16px; font-weight:600; color:#F0F4FF; margin:0 0 4px; }
    .job-meta { font-size:12px; color:#8B9ABF; margin:0 0 8px; }
    .summary { font-size:13px; color:#8B9ABF; line-height:1.6; margin:8px 0; }
    .apply-btn { display:inline-block; padding:8px 18px; background:#3B82F6; color:#fff; text-decoration:none; border-radius:8px; font-size:13px; font-weight:600; }
    .footer { margin-top:32px; padding-top:20px; border-top:1px solid #263047; font-size:11px; color:#4A5878; text-align:center; }
    .footer a { color:#3B82F6; text-decoration:none; }
    h2 { font-size:20px; font-weight:700; color:#F0F4FF; margin:0 0 6px; }
    p { margin:0 0 16px; color:#8B9ABF; font-size:14px; line-height:1.6; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <span class="dot"></span>
    <span class="logo-text">Radar</span>
  </div>
  ${content}
  <div class="footer">
    <p>You're receiving this because you have email notifications enabled.<br/>
    <a href="${APP_URL}/dashboard/profile">Manage notification preferences</a> · 
    <a href="${APP_URL}/dashboard">Go to dashboard</a></p>
  </div>
</div>
</body>
</html>
`;

function scoreBadgeClass(score: number): string {
  if (score >= 80) return "score-a";
  if (score >= 60) return "score-b";
  if (score >= 40) return "score-c";
  return "score-d";
}

function scoreLetter(score: number): string {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

// ─── Instant alert email ──────────────────────────────────────────────────────

export async function sendInstantAlert(params: {
  to: string;
  jobTitle: string;
  companyName: string;
  location: string;
  matchScore: number;
  summary: string;
  matchExplanation: string;
  applyUrl: string;
  salary?: string;
}) {
  const { to, jobTitle, companyName, location, matchScore, summary, matchExplanation, applyUrl, salary } = params;
  const grade = scoreLetter(matchScore);
  const badgeClass = scoreBadgeClass(matchScore);

  const html = emailBase(`
    <h2>New match found</h2>
    <p>Radar found a job that matches your profile with a strong score.</p>
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:8px;">
        <div>
          <p class="job-title">${jobTitle}</p>
          <p class="job-meta">${companyName} · ${location}${salary ? ` · ${salary}` : ""}</p>
        </div>
        <span class="score-badge ${badgeClass}">${grade} · ${matchScore}%</span>
      </div>
      <p class="summary">${summary}</p>
      ${matchExplanation ? `<p class="summary" style="color:#4A5878;">✦ ${matchExplanation}</p>` : ""}
      <a href="${applyUrl}" class="apply-btn">View &amp; Apply →</a>
    </div>
  `);

  return resend.emails.send({
    from: FROM,
    to,
    subject: `New match: ${jobTitle} at ${companyName} · ${matchScore}%`,
    html,
  });
}

// ─── Digest email (daily or weekly) ──────────────────────────────────────────

interface DigestJob {
  title: string;
  company_name: string;
  location: string;
  match_score: number;
  description_summary: string | null;
  apply_url: string;
  salary_raw?: string | null;
}

export async function sendDigest(params: {
  to: string;
  type: "daily" | "weekly";
  postings: DigestJob[];
  date: string;
}) {
  const { to, type, postings, date } = params;
  const count = postings.length;
  const label = type === "daily" ? "Daily" : "Weekly";
  const period = type === "daily" ? "today" : "this week";

  const jobRows = postings
    .slice(0, 10)
    .map((j) => {
      const grade = scoreLetter(j.match_score);
      const badgeClass = scoreBadgeClass(j.match_score);
      return `
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div>
              <p class="job-title" style="font-size:14px;">${j.title}</p>
              <p class="job-meta">${j.company_name} · ${j.location}${j.salary_raw ? ` · ${j.salary_raw}` : ""}</p>
            </div>
            <span class="score-badge ${badgeClass}">${grade} · ${j.match_score}%</span>
          </div>
          ${j.description_summary ? `<p class="summary">${j.description_summary.split(".")[0]}.</p>` : ""}
          <a href="${j.apply_url}" class="apply-btn" style="font-size:12px; padding:6px 14px;">Apply →</a>
        </div>
      `;
    })
    .join("");

  const html = emailBase(`
    <h2>Radar ${label}: ${count} new match${count !== 1 ? "es" : ""} ${period}</h2>
    <p>Here are your top job matches for ${date}. Sorted by match score.</p>
    ${jobRows}
    <p style="text-align:center; margin-top:24px;">
      <a href="${APP_URL}/dashboard" class="apply-btn">View all on dashboard →</a>
    </p>
  `);

  return resend.emails.send({
    from: FROM,
    to,
    subject: `Radar ${label}: ${count} new match${count !== 1 ? "es" : ""} for ${date}`,
    html,
  });
}
