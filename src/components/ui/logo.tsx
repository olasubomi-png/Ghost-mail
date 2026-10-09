import Link from "next/link";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Show wordmark text next to the mark (default true) */
  wordmark?: boolean;
  href?: string;
};

const sizes = {
  sm: { mark: 28, text: "text-lg" },
  md: { mark: 32, text: "text-xl" },
  lg: { mark: 40, text: "text-2xl" },
} as const;

export function Logo({
  className,
  size = "md",
  wordmark = true,
  href = "/",
}: LogoProps) {
  const s = sizes[size];

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 font-semibold tracking-tight text-foreground hover:opacity-90 transition-opacity",
        s.text,
        className
      )}
      aria-label="Ghost Mail home"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/ghost-mail-icon.svg"
        alt=""
        width={s.mark}
        height={s.mark}
        className="shrink-0 rounded-lg"
        decoding="async"
      />
      {wordmark && (
        <span className="select-none">
          Ghost<span className="text-accent">Mail</span>
        </span>
      )}
    </Link>
  );
}

/** Compact mark-only variant for tight UI chrome */
export function LogoMark({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/ghost-mail-icon.svg"
      alt="Ghost Mail"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      decoding="async"
    />
  );
}
