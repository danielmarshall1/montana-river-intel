import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-slate-50">
      <h1 className="text-xl font-bold text-slate-900 mb-2">Page not found</h1>
      <Link
        href="/"
        className="text-blue-600 hover:text-blue-700 font-medium"
      >
        ← Back to Montana River Intel
      </Link>
    </div>
  );
}
