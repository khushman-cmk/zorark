"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createMessage, setCreateMessage] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [invalidLogin, setInvalidLogin] = useState("");

  const [resetMobile, setResetMobile] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetInfo, setResetInfo] = useState("");

  const parseResponse = async (response: Response) => {
    const text = await response.text();

    try {
      return JSON.parse(text) as { error?: string; message?: string; otpPreview?: string };
    } catch {
      return {};
    }
  };

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    setCreateMessage("");

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, mobile, password }),
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      setCreateMessage(data.error ?? "Unable to create account.");
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setCreateMessage("Account created. Redirecting to landing page...");
      router.push("/home");
      return;
    }

    router.push("/home");
  };

  const loginByEmail = async (event: FormEvent) => {
    event.preventDefault();
    setInvalidLogin("");

    const result = await signIn("credentials", {
      email: loginEmail,
      password: loginPassword,
      redirect: false,
    });

    if (!result || result.error) {
      setInvalidLogin("Invalid credentials or already registered password mismatch.");
      return;
    }

    router.push("/home");
  };

  const startReset = async () => {
    setResetInfo("");

    const response = await fetch("/api/auth/forgot-password/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: resetMobile }),
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      setResetInfo(data.error ?? "Could not send OTP.");
      return;
    }

    setResetInfo(`OTP sent. ${data.otpPreview ? `Dev OTP: ${data.otpPreview}` : ""}`);
  };

  const completeReset = async () => {
    setResetInfo("");

    const response = await fetch("/api/auth/forgot-password/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mobile: resetMobile,
        otp: resetOtp,
        newPassword: resetPassword,
      }),
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      setResetInfo(data.error ?? "Reset failed.");
      return;
    }

    setResetInfo("Password updated. You can login now.");
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#d84187] px-4 py-10">
      <div className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-[#ef6cae]/80 blur-3xl" />
      <div className="pointer-events-none absolute -top-16 right-0 h-72 w-72 rounded-full bg-[#b31362]/70 blur-3xl" />

      <section className="relative w-full max-w-md overflow-hidden rounded-[2rem] border-8 border-zinc-900 bg-zinc-950 shadow-2xl">
        <div className="absolute left-0 top-0 h-44 w-full rounded-b-[40%] bg-[#f57ab4]" />
        <div className="relative z-10 p-6 pt-16">
          <h1 className="text-4xl font-extrabold tracking-tight text-white">Welcome!</h1>
          <p className="mt-1 text-sm text-zinc-300">Create account and continue to your landing page</p>

          <Tabs.Root defaultValue="create" className="mt-6">
            <Tabs.List className="grid grid-cols-2 rounded-lg bg-zinc-900 p-1">
              <Tabs.Trigger value="create" className="rounded-md px-3 py-2 text-sm font-semibold text-zinc-300 data-[state=active]:bg-pink-600 data-[state=active]:text-white">
                Create Account
              </Tabs.Trigger>
              <Tabs.Trigger value="email" className="rounded-md px-3 py-2 text-sm font-semibold text-zinc-300 data-[state=active]:bg-pink-600 data-[state=active]:text-white">
                Email Login
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="create" className="mt-5">
              <form onSubmit={createAccount} className="space-y-3">
                <label className="block text-sm font-medium text-zinc-200">Full Name</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Enter your full name"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white outline-none focus:border-pink-500"
                />
                <label className="block text-sm font-medium text-zinc-200">Mobile Number</label>
                <input
                  value={mobile}
                  onChange={(event) => setMobile(event.target.value)}
                  placeholder="9876543210"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white outline-none focus:border-pink-500"
                />
                <label className="block text-sm font-medium text-zinc-200">Email</label>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white outline-none focus:border-pink-500"
                />
                <label className="block text-sm font-medium text-zinc-200">Password</label>
                <input
                  value={password}
                  type="password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Create password"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white outline-none focus:border-pink-500"
                />
                <button className="w-full rounded-lg bg-pink-600 py-2.5 font-semibold text-white hover:bg-pink-700">Create Account</button>
                {createMessage ? <p className="text-sm text-pink-300">{createMessage}</p> : null}
              </form>
            </Tabs.Content>

            <Tabs.Content value="email" className="mt-5">
              <form onSubmit={loginByEmail} className="space-y-3">
                <label className="block text-sm font-medium text-zinc-200">Email</label>
                <input
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white outline-none focus:border-pink-500"
                />
                <label className="block text-sm font-medium text-zinc-200">Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="Enter password"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white outline-none focus:border-pink-500"
                />
                <button className="w-full rounded-lg bg-pink-600 py-2.5 font-semibold text-white hover:bg-pink-700">Log In</button>
                {invalidLogin ? <p className="text-sm text-red-300">{invalidLogin}</p> : null}
              </form>
            </Tabs.Content>
          </Tabs.Root>

          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button className="mt-4 text-sm font-semibold text-pink-300 underline">Forgot password?</button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/60" />
              <Dialog.Content className="fixed left-1/2 top-1/2 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-700 bg-zinc-950 p-6 text-white shadow-2xl">
                <Dialog.Title className="text-xl font-bold">Reset Password</Dialog.Title>
                <p className="mt-1 text-sm text-zinc-400">Verify using mobile number + OTP and set a new password.</p>

                <div className="mt-4 space-y-3">
                  <input
                    value={resetMobile}
                    onChange={(event) => setResetMobile(event.target.value)}
                    placeholder="Mobile number"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white"
                  />
                  <button type="button" onClick={startReset} className="w-full rounded-lg border border-zinc-700 py-2 font-semibold text-zinc-200">
                    Send OTP
                  </button>
                  <input
                    value={resetOtp}
                    onChange={(event) => setResetOtp(event.target.value)}
                    placeholder="OTP"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white"
                  />
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    placeholder="New password"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white"
                  />
                  <button type="button" onClick={completeReset} className="w-full rounded-lg bg-pink-600 py-2.5 font-semibold text-white hover:bg-pink-700">
                    Update Password
                  </button>
                </div>

                {resetInfo ? <p className="mt-3 text-sm text-pink-300">{resetInfo}</p> : null}

                <Dialog.Close asChild>
                  <button className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 text-sm">Close</button>
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </section>
    </main>
  );
}
