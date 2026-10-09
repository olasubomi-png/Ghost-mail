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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime, extractVerificationCodes } from "@/lib/utils";

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

export function InboxDashboard({ token }: InboxDashboardProps) {
  const router = useRouter();
  const [address, setAddress] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchInbox = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const res = await fetch(`/api/inbox/${token}`);
        if (res.status === 404) {
          toast.error("Inbox not found or deleted");
          router.push("/");
          return;
        }
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setAddress(data.address);
        setMessages(data.messages || []);
      } catch {
        if (!silent) toast.error("Could not refresh inbox");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, router]
  );

  const fetchMessage = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/inbox/${token}/messages/${id}`);
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setDetail(data);
        // Mark read locally
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, isRead: true } : m))
        );
      } catch {
        toast.error("Could not load message");
      }
    },
    [token]
  );

  useEffect(() => {
    fetchInbox();
    pollRef.current = setInterval(() => fetchInbox(true), 12_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
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
      toast.success(`Copied ${code}`);
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

  const unreadCount = messages.filter((m) => !m.isRead).length;

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

  const codes = detail
    ? extractVerificationCodes(
        [detail.textBody, detail.subject].filter(Boolean).join("\n")
      )
    : [];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
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

      {/* Main split view */}
      <div className="flex-1 flex overflow-hidden">
        {/* Message list */}
        <aside
          className={cn(
            "w-full md:w-80 lg:w-96 border-r border-border flex flex-col bg-surface/50",
            showMobileDetail && "hidden md:flex"
          )}
        >
          <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
            <h2 className="text-sm font-medium flex items-center gap-2">
              Inbox
              {unreadCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">
                  {unreadCount}
                </span>
              )}
            </h2>
            <span className="text-xs text-muted">{messages.length} messages</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center">
                <div className="h-12 w-12 rounded-2xl bg-surface-elevated flex items-center justify-center mb-4">
                  <Mail className="h-6 w-6 text-muted" />
                </div>
                <p className="text-sm font-medium">No messages yet</p>
                <p className="mt-1 text-xs text-muted max-w-[200px]">
                  Send an email to this address. New messages appear
                  automatically.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {messages.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      className={cn(
                        "w-full text-left px-4 py-3.5 hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:bg-surface-elevated",
                        selectedId === m.id && "bg-surface-elevated",
                        !m.isRead && "border-l-2 border-l-accent"
                      )}
                    >
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
                        <span className="text-[11px] text-muted shrink-0">
                          {formatRelativeTime(m.receivedAt)}
                        </span>
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 text-sm truncate",
                          !m.isRead ? "text-foreground" : "text-muted"
                        )}
                      >
                        {m.subject}
                      </p>
                      <p className="mt-0.5 text-xs text-muted truncate">
                        {m.preview}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Message detail */}
        <section
          className={cn(
            "flex-1 flex flex-col bg-background",
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
              {/* Detail header */}
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
                      <span>
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

                {/* Verification codes */}
                {codes.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {codes.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => copyCode(code)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent/15 border border-accent/30 px-3 py-1.5 text-sm font-mono text-accent hover:bg-accent/25 transition-colors"
                      >
                        {code}
                        <Copy className="h-3 w-3 opacity-70" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Body */}
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
