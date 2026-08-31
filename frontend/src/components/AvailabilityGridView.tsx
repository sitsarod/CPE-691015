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
// บนมือถือใช้ตารางแบบสลับแกน: แถว = ชั่วโมง, คอลัมน์ = 7 วัน (พอดีจอ ไม่ต้องเลื่อนแนวนอน)
const MOBILE_GRID_COLUMNS = `44px repeat(${DAYS.length}, minmax(0, 1fr))`;

export default function AvailabilityGridView({ slots }: { slots: AvailabilitySlot[] }) {
  const selected = slotsToSelected(slots);

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      {/* เดสก์ท็อป (md+): แถว = วัน, คอลัมน์ = ชั่วโมง */}
      <div className="hidden md:block overflow-x-auto">
        <div className="min-w-[820px]">
          {/* หัวตาราง — เลขเวลาอยู่ที่เส้นแบ่งชั่วโมง (หมุด) + หมุดปิดท้าย 24:00 */}
          <div className="flex bg-slate-50 border-b border-slate-200">
            <div className="w-[72px] shrink-0 py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">DAY</div>
            <div className="relative flex-1">
              {Array.from({ length: HOURS.length + 1 }, (_, i) => {
                const hour = START_HOUR + i;
                const transform =
                  i === 0 ? "translateY(-50%)" : i === HOURS.length ? "translate(-100%,-50%)" : "translate(-50%,-50%)";
                return (
                  <span
                    key={hour}
                    className="absolute top-1/2 text-[9px] font-bold text-slate-400 tabular-nums whitespace-nowrap"
                    style={{ left: `${(i / HOURS.length) * 100}%`, transform }}
                  >
                    {hour}:00
                  </span>
                );
              })}
            </div>
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

      {/* มือถือ (< md): สลับแกน — แถว = ชั่วโมง, คอลัมน์ = วัน */}
      <div className="md:hidden">
        {/* หัวตาราง */}
        <div className="grid bg-slate-50 border-b border-slate-200" style={{ gridTemplateColumns: MOBILE_GRID_COLUMNS }}>
          <div className="py-2.5 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">TIME</div>
          {DAYS.map((day) => (
            <div key={day.value} className="py-2.5 text-center text-[10px] font-bold text-slate-500">
              {day.label}
            </div>
          ))}
        </div>

        {/* แถวแต่ละชั่วโมง */}
        {HOURS.map((h, hIdx) => (
          <div
            key={h}
            className={`grid items-stretch ${hIdx !== HOURS.length - 1 ? "border-b border-slate-100" : ""}`}
            style={{ gridTemplateColumns: MOBILE_GRID_COLUMNS }}
          >
            <div className="py-1 px-2 flex items-center text-[11px] font-bold text-slate-600">{h}:00</div>

            {DAYS.map((day) => {
              const isSel = selected.has(cellKey(day.value, h));
              const prevSel = h > START_HOUR && selected.has(cellKey(day.value, h - 1));
              const nextSel = h < END_HOUR - 1 && selected.has(cellKey(day.value, h + 1));
              const roundTop = isSel && !prevSel;
              const roundBottom = isSel && !nextSel;

              return (
                <div
                  key={day.value}
                  title={isSel ? `${day.label} ${pad2(h)}:00-${pad2(h + 1)}:00` : undefined}
                  className={`flex justify-center h-8 ${roundTop ? "pt-1" : ""} ${roundBottom ? "pb-1" : ""}`}
                >
                  {isSel && (
                    <div
                      className={`w-6 h-full bg-gradient-to-b from-[#E63946] to-[#CD0D13] ${
                        roundTop ? "rounded-t-full" : ""
                      } ${roundBottom ? "rounded-b-full" : ""}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
