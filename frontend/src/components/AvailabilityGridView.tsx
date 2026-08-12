import React from "react";
import { AvailabilitySlot } from "@/types/coach";

// กริดตารางเวลาว่างแบบดูอย่างเดียว (read-only) — ใช้ซ้ำได้ทั้งหน้าโค้ชและ modal ฝั่ง admin
// แสดงช่องที่ว่างเป็นแท่ง pill สีแดงต่อเนื่อง (ช่องที่ติดกันเชื่อมเป็นแท่งเดียว)

const DAYS: { value: string; label: string }[] = [
  { value: "Sunday", label: "SUN" },
  { value: "Monday", label: "MON" },
  { value: "Tuesday", label: "TUE" },
  { value: "Wednesday", label: "WED" },
  { value: "Thursday", label: "THU" },
  { value: "Friday", label: "FRI" },
  { value: "Saturday", label: "SAT" },
];

const START_HOUR = 8;
const END_HOUR = 24;
const HOURS: number[] = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

const pad2 = (n: number) => String(n).padStart(2, "0");
const cellKey = (day: string, hour: number) => `${day}|${hour}`;

const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const slotsToSelected = (list: AvailabilitySlot[]): Set<string> => {
  const set = new Set<string>();
  for (const item of list) {
    const start = timeToMinutes(item.start_time);
    const end = timeToMinutes(item.end_time);
    for (const h of HOURS) {
      if (start < (h + 1) * 60 && end > h * 60) set.add(cellKey(item.day_of_week, h));
    }
  }
  return set;
};

const GRID_TEMPLATE_COLUMNS = `72px repeat(${HOURS.length}, minmax(40px, 1fr))`;

export default function AvailabilityGridView({ slots }: { slots: AvailabilitySlot[] }) {
  const selected = slotsToSelected(slots);

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          {/* หัวตาราง */}
          <div className="grid bg-slate-50 border-b border-slate-200" style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}>
            <div className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">DAY</div>
            {HOURS.map((h) => (
              <div key={h} className="py-2.5 text-center text-[9px] font-bold text-slate-500">
                {pad2(h)}-{pad2(h + 1)}
              </div>
            ))}
          </div>

          {/* แถวแต่ละวัน */}
          {DAYS.map((day, dayIdx) => (
            <div
              key={day.value}
              className={`grid items-center ${dayIdx !== DAYS.length - 1 ? "border-b border-slate-100" : ""}`}
              style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
            >
              <div className="py-1 px-3 text-[11px] font-extrabold text-slate-700">{day.label}</div>

              {HOURS.map((h) => {
                const isSel = selected.has(cellKey(day.value, h));
                const prevSel = h > START_HOUR && selected.has(cellKey(day.value, h - 1));
                const nextSel = h < END_HOUR - 1 && selected.has(cellKey(day.value, h + 1));
                const roundLeft = isSel && !prevSel;
                const roundRight = isSel && !nextSel;

                return (
                  <div
                    key={h}
                    title={isSel ? `${day.label} ${pad2(h)}:00-${pad2(h + 1)}:00` : undefined}
                    className={`h-8 flex items-center ${roundLeft ? "pl-1" : ""} ${roundRight ? "pr-1" : ""}`}
                  >
                    {isSel && (
                      <div
                        className={`h-6 w-full bg-gradient-to-r from-[#E63946] to-[#CD0D13] ${roundLeft ? "rounded-l-full" : ""} ${
                          roundRight ? "rounded-r-full" : ""
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
