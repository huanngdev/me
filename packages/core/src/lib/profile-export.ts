import {
  AWARDS,
  CERTIFICATIONS,
  EDUCATION,
  EXPERIENCE,
  IDENTITY,
  PROJECTS,
  PUBLIC_EMAIL,
  PUBLIC_PHONE,
  PUBLIC_PORTFOLIO_URL,
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

function buildCvBody(): string {
  const e = escapeHtml;
  const parts: string[] = [];

  parts.push(`<header class="cv-header">`);
  parts.push(`  <div class="header-top">`);
  parts.push(`    <h1>${e(IDENTITY.displayName)}</h1>`);
  parts.push(`    <p class="availability">${e(IDENTITY.availability)}</p>`);
  parts.push(`  </div>`);
  const contactItems = [
    `<a href="mailto:${e(PUBLIC_EMAIL)}">${e(PUBLIC_EMAIL)}</a>`,
    `<span>${e(PUBLIC_PHONE)}</span>`,
    `<span>${e(IDENTITY.location.city)}, ${e(IDENTITY.location.country)}</span>`,
    `<a href="${e(PUBLIC_PORTFOLIO_URL)}">Portfolio</a>`,
    ...SOCIAL_LINKS.filter((s) => s.platform === "github" || s.platform === "linkedin").map(
      (s) => `<a href="${e(s.url)}">${e(s.label)}</a>`,
    ),
  ];
  parts.push(`  <p class="contact-row">${contactItems.join('<span class="dot">·</span>')}</p>`);
  parts.push(`</header>`);

  parts.push(`<section class="section">`);
  parts.push(`  <h2>Summary</h2>`);
  parts.push(`  <p>${e(IDENTITY.description)}</p>`);
  parts.push(`</section>`);

  parts.push(`<section class="section">`);
  parts.push(`  <h2>Skills</h2>`);
  parts.push(`  <ul class="skill-list">`);
  for (const g of SKILLS) {
    parts.push(
      `    <li><strong class="skill-cat">${e(g.label)}</strong> ${e(g.items.join(" · "))}</li>`,
    );
  }
  parts.push(`  </ul>`);
  parts.push(`</section>`);

  parts.push(`<section class="section">`);
  parts.push(`  <h2>Experience</h2>`);
  for (const x of EXPERIENCE) {
    parts.push(`  <div class="entry">`);
    parts.push(
      `    <div class="entry-row"><strong>${e(x.company)}</strong><span class="role">${e(x.role)}</span><span class="period">${e(formatPeriod(x.start, x.end))}</span></div>`,
    );
    parts.push(`    <div class="entry-sub">${e(x.employmentType)} · ${e(x.location)}</div>`);
    if (x.about) {
      parts.push(`    <p class="entry-desc">${e(x.about)}</p>`);
    }
    parts.push(`  </div>`);
  }
  parts.push(`</section>`);

  parts.push(`<section class="section">`);
  parts.push(`  <h2>Projects</h2>`);
  for (const p of PROJECT_LIST) {
    parts.push(`  <div class="entry">`);
    const tag = p.hackathon
      ? ` <span class="badge">${e(p.hackathon)}${p.result ? ` — ${e(p.result)}` : ""}</span>`
      : "";
    parts.push(`    <div class="entry-row"><strong>${e(p.name)}</strong>${tag}</div>`);
    parts.push(`    <p class="entry-desc">${e(p.description)}</p>`);
    parts.push(`    <div class="entry-sub stack">${e(p.stack.join(" · "))}</div>`);
    parts.push(`  </div>`);
  }
  parts.push(`</section>`);

  parts.push(`<section class="section">`);
  parts.push(`  <h2>Education</h2>`);
  for (const x of EDUCATION) {
    parts.push(`  <div class="entry">`);
    parts.push(
      `    <div class="entry-row"><strong>${e(x.institution)}</strong><span class="period">${e(formatPeriod(x.start, x.end))}</span></div>`,
    );
    parts.push(
      `    <div class="entry-sub">${e(x.degree)} in ${e(x.major)} · ${e(x.location)}</div>`,
    );
    parts.push(`  </div>`);
  }
  parts.push(`</section>`);

  if (AWARDS.length) {
    parts.push(`<section class="section">`);
    parts.push(`  <h2>Awards & Hackathons</h2>`);
    parts.push(`  <ul class="compact-list">`);
    for (const a of AWARDS) {
      parts.push(
        `    <li><strong>${e(a.result)}</strong> — ${e(a.project)} at ${e(a.event)} (${e(a.date)})</li>`,
      );
    }
    parts.push(`  </ul>`);
    parts.push(`</section>`);
  }

  parts.push(`<section class="section">`);
  parts.push(`  <h2>Languages</h2>`);
  parts.push(`  <p>`);
  parts.push(
    IDENTITY.languages
      .map((l) => `${e(l.name)} — ${e(l.level)}`)
      .join('<span class="dot">·</span>'),
  );
  parts.push(`  </p>`);
  parts.push(`</section>`);

  if (CERTIFICATIONS.length) {
    parts.push(`<section class="section">`);
    parts.push(`  <h2>Certifications</h2>`);
    parts.push(`  <ul class="cert-list">`);
    for (const c of CERTIFICATIONS) {
      parts.push(
        `    <li><span class="cert-date">${e(formatDate(c.date))}</span> ${e(c.name)}</li>`,
      );
    }
    parts.push(`  </ul>`);
    parts.push(`</section>`);
  }

  parts.push(`<footer class="cv-footer">`);
  parts.push(
    `<p>${e(IDENTITY.displayName)} · ${e(PUBLIC_EMAIL)} · ${e(IDENTITY.location.city)}</p>`,
  );
  parts.push(`</footer>`);

  return parts.join("\n");
}

const CV_CSS = `
@page { size: A4; margin: 12mm 14mm 14mm; }

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body { background: #fff; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #1a1a1a;
  font-size: 9.5pt;
  line-height: 1.55;
  max-width: 720px;
  margin: 0 auto;
  padding: 0 4px;
}

a { color: #1a1a1a; text-decoration: none; }

/* ---- Header ---- */
.cv-header { padding: 16px 0 12px; border-bottom: 2px solid #13111a; }
.header-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 6px; }
h1 { font-size: 22pt; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; }
.availability { font-size: 8pt; color: #7c3aed; font-weight: 500; white-space: nowrap; }
.contact-row { font-size: 8.5pt; color: #555; display: flex; flex-wrap: wrap; gap: 2px 0; }
.contact-row a { color: #7c3aed; }
.dot { margin: 0 6px; color: #ccc; }

/* ---- Sections ---- */
.section { margin-top: 14px; page-break-inside: avoid; }
h2 {
  font-size: 9pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em;
  color: #7c3aed; margin-bottom: 7px; padding-bottom: 2px; border-bottom: 0.5px solid #e5e0ec;
}
p { margin: 2px 0; }

/* ---- Skills list ---- */
.skill-list { list-style: none; padding: 0; }
.skill-list li { font-size: 8.5pt; line-height: 1.65; }
.skill-cat { font-size: 9pt; color: #1a1a1a; }

/* ---- Entry ---- */
.entry { margin: 0 0 9px; }
.entry-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 10pt; }
.entry-row strong { font-size: 10pt; }
.role { color: #555; font-size: 9pt; }
.period { margin-left: auto; font-size: 8.5pt; color: #888; white-space: nowrap; }
.entry-sub { font-size: 8.5pt; color: #666; margin-bottom: 1px; }
.entry-desc { font-size: 9pt; color: #333; line-height: 1.5; }
.stack { font-size: 8pt; color: #7c3aed; font-weight: 500; }

/* ---- Badge ---- */
.badge { display: inline; font-size: 7.5pt; font-weight: 600; color: #7c3aed; white-space: nowrap; }

/* ---- Compact lists ---- */
.compact-list { list-style: none; padding: 0; }
.compact-list li { font-size: 9pt; line-height: 1.6; }
.compact-list li::before { content: "— "; color: #ccc; }

/* ---- Certs ---- */
.cert-list { list-style: none; padding: 0; }
.cert-list li { font-size: 8pt; line-height: 1.6; }
.cert-date { color: #888; margin-right: 4px; }

/* ---- Footer ---- */
.cv-footer { margin-top: 16px; padding-top: 6px; border-top: 0.5px solid #e5e0ec; text-align: center; }
.cv-footer p { font-size: 7.5pt; color: #aaa; }

@media print { body { padding: 0; } @page { margin: 12mm 14mm 14mm; } }
`;

export function buildProfileCvHtml(): string {
  const e = escapeHtml;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${e(IDENTITY.displayName)} — CV</title>
<style>${CV_CSS}</style>
</head>
<body>
${buildCvBody()}
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

function openCvInWindow(html: string): void {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function openCvPrintWindow(): void {
  openCvInWindow(buildProfileCvHtml());
}

export function openCvHtmlWindow(): void {
  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${e(IDENTITY.displayName)} — CV</title>
<style>${CV_CSS}</style>
</head>
<body>
${buildCvBody()}
</body>
</html>`;
  openCvInWindow(html);
}
