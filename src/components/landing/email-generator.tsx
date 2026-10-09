"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Check, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EmailGeneratorProps {
  domainConfigured: boolean;
  domainDisplay: string;
}

export function EmailGenerator({
  domainConfigured,
  domainDisplay,
}: EmailGeneratorProps) {
  const router = useRouter();
  const [customUsername, setCustomUsername] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState<"random" | "custom">("random");
  const [lastAddress, setLastAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(
    async (localPart?: string) => {
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
          body: JSON.stringify(
            localPart ? { localPart } : {}
          ),
        });

        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error || "Failed to create address");
          return;
        }

        setLastAddress(data.address);
        toast.success("Inbox created", {
          description: data.address,
        });

        // Navigate to the secure inbox
        router.push(`/inbox/${data.accessToken}`);
      } catch {
        toast.error("Network error. Please try again.");
      } finally {
        setIsGenerating(false);
      }
    },
    [domainConfigured, router]
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
    <div className="w-full max-w-xl mx-auto animate-slide-up">
      <div className="rounded-2xl border border-border bg-surface/80 p-1 shadow-2xl shadow-black/40">
        <div className="rounded-xl bg-surface-elevated p-5 sm:p-6 space-y-5">
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 rounded-lg bg-background border border-border-subtle">
            <button
              type="button"
              onClick={() => setMode("random")}
              className={cn(
                "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
                mode === "random"
                  ? "bg-accent text-white shadow"
                  : "text-foreground-secondary hover:text-foreground"
              )}
            >
              Random
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={cn(
                "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
                mode === "custom"
                  ? "bg-accent text-white shadow"
                  : "text-foreground-secondary hover:text-foreground"
              )}
            >
              Custom
            </button>
          </div>

          {mode === "custom" && (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="your-username"
                  value={customUsername}
                  onChange={(e) => setCustomUsername(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customUsername.trim()) {
                      generate(customUsername.trim());
                    }
                  }}
                  disabled={isGenerating}
                  aria-label="Custom username"
                  className="pr-28 font-mono text-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none font-mono">
                  @{domainDisplay || "…"}
                </span>
              </div>
              <Button
                onClick={() => generate(customUsername.trim())}
                isLoading={isGenerating}
                disabled={!customUsername.trim() || isGenerating}
                className="shrink-0"
              >
                Create
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {mode === "random" && (
            <Button
              size="lg"
              className="w-full"
              onClick={() => generate()}
              isLoading={isGenerating}
              disabled={isGenerating}
            >
              <Sparkles className="h-4 w-4" />
              Generate random address
            </Button>
          )}

          {!domainConfigured && (
            <p className="text-xs text-warning text-center leading-relaxed">
              Real email delivery requires{" "}
              <code className="px-1 py-0.5 rounded bg-background text-foreground-secondary">
                EMAIL_DOMAIN
              </code>{" "}
              and an inbound provider to be configured.
            </p>
          )}

          {lastAddress && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-background border border-border">
              <code className="flex-1 text-sm font-mono text-accent truncate">
                {lastAddress}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyAddress}
                aria-label="Copy address"
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
    </div>
  );
}
