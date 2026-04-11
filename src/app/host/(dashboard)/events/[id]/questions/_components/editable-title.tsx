"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase";

export function EditableTitle({
  eventId,
  initialTitle,
}: {
  eventId: string;
  initialTitle: string;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function save() {
    setEditing(false);
    const trimmed = title.trim();
    if (!trimmed || trimmed === initialTitle) {
      setTitle(initialTitle);
      return;
    }
    const supabase = createClient();
    await supabase.from("events").update({ title: trimmed }).eq("id", eventId);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setTitle(initialTitle);
            setEditing(false);
          }
        }}
        className="text-sm text-foreground bg-transparent border-b border-primary outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-sm text-foreground hover:text-primary transition-colors"
      title="Click to edit title"
    >
      {title}
    </button>
  );
}
