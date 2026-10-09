import { Logo } from "@/components/ui/logo";
import { EmailGenerator } from "@/components/landing/email-generator";
import { isDomainConfigured, getEmailDomain, APP_NAME } from "@/lib/constants";
import {
  Shield,
  Clock,
  Zap,
  EyeOff,
  Mail,
  Lock,
  RefreshCw,
  Trash2,
} from "lucide-react";

export default function LandingPage() {
  const domainConfigured = isDomainConfigured();
  const domain = getEmailDomain() || "yourdomain.com";

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 glass">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="hidden sm:flex items-center gap-6 text-sm text-foreground-secondary">
            <a href="#how-it-works" className="hover:text-foreground transition-colors">
              How it works
            </a>
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28">
          <div
            className="absolute inset-0 -z-10 opacity-30"
            style={{
              background:
                "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(139, 92, 246, 0.35), transparent)",
            }}
          />
          <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground-secondary mb-6 animate-fade-in">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Persistent · Private · No signup
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-balance animate-slide-up">
              Disposable email that{" "}
              <span className="text-accent">stays with you</span>
            </h1>

            <p className="mt-5 max-w-2xl mx-auto text-lg text-foreground-secondary text-balance animate-slide-up">
              Generate a temporary address in one click. Keep it as long as you
              need. Delete it when you&apos;re done. No accounts, no spam on
              your real inbox.
            </p>

            <div className="mt-10">
              <EmailGenerator
                domainConfigured={domainConfigured}
                domainDisplay={domain}
              />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="py-20 border-t border-border-subtle">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                How {APP_NAME} works
              </h2>
              <p className="mt-3 text-foreground-secondary max-w-lg mx-auto">
                Three steps to a clean, private inbox.
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-3">
              {[
                {
                  icon: Zap,
                  step: "01",
                  title: "Generate",
                  desc: "Create a random or custom address instantly. No registration required.",
                },
                {
                  icon: Mail,
                  step: "02",
                  title: "Receive",
                  desc: "Use the address anywhere. Messages appear in your private inbox in real time.",
                },
                {
                  icon: Trash2,
                  step: "03",
                  title: "Control",
                  desc: "Keep the inbox as long as you need. Delete messages or the whole inbox when finished.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="relative rounded-2xl border border-border bg-surface p-6 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-mono text-muted">{item.step}</span>
                  </div>
                  <h3 className="text-lg font-medium">{item.title}</h3>
                  <p className="mt-2 text-sm text-foreground-secondary leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="py-20 border-t border-border-subtle">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                Built for privacy
              </h2>
              <p className="mt-3 text-foreground-secondary max-w-lg mx-auto">
                Professional-grade temporary email without the usual trade-offs.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Clock,
                  title: "Persistent inboxes",
                  desc: "Addresses stay active until you delete them. No automatic expiry.",
                },
                {
                  icon: Shield,
                  title: "Secure access",
                  desc: "Each inbox is protected by a high-entropy token, not a guessable ID.",
                },
                {
                  icon: EyeOff,
                  title: "No tracking",
                  desc: "We don't sell data or inject ads. Your messages stay private.",
                },
                {
                  icon: RefreshCw,
                  title: "Live polling",
                  desc: "Inbox refreshes automatically so verification codes appear quickly.",
                },
                {
                  icon: Lock,
                  title: "Sanitized HTML",
                  desc: "Incoming HTML is scrubbed of scripts and dangerous content.",
                },
                {
                  icon: Mail,
                  title: "Custom usernames",
                  desc: "Choose a readable local-part when you need a professional-looking address.",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl border border-border-subtle bg-surface/50 p-5 hover:bg-surface transition-colors"
                >
                  <f.icon className="h-5 w-5 text-accent mb-3" />
                  <h3 className="font-medium text-sm">{f.title}</h3>
                  <p className="mt-1.5 text-xs text-foreground-secondary leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size="sm" />
          <p className="text-xs text-muted text-center sm:text-right">
            © {new Date().getFullYear()} {APP_NAME}. Temporary email for privacy.
            <br className="sm:hidden" />
            <span className="hidden sm:inline"> · </span>
            Not affiliated with any email provider.
          </p>
        </div>
      </footer>
    </div>
  );
}
