"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { GREETING_PERIODS } from "../../constants";
import { AsciiOcean } from "../ascii-ocean/ascii-ocean";
import { TypingAnimation } from "../typing-animation";

const GREETING_INTERVAL_MS = 15_000;

function getGreeting(current: string): string {
  const hour = new Date().getHours();
  const period = GREETING_PERIODS.find(
    ({ startHour, endHour }) => hour >= startHour && hour < endHour,
  );
  if (!period) return "";

  const alternatives = period.messages.filter((message) => message !== current);
  return alternatives[Math.floor(Math.random() * alternatives.length)] ?? period.messages[0];
}

export function CoverSection() {
  const reduceMotion = useReducedMotion();
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    const updateGreeting = () => {
      setGreeting((current) => getGreeting(current));
    };

    // The visitor's local hour only exists after hydration.
    updateGreeting();

    const interval = window.setInterval(updateGreeting, GREETING_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="border-b">
      <div className="relative isolate mx-auto h-48 w-full max-w-4xl overflow-hidden border-x sm:h-56">
        <AsciiOcean className="absolute inset-0" />
        <div className="pointer-events-none relative z-10 flex h-full items-end px-4 pb-6 sm:px-6 sm:pb-8 lg:px-8">
          <div className="min-h-9">
            <AnimatePresence mode="wait" initial={false}>
              {greeting && (
                <motion.div
                  key={greeting}
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="text-foreground text-xl leading-none sm:text-3xl"
                  style={{ fontFamily: "var(--font-handwriting), cursive" }}
                  aria-label={greeting}
                >
                  {reduceMotion ? (
                    greeting
                  ) : (
                    <TypingAnimation
                      words={[greeting]}
                      startOnView={false}
                      showCursor={false}
                      typeSpeed={38}
                      className="leading-none tracking-normal"
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
