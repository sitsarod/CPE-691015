// AnnouncementDetailSkeleton — โครงหน้ารายละเอียดประกาศระหว่างรอโหลด
// ตามคอนเวนชัน Sk + animate-pulse

function Sk({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200/70 rounded ${className}`} />;
}

export default function AnnouncementDetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse px-4 py-8">
      <Sk className="mb-6 h-5 w-24" />
      <Sk className="mb-4 h-9 w-3/4" />
      <div className="mb-6 flex gap-4">
        <Sk className="h-4 w-28" />
        <Sk className="h-4 w-20" />
      </div>
      <Sk className="mb-6 aspect-[16/9] w-full rounded-2xl" />
      <div className="space-y-3">
        <Sk className="h-4 w-full" />
        <Sk className="h-4 w-full" />
        <Sk className="h-4 w-5/6" />
        <Sk className="h-4 w-2/3" />
      </div>
    </div>
  );
}
