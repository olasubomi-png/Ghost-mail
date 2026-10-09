import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Generate a readable random local-part (8–12 chars). */
export function generateRandomLocalPart(): string {
  const adjectives = [
    "swift", "quiet", "bright", "calm", "bold", "clear", "fast", "keen",
    "neat", "pure", "soft", "warm", "cool", "dark", "light", "sharp",
  ];
  const nouns = [
    "fox", "owl", "wolf", "bear", "hawk", "lynx", "crow", "dove",
    "moss", "stone", "wave", "leaf", "star", "moon", "rain", "wind",
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 9000 + 1000);
  return `${adj}${noun}${num}`;
}

/** Format relative time for inbox list. */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

/** Extract common OTP / verification codes from text. */
export function extractVerificationCodes(text: string): string[] {
  if (!text) return [];
  const patterns = [
    /\b(\d{6})\b/g, // 6-digit
    /\b(\d{4})\b/g, // 4-digit
    /\b([A-Z0-9]{6,8})\b/g, // alphanumeric codes
  ];
  const codes = new Set<string>();
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // Prefer 6-digit over 4-digit noise
      if (m[1].length >= 4) codes.add(m[1]);
    }
  }
  // Prefer longer numeric codes first
  return Array.from(codes).sort((a, b) => {
    const aNum = /^\d+$/.test(a);
    const bNum = /^\d+$/.test(b);
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    return b.length - a.length;
  }).slice(0, 5);
}
