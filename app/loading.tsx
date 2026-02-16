export default function Loading() {
  return (
    <div className="h-screen flex flex-col">
      <div className="h-14 bg-white border-b border-slate-200 animate-pulse" />
      <div className="flex-1 flex">
        <div className="flex-1 md:w-2/3 bg-slate-100 animate-pulse" />
        <div className="hidden md:block w-1/3 bg-slate-50 p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
