import {
  AWARDS,
  CERTIFICATIONS,
  EDUCATION,
  EXPERIENCE,
  IDENTITY,
  PROJECTS,
  PUBLIC_EMAIL,
  PUBLIC_PHONE,
  SKILLS,
  SOCIAL_LINKS,
  type ProjectEntry,
} from "../constants";

const PROJECT_LIST: ReadonlyArray<ProjectEntry> = PROJECTS;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);

const MONTHS = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const formatDate = (d: string): string => {
  const [y, m] = d.split("-");
  if (!m) return y ?? d;
  const monthIdx = Number(m);
  return `${MONTHS[monthIdx] ?? m} ${y}`;
};

const formatPeriod = (start: string, end: string | null): string =>
  `${formatDate(start)} – ${end ? formatDate(end) : "Present"}`;

export function buildProfileJson(): string {
  const data = {
    identity: IDENTITY,
    contact: { email: PUBLIC_EMAIL, phone: PUBLIC_PHONE },
    socials: SOCIAL_LINKS,
    skills: SKILLS,
    experience: EXPERIENCE,
    education: EDUCATION,
    projects: PROJECTS,
    awards: AWARDS,
    certifications: CERTIFICATIONS,
  };
  return JSON.stringify(data, null, 2);
}

export function buildProfileMarkdown(): string {
  const lines: string[] = [];

  lines.push(`# ${IDENTITY.displayName}`);
  lines.push("");
  lines.push(IDENTITY.tagline);
  lines.push("");

  lines.push("## Contact");
  lines.push(`- Email: ${PUBLIC_EMAIL}`);
  lines.push(`- Phone: ${PUBLIC_PHONE}`);
  lines.push(`- Location: ${IDENTITY.location.city}, ${IDENTITY.location.country}`);
  for (const s of SOCIAL_LINKS) lines.push(`- ${s.label}: ${s.url}`);
  lines.push("");

  lines.push("## About");
  lines.push(IDENTITY.description);
  lines.push("");

  lines.push("## Skills");
  for (const g of SKILLS) lines.push(`- **${g.label}:** ${g.items.join(", ")}`);
  lines.push("");

  lines.push("## Experience");
  for (const e of EXPERIENCE) {
    lines.push(`### ${e.role} — ${e.company}`);
    lines.push(`${formatPeriod(e.start, e.end)} · ${e.employmentType} · ${e.location}`);
    if (e.about) {
      lines.push("");
      lines.push(e.about);
    }
    lines.push("");
  }

  lines.push("## Education");
  for (const e of EDUCATION) {
    lines.push(`### ${e.institution}`);
    lines.push(`${e.degree} in ${e.major} · ${formatPeriod(e.start, e.end)} · ${e.location}`);
    lines.push("");
  }

  lines.push("## Projects");
  for (const p of PROJECT_LIST) {
    lines.push(`### ${p.name}`);
    lines.push(p.description);
    lines.push(`Stack: ${p.stack.join(", ")}`);
    if (p.hackathon) {
      lines.push(`Hackathon: ${p.hackathon}${p.result ? ` — ${p.result}` : ""}`);
    }
    lines.push("");
  }

  if (AWARDS.length) {
    lines.push("## Awards");
    for (const a of AWARDS) {
      lines.push(`- **${a.event}** (${a.date}) — ${a.project}, ${a.result}`);
    }
    lines.push("");
  }

  if (CERTIFICATIONS.length) {
    lines.push("## Certifications");
    for (const c of CERTIFICATIONS) {
      lines.push(`- ${c.name} — ${c.issuer} (${c.date})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function buildProfileCvHtml(): string {
  const e = escapeHtml;
  const parts: string[] = [];

  parts.push(`<header>`);
  parts.push(`<h1>${e(IDENTITY.displayName)}</h1>`);
  parts.push(`<p class="tagline">${e(IDENTITY.tagline)}</p>`);
  const contact = [
    e(PUBLIC_EMAIL),
    e(PUBLIC_PHONE),
    `${e(IDENTITY.location.city)}, ${e(IDENTITY.location.country)}`,
    ...SOCIAL_LINKS.map((s) => `${e(s.label)}: ${e(s.url)}`),
  ].join(" · ");
  parts.push(`<p class="contact">${contact}</p>`);
  parts.push(`</header>`);

  parts.push(`<section><h2>About</h2><p>${e(IDENTITY.description)}</p></section>`);

  parts.push(`<section><h2>Skills</h2><ul>`);
  for (const g of SKILLS) {
    parts.push(`<li><strong>${e(g.label)}:</strong> ${e(g.items.join(", "))}</li>`);
  }
  parts.push(`</ul></section>`);

  parts.push(`<section><h2>Experience</h2>`);
  for (const x of EXPERIENCE) {
    parts.push(`<div class="entry">`);
    parts.push(
      `<div class="entry-head"><span><strong>${e(x.role)}</strong> — ${e(x.company)}</span><span class="meta">${e(formatPeriod(x.start, x.end))} · ${e(x.location)}</span></div>`,
    );
    if (x.about) parts.push(`<p>${e(x.about)}</p>`);
    parts.push(`</div>`);
  }
  parts.push(`</section>`);

  parts.push(`<section><h2>Education</h2>`);
  for (const x of EDUCATION) {
    parts.push(`<div class="entry">`);
    parts.push(
      `<div class="entry-head"><strong>${e(x.institution)}</strong><span class="meta">${e(formatPeriod(x.start, x.end))} · ${e(x.location)}</span></div>`,
    );
    parts.push(`<p>${e(x.degree)} in ${e(x.major)}</p>`);
    parts.push(`</div>`);
  }
  parts.push(`</section>`);

  parts.push(`<section><h2>Projects</h2>`);
  for (const p of PROJECT_LIST) {
    parts.push(`<div class="entry">`);
    const meta = p.hackathon
      ? `<span class="meta"> — ${e(p.hackathon)}${p.result ? ` (${e(p.result)})` : ""}</span>`
      : "";
    parts.push(`<div><strong>${e(p.name)}</strong>${meta}</div>`);
    parts.push(`<p>${e(p.description)}</p>`);
    parts.push(`<p class="meta">Stack: ${e(p.stack.join(", "))}</p>`);
    parts.push(`</div>`);
  }
  parts.push(`</section>`);

  if (AWARDS.length) {
    parts.push(`<section><h2>Awards</h2><ul>`);
    for (const a of AWARDS) {
      parts.push(
        `<li><strong>${e(a.event)}</strong> (${e(a.date)}) — ${e(a.project)}, ${e(a.result)}</li>`,
      );
    }
    parts.push(`</ul></section>`);
  }

  if (CERTIFICATIONS.length) {
    parts.push(`<section><h2>Certifications</h2><ul>`);
    for (const c of CERTIFICATIONS) {
      parts.push(`<li>${e(c.name)} — ${e(c.issuer)} (${e(c.date)})</li>`);
    }
    parts.push(`</ul></section>`);
  }

  const css = `
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: #111;
      font-size: 10.5pt;
      line-height: 1.5;
      max-width: 820px;
      margin: 0 auto;
      padding: 28px 32px;
    }
    h1 { font-size: 22pt; margin: 0 0 4px; font-weight: 600; letter-spacing: -0.02em; }
    h2 {
      font-size: 10.5pt;
      margin: 18px 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      border-bottom: 1px solid #ccc;
      padding-bottom: 3px;
      font-weight: 600;
    }
    p { margin: 4px 0; }
    .tagline { color: #444; margin: 0 0 6px; }
    .contact { color: #555; font-size: 9.5pt; margin: 0; }
    section { margin-top: 10px; page-break-inside: avoid; }
    ul { margin: 4px 0; padding-left: 18px; }
    li { margin: 2px 0; }
    .entry { margin: 6px 0 10px; page-break-inside: avoid; }
    .entry-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .meta { color: #666; font-size: 9.5pt; font-weight: 400; }
    @media print { body { padding: 0; } }
  `;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${e(IDENTITY.displayName)} — CV</title>
<style>${css}</style>
</head>
<body>
${parts.join("\n")}
<script>window.addEventListener("load", () => setTimeout(() => window.print(), 150));</script>
</body>
</html>`;
}

export function downloadBlob(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function openCvPrintWindow(): void {
  const html = buildProfileCvHtml();
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
