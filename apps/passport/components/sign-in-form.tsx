"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

const accounts = [
  {
    role: "Passport owner",
    name: "Mateo Rivera Demo",
    email: "mateo.demo@adaptiveworld.test",
    copy: "See one private Passport and decide what leaves it.",
  },
  {
    role: "Authorized doctor",
    name: "Dra. Elena Vargas",
    email: "elena.vargas@adaptiveworld.test",
    copy: "See only patients with an active relationship and scope.",
  },
] as const;

const demoPassword = "AdaptiveWorld2026!";

export function SignInForm() {
  const [email, setEmail] = useState<string>(accounts[0].email);
  const [password, setPassword] = useState<string>(demoPassword);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await authClient.signIn.email({
      email,
      password,
      callbackURL: "/auth/continue",
      rememberMe: true,
    });
    if (result.error) {
      setError("The email or password was not accepted.");
      setPending(false);
    }
  }

  return (
    <main className="signin-shell">
      <section className="signin-story">
        <div className="brand signin-brand">
          <Image
            alt=""
            aria-hidden="true"
            className="brand-mark"
            height={34}
            src="/icons/icon-192.png"
            width={34}
          />
          <div className="brand-copy">
            <strong>Adaptive World</strong>
            <small>Digital Passport</small>
          </div>
        </div>
        <p className="eyebrow">Private context, purpose-bound access</p>
        <h1>A Passport belongs to a person—not to a clinic or a gym.</h1>
        <p>
          This MVP uses a real password, a server-side Better Auth session, and Neon-backed roles.
          The people and clinical records are synthetic and visibly labeled.
        </p>
        <div className="signin-trust">
          <span>Real authentication</span>
          <span>Server-enforced roles</span>
          <span>One-use Gym handoff</span>
        </div>
      </section>
      <section className="signin-panel">
        <div>
          <p className="eyebrow">Professional demo access</p>
          <h2>Sign in to a distinct workspace</h2>
          <p className="card-subtitle">
            Pick an actor to prefill the credentials, then submit the real sign-in form.
          </p>
        </div>
        <div className="account-choices">
          {accounts.map((account) => (
            <button
              type="button"
              className={`account-choice ${email === account.email ? "selected" : ""}`}
              key={account.email}
              onClick={() => {
                setEmail(account.email);
                setPassword(demoPassword);
              }}
            >
              <span>{account.role}</span>
              <strong>{account.name}</strong>
              <small>{account.copy}</small>
            </button>
          ))}
        </div>
        <form className="signin-form" onSubmit={submit}>
          <label>
            Email
            <input
              autoComplete="username"
              inputMode="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={12}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="button primary signin-submit" disabled={pending} type="submit">
            {pending ? "Creating secure session…" : "Sign in securely"}
          </button>
        </form>
        <div className="demo-credential-note">
          <strong>Demo password</strong>
          <code>{demoPassword}</code>
          <span>Public synthetic accounts only. Self-registration is disabled.</span>
        </div>
      </section>
    </main>
  );
}
