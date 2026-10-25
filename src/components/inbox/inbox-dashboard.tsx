"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Mail,
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
  KeyRound,
  Search,
  X,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  detectVerificationCodes,
  detectVerificationLinks,
  primaryVerificationCode,
  type DetectedCode,
  type DetectedLink,
} from "@/lib/email/detection";
import {
  senderInitials,
  filterMessages,
  avatarTone,
} from "@/lib/inbox-ui";

interface MessageSummary {
  id: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  preview: string;
  receivedAt: string;
  isRead: boolean;
}

interface MessageDetail {
  id: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  receivedAt: string;
  isRead: boolean;
}

interface InboxDashboardProps {
  token: string;
}

const POLL_VISIBLE_MS = 5_000;
const POLL_HIDDEN_MS = 30_000;

export function InboxDashboard({ token }: InboxDashboardProps) {
  const router = useRouter();
  const [address, setAddress] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [newMessageFlash, setNewMessageFlash] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const fetchInbox = useCallback(
    async (silent = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (!silent) setRefreshing(true);
      try {
        const res = await fetch(`/api/inbox/${token}`, {
          cache: "no-store",
        });
        if (res.status === 404) {
          toast.error("Inbox not found or deleted");
          router.push("/");
          return;
        }
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setAddress(data.address);
        const next: MessageSummary[] = data.messages || [];

        // Detect newly arrived messages without disturbing selection
        const nextIds = new Set(next.map((m) => m.id));
        if (knownIdsRef.current.size > 0) {
          const arrived = next.filter((m) => !knownIdsRef.current.has(m.id));
          if (arrived.length > 0) {
            setNewMessageFlash(true);
            window.setTimeout(() => setNewMessageFlash(false), 2500);
            toast.success(
              arrived.length === 1
                ? "New message received"
                : `${arrived.length} new messages`,
              { description: arrived[0]?.subject }
            );
          }
        }
        knownIdsRef.current = nextIds;
        setMessages(next);
        setLoadError(null);
      } catch {
        if (!silent) {
          setLoadError("Could not load inbox. Check your connection and try again.");
          toast.error("Could not refresh inbox");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        inFlightRef.current = false;
      }
    },
    [token, router]
  );

  const fetchMessage = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/inbox/${token}/messages/${id}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        // Only apply if still selected
        if (selectedIdRef.current === id) {
          setDetail(data);
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, isRead: true } : m))
          );
        }
      } catch {
        toast.error("Could not load message");
      }
    },
    [token]
  );

  // Visibility-aware polling
  useEffect(() => {
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      if (pollRef.current) clearTimeout(pollRef.current);
      const hidden =
        typeof document !== "undefined" && document.visibilityState === "hidden";
      const delay = hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS;
      pollRef.current = setTimeout(async () => {
        if (cancelled) return;
        await fetchInbox(true);
        schedule();
      }, delay);
    };

    fetchInbox();
    schedule();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchInbox(true);
      }
      schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchInbox]);

  useEffect(() => {
    if (selectedId) {
      fetchMessage(selectedId);
      setShowMobileDetail(true);
    } else {
      setDetail(null);
      setShowMobileDetail(false);
    }
  }, [selectedId, fetchMessage]);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success("Address copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      toast.success("Code copied", { description: code });
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("Delete this message permanently?")) return;
    try {
      const res = await fetch(`/api/inbox/${token}/messages/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setMessages((prev) => prev.filter((m) => m.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
      }
      toast.success("Message deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  const deleteInbox = async () => {
    if (
      !confirm(
        "Delete this entire inbox and all messages? This cannot be undone."
      )
    )
      return;
    try {
      const res = await fetch(`/api/inbox/${token}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Inbox deleted");
      router.push("/");
    } catch {
      toast.error("Delete failed");
    }
  };

  const filteredMessages = filterMessages(messages, searchQuery);
  const unreadCount = messages.filter((m) => !m.isRead).length;

  const codes: DetectedCode[] = detail
    ? detectVerificationCodes(detail.subject, detail.textBody, detail.htmlBody)
    : [];
  const primary = primaryVerificationCode(codes);
  const links: DetectedLink[] = detail
    ? detectVerificationLinks(detail.textBody, detail.htmlBody)
    : [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-accent" />
          <p className="text-sm text-muted">Loading inbox…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/")}
            className="shrink-0"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </Button>

          <div className="flex-1 min-w-0 flex items-center gap-2">
            <code className="text-sm font-mono text-accent truncate">
              {address}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyAddress}
              aria-label="Copy email address"
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
            {newMessageFlash && (
              <span className="hidden sm:inline-flex items-center rounded-full bg-success/15 text-success text-[11px] font-medium px-2 py-0.5 animate-fade-in">
                New mail
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchInbox()}
              disabled={refreshing}
              aria-label="Refresh inbox"
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
              />
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={deleteInbox}
              aria-label="Delete inbox"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside
          className={cn(
            "w-full md:w-80 lg:w-96 border-r border-border flex flex-col bg-surface/50",
            showMobileDetail && "hidden md:flex"
          )}
        >
          <div className="px-4 py-3 border-b border-border-subtle space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium flex items-center gap-2">
                Inbox
                {unreadCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-[#050A14]">
                    {unreadCount}
                  </span>
                )}
              </h2>
              <span className="text-xs text-muted">
                {searchQuery
                  ? `${filteredMessages.length} of ${messages.length}`
                  : `${messages.length} messages`}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search mail"
                aria-label="Search messages"
                className="pl-8 pr-8 h-9 text-sm bg-background/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {loadError && (
            <div className="mx-3 mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs text-danger flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{loadError}</p>
                <button
                  type="button"
                  onClick={() => fetchInbox()}
                  className="mt-1.5 font-medium underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center">
                <div className="h-12 w-12 rounded-2xl bg-surface-elevated flex items-center justify-center mb-4">
                  <Mail className="h-6 w-6 text-muted" />
                </div>
                <p className="text-sm font-medium">No messages yet</p>
                <p className="mt-1 text-xs text-muted max-w-[220px]">
                  Send a verification email to this address. New messages appear
                  automatically every few seconds.
                </p>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <Search className="h-8 w-8 text-muted mb-3 opacity-50" />
                <p className="text-sm font-medium">No matching messages</p>
                <p className="mt-1 text-xs text-muted">
                  Try a different search term
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {filteredMessages.map((m) => {
                  const initials = senderInitials(m.fromName, m.fromAddress);
                  const tone = avatarTone(m.fromAddress);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(m.id)}
                        className={cn(
                          "w-full text-left px-3 sm:px-4 py-3 hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40",
                          selectedId === m.id && "bg-surface-elevated",
                          !m.isRead && "bg-accent/[0.04]"
                        )}
                      >
                        <div className="flex gap-3">
                          <div
                            className={cn(
                              "mt-0.5 h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold text-white",
                              tone
                            )}
                            aria-hidden
                          >
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={cn(
                                  "text-sm truncate",
                                  !m.isRead
                                    ? "font-semibold text-foreground"
                                    : "text-foreground-secondary"
                                )}
                              >
                                {m.fromName || m.fromAddress}
                              </span>
                              <span className="text-[11px] text-muted shrink-0 tabular-nums">
                                {formatRelativeTime(m.receivedAt)}
                              </span>
                            </div>
                            <p
                              className={cn(
                                "mt-0.5 text-sm truncate",
                                !m.isRead
                                  ? "font-medium text-foreground"
                                  : "text-muted"
                              )}
                            >
                              {m.subject || "(no subject)"}
                            </p>
                            <p className="mt-0.5 text-xs text-muted truncate">
                              {m.preview}
                            </p>
                          </div>
                          {!m.isRead && (
                            <span
                              className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent"
                              aria-label="Unread"
                            />
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <section
          className={cn(
            "flex-1 flex flex-col bg-background min-w-0",
            !showMobileDetail && "hidden md:flex"
          )}
        >
          {!detail ? (
            <div className="flex-1 flex items-center justify-center text-muted">
              <div className="text-center px-6">
                <Mail className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Select a message to read</p>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-border px-4 sm:px-6 py-4">
                <div className="flex items-start gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="md:hidden shrink-0 -ml-2"
                    onClick={() => {
                      setSelectedId(null);
                      setShowMobileDetail(false);
                    }}
                    aria-label="Back to list"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-semibold leading-snug">
                      {detail.subject}
                    </h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground-secondary">
                      <span className="break-all">
                        {detail.fromName
                          ? `${detail.fromName} <${detail.fromAddress}>`
                          : detail.fromAddress}
                      </span>
                      <span className="text-muted">
                        {new Date(detail.receivedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMessage(detail.id)}
                    aria-label="Delete message"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Primary OTP */}
                {primary && (
                  <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 p-4">
                    <div className="flex items-center gap-2 text-xs font-medium text-accent mb-2">
                      <KeyRound className="h-3.5 w-3.5" />
                      Detected verification code
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-2xl sm:text-3xl font-mono font-semibold tracking-widest text-foreground">
                        {primary.code}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => copyCode(primary.code)}
                        aria-label={`Copy verification code ${primary.code}`}
                      >
                        {copiedCode === primary.code ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-success" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy code
                          </>
                        )}
                      </Button>
                    </div>
                    {codes.length > 1 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {codes
                          .filter((c) => c.code !== primary.code)
                          .map((c) => (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => copyCode(c.code)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-elevated border border-border px-2.5 py-1 text-xs font-mono text-foreground-secondary hover:text-foreground transition-colors"
                              aria-label={`Copy alternative code ${c.code}`}
                            >
                              {c.code}
                              <Copy className="h-3 w-3 opacity-60" />
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Verification links – user must open intentionally */}
                {links.length > 0 && (
                  <div className="mt-3 rounded-xl border border-border bg-surface-elevated/80 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-foreground-secondary">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Possible verification link
                      <span className="text-muted font-normal">
                        · opens in a new tab · not verified by VeilMail
                      </span>
                    </div>
                    {links.map((link) => (
                      <div
                        key={link.url}
                        className="flex flex-col sm:flex-row sm:items-center gap-2"
                      >
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline break-all"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          {link.label}
                        </a>
                        <span className="text-[11px] text-muted truncate max-w-full sm:max-w-xs font-mono">
                          {link.url}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
                {detail.htmlBody ? (
                  <div
                    className="prose prose-invert prose-sm max-w-none break-words"
                    dangerouslySetInnerHTML={{ __html: detail.htmlBody }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-foreground-secondary leading-relaxed">
                    {detail.textBody || "(empty message)"}
                  </pre>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
