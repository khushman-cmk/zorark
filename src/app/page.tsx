import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#e0428d] px-4 py-10">
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#f86bb4]/50 blur-3xl" />
      <div className="pointer-events-none absolute -top-20 right-0 h-72 w-72 rounded-full bg-[#c01968]/35 blur-3xl" />

      <section className="relative w-full max-w-[420px]">
        <div className="relative mx-auto h-[760px] w-[366px] rounded-[50px] border-[9px] border-[#29262f] bg-[#1f1d24] p-2.5 shadow-[0_28px_75px_rgba(15,10,18,0.45)]">
          <div className="relative h-full overflow-hidden rounded-[40px] bg-[#15131a]">
            <div className="absolute left-1/2 top-2 z-30 h-6 w-40 -translate-x-1/2 rounded-b-2xl bg-[#0f0d13]" />

            <div
              className="absolute inset-x-0 top-0 h-[60%] bg-[#f283bc]"
              style={{
                borderBottomLeftRadius: "40% 20%",
                borderBottomRightRadius: "60% 28%",
              }}
            />

            <div
              className="absolute bottom-[40%] left-0 h-[23%] w-full bg-[#15131a]"
              style={{
                borderTopLeftRadius: "56% 70%",
                borderTopRightRadius: "44% 60%",
              }}
            />

            <div className="relative z-10 flex h-full flex-col items-center justify-between px-8 pb-12 pt-20 text-center">
              <div>
                <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full bg-[#de3a8f] shadow-[inset_0_0_0_8px_rgba(143,12,72,0.36)]">
                  <svg
                    width="96"
                    height="96"
                    viewBox="0 0 92 92"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="opacity-85"
                    aria-hidden="true"
                  >
                    <circle cx="46" cy="46" r="39" stroke="#9c185a" strokeWidth="7" />
                    <path
                      d="M18 46C31 35 45 33 74 30"
                      stroke="#9c185a"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                    <path
                      d="M27 69C39 50 51 37 66 22"
                      stroke="#9c185a"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                    <path
                      d="M24 26C36 40 44 53 49 74"
                      stroke="#9c185a"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <p
                  className="mt-4 text-[58px] leading-none text-[#c82f79]"
                  style={{
                    fontFamily: '"Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive',
                  }}
                >
                  dribbble
                </p>
              </div>

              <div className="w-full">
                <h1 className="text-[50px] font-extrabold leading-none tracking-tight text-white">
                  Dribbble
                </h1>
                <p className="mx-auto mt-5 max-w-[285px] text-[19px] leading-8 text-zinc-300">
                  Sign in to be inspired by the works of designers
                  <br />
                  or to inspire others with your design
                </p>
                <div className="mx-auto mt-4 h-[2px] w-16 rounded-full bg-[#f16faf]" />

                <Link
                  href="/login"
                  className="mt-10 block rounded-full bg-[#ef6eae] px-7 py-3 text-[13px] font-extrabold tracking-wide text-white transition hover:brightness-105"
                >
                  CREATE ACCOUNT
                </Link>

                <Link
                  href="/login"
                  className="mt-4 inline-block text-sm font-bold tracking-wide text-[#f06daf] transition hover:text-[#ff91c5]"
                >
                  LOG IN
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
