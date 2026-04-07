"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RadarLogo } from "@/components/ui/RadarLogo";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const passwordRequirements = [
  { label: "8+ characters", test: (p: string) => p.length >= 8 },
  { label: "1 uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "1 number", test: (p: string) => /[0-9]/.test(p) },
];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [showPasswordHints, setShowPasswordHints] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.fullName.trim()) errs.fullName = "Full name is required";
    if (!form.email) errs.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = "Enter a valid email";

    const failedReqs = passwordRequirements.filter((r) => !r.test(form.password));
    if (failedReqs.length > 0) {
      errs.password = `Password needs: ${failedReqs.map((r) => r.label).join(", ")}`;
    }
    if (form.password !== form.confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }
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
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          fullName: form.fullName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setGlobalError(data.error || "Registration failed. Please try again.");
        return;
      }

      // Auto sign-in after registration
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (result?.ok) {
        router.push("/onboarding");
      } else {
        router.push("/auth/login");
      }
    } catch {
      setGlobalError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = passwordRequirements.filter((r) =>
    r.test(form.password)
  ).length;

  return (
    <div className="min-h-screen bg-radar-base grid-bg flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md animate-fade-in">
        <div className="flex justify-center mb-8">
          <RadarLogo size="md" />
        </div>

        <div className="bg-radar-surface border border-radar-border rounded-2xl p-8 shadow-2xl">
          <div className="mb-6">
            <h1
              className="text-2xl font-bold text-text-primary mb-1"
              style={{ fontFamily: "Syne, sans-serif" }}
            >
              Create your account
            </h1>
            <p className="text-sm text-text-secondary">
              Start tracking jobs with AI-powered matching
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
              label="Full name"
              type="text"
              placeholder="Alex Chen"
              value={form.fullName}
              onChange={(e) => {
                setForm((f) => ({ ...f, fullName: e.target.value }));
                if (errors.fullName) setErrors((e) => ({ ...e, fullName: "" }));
              }}
              error={errors.fullName}
              autoComplete="name"
              data-testid="input-full-name"
            />

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

            <div className="space-y-1.5">
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => {
                  setForm((f) => ({ ...f, password: e.target.value }));
                  if (errors.password) setErrors((e) => ({ ...e, password: "" }));
                }}
                onFocus={() => setShowPasswordHints(true)}
                error={errors.password}
                autoComplete="new-password"
                data-testid="input-password"
              />

              {/* Password strength indicator */}
              {(showPasswordHints || form.password) && (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          i < passwordStrength
                            ? passwordStrength === 3
                              ? "bg-green-500"
                              : passwordStrength === 2
                              ? "bg-yellow-500"
                              : "bg-red-500"
                            : "bg-radar-elevated"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="space-y-1">
                    {passwordRequirements.map((req) => {
                      const met = req.test(form.password);
                      return (
                        <div key={req.label} className="flex items-center gap-1.5">
                          <div
                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                              met ? "text-green-500" : "text-text-muted"
                            }`}
                          >
                            {met ? (
                              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-current" />
                            )}
                          </div>
                          <span
                            className={`text-xs transition-colors ${
                              met ? "text-green-400" : "text-text-muted"
                            }`}
                          >
                            {req.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <Input
              label="Confirm password"
              type="password"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={(e) => {
                setForm((f) => ({ ...f, confirmPassword: e.target.value }));
                if (errors.confirmPassword)
                  setErrors((e) => ({ ...e, confirmPassword: "" }));
              }}
              error={errors.confirmPassword}
              autoComplete="new-password"
              data-testid="input-confirm-password"
            />

            <Button
              type="submit"
              size="lg"
              className="w-full mt-2"
              loading={loading}
              data-testid="button-submit"
            >
              Create account
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-radar-border text-center">
            <p className="text-sm text-text-secondary">
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                data-testid="link-login"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-text-muted mt-6 font-mono">
          RADAR · JOB INTELLIGENCE PLATFORM
        </p>
      </div>
    </div>
  );
}
