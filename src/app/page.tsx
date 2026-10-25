import { Logo } from "@/components/ui/logo";
import { EmailGenerator } from "@/components/landing/email-generator";
import { AddressHistory } from "@/components/landing/address-history";
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
      <header className="sticky top-0 z-50 border-b border-border-subtle bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <Logo size="sm" />
          <nav className="flex items-center gap-1 sm:gap-2 text-sm">
            <a
              href="#how-it-works"
              className="hidden sm:inline-flex px-3 py-1.5 rounded-md text-foreground-secondary hover:text-foreground transition-colors"
            >
              How it works
            </a>
            <a
              href="#features"
              className="hidden sm:inline-flex px-3 py-1.5 rounded-md text-foreground-secondary hover:text-foreground transition-colors"
            >
              Features
            </a>
            <a
              href="/login"
              className="px-3 py-1.5 rounded-md text-foreground-secondary hover:text-foreground transition-colors"
            >
              Sign in
            </a>
            <a
              href="/register"
              className="ml-1 rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-[#050A14] hover:bg-accent-hover transition-colors"
            >
              Register
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="pt-12 pb-16 sm:pt-16 sm:pb-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="max-w-2xl mx-auto text-center">
              <h1 className="text-[1.875rem] leading-tight sm:text-4xl lg:text-[2.75rem] font-semibold tracking-tight text-foreground">
                Email on your terms.
              </h1>
              <p className="mt-4 text-[15px] sm:text-base text-foreground-secondary leading-relaxed max-w-md mx-auto">
                Create an inbox in seconds. Keep the addresses you need and
                delete them whenever you&apos;re ready.
              </p>
            </div>

            <div className="mt-8 sm:mt-10">
              <EmailGenerator
                domainConfigured={domainConfigured}
                domainDisplay={domain}
              />
              <AddressHistory />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="py-16 sm:py-20 border-t border-border-subtle">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="mb-10 sm:mb-12 max-w-lg">
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
                How it works
              </h2>
              <p className="mt-2 text-sm text-foreground-secondary leading-relaxed">
                Three steps. No account required to start.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-3 sm:gap-8">
              {[
                {
                  icon: Zap,
                  step: "01",
                  title: "Generate",
                  desc: "Create a random or custom address instantly.",
                },
                {
                  icon: Mail,
                  step: "02",
                  title: "Receive",
                  desc: "Messages appear in your private inbox as they arrive.",
                },
                {
                  icon: Trash2,
                  step: "03",
                  title: "Control",
                  desc: "Keep an inbox as long as you need, then delete it.",
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-4 sm:block">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-accent">
                    <item.icon className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="sm:mt-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[11px] font-mono text-muted">
                        {item.step}
                      </span>
                      <h3 className="text-sm font-medium text-foreground">
                        {item.title}
                      </h3>
                    </div>
                    <p className="mt-1.5 text-sm text-foreground-secondary leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="py-16 sm:py-20 border-t border-border-subtle">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="mb-10 sm:mb-12 max-w-lg">
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
                Built for everyday use
              </h2>
              <p className="mt-2 text-sm text-foreground-secondary leading-relaxed">
                Practical controls for temporary addresses without extra clutter.
              </p>
            </div>

            <div className="grid gap-px rounded-xl border border-border-subtle bg-border-subtle overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Clock,
                  title: "Persistent inboxes",
                  desc: "Addresses stay active until you delete them.",
                },
                {
                  icon: Shield,
                  title: "Secure access",
                  desc: "Each inbox uses a high-entropy access token.",
                },
                {
                  icon: EyeOff,
                  title: "No ads or tracking",
                  desc: "Your messages stay private on this service.",
                },
                {
                  icon: RefreshCw,
                  title: "Live refresh",
                  desc: "The inbox updates automatically while you wait.",
                },
                {
                  icon: Lock,
                  title: "Sanitized HTML",
                  desc: "Incoming HTML is cleaned before it is shown.",
                },
                {
                  icon: Mail,
                  title: "Custom usernames",
                  desc: "Choose a readable local-part when you need one.",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="bg-background p-5 sm:p-6 hover:bg-surface/40 transition-colors"
                >
                  <f.icon
                    className="h-4 w-4 text-accent mb-3"
                    aria-hidden
                  />
                  <h3 className="text-sm font-medium text-foreground">
                    {f.title}
                  </h3>
                  <p className="mt-1 text-sm text-foreground-secondary leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle py-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <Logo size="sm" />
          <p className="text-xs text-muted text-center sm:text-right">
            © {new Date().getFullYear()} {APP_NAME}
            <span className="mx-1.5 text-border">·</span>
            Temporary email for privacy
          </p>
        </div>
      </footer>
    </div>
  );
}
