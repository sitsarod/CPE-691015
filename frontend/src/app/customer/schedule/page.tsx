"use client";

import { useState, useEffect } from "react";
import { Loader2, Calendar, BookOpen, AlertCircle, Clock, CalendarX } from "lucide-react";
import { fetchCustomerEnrollments } from "@/services/enrollmentAPI";
import type { ScheduleInfo, FormattedEnrollment } from "@/types/enrollment";

// สีประจำวันตามคติไทย (จันทร์เหลือง อังคารชมพู พุธเขียว ...) — เก็บความหมายไว้
// แต่ใช้เป็นสีเน้นเล็ก ๆ ไม่ใช่ทาเต็มช่อง เพราะเจ็ดสีเข้มตีกับสีบล็อกคอร์สอีกหกสี
//
//   dot  = สีเข้ม ใช้กับแถบ/จุดเล็ก ๆ
//   tint = สีอ่อนมาก ใช้เป็นพื้นหลังช่องวัน
const DAYS = [
  { key: 'Monday',    label: 'จันทร์',    dot: 'bg-yellow-600', tint: 'bg-yellow-200' },
  { key: 'Tuesday',   label: 'อังคาร',    dot: 'bg-pink-600',   tint: 'bg-pink-200' },
  { key: 'Wednesday', label: 'พุธ',       dot: 'bg-green-700',  tint: 'bg-green-200' },
  { key: 'Thursday',  label: 'พฤหัสบดี',  dot: 'bg-orange-600', tint: 'bg-orange-200' },
  { key: 'Friday',    label: 'ศุกร์',     dot: 'bg-sky-600',    tint: 'bg-sky-200' },
  { key: 'Saturday',  label: 'เสาร์',     dot: 'bg-purple-700', tint: 'bg-purple-200' },
  { key: 'Sunday',    label: 'อาทิตย์',   dot: 'bg-red-700',    tint: 'bg-red-200' },
];

const COURSE_COLORS = [
  "bg-blue-100 border-blue-200 text-blue-900 hover:bg-blue-200",
  "bg-purple-100 border-purple-200 text-purple-900 hover:bg-purple-200",
  "bg-orange-100 border-orange-200 text-orange-900 hover:bg-orange-200",
  "bg-emerald-100 border-emerald-200 text-emerald-900 hover:bg-emerald-200",
  "bg-pink-100 border-pink-200 text-pink-900 hover:bg-pink-200",
  "bg-cyan-100 border-cyan-200 text-cyan-900 hover:bg-cyan-200",
];



const parseTime = (timeStr: string) => {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours + (minutes / 60);
};

// assignLanes จัดเลนให้คาบที่เวลาทับกันในวันเดียวกัน
//
// บล็อกคาบฝั่งเดสก์ท็อปวางด้วย absolute ตามเวลาเริ่ม-จบ ถ้าผู้เรียนลงสองคอร์ส
// ที่เรียนวันและเวลาเดียวกัน บล็อกจะทับกันสนิทจนเห็นแค่ใบบนสุด ใบล่างหายเงียบ ๆ
// แยกเลนแล้วซอยความสูงตามจำนวนเลนจึงเห็นครบทุกใบ
//
// ต้องส่งรายการที่เรียงตามเวลาเริ่มมาแล้ว (scheduleByDay จัดให้)
function assignLanes<T extends { start_time: string; end_time: string }>(classes: T[]) {
  // เวลาสิ้นสุดล่าสุดของแต่ละเลน — ใช้ตัดสินว่าเลนไหนว่างพอรับคาบถัดไป
  const laneEndsAt: number[] = [];

  const laned = classes.map((cls) => {
    const start = parseTime(cls.start_time);
    const end = parseTime(cls.end_time);

    let lane = laneEndsAt.findIndex((endsAt) => endsAt <= start);
    if (lane === -1) lane = laneEndsAt.length;

    laneEndsAt[lane] = end;
    return { cls, lane };
  });

  return { laned, laneCount: Math.max(1, laneEndsAt.length) };
}

const formatTimeLabel = (hour: number) => {
  return `${hour.toString().padStart(2, '0')}:00`;
};

function StatusBadge({ status }: { status: string }) {
  const base = "px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap";

  if (status === 'active')
    return <span className={`${base} bg-green-100 text-green-700 border-green-200`}>กำลังเรียน</span>;
  if (status === 'pending')
    return <span className={`${base} bg-yellow-100 text-yellow-700 border-yellow-200`}>รออนุมัติ</span>;
  if (status === 'completed')
    return <span className={`${base} bg-gray-100 text-gray-600 border-gray-200`}>เรียนจบแล้ว</span>;

  return null;
}

export default function CustomerSchedulePage() {
  const [enrollments, setEnrollments] = useState<FormattedEnrollment[]>([]);
  /** จำนวนคอร์สที่ครบกำหนดแล้ว — ใช้อธิบายว่าทำไมคอร์สหายจากตาราง */
  const [expiredCount, setExpiredCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSchedule = async () => {
      try {
        setIsLoading(true);
        const token = localStorage.getItem("token");
        const customerId = localStorage.getItem("customer_id") || localStorage.getItem("user_id");

        if (!token || !customerId) {
          setError("กรุณาเข้าสู่ระบบเพื่อดูตารางเรียน");
          setIsLoading(false);
          return;
        }

        const data = await fetchCustomerEnrollments(customerId, token);
        const displayEnrollments = data.filter(e => e.status === "active");
        setExpiredCount(data.filter(e => e.status === "expired").length);

        const formatted: FormattedEnrollment[] = displayEnrollments.map((enrollment) => {
          const schedules = enrollment.package?.schedules || [];
          
          let unifiedTime = "";
          if (schedules.length > 0) {
            const firstTime = `${schedules[0].start_time} - ${schedules[0].end_time}`;
            const allSameTime = schedules.every((sch: ScheduleInfo) => `${sch.start_time} - ${sch.end_time}` === firstTime);
            if (allSameTime) unifiedTime = `${firstTime} น.`;
          }

          return {
            id: enrollment.id,
            courseName: enrollment.package?.course?.course_name || "ไม่ระบุคอร์ส",
            sessionsCount: enrollment.package?.sessions_count || 0,
            totalSessions: enrollment.total_sessions,
            remainingSessions: enrollment.remaining_sessions,
            // backend คำนวณมาให้แล้ว (กัน underflow ของ uint กรณี remaining > total)
            attendedSessions: enrollment.attended_sessions,
            status: enrollment.status,
            schedules: schedules,
            unifiedTime
          };
        });

        setEnrollments(formatted);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดตารางเรียน");
      } finally {
        setIsLoading(false);
      }
    };

    loadSchedule();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-[#CC0000]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 flex items-center shadow-sm">
          <AlertCircle className="w-5 h-5 mr-3" />
          <span className="font-medium">{error}</span>
        </div>
      </div>
    );
  }

  // Calculate dynamic grid time range
  let minHour = 9;
  let maxHour = 18;
  const allSchedules = enrollments.flatMap(e => e.schedules);
  
  if (allSchedules.length > 0) {
    const startTimes = allSchedules.map(s => parseTime(s.start_time));
    const endTimes = allSchedules.map(s => parseTime(s.end_time));
    minHour = Math.floor(Math.min(...startTimes));
    maxHour = Math.ceil(Math.max(...endTimes));
  }
  
  // Ensure minimum visual space
  if (maxHour - minHour < 5) maxHour = minHour + 5;
  // Padding hour for visuals
  if (minHour > 6) minHour -= 1;
  if (maxHour < 22) maxHour += 1;

  const totalHours = maxHour - minHour;
  const timeSlots = Array.from({ length: totalHours + 1 }, (_, i) => minHour + i);

  // คำนวณครั้งเดียวแล้วใช้ทั้งสองมุมมอง — ของเดิมคำนวณอยู่ในลูปของตารางแกนเวลา
  // สีผูกกับชื่อคอร์ส ไม่ใช่เลขใบ — ใบเดิมกับใบที่สมัครต่อของคอร์สเดียวกันต้องเป็นสีเดียวกัน
  const courseColorIndex = new Map<string, number>();
  enrollments.forEach((e) => {
    if (!courseColorIndex.has(e.courseName)) courseColorIndex.set(e.courseName, courseColorIndex.size);
  });
  const colorOf = (courseName: string) =>
    COURSE_COLORS[(courseColorIndex.get(courseName) ?? 0) % COURSE_COLORS.length];

  // บล็อกที่รวมหลายใบของคอร์สเดียวกัน ต้องบอกให้ครบว่ามาจากแพ็กเกจไหนบ้าง
  const packageLabel = (dayKey: string, cls: ScheduleInfo & { course: FormattedEnrollment }) => {
    const counts = enrollments
      .filter(
        (e) =>
          e.courseName === cls.course.courseName &&
          e.schedules.some(
            (s) =>
              s.day_of_week === dayKey &&
              s.start_time === cls.start_time &&
              s.end_time === cls.end_time
          )
      )
      .map((e) => e.sessionsCount);
    const unique = [...new Set(counts)].sort((a, b) => a - b);
    return unique.length > 0 ? `แพ็กเกจ ${unique.join(", ")} ครั้ง` : "";
  };

  const scheduleByDay = DAYS.map((day) => {
    const classes = enrollments
      .flatMap((course) =>
        course.schedules
          .filter((s) => s.day_of_week === day.key)
          .map((s) => ({ ...s, course }))
      )
      // มีหลายใบของคอร์สเดียวกัน (เช่นใบเดิมกับใบที่สมัครต่อ) คาบเดียวกันต้องเป็นบล็อกเดียว
      .filter(
        (cls, i, all) =>
          all.findIndex(
            (o) =>
              o.course.courseName === cls.course.courseName &&
              o.start_time === cls.start_time &&
              o.end_time === cls.end_time
          ) === i
      )
      .sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time));

    return { ...day, classes, ...assignLanes(classes) };
  });

  const daysWithClasses = scheduleByDay.filter((d) => d.classes.length > 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24 sm:space-y-8">
      {expiredCount > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <CalendarX className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
          <div className="text-sm leading-relaxed text-slate-700">
            <span className="font-bold">
              มีคอร์สที่ครบกำหนดระยะเวลาแล้ว {expiredCount} คอร์ส
            </span>
            <span className="text-slate-500">
              {" "}
              จึงไม่แสดงในตารางเรียนนี้ — สมัครแพ็กเกจใหม่ได้ที่หน้าคอร์สของฉัน
            </span>
          </div>
        </div>
      )}

      {/* 1. Summary Table Section (Top) */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-4 sm:px-6">
          <h2 className="text-base font-bold text-gray-900 sm:text-lg">
            สรุปข้อมูลคอร์สเรียนของคุณ
          </h2>
        </div>
        
        {enrollments.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            คุณยังไม่มีคอร์สเรียนในขณะนี้
          </div>
        ) : (
          <>
            {/* มือถือ: การ์ดต่อคอร์ส — สี่คอลัมน์ไม่ลงจอแคบ และการเลื่อนตาราง
                ซ้ายขวาทำให้ชื่อคอร์สหลุดออกนอกจอตอนอ่านตัวเลขทางขวา */}
            <div className="divide-y divide-gray-100 md:hidden">
              {enrollments.map((course) => (
                <div key={course.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 h-10 w-2 shrink-0 rounded-full ${
                        colorOf(course.courseName).split(' ')[0]
                      }`}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-gray-900">{course.courseName}</p>
                      {course.unifiedTime && (
                        <p className="mt-0.5 flex items-center text-xs text-gray-500">
                          <Clock className="mr-1 h-3 w-3 shrink-0" />
                          {course.unifiedTime}
                        </p>
                      )}
                    </div>

                    <StatusBadge status={course.status} />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-sm">
                    <span className="text-gray-500">
                      แพ็กเกจ{" "}
                      <span className="font-medium text-gray-700">
                        {course.sessionsCount} ครั้ง
                      </span>
                    </span>

                    <span className="text-right">
                      <span className="font-bold text-gray-900">
                        <span className="text-[#CC0000]">{course.attendedSessions}</span> /{" "}
                        {course.totalSessions}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        เหลือ {course.remainingSessions}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* จอกว้าง: ตาราง — table-fixed กันคอลัมน์ยืดตามชื่อคอร์สจนล้นออกนอกกรอบ */}
            <table className="hidden w-full table-fixed text-left border-collapse md:table">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-sm text-gray-600">
                  <th className="p-4 font-bold">ชื่อรายวิชา / คอร์ส</th>
                  <th className="w-28 p-4 font-bold text-center">แพ็กเกจ</th>
                  <th className="w-32 p-4 font-bold text-center">สถานะ</th>
                  <th className="w-44 p-4 font-bold text-center">จำนวนครั้ง (เรียน/เหลือ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {enrollments.map((course) => (
                  <tr key={course.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-10 shrink-0 rounded-full ${colorOf(course.courseName).split(' ')[0]}`}></div>
                        <div className="min-w-0">
                          <div className="truncate font-bold text-gray-900 text-lg">{course.courseName}</div>
                          {course.unifiedTime && (
                            <div className="text-xs text-gray-500 flex items-center mt-1">
                              <Clock className="w-3 h-3 mr-1 shrink-0" />
                              เวลา: {course.unifiedTime}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center font-medium text-gray-700">
                      {course.sessionsCount} ครั้ง
                    </td>
                    <td className="p-4 text-center">
                      <StatusBadge status={course.status} />
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col items-center">
                        <div className="font-bold text-gray-900">
                          <span className="text-[#CC0000] text-lg">{course.attendedSessions}</span> / {course.totalSessions}
                        </div>
                        <div className="text-xs text-gray-500">เหลือ {course.remainingSessions} ครั้ง</div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* 2. Timetable Grid Section (Bottom) */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-4 sm:px-6">
          <h2 className="text-base font-bold text-gray-900 sm:text-lg">
            ตารางเรียนประจำสัปดาห์
          </h2>
        </div>

        <div className="p-4 md:p-5">
          {/* มือถือ: ไล่เป็นรายวัน ไม่ใช่ตาราง
              ตารางแกนเวลาฝั่งเดสก์ท็อปต้องกว้างขั้นต่ำ 800px จอมือถือให้ไม่ได้
              และการยุบเป็นตารางช่องเวลาก็ยังพังเมื่อผู้เรียนลงหลายคอร์สคนละเวลา
              เพราะคอลัมน์จะเพิ่มตามจำนวนช่วงเวลาจนต้องเลื่อนซ้ายขวาอยู่ดี

              รายการรายวันไม่มีเพดานนั้น จะกี่คอร์สกี่เวลาก็ต่อลงมาข้างล่างได้เรื่อย ๆ
              แสดงเฉพาะวันที่มีคาบจริง เพราะไล่ครบเจ็ดวันแล้วเขียน "ไม่มีคาบ" ห้าวัน
              คือเลื่อนยาวโดยไม่ได้ข้อมูลอะไร */}
          <div className="space-y-3 md:hidden">
            {daysWithClasses.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                ยังไม่มีคาบเรียนในสัปดาห์นี้
              </p>
            ) : (
              daysWithClasses.map((day) => (
                <div
                  key={`m-${day.key}`}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white"
                >
                  <div
                    className={`flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 ${day.tint}`}
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${day.dot}`} />
                    <span className="text-sm font-bold text-gray-800">{day.label}</span>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {day.classes.map((cls, idx) => (
                      <div key={`m-${day.key}-${idx}`} className="flex items-center gap-3 p-3">
                        <div
                          className={`h-9 w-1.5 shrink-0 rounded-full ${
                            colorOf(cls.course.courseName).split(' ')[0]
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-gray-900">
                            {cls.course.courseName}
                          </p>
                          <p className="mt-0.5 flex items-center text-xs text-gray-500">
                            <Clock className="mr-1 h-3 w-3 shrink-0" />
                            {cls.start_time} - {cls.end_time} น.
                            {packageLabel(day.key, cls) && ` · ${packageLabel(day.key, cls)}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
          <div className="relative min-w-[800px] overflow-hidden rounded-xl border border-gray-200 bg-white">

            {/* หัวตาราง: แกนเวลา
                แสดงแค่เวลาเริ่มของแต่ละช่อง — ของเดิมเขียน "08:00 - 09:00" เต็มช่วง
                ซ้ำกันสิบกว่าครั้งเรียงกันเป็นพรืด อ่านยากกว่าที่ควร */}
            <div className="flex border-b border-gray-200 text-gray-500">
              <div className="sticky left-0 z-30 flex w-[100px] flex-shrink-0 items-center justify-center border-r border-gray-200 bg-gray-50 text-xs font-bold text-gray-600">
                วัน / เวลา
              </div>
              <div className="relative flex flex-1">
                {timeSlots.slice(0, -1).map((hour, idx) => (
                  <div
                    key={hour}
                    className={`flex min-w-0 flex-1 items-center justify-center overflow-hidden border-r border-gray-100 py-2.5 text-xs font-semibold last:border-r-0 ${
                      idx % 2 === 1 ? 'bg-gray-50' : ''
                    }`}
                  >
                    {formatTimeLabel(hour)}
                  </div>
                ))}
              </div>
            </div>

            {/* Body: Days Axis */}
            <div className="flex flex-col">
              {scheduleByDay.map((day) => {
                const { laned, laneCount } = day;

                return (
                  <div key={day.key} className="group flex border-b border-gray-100 last:border-0">
                    {/* Day Label Cell */}
                    <div
                      className={`sticky left-0 z-20 flex w-[100px] flex-shrink-0 items-center justify-center border-r border-gray-200 py-4 text-sm font-bold text-gray-800 ${day.tint}`}
                    >
                      <span className={`absolute inset-y-0 left-0 w-1.5 ${day.dot}`} />
                      {day.label}
                    </div>

                    {/* Timeline Cell */}
                    <div className="flex-1 relative bg-white">
                      {/* Vertical grid lines (background) */}
                      <div className="absolute inset-0 flex">
                        {timeSlots.slice(0, -1).map((hour, idx) => (
                          <div
                            key={hour}
                            className={`h-full min-w-0 flex-1 border-r border-gray-100 last:border-r-0 ${
                              idx % 2 === 1 ? 'bg-gray-50/70' : ''
                            }`}
                          />
                        ))}
                      </div>

                      {/* Class Blocks */}
                      {/* แถวสูงตามจำนวนเลน — สองคอร์สเวลาเดียวกันต้องมีที่ยืนคนละครึ่ง */}
                      <div
                        className="relative w-full"
                        style={{ height: Math.max(80, laneCount * 56) }}
                      >
                        {laned.map(({ cls, lane }, idx) => {
                          const startDec = parseTime(cls.start_time);
                          const endDec = parseTime(cls.end_time);
                          
                          // Calculate position percentages
                          const leftPct = ((startDec - minHour) / totalHours) * 100;
                          const widthPct = ((endDec - startDec) / totalHours) * 100;

                          const laneTopPct = (lane / laneCount) * 100;
                          const laneHeightPct = (1 / laneCount) * 100;

                          const colorClass = colorOf(cls.course.courseName);

                          return (
                            <div 
                              key={`${day.key}-${idx}`}
                              className={`absolute z-10 flex flex-col items-center justify-center overflow-hidden rounded-md border p-1 transition-all ${colorClass}`}
                              style={{ 
                                left: `${leftPct}%`, 
                                width: `${widthPct}%`,
                                top: `calc(${laneTopPct}% + 4px)`,
                                height: `calc(${laneHeightPct}% - 8px)`,
                              }}
                            >
                              <span
                                title={cls.course.courseName}
                                className="w-full truncate text-center text-sm font-bold"
                              >
                                {cls.course.courseName}
                              </span>
                              <span
                                title={packageLabel(day.key, cls)}
                                className="text-[11px] font-semibold opacity-80 truncate w-full text-center mt-1"
                              >
                                {cls.start_time} - {cls.end_time}
                                {packageLabel(day.key, cls) && ` · ${packageLabel(day.key, cls)}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
          </div>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            * แสดงเฉพาะคอร์สที่ได้รับการอนุมัติแล้วเท่านั้น
          </p>
        </div>
      </div>
      
    </div>
  );
}
