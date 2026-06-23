import { cn } from "../../../lib/utils";

// Team name → ISO 3166-1 alpha-2 code for flagcdn. England/Scotland use GB subdivisions.
const FLAG_CODE: Record<string, string> = {
  Algeria: "dz",
  Argentina: "ar",
  Australia: "au",
  Austria: "at",
  Belgium: "be",
  "Bosnia & Herzegovina": "ba",
  Brazil: "br",
  Canada: "ca",
  "Cape Verde": "cv",
  Colombia: "co",
  Croatia: "hr",
  Curaçao: "cw",
  "Czech Republic": "cz",
  "DR Congo": "cd",
  Ecuador: "ec",
  Egypt: "eg",
  England: "gb-eng",
  France: "fr",
  Germany: "de",
  Ghana: "gh",
  Haiti: "ht",
  Iran: "ir",
  Iraq: "iq",
  "Ivory Coast": "ci",
  Japan: "jp",
  Jordan: "jo",
  Mexico: "mx",
  Morocco: "ma",
  Netherlands: "nl",
  "New Zealand": "nz",
  Norway: "no",
  Panama: "pa",
  Paraguay: "py",
  Portugal: "pt",
  Qatar: "qa",
  "Saudi Arabia": "sa",
  Scotland: "gb-sct",
  Senegal: "sn",
  "South Africa": "za",
  "South Korea": "kr",
  Spain: "es",
  Sweden: "se",
  Switzerland: "ch",
  Tunisia: "tn",
  Turkey: "tr",
  USA: "us",
  Uruguay: "uy",
  Uzbekistan: "uz",
};

// Team name → 3-letter FIFA-style code for compact display in tight calendar blocks.
const TEAM_ABBR: Record<string, string> = {
  Algeria: "ALG",
  Argentina: "ARG",
  Australia: "AUS",
  Austria: "AUT",
  Belgium: "BEL",
  "Bosnia & Herzegovina": "BIH",
  Brazil: "BRA",
  Canada: "CAN",
  "Cape Verde": "CPV",
  Colombia: "COL",
  Croatia: "CRO",
  Curaçao: "CUW",
  "Czech Republic": "CZE",
  "DR Congo": "COD",
  Ecuador: "ECU",
  Egypt: "EGY",
  England: "ENG",
  France: "FRA",
  Germany: "GER",
  Ghana: "GHA",
  Haiti: "HAI",
  Iran: "IRN",
  Iraq: "IRQ",
  "Ivory Coast": "CIV",
  Japan: "JPN",
  Jordan: "JOR",
  Mexico: "MEX",
  Morocco: "MAR",
  Netherlands: "NED",
  "New Zealand": "NZL",
  Norway: "NOR",
  Panama: "PAN",
  Paraguay: "PAR",
  Portugal: "POR",
  Qatar: "QAT",
  "Saudi Arabia": "KSA",
  Scotland: "SCO",
  Senegal: "SEN",
  "South Africa": "RSA",
  "South Korea": "KOR",
  Spain: "ESP",
  Sweden: "SWE",
  Switzerland: "SUI",
  Tunisia: "TUN",
  Turkey: "TUR",
  USA: "USA",
  Uruguay: "URU",
  Uzbekistan: "UZB",
};

/** Compact label: a 3-letter code for known teams, else the slot code as given. */
export function teamAbbr(name: string): string {
  return TEAM_ABBR[name.normalize("NFC")] ?? name;
}

/** flagcdn SVG URL for a team, or null for undecided slots / unmapped names. */
export function flagSrc(name: string): string | null {
  const code = FLAG_CODE[name.normalize("NFC")];
  return code ? `https://flagcdn.com/${code}.svg` : null;
}

const base =
  "ring-border/60 inline-block shrink-0 overflow-hidden rounded-[2px] bg-muted object-cover ring-1";

// A team flag, or a neutral placeholder for undecided knockout slots / unmapped names.
export function TeamFlag({ name, className }: { name: string; className?: string }) {
  const src = flagSrc(name);
  if (!src) {
    return <span aria-hidden className={cn(base, className)} />;
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      aria-hidden
      width={24}
      height={16}
      loading="lazy"
      decoding="async"
      className={cn(base, className)}
    />
  );
}
