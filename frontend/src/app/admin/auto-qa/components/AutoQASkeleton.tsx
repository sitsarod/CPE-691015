// AutoQASkeleton — โครงการ์ด Q&A ระหว่างรอโหลดข้อมูล (ตามคอนเวนชัน Sk + animate-pulse)

function Sk({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200/70 rounded ${className}`} />;
}

export default function AutoQASkeleton() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <Sk className="h-9 w-9 shrink-0 rounded-lg" />
            <Sk className="mt-1 h-5 w-3/4" />
          </div>
          <div className="flex gap-1.5">
            <Sk className="h-6 w-16 rounded-full" />
            <Sk className="h-6 w-20 rounded-full" />
          </div>
          <div className="space-y-2 rounded-xl bg-gray-50 p-3">
            <Sk className="h-3 w-full" />
            <Sk className="h-3 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}
