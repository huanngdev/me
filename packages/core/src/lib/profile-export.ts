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
