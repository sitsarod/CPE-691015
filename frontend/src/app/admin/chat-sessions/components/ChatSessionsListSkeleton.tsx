// ChatSessionsListSkeleton — โครงรายการห้องแชท (คอลัมน์ซ้าย) ระหว่างรอโหลด
// ตามคอนเวนชัน Sk + animate-pulse

function Sk({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200/70 rounded ${className}`} />;
}

export default function ChatSessionsListSkeleton() {
  return (
    <div className="animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-gray-50 px-3 py-3">
          <Sk className="h-12 w-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Sk className="h-4 w-28" />
              <Sk className="h-3 w-14" />
            </div>
            <Sk className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}
