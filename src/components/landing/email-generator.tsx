"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { pushAddressHistory } from "@/lib/client/address-history";

interface EmailGeneratorProps {
  domainConfigured: boolean;
  domainDisplay: string;
  emailVerified?: boolean;
}

export function EmailGenerator({
  domainConfigured,
  domainDisplay,
  emailVerified = true,
}: EmailGeneratorProps) {
  const router = useRouter();
  const [customUsername, setCustomUsername] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState<"random" | "custom">("random");
  const [lastAddress, setLastAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(
    async (localPart?: string) => {
      if (!emailVerified) {
        toast.error("Verify your email before creating an inbox.", {
          description: "Check your inbox for a verification link, or resend from Account.",
        });
        return;
      }
      if (!domainConfigured) {
        toast.error("Email domain is not configured yet.", {
          description:
            "An administrator must set EMAIL_DOMAIN before addresses can receive real mail.",
        });
        return;
      }

      setIsGenerating(true);
      try {
        const res = await fetch("/api/inbox/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(localPart ? { localPart } : {}),
        });

        const data = await res.json();

        if (res.status === 401) {
          toast.error("Sign in required");
          router.push("/login?next=/");
          return;
        }
        if (!res.ok) {
          if (data.code === "INSUFFICIENT_COINS") {
            toast.error(data.error || "Not enough Veil Coins", {
              action: {
                label: "Billing",
                onClick: () => router.push("/billing"),
              },
            });
            return;
          }
          toast.error(data.error || "Failed to create address");
          return;
        }

        setLastAddress(data.address);
        pushAddressHistory({
          address: data.address,
          accessToken: data.accessToken,
          createdAt: data.createdAt || new Date().toISOString(),
        });
        toast.success("Inbox created", {
          description: data.address,
        });

        router.push(`/inbox/${data.accessToken}`);
      } catch {
        toast.error("Network error. Please try again.");
      } finally {
        setIsGenerating(false);
      }
    },
    [domainConfigured, emailVerified, router]
  );

  const copyAddress = useCallback(async () => {
    if (!lastAddress) return;
    try {
      await navigator.clipboard.writeText(lastAddress);
      setCopied(true);
      toast.success("Address copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }, [lastAddress]);

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5 space-y-4">
        <div
          role="tablist"
          aria-label="Address type"
          className="grid grid-cols-2 gap-0.5 p-0.5 rounded-lg bg-background border border-border-subtle"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "random"}
            onClick={() => setMode("random")}
            className={cn(
              "py-2 px-3 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              mode === "random"
                ? "bg-surface-elevated text-foreground shadow-sm"
                : "text-foreground-secondary hover:text-foreground"
            )}
          >
            Random
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "custom"}
            onClick={() => setMode("custom")}
            className={cn(
              "py-2 px-3 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              mode === "custom"
                ? "bg-surface-elevated text-foreground shadow-sm"
                : "text-foreground-secondary hover:text-foreground"
            )}
          >
            Custom
          </button>
        </div>

        {mode === "custom" && (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Input
                placeholder="username"
                value={customUsername}
                onChange={(e) => setCustomUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customUsername.trim()) {
                    generate(customUsername.trim());
                  }
                }}
                disabled={isGenerating}
                aria-label="Custom username"
                className="pr-[min(42%,11rem)] font-mono text-sm h-11"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none font-mono truncate max-w-[40%]">
                @{domainDisplay || "…"}
              </span>
            </div>
            <Button
              onClick={() => generate(customUsername.trim())}
              isLoading={isGenerating}
              disabled={!customUsername.trim() || isGenerating}
              className="w-full h-11 text-[#050A14]"
            >
              Create address
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {mode === "random" && (
          <Button
            size="lg"
            className="w-full h-11 text-[#050A14] shadow-none"
            onClick={() => generate()}
            isLoading={isGenerating}
            disabled={isGenerating}
          >
            Generate random address
          </Button>
        )}

        {!emailVerified && (
          <p className="text-xs text-warning text-center leading-relaxed">
            Verify your email to create inboxes.{" "}
            <a href="/account" className="underline hover:text-foreground">
              Account settings
            </a>
          </p>
        )}

        {!domainConfigured && (
          <p className="text-xs text-warning text-center leading-relaxed">
            Real email delivery requires{" "}
            <code className="px-1 py-0.5 rounded bg-background text-foreground-secondary">
              EMAIL_DOMAIN
            </code>{" "}
            and an inbound provider.
          </p>
        )}

        {lastAddress && (
          <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-background px-3 py-2.5">
            <code className="flex-1 min-w-0 text-sm font-mono text-foreground truncate">
              {lastAddress}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyAddress}
              aria-label="Copy address"
              className="h-8 w-8 p-0 shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
