"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/core/components/tabs";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { type PresetId, ScenePicker, ShowcaseOcean } from "@/components/showcase";
import { SpeciesList } from "@/components/species-list";
import { ThemeToggle } from "@/components/theme-toggle";
import { GLASS_CAPSULE, GLASS_TAB } from "@/lib/glass";

const TAB_IDS = ["showcase", "species"] as const;

type TabId = (typeof TAB_IDS)[number];

/** The tab named in `?tab=`, or showcase for anything else. */
function parseTab(value: string | null): TabId {
  return TAB_IDS.find((id) => id === value) ?? "showcase";
}

/**
 * Header tabs (showcase, species), the theme toggle and, on the showcase, the scene picker, all in one
 * row fixed to the top left. The active tab is kept in `?tab=` so a link opens the same tab. The
 * showcase ocean fills the screen behind the row; the species list scrolls under it.
 */
export function AsciiArtTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const [preset, setPreset] = useState<PresetId>("open-ocean");

  const handleTabChange = (value: string) => {
    router.replace(`?tab=${value}`, { scroll: false });
  };

  return (
    <Tabs value={tab} onValueChange={handleTabChange}>
      <div className="fixed top-4 left-4 z-10 flex items-center gap-2">
        <TabsList className={GLASS_CAPSULE}>
          <TabsTrigger value="showcase" className={GLASS_TAB}>
            showcase
          </TabsTrigger>
          <TabsTrigger value="species" className={GLASS_TAB}>
            species
          </TabsTrigger>
        </TabsList>
        <ThemeToggle />
        {tab === "showcase" && <ScenePicker value={preset} onChange={setPreset} />}
      </div>

      <TabsContent value="showcase">
        <ShowcaseOcean preset={preset} />
      </TabsContent>
      <TabsContent value="species" className="pt-20">
        <SpeciesList />
      </TabsContent>
    </Tabs>
  );
}
