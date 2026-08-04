"use client";

import { useState, useEffect } from "react";
import { Loader2, Calendar, BookOpen, AlertCircle, Clock } from "lucide-react";
import { fetchCustomerEnrollments } from "@/services/enrollmentAPI";
import type { ScheduleInfo, FormattedEnrollment } from "@/types/enrollment";

const DAYS = [
  { key: 'Monday', label: 'จันทร์', color: 'bg-yellow-500', text: 'text-yellow-900' }, 
  { key: 'Tuesday', label: 'อังคาร', color: 'bg-pink-400', text: 'text-pink-900' },
  { key: 'Wednesday', label: 'พุธ', color: 'bg-green-500', text: 'text-green-900' },
  { key: 'Thursday', label: 'พฤหัสบดี', color: 'bg-orange-500', text: 'text-orange-900' },
  { key: 'Friday', label: 'ศุกร์', color: 'bg-blue-400', text: 'text-blue-900' },
  { key: 'Saturday', label: 'เสาร์', color: 'bg-purple-500', text: 'text-purple-900' },
  { key: 'Sunday', label: 'อาทิตย์', color: 'bg-red-500', text: 'text-red-900' },
];

const COURSE_COLORS = [
  "bg-blue-100 border-blue-200 text-blue-900 hover:bg-blue-200",
  "bg-purple-100 border-purple-200 text-purple-900 hover:bg-purple-200",
  "bg-orange-100 border-orange-200 text-orange-900 hover:bg-orange-200",
  "bg-emerald-100 border-emerald-200 text-emerald-900 hover:bg-emerald-200",
  "bg-pink-100 border-pink-200 text-pink-900 hover:bg-pink-200",
  "bg-cyan-100 border-cyan-200 text-cyan-900 hover:bg-cyan-200",
];

const getCourseColor = (id: number) => COURSE_COLORS[id % COURSE_COLORS.length];

const parseTime = (timeStr: string) => {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours + (minutes / 60);
};

const formatTimeLabel = (hour: number) => {
  return `${hour.toString().padStart(2, '0')}:00`;
};

export default function CustomerSchedulePage() {
  const [enrollments, setEnrollments] = useState<FormattedEnrollment[]>([]);
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

  return (
    <div className="w-full pb-24 space-y-8">
      {/* 1. Summary Table Section (Top) */}
      <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
        <div className="bg-[#CC0000] p-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-white/80" />
            สรุปข้อมูลคอร์สเรียนของคุณ
          </h2>
        </div>
        
        {enrollments.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            คุณยังไม่มีคอร์สเรียนในขณะนี้
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-sm text-gray-600">
                  <th className="p-4 font-bold">ชื่อรายวิชา / คอร์ส</th>
                  <th className="p-4 font-bold text-center">แพ็กเกจ</th>
                  <th className="p-4 font-bold text-center">สถานะ</th>
                  <th className="p-4 font-bold text-center">จำนวนครั้ง (เรียน/เหลือ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {enrollments.map((course) => (
                  <tr key={course.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-10 rounded-full ${COURSE_COLORS[course.id % COURSE_COLORS.length].split(' ')[0]}`}></div>
                        <div>
                          <div className="font-bold text-gray-900 text-lg">{course.courseName}</div>
                          {course.unifiedTime && (
                            <div className="text-xs text-gray-500 flex items-center mt-1">
                              <Clock className="w-3 h-3 mr-1" />
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
                      {course.status === 'active' && <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold border border-green-200">กำลังเรียน</span>}
                      {course.status === 'pending' && <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold border border-yellow-200">รออนุมัติ</span>}
                      {course.status === 'completed' && <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">เรียนจบแล้ว</span>}
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
          </div>
        )}
      </div>

      {/* 2. Timetable Grid Section (Bottom) */}
      <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden mt-8">
        <div className="bg-[#555] p-5 flex items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-white/80" />
            ตารางเรียนประจำสัปดาห์
          </h2>
        </div>

        <div className="overflow-x-auto p-4 md:p-6 bg-gray-50">
          <div className="min-w-[800px] border border-gray-200 bg-white shadow-sm rounded-xl overflow-hidden relative">
            
            {/* Header: Time Axis */}
            <div className="flex border-b border-gray-200 bg-gray-100 text-gray-700">
              <div className="w-[100px] flex-shrink-0 border-r border-gray-200 flex items-center justify-center font-bold text-sm bg-gray-200 text-gray-800">
                Day / Time
              </div>
              <div className="flex-1 relative flex">
                {timeSlots.slice(0, -1).map((hour) => (
                  <div key={hour} className="flex-1 flex flex-col justify-center items-center py-3 border-r border-gray-300 text-xs font-semibold tracking-wide">
                    {formatTimeLabel(hour)} - {formatTimeLabel(hour + 1)}
                  </div>
                ))}
              </div>
            </div>

            {/* Body: Days Axis */}
            <div className="flex flex-col">
              {DAYS.map((day) => {
                // Find all classes occurring on this day
                const dayClasses = enrollments.flatMap(course => 
                  course.schedules
                    .filter(s => s.day_of_week === day.key)
                    .map(s => ({ ...s, course }))
                );

                return (
                  <div key={day.key} className="flex border-b border-gray-200 last:border-0 group">
                    {/* Day Label Cell */}
                    <div className={`w-[100px] flex-shrink-0 ${day.color} border-r border-white flex flex-col items-center justify-center py-4 text-sm font-bold text-white shadow-inner`}>
                      {day.label}
                    </div>

                    {/* Timeline Cell */}
                    <div className="flex-1 relative bg-white">
                      {/* Vertical grid lines (background) */}
                      <div className="absolute inset-0 flex">
                        {timeSlots.slice(0, -1).map((hour) => (
                          <div key={hour} className="flex-1 border-r border-gray-100 border-dashed h-full"></div>
                        ))}
                      </div>

                      {/* Class Blocks */}
                      <div className="relative w-full h-[80px] min-h-full py-2">
                        {dayClasses.map((cls, idx) => {
                          const startDec = parseTime(cls.start_time);
                          const endDec = parseTime(cls.end_time);
                          
                          // Calculate position percentages
                          const leftPct = ((startDec - minHour) / totalHours) * 100;
                          const widthPct = ((endDec - startDec) / totalHours) * 100;
                          
                          const colorClass = getCourseColor(cls.course.id);

                          return (
                            <div 
                              key={`${day.key}-${idx}`}
                              className={`absolute top-2 bottom-2 rounded-lg border shadow-sm p-2 flex flex-col justify-center items-center overflow-hidden transition-all z-10 ${colorClass}`}
                              style={{ 
                                left: `${leftPct}%`, 
                                width: `${widthPct}%` 
                              }}
                            >
                              <span className="font-bold text-sm truncate w-full text-center">{cls.course.courseName}</span>
                              <span className="text-[11px] font-semibold opacity-80 truncate w-full text-center mt-1">
                                {cls.start_time} - {cls.end_time}
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
          
          <div className="mt-4 text-xs text-gray-500 font-medium">
            * ข้อมูลตารางเรียนแสดงผลเฉพาะคอร์สที่ได้รับการอนุมัติแล้วเท่านั้น
          </div>
        </div>
      </div>
      
    </div>
  );
}
