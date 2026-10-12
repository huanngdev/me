import { useEffect, useRef, useState } from "react";
import { useEditorRef } from "platejs/react";

import { Input } from "@/components/input";

// A text field inside a media block, such as a caption or a file name. It commits on blur and on
// Enter, and Escape restores the stored value. `normalize` gives the form the stored value takes,
// so a commit that changes nothing does nothing. `readStored` reads the stored value from the
// document at commit time. Keys typed here never reach the editor.
export function MediaTextInput({
  label,
  placeholder,
  maxLength,
  initial,
  autoFocus,
  className,
  normalize,
  readStored,
  onCommit,
  onSettled,
}: {
  label: string;
  placeholder: string;
  maxLength: number;
  initial: string;
  autoFocus: boolean;
  className: string;
  normalize: (text: string) => string;
  readStored: () => string | undefined;
  onCommit: (text: string) => void;
  onSettled: () => void;
}) {
  const editor = useEditorRef();
  const [draft, setDraft] = useState(initial);
  const draftRef = useRef(draft);
  const inputRef = useRef<HTMLInputElement>(null);

  // Slate reads beforeinput on the editor root, so it is stopped here.
  useEffect(() => {
    const node = inputRef.current;
    if (node === null) {
      return;
    }

    const stop = (event: Event): void => {
      event.stopPropagation();
    };
    node.addEventListener("beforeinput", stop);
    return () => {
      node.removeEventListener("beforeinput", stop);
    };
  }, []);

  function commit(): void {
    const text = draftRef.current;
    if (normalize(text) === (readStored() ?? "")) {
      return;
    }

    onCommit(text);
  }

  return (
    <Input
      ref={inputRef}
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      value={draft}
      autoFocus={autoFocus}
      className={className}
      onChange={(event) => {
        draftRef.current = event.target.value;
        setDraft(event.target.value);
      }}
      onBlur={() => {
        commit();
        onSettled();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          commit();
          onSettled();
          editor.tf.focus();
        } else if (event.key === "Escape") {
          event.preventDefault();
          draftRef.current = initial;
          setDraft(initial);
          onSettled();
          editor.tf.focus();
        }
      }}
      onKeyUp={(event) => {
        event.stopPropagation();
      }}
      onCompositionStart={(event) => {
        event.stopPropagation();
      }}
      onCompositionUpdate={(event) => {
        event.stopPropagation();
      }}
      onCompositionEnd={(event) => {
        event.stopPropagation();
      }}
      onPaste={(event) => {
        event.stopPropagation();
      }}
      onCut={(event) => {
        event.stopPropagation();
      }}
      onCopy={(event) => {
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    />
  );
}
