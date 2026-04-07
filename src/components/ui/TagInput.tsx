"use client";

import { useState, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  label?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  variant?: "default" | "accent";
  hint?: string;
  className?: string;
}

export function TagInput({
  label,
  tags,
  onChange,
  placeholder = "Type and press Enter",
  maxTags,
  variant = "default",
  hint,
  className,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (maxTags && tags.length >= maxTags) return;
    if (tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setInputValue("");
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const isAccent = variant === "accent";

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div
        className={cn(
          "min-h-[44px] flex flex-wrap gap-1.5 p-2 rounded-lg border transition-all duration-150 focus-within:ring-2",
          isAccent
            ? "bg-radar-surface border-blue-500/30 focus-within:ring-blue-500/30 focus-within:border-blue-500/50"
            : "bg-radar-surface border-radar-border hover:border-[#2E3B55] focus-within:ring-blue-500/30 focus-within:border-blue-500/50"
        )}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium font-body transition-all",
              isAccent
                ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                : "bg-radar-elevated text-text-secondary border border-radar-border"
            )}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className={cn(
                "ml-0.5 rounded-full hover:text-text-primary transition-colors",
                isAccent ? "text-blue-400/70" : "text-text-muted"
              )}
            >
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addTag(inputValue)}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          disabled={!!(maxTags && tags.length >= maxTags)}
        />
      </div>
      {hint && (
        <p className="text-xs text-text-muted">{hint}</p>
      )}
      {maxTags && (
        <p className="text-xs text-text-muted font-mono">
          {tags.length}/{maxTags}
        </p>
      )}
    </div>
  );
}
