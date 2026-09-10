"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Loader2, Lock, RefreshCw } from "lucide-react";

import { fetchClassHeadcounts } from "@/services/classConfirmationAPI";
import type { ClassHeadcount } from "@/types/classConfirmation";
import { dayLabel } from "@/components/course/courseUtils";
import ClassRosterModal, { type ClassRosterTarget } from "./ClassRosterModal";
import { SectionHeader } from "./dashParts";

/** ยอดคนที่ยืนยันจะมาเรียนในแต่ละคาบของวันนี้ */

const TH_MONTH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

// แปลงเอง ไม่ผ่าน new Date() — เป็นวันตามปฏิทิน ไม่ใช่จุดเวลา
function formatClassDate(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  if (!m || !d) return ymd;
  return `${d} ${TH_MONTH[m - 1] ?? ""}`;
}

export default function ClassHeadcountPanel() {
  const [items, setItems] = useState<ClassHeadcount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // คาบที่กำลังเปิดดูรายชื่ออยู่ — null = ปิด modal
  const [target, setTarget] = useState<ClassRosterTarget | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await fetchClassHeadcounts());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ไม่สามารถดึงยอดได้");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // backend ส่งเฉพาะคาบของวันนี้ จึงอ่านวันจากแถวแรกได้เลย
  const header = items.length > 0
    ? `${dayLabel(items[0].day_of_week)} ${formatClassDate(items[0].class_date)}`
    : null;

  // จับกลุ่มตามคอร์ส — คอร์สเดียวมีได้หลายแพ็กเกจคนละเวลาในวันเดียวกัน
  // เรียงตามลำดับที่ backend ส่งมา ไม่จัดเรียงใหม่ จะได้ไม่มีสองที่ที่ตัดสินลำดับ
  const courses: { courseId: number; courseName: string; periods: ClassHeadcount[] }[] = [];
  for (const it of items) {
    const found = courses.find((g) => g.courseId === it.course_id);
    if (found) found.periods.push(it);
    else courses.push({ courseId: it.course_id, courseName: it.course_name, periods: [it] });
  }

  return (
    <section>
      <SectionHeader
        title="ยอดคนมาเรียนวันนี้"
        meta={header ?? undefined}
        right={
          <button
            type="button"
            onClick={load}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-[#CC0000] hover:text-[#CC0000] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            รีเฟรช
          </button>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {isLoading && items.length === 0 && (
        <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด…
        </div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <p className="py-3 text-sm text-gray-500">วันนี้ไม่มีคาบเรียน</p>
      )}

      {items.length > 0 && (
        // ให้ตารางเลื่อนในกล่องตัวเอง ไม่ให้ทั้งหน้าเลื่อนแนวนอน
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-2 pr-3 font-semibold">คาบเรียน</th>
                <th className="py-2 px-2 text-center font-semibold">มา</th>
                <th className="py-2 pl-2 text-center font-semibold">ยังไม่ตอบ</th>
              </tr>
            </thead>
            {/* หนึ่งคอร์ส = หนึ่ง tbody หัวข้อกินเต็มแถว
                คอลัมน์ตัวเลขจึงตรงแนวกันทุกคอร์ส ต่างจากแยกเป็นตารางย่อย */}
            {courses.map((g) => (
              <tbody key={g.courseId} className="border-b border-gray-200 last:border-0">
                <tr>
                  <th
                    colSpan={3}
                    scope="colgroup"
                    className="px-3 py-2.5 text-left text-sm font-medium text-[#CC0000]"
                  >
                    {g.courseName}
                  </th>
                </tr>

                {g.periods.map((r) => (
                  // กดที่แถวเพื่อดูรายชื่อ — <tr> ไม่ใช่ปุ่ม จึงต้องใส่ tabIndex
                  // กับ onKeyDown เอง ไม่งั้นคนที่ใช้คีย์บอร์ดโฟกัสไม่ได้เลย
                  <tr
                    key={`${r.package_id}-${r.class_date}-${r.start_time}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`ดูรายชื่อ ${g.courseName} ${r.start_time}–${r.end_time}`}
                    onClick={() =>
                      setTarget({
                        packageId: r.package_id,
                        classDate: r.class_date,
                        startTime: r.start_time,
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setTarget({
                          packageId: r.package_id,
                          classDate: r.class_date,
                          startTime: r.start_time,
                        });
                      }
                    }}
                    className="cursor-pointer border-t border-gray-100 transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#CC0000]"
                  >
                    <td className="py-2 pr-3 pl-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-800">
                          {r.start_time}–{r.end_time}
                        </span>
                        {r.is_closed && (
                          <Lock
                            className="h-3 w-3 shrink-0 text-gray-400"
                            aria-label="ปิดรับคำตอบแล้ว"
                          />
                        )}
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                      </div>
                      <span className="text-xs text-gray-500">
                        ทั้งหมด {r.total} คน
                      </span>
                    </td>
                    <td className="px-2 text-center text-lg font-semibold text-emerald-600 tabular-nums">
                      {r.going}
                    </td>
                    <td className="pl-2 text-center text-lg font-semibold text-amber-600 tabular-nums">
                      {r.pending}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      <ClassRosterModal target={target} onClose={() => setTarget(null)} />
    </section>
  );
}
