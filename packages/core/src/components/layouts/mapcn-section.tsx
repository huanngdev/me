"use client";

import Image from "next/image";

import { Map, MapControls, MapMarker, MarkerContent, MarkerPopup } from "../ui/map";

const HCMC = {
  name: "Ho Chi Minh City",
  country: "Vietnam",
  longitude: 106.7009,
  latitude: 10.7769,
} as const;

export function MapcnSection() {
  return (
    <section id="mapcn">
      <div className="mx-auto w-full max-w-4xl border-x">
        <div className="border-b px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Components</h2>
        </div>

        <div className="h-[320px] sm:h-[380px]">
          <Map
            center={[HCMC.longitude, HCMC.latitude]}
            zoom={11.5}
            pitch={0}
            bearing={0}
            cooperativeGestures
            className="h-full"
          >
            <MapControls />
            <MapMarker
              longitude={HCMC.longitude}
              latitude={HCMC.latitude}
              anchor="top"
              offset={[0, 40]}
            >
              <MarkerContent className="group">
                <span className="ring-background bg-background block size-10 overflow-hidden rounded-full border shadow-lg ring-2 transition-transform group-hover:scale-105">
                  <Image
                    src="/images/avatar-nft-monkey.svg"
                    alt="Ngo Gia Huan"
                    width={40}
                    height={40}
                    className="size-full object-cover object-bottom"
                  />
                </span>
              </MarkerContent>
              <MarkerPopup>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{HCMC.name}</p>
                  <p className="text-muted-foreground text-xs">{HCMC.country}</p>
                  <p className="text-muted-foreground font-mono text-[11px]">
                    {HCMC.latitude}, {HCMC.longitude}
                  </p>
                </div>
              </MarkerPopup>
            </MapMarker>
          </Map>
        </div>
      </div>
    </section>
  );
}
