import Link from "next/link";

export function BackHomeLink() {
  return (
    <Link
      href="/"
      className="mb-6 inline-flex items-center gap-1 text-sm font-bold uppercase tracking-[0.18em] hover:underline"
    >
      ← Home
    </Link>
  );
}
