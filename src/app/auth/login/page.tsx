"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RadarLogo } from "@/components/ui/RadarLogo";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");

  // Auto-seed demo data if DB is empty
  useEffect(() => {
    fetch("/api/seed")
      .then((r) => r.json())
      .then((d) => {
        if (!d.seeded) {
          fetch("/api/seed", { method: "POST" })
            .then((r) => r.json())
            .then((data) => {
              if (data.ok) {
                setGlobalError(""); // clear any errors
                console.log("Demo data seeded:", data.credentials);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);


  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.email) errs.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = "Enter a valid email";
    if (!form.password) errs.password = "Password is required";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setGlobalError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        rememberMe: form.rememberMe ? "true" : "false",
        redirect: false,
      });

      if (result?.error) {
        setGlobalError("Invalid email or password. Please try again.");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setGlobalError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-radar-base grid-bg flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <RadarLogo size="md" />
        </div>

        {/* Card */}
        <div className="bg-radar-surface border border-radar-border rounded-2xl p-8 shadow-2xl">
          <div className="mb-6">
            <h1
              className="text-2xl font-display font-bold text-text-primary mb-1"
              style={{ fontFamily: "Syne, sans-serif" }}
            >
              Welcome back
            </h1>
            <p className="text-sm text-text-secondary">
              Sign in to your Radar account
            </p>
          </div>

          {globalError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {globalError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => {
                setForm((f) => ({ ...f, email: e.target.value }));
                if (errors.email) setErrors((e) => ({ ...e, email: "" }));
              }}
              error={errors.email}
              autoComplete="email"
              data-testid="input-email"
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => {
                setForm((f) => ({ ...f, password: e.target.value }));
                if (errors.password) setErrors((e) => ({ ...e, password: "" }));
              }}
              error={errors.password}
              autoComplete="current-password"
              data-testid="input-password"
            />

            {/* Remember me */}
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                role="checkbox"
                aria-checked={form.rememberMe}
                onClick={() => setForm((f) => ({ ...f, rememberMe: !f.rememberMe }))}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                  form.rememberMe
                    ? "bg-blue-500 border-blue-500"
                    : "bg-transparent border-radar-border hover:border-blue-500/50"
                }`}
                data-testid="checkbox-remember-me"
              >
                {form.rememberMe && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <label
                className="text-sm text-text-secondary cursor-pointer select-none"
                onClick={() => setForm((f) => ({ ...f, rememberMe: !f.rememberMe }))}
              >
                Remember me for 30 days
              </label>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full mt-2"
              loading={loading}
              data-testid="button-submit"
            >
              Sign in
            </Button>
          </form>


          {/* Demo credentials */}
          <div className="mt-4 p-3 rounded-lg bg-radar-elevated border border-radar-border text-center">
            <p className="text-xs text-text-muted mb-1 font-mono">DEMO CREDENTIALS</p>
            <p className="text-xs text-text-secondary">
              <span className="font-mono text-blue-400">demo@radar.app</span> /{' '}
              <span className="font-mono text-blue-400">Demo1234!</span>
            </p>
          </div>
          <div className="mt-6 pt-6 border-t border-radar-border text-center">
            <p className="text-sm text-text-secondary">
              Don&apos;t have an account?{" "}
              <Link
                href="/auth/register"
                className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                data-testid="link-register"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-text-muted mt-6 font-mono">
          RADAR · JOB INTELLIGENCE PLATFORM
        </p>
      </div>
    </div>
  );
}
