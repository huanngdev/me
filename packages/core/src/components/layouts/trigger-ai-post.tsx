"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { triggerAiPost } from "../../lib/ai-blog-actions";
import { Button } from "../button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../tooltip";

export function TriggerAiPostButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleClick = async () => {
    setState("loading");
    setMessage("Generating...");
    try {
      const result = await triggerAiPost();
      if (result.ok) {
        setState("done");
        setMessage(result.title ?? "Post created");
      } else {
        setState("error");
        setMessage(result.error ?? "Failed");
      }
      setTimeout(() => setState("idle"), 3000);
    } catch {
      setState("error");
      setMessage("Request failed");
      setTimeout(() => setState("idle"), 3000);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Trigger AI blog post"
            disabled={state === "loading"}
            onClick={handleClick}
          >
            <Sparkles className={`size-4 ${state === "loading" ? "animate-spin" : ""}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {state === "idle" && "Trigger AI blog post"}
          {state === "loading" && "Generating..."}
          {state === "done" && (message.length > 40 ? `${message.slice(0, 40)}...` : message)}
          {state === "error" && message}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
