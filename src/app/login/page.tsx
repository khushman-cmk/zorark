"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

function ZippiLogo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 10H26L14 22H28" stroke="#ea4c89" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 10H6M8 16H11M6 22H8" stroke="#ea4c89" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="text-3xl font-extrabold text-black tracking-tight">Zippi</span>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [currentView, setCurrentView] = useState<"splash" | "login" | "create">("splash");

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createMessage, setCreateMessage] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [invalidLogin, setInvalidLogin] = useState("");

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

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

    const session = await getSession();
    if (session?.user && (session.user as any).role === "admin") {
      router.push("/admin");
    } else {
      router.push("/home");
    }
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

    const session = await getSession();
    if (session?.user && (session.user as any).role === "admin") {
      router.push("/admin");
    } else {
      router.push("/home");
    }
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
    <main className="h-screen flex flex-col md:flex-row bg-white font-sans text-black selection:bg-[#ea4c89] selection:text-white overflow-hidden">
      
      {/* Left Panel */}
      <div className="w-full md:w-[45%] lg:w-[40%] flex flex-col px-8 py-10 md:px-16 md:py-12 z-10 bg-white h-full relative">
        
        {/* Top Logo */}
        <div className="flex-shrink-0">
          <ZippiLogo />
        </div>

        {/* Dynamic Center Content */}
        <div className="flex-1 flex flex-col justify-center">
          
          {currentView === "splash" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-sm">
              <h1 className="text-5xl font-extrabold text-black tracking-tight leading-tight">
                Move better,<br/>
                <span className="text-[#ea4c89]">every day.</span>
              </h1>
              <p className="text-gray-500 mt-6 text-lg font-medium leading-relaxed">
                Quick rides. Fair prices.<br/>
                Always with you.
              </p>
              <div className="w-10 h-[3px] bg-[#ea4c89] mt-6 mb-10 rounded-full"></div>

              <div className="space-y-4">
                <button
                  onClick={() => setCurrentView("create")}
                  className="w-full bg-[#ea4c89] hover:bg-[#d83f7a] text-white py-4 rounded-xl font-bold tracking-wide transition-colors shadow-md flex items-center justify-center gap-2 group"
                >
                  Create Account
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
                <button
                  onClick={() => setCurrentView("login")}
                  className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-black py-4 rounded-xl font-bold tracking-wide transition-colors flex items-center justify-center gap-2 group shadow-sm"
                >
                  Log In
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {currentView === "login" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500 max-w-sm w-full">
              <h2 className="text-3xl font-bold text-black mb-6">Log In</h2>
              <form onSubmit={loginByEmail} className="space-y-4">
                <input
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder="Email Address"
                  className="w-full rounded-xl border border-gray-300 bg-white px-5 py-4 text-black placeholder-gray-400 outline-none focus:border-[#ea4c89] focus:ring-1 focus:ring-[#ea4c89] transition-all"
                />
                <div className="relative">
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    placeholder="Password"
                    className="w-full rounded-xl border border-gray-300 bg-white px-5 py-4 text-black placeholder-gray-400 outline-none focus:border-[#ea4c89] focus:ring-1 focus:ring-[#ea4c89] transition-all pr-12"
                  />
                  <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black focus:outline-none">
                    {showLoginPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                
                {invalidLogin && <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-lg">{invalidLogin}</p>}
                
                <button className="w-full rounded-xl bg-[#ea4c89] hover:bg-[#d83f7a] py-4 text-sm font-bold tracking-wider text-white shadow-md transition-colors mt-2">
                  LOG IN
                </button>
              </form>

              <div className="mt-6 flex flex-col gap-4">
                <Dialog.Root>
                  <Dialog.Trigger asChild>
                    <button className="text-sm font-semibold text-gray-600 hover:text-black hover:underline self-start">Forgot password?</button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" />
                    <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
                      <Dialog.Title className="text-2xl font-bold text-black">Reset Password</Dialog.Title>
                      <p className="mt-2 text-sm text-gray-500">Verify using mobile number + OTP and set a new password.</p>

                      <div className="mt-6 space-y-4">
                        <input
                          value={resetMobile}
                          onChange={(event) => setResetMobile(event.target.value)}
                          placeholder="Mobile number"
                          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-black outline-none focus:border-[#ea4c89] focus:ring-1 focus:ring-[#ea4c89]"
                        />
                        <button type="button" onClick={startReset} className="w-full rounded-xl border border-gray-300 py-3 font-semibold text-black hover:bg-gray-50 transition-colors">
                          Send OTP
                        </button>
                        <input
                          value={resetOtp}
                          onChange={(event) => setResetOtp(event.target.value)}
                          placeholder="OTP"
                          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-black outline-none focus:border-[#ea4c89] focus:ring-1 focus:ring-[#ea4c89]"
                        />
                        <div className="relative">
                          <input
                            type={showResetPassword ? "text" : "password"}
                            value={resetPassword}
                            onChange={(event) => setResetPassword(event.target.value)}
                            placeholder="New password"
                            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-black outline-none focus:border-[#ea4c89] focus:ring-1 focus:ring-[#ea4c89] pr-12"
                          />
                          <button type="button" onClick={() => setShowResetPassword(!showResetPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black focus:outline-none">
                            {showResetPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                        <button type="button" onClick={completeReset} className="w-full rounded-xl bg-[#ea4c89] py-3 font-semibold text-white hover:bg-[#d83f7a] transition-colors shadow-sm">
                          Update Password
                        </button>
                      </div>

                      {resetInfo && <p className="mt-4 text-sm font-medium text-[#ea4c89] bg-pink-50 px-3 py-2 rounded-lg">{resetInfo}</p>}

                      <Dialog.Close asChild>
                        <button className="mt-6 w-full rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-500 hover:text-black hover:bg-gray-50 transition-colors">Cancel</button>
                      </Dialog.Close>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>

                <button
                  onClick={() => setCurrentView("splash")}
                  className="text-sm font-bold text-gray-400 hover:text-black transition-colors self-start"
                >
                  Back to Welcome
                </button>
              </div>
            </div>
          )}

          {currentView === "create" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500 max-w-sm w-full">
              <h2 className="text-3xl font-bold text-black mb-6">Create Account</h2>
              <form onSubmit={createAccount} className="space-y-4">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Full Name"
                  className="w-full rounded-xl border border-gray-300 bg-white px-5 py-4 text-black placeholder-gray-400 outline-none focus:border-[#ea4c89] focus:ring-1 focus:ring-[#ea4c89] transition-all"
                />
                <input
                  value={mobile}
                  onChange={(event) => setMobile(event.target.value)}
                  placeholder="Mobile Number"
                  className="w-full rounded-xl border border-gray-300 bg-white px-5 py-4 text-black placeholder-gray-400 outline-none focus:border-[#ea4c89] focus:ring-1 focus:ring-[#ea4c89] transition-all"
                />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email Address"
                  className="w-full rounded-xl border border-gray-300 bg-white px-5 py-4 text-black placeholder-gray-400 outline-none focus:border-[#ea4c89] focus:ring-1 focus:ring-[#ea4c89] transition-all"
                />
                <div className="relative">
                  <input
                    value={password}
                    type={showCreatePassword ? "text" : "password"}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Create Password"
                    className="w-full rounded-xl border border-gray-300 bg-white px-5 py-4 text-black placeholder-gray-400 outline-none focus:border-[#ea4c89] focus:ring-1 focus:ring-[#ea4c89] transition-all pr-12"
                  />
                  <button type="button" onClick={() => setShowCreatePassword(!showCreatePassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black focus:outline-none">
                    {showCreatePassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                
                {createMessage && <p className="text-sm font-medium text-black bg-gray-100 px-4 py-3 rounded-lg">{createMessage}</p>}

                <button className="w-full rounded-xl bg-[#ea4c89] hover:bg-[#d83f7a] py-4 text-sm font-bold tracking-wider text-white shadow-md transition-colors mt-2">
                  CREATE ACCOUNT
                </button>
              </form>

              <div className="mt-6 flex">
                <button
                  onClick={() => setCurrentView("splash")}
                  className="text-sm font-bold text-gray-400 hover:text-black transition-colors self-start"
                >
                  Back to Welcome
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer Terms */}
        <div className="flex-shrink-0 mt-8">
          <p className="text-sm text-gray-500 leading-relaxed">
            By continuing, you agree to Zippi's<br/>
            <a href="#" className="text-[#ea4c89] hover:underline">Terms of Service</a> and <a href="#" className="text-[#ea4c89] hover:underline">Privacy Policy</a>
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="hidden md:block flex-1 relative bg-[#f4f4f6]">
        <img src="/assets/login.png" alt="Login Banner" className="w-full h-full object-cover" />
      </div>

    </main>
  );
}
