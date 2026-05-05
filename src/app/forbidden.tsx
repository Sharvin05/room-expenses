import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-semibold mb-2">Forbidden</h1>
        <p className="text-sm text-neutral-500 mb-6">
          You don&apos;t have permission to view this page.
        </p>
        <Link
          href="/"
          className="text-sm rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-white"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
