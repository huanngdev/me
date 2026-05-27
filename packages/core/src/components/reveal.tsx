"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

import { cn } from "../lib/utils";

type RevealProps = HTMLMotionProps<"div"> & {
  delay?: number;
};

export function Reveal({ delay = 0, className, children, ...props }: RevealProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1], delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({ className, children, ...props }: HTMLMotionProps<"div">) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      whileInView={reduceMotion ? undefined : "show"}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ className, children, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
      }}
      className={cn("motion-reduce:transform-none", className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerList({ className, children, ...props }: HTMLMotionProps<"ul">) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.ul
      initial={reduceMotion ? false : "hidden"}
      whileInView={reduceMotion ? undefined : "show"}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.ul>
  );
}

export function StaggerListItem({ className, children, ...props }: HTMLMotionProps<"li">) {
  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, x: -10 },
        show: { opacity: 1, x: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
      }}
      className={cn("motion-reduce:transform-none", className)}
      {...props}
    >
      {children}
    </motion.li>
  );
}
