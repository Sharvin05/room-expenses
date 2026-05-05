import Link from "next/link";

export default function Unauthorized() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-semibold mb-2">Sign in required</h1>
        <p className="text-sm text-neutral-500 mb-6">Please sign in to continue.</p>
        <Link
          href="/login"
          className="text-sm rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-white"
        >
          Go to login
        </Link>
      </div>
    </main>
  );
}
