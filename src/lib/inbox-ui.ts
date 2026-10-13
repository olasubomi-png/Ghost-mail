/** Sender initials for avatar (1–2 chars). */
export function senderInitials(
  fromName: string | null | undefined,
  fromAddress: string
): string {
  const name = (fromName || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const local = fromAddress.split("@")[0] || "?";
  return local.slice(0, 2).toUpperCase();
}

export type SearchableMessage = {
  fromAddress: string;
  fromName: string | null;
  subject: string;
  preview: string;
};

/** Case-insensitive filter across sender, subject, and preview. */
export function filterMessages<T extends SearchableMessage>(
  messages: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return messages;
  return messages.filter((m) => {
    const hay = [
      m.fromAddress,
      m.fromName || "",
      m.subject,
      m.preview,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

/** Stable color class from a string (for avatar backgrounds). */
export function avatarTone(seed: string): string {
  const tones = [
    "bg-violet-600/80",
    "bg-indigo-600/80",
    "bg-blue-600/80",
    "bg-cyan-700/80",
    "bg-emerald-700/80",
    "bg-amber-700/80",
    "bg-rose-700/80",
    "bg-fuchsia-700/80",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return tones[h % tones.length];
}
