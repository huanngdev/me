"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommandState } from "cmdk";
import {
  ArrowUpRight,
  Award,
  BookmarkIcon,
  Briefcase,
  ChevronDown,
  Copy,
  Eye,
  FolderGit2,
  GitBranch,
  GraduationCap,
  LayoutGrid,
  Link2,
  Mail,
  MapPin,
  Moon,
  ScrollText,
  Search,
  Sun,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import {
  AWARDS,
  BOOKMARKS,
  CERTIFICATIONS,
  IDENTITY,
  PROJECTS,
  PUBLIC_EMAIL,
  REPO_URL,
  SOCIAL_LINKS,
} from "../../constants";
import { cn } from "../../lib/utils";
import { Button } from "../button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "../command";
import { Kbd, KbdGroup } from "../kbd";

type SectionItem = {
  id: string;
  title: string;
  hash: string;
  keywords: string[];
  icon: React.ComponentType<{ className?: string }>;
};

const SECTIONS: SectionItem[] = [
  {
    id: "profile",
    title: "Profile",
    hash: "#profile",
    icon: User,
    keywords: ["about", "bio", "intro", "hero"],
  },
  {
    id: "overview",
    title: "Overview",
    hash: "#overview",
    icon: LayoutGrid,
    keywords: ["stack", "tech", "skills", "summary"],
  },
  {
    id: "links",
    title: "Links",
    hash: "#links",
    icon: Link2,
    keywords: ["social", "contact", "github", "linkedin"],
  },
  {
    id: "coding",
    title: "Coding",
    hash: "#coding",
    icon: GitBranch,
    keywords: ["github", "contributions", "activity"],
  },
  {
    id: "views",
    title: "Views",
    hash: "#views",
    icon: Eye,
    keywords: ["traffic", "analytics", "page views"],
  },
  {
    id: "projects",
    title: "Projects",
    hash: "#projects",
    icon: FolderGit2,
    keywords: ["work", "apps", "portfolio", "showcase"],
  },
  {
    id: "experience",
    title: "Experience",
    hash: "#experience",
    icon: Briefcase,
    keywords: ["jobs", "career", "work history"],
  },
  {
    id: "education",
    title: "Education",
    hash: "#education",
    icon: GraduationCap,
    keywords: ["school", "university", "fpt"],
  },
  {
    id: "certifications",
    title: "Certifications",
    hash: "#certifications",
    icon: ScrollText,
    keywords: ["certs", "courses", "coursera"],
  },
  {
    id: "awards",
    title: "Awards",
    hash: "#awards",
    icon: Award,
    keywords: ["hackathons", "prizes", "wins"],
  },
  {
    id: "bookmarks",
    title: "Bookmarks",
    hash: "#bookmarks",
    icon: BookmarkIcon,
    keywords: ["reading", "links", "resources"],
  },
  {
    id: "mapcn",
    title: "MapCN",
    hash: "#mapcn",
    icon: MapPin,
    keywords: ["map", "location", "ho chi minh city", "maplibre"],
  },
];

function scrollToHash(hash: string) {
  const id = hash.replace(/^#/, "");
  const el = document.getElementById(id);
  if (!el) return;
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", hash);
}

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Couldn't copy ${label.toLowerCase()}`);
  }
}

/** Highlights the user's query as a substring inside `text`. Case-insensitive. */
function Highlight({ text }: { text: string }) {
  const search = useCommandState((state) => (state as { search?: string }).search) ?? "";
  const q = search.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lower.indexOf(qLower, i);
    if (idx === -1) {
      out.push(text.slice(i));
      break;
    }
    if (idx > i) out.push(text.slice(i, idx));
    out.push(
      <mark key={key++} className="bg-primary/20 text-foreground rounded-[3px] px-px font-medium">
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
  }
  return <>{out}</>;
}

/** Title that truncates with ellipsis and highlights matched query. */
function ItemTitle({ children }: { children: string }) {
  return (
    <span className="min-w-0 flex-1 truncate">
      <Highlight text={children} />
    </span>
  );
}

function ExternalIndicator() {
  return <ArrowUpRight className="text-muted-foreground ml-auto size-4 shrink-0" />;
}

function PaletteTrigger({ onClick }: { onClick: () => void }) {
  return (
    <>
      <Button
        variant="outline"
        size="icon"
        aria-label="Open command palette"
        onClick={onClick}
        className="sm:hidden"
      >
        <Search className="size-4" />
      </Button>
      <button
        type="button"
        onClick={onClick}
        aria-label="Open command palette"
        className={cn(
          "text-muted-foreground hover:text-foreground hover:bg-muted dark:bg-input/30 dark:hover:bg-input/50",
          "hidden h-8 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors sm:inline-flex",
        )}
      >
        <Search className="size-4" />
        <span className="hidden md:inline">Search…</span>
        <KbdGroup className="ml-2">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </button>
    </>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const listRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  // Global hotkey: ⌘K / Ctrl+K toggles. "/" opens when no input is focused.
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    }
    function onKeyDown(e: KeyboardEvent) {
      const isModK = e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey);
      if (isModK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Track whether the list has content below the fold to render the "more below" hint.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    const check = () => {
      setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
      mo.disconnect();
    };
  }, [open]);

  const runCommand = useCallback((fn: () => void) => {
    setOpen(false);
    requestAnimationFrame(fn);
  }, []);

  const isDark = resolvedTheme === "dark";
  const sectionItems = useMemo(() => SECTIONS, []);

  return (
    <>
      <PaletteTrigger onClick={() => setOpen(true)} />
      <CommandDialog open={open} onOpenChange={setOpen} className="sm:max-w-2xl">
        <CommandInput placeholder="Search sections, projects, links…" />
        <div className="relative">
          <CommandList
            ref={listRef}
            className="max-h-[40vh] scrollbar-thin [scrollbar-color:var(--border)_transparent]"
          >
            <CommandEmpty>No results found.</CommandEmpty>

            <CommandGroup heading="Go to section">
              {sectionItems.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`section ${s.title} ${s.keywords.join(" ")}`}
                  keywords={s.keywords}
                  onSelect={() => runCommand(() => scrollToHash(s.hash))}
                >
                  <s.icon />
                  <ItemTitle>{s.title}</ItemTitle>
                  <CommandShortcut>{s.hash}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Quick actions">
              <CommandItem
                value="action toggle theme dark light mode"
                keywords={["theme", "dark", "light", "mode", "appearance"]}
                onSelect={() => runCommand(() => setTheme(isDark ? "light" : "dark"))}
              >
                {isDark ? <Sun /> : <Moon />}
                <ItemTitle>{`Switch to ${isDark ? "light" : "dark"} theme`}</ItemTitle>
              </CommandItem>
              <CommandItem
                value="action copy email contact"
                keywords={["mail", "contact", "reach"]}
                onSelect={() => runCommand(() => copyToClipboard(PUBLIC_EMAIL, "Email"))}
              >
                <Mail />
                <ItemTitle>Copy email</ItemTitle>
              </CommandItem>
              <CommandItem
                value="action copy repo source github"
                keywords={["github", "source", "repository"]}
                onSelect={() => runCommand(() => copyToClipboard(REPO_URL, "Repo URL"))}
              >
                <Copy />
                <ItemTitle>Copy repo URL</ItemTitle>
              </CommandItem>
              <CommandItem
                value="action open repository source"
                keywords={["github", "source", "code"]}
                onSelect={() => runCommand(() => openExternal(REPO_URL))}
              >
                <FolderGit2 />
                <ItemTitle>Open source repository</ItemTitle>
                <ExternalIndicator />
              </CommandItem>
              <CommandItem
                value="action open changelog history releases"
                keywords={["changelog", "history", "releases", "updates", "what's new"]}
                onSelect={() => runCommand(() => router.push("/changelog"))}
              >
                <ScrollText />
                <ItemTitle>Open changelog</ItemTitle>
                <CommandShortcut>/changelog</CommandShortcut>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Projects">
              {PROJECTS.map((p) => {
                const links = p.links as { live?: string; source?: string };
                const target = links.live ?? links.source;
                const hackathon = "hackathon" in p ? (p.hackathon as string) : "";
                const action = target
                  ? () => openExternal(target)
                  : () => scrollToHash("#projects");
                return (
                  <CommandItem
                    key={p.slug}
                    value={`project ${p.name} ${p.stack.join(" ")}`}
                    keywords={[...p.stack, p.status, hackathon].filter(Boolean)}
                    onSelect={() => runCommand(action)}
                  >
                    <FolderGit2 />
                    <ItemTitle>{p.name}</ItemTitle>
                    {target ? <ExternalIndicator /> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Social">
              {SOCIAL_LINKS.map((link) => (
                <CommandItem
                  key={link.platform}
                  value={`social ${link.label} ${link.handle}`}
                  keywords={[link.platform, link.handle]}
                  onSelect={() => runCommand(() => openExternal(link.url))}
                >
                  <Link2 />
                  <ItemTitle>{link.label}</ItemTitle>
                  <CommandShortcut>{link.handle}</CommandShortcut>
                  <ExternalIndicator />
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Awards & hackathons">
              {AWARDS.map((a) => (
                <CommandItem
                  key={`${a.event}-${a.project}`}
                  value={`award ${a.event} ${a.project} ${a.result}`}
                  keywords={["hackathon", "prize", a.project]}
                  onSelect={() => runCommand(() => scrollToHash("#awards"))}
                >
                  <Award />
                  <ItemTitle>{a.event}</ItemTitle>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Certifications">
              {CERTIFICATIONS.map((c) => (
                <CommandItem
                  key={c.name}
                  value={`certification ${c.name} ${c.issuer}`}
                  keywords={[c.platform ?? "", c.issuer]}
                  onSelect={() =>
                    runCommand(() =>
                      c.credentialUrl
                        ? openExternal(c.credentialUrl)
                        : scrollToHash("#certifications"),
                    )
                  }
                >
                  <ScrollText />
                  <ItemTitle>{c.name}</ItemTitle>
                  {c.credentialUrl ? <ExternalIndicator /> : null}
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Bookmarks">
              {BOOKMARKS.map((b) => (
                <CommandItem
                  key={b.url}
                  value={`bookmark ${b.title} ${b.source}`}
                  keywords={["reading", "link", b.source]}
                  onSelect={() => runCommand(() => openExternal(b.url))}
                >
                  <BookmarkIcon />
                  <ItemTitle>{b.title}</ItemTitle>
                  <ExternalIndicator />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>

          {/* "More below" hint — fades in when the list has scrollable content beneath the viewport. */}
          <div
            aria-hidden="true"
            className={cn(
              "from-popover pointer-events-none absolute inset-x-0 bottom-0 flex h-10 items-end justify-center bg-linear-to-t to-transparent transition-opacity",
              hasMoreBelow ? "opacity-100" : "opacity-0",
            )}
          >
            <ChevronDown className="text-primary mb-1 size-4 animate-bounce" />
          </div>
        </div>

        <div className="text-muted-foreground flex items-center justify-between border-t px-3 py-2 text-xs">
          <span className="font-mono tracking-tight">{IDENTITY.displayName}</span>
          <KbdGroup>
            <Kbd>↵</Kbd>
            <span>to select</span>
            <Kbd>esc</Kbd>
            <span>to close</span>
          </KbdGroup>
        </div>
      </CommandDialog>
    </>
  );
}
