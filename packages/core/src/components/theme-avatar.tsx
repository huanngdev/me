"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { IDENTITY } from "../constants";
import { Avatar } from "./avatar";

const AVATAR_SOURCES = {
  dark: "/images/ai-gen-avatar-dark.webp",
  light: "/images/ai-gen-avatar-light.webp",
} as const;

const initials = IDENTITY.displayName
  .split(" ")
  .map((part) => part[0])
  .slice(0, 2)
  .join("");

export function ThemeAvatar() {
  const { resolvedTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [lightAvatarFailed, setLightAvatarFailed] = useState(false);
  const [darkAvatarFailed, setDarkAvatarFailed] = useState(false);

  useEffect(() => {
    // Keep the server-rendered light avatar stable until next-themes has mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const avatarSource =
    mounted && resolvedTheme === "dark" ? AVATAR_SOURCES.dark : AVATAR_SOURCES.light;
  const showDarkAvatar = avatarSource === AVATAR_SOURCES.dark;
  const imageFailed = showDarkAvatar ? darkAvatarFailed : lightAvatarFailed;
  const transition = {
    duration: reduceMotion ? 0 : 0.65,
    ease: "easeInOut" as const,
  };

  return (
    <Avatar className="bg-muted relative size-full">
      {imageFailed ? (
        <span className="bg-muted text-muted-foreground absolute inset-0 flex items-center justify-center rounded-full text-base font-medium">
          {initials}
        </span>
      ) : (
        <>
          <motion.img
            src={AVATAR_SOURCES.light}
            alt={IDENTITY.displayName}
            onError={() => setLightAvatarFailed(true)}
            initial={false}
            animate={{ opacity: showDarkAvatar ? 0 : 1, scale: showDarkAvatar ? 0.98 : 1 }}
            transition={transition}
            className="absolute inset-0 z-10 size-full rounded-full object-cover object-bottom"
          />
          <motion.img
            src={AVATAR_SOURCES.dark}
            alt=""
            aria-hidden="true"
            onError={() => setDarkAvatarFailed(true)}
            initial={false}
            animate={{ opacity: showDarkAvatar ? 1 : 0, scale: showDarkAvatar ? 1 : 1.02 }}
            transition={transition}
            className="absolute inset-0 z-10 size-full rounded-full object-cover object-bottom"
          />
        </>
      )}
    </Avatar>
  );
}
