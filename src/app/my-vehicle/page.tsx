import Link from "next/link";

export default function MyVehiclePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12">
      <section className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-lg">
        <h1 className="text-3xl font-bold text-zinc-900">My Vehicle</h1>
        <p className="mt-3 text-zinc-600">Add and manage your vehicles for quicker travel booking.</p>
        <Link href="/home" className="mt-6 inline-block rounded-lg bg-zinc-900 px-5 py-2.5 font-semibold text-white hover:bg-black">
          Back to Home
        </Link>
      </section>
    </main>
  );
}
