"use client";

import { useState } from "react";
import { Plus, Trash2, Save, Clock, Calendar, Loader2 } from "lucide-react";
import { createCourse, createPackage } from "@/services/courseAPI";
import CourseImageField from "./CourseImageField";
import { ScheduleFormInput, PackageFormInput } from "@/types/course";

export default function CreateCourseForm({ onSuccess }: { onSuccess: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [courseName, setCourseName] = useState("");
  const [description, setDescription] = useState("");
  const [learningOutcomes, setLearningOutcomes] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [packages, setPackages] = useState<PackageFormInput[]>([
    { id: Date.now().toString(), sessions_count: "", hours_count: "", max_seats: "", price: "", duration_days: "", schedules: [] }
  ]);

  const addPackage = () => setPackages([...packages, { id: Date.now().toString(), sessions_count: "", hours_count: "", max_seats: "", price: "", duration_days: "", schedules: [] }]);
  
  const removePackage = (pkgId: string) => setPackages(packages.filter((pkg) => pkg.id !== pkgId));
  
  const updatePackage = (pkgId: string, field: keyof PackageFormInput, value: string | number) => {
    setPackages(packages.map(pkg => pkg.id === pkgId ? { ...pkg, [field]: value } : pkg));
  };

  // แพ็กเกจทดลองบังคับ 1 ครั้ง ราคา 0 (backend บังคับซ้ำอีกชั้น)
  const setTrial = (pkgId: string, checked: boolean) => {
    setPackages(packages.map(pkg => pkg.id === pkgId ? { ...pkg, is_trial: checked, ...(checked ? { sessions_count: 1, price: 0 } : {}) } : pkg));
  };

  const addSchedule = (pkgId: string) => {
    setPackages(packages.map(pkg => pkg.id === pkgId ? { ...pkg, schedules: [...pkg.schedules, { id: Date.now().toString(), day_of_week: "Monday", start_time: "18:00", end_time: "20:00" }] } : pkg));
  };
  
  const removeSchedule = (pkgId: string, schId: string) => {
    setPackages(packages.map(pkg => pkg.id === pkgId ? { ...pkg, schedules: pkg.schedules.filter(sch => sch.id !== schId) } : pkg));
  };
  
  const updateSchedule = (pkgId: string, schId: string, field: keyof ScheduleFormInput, value: string) => {
    setPackages(packages.map(pkg => pkg.id === pkgId ? { ...pkg, schedules: pkg.schedules.map(sch => sch.id === schId ? { ...sch, [field]: value } : sch) } : pkg));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const token = localStorage.getItem("token");

    if (!token) {
      setError("ไม่พบข้อมูลการยืนยันตัวตน กรุณาเข้าสู่ระบบใหม่");
      setIsLoading(false);
      return;
    }

    try {
      // Step 1: สร้างคอร์ส (เจ้าของคอร์สกำหนดจาก JWT ที่ฝั่ง backend)
      const newCourse = await createCourse({
        course_name: courseName,
        description: description,
        status: "active",
        image_url: imageUrl,
        learning_outcomes: learningOutcomes
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line !== ""),
      }, token);

      // Step 2: สร้างแพ็กเกจของคอร์สนี้
      if (newCourse && newCourse.id) {
        for (const pkg of packages) {
          await createPackage({
            course_id: newCourse.id, // ใช้ ID ของคอร์สที่เพิ่งสร้าง
            sessions_count: Number(pkg.sessions_count),
            hours_count: Number(pkg.hours_count),
            max_seats: Number(pkg.max_seats),
            price: Number(pkg.price),
            is_trial: !!pkg.is_trial,
            ...(pkg.duration_days !== "" ? { duration_days: Number(pkg.duration_days) } : {}),
            schedules: pkg.schedules.map(s => ({
              day_of_week: s.day_of_week,
              start_time: s.start_time,
              end_time: s.end_time
            }))
          }, token);
        }
      }
      
      alert("สร้างคอร์สและแพ็กเกจสำเร็จ!");
      onSuccess(); // กลับไปหน้า List
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ไม่สามารถสร้างคอร์สได้ โปรดลองอีกครั้ง");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-in fade-in duration-300">
      {error && <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 border border-red-200">{error}</div>}

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-l-4 border-[#CC0000] pl-3">ข้อมูลพื้นฐาน</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อคอร์ส <span className="text-red-500">*</span></label>
            <input 
              type="text" required value={courseName} onChange={(e) => setCourseName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-200 focus:border-[#CC0000] outline-none"
              placeholder="เช่น คอร์ส VIP นักกีฬา"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">รายละเอียด <span className="text-red-500">*</span></label>
            <textarea
              required value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 h-24 focus:ring-2 focus:ring-red-200 focus:border-[#CC0000] outline-none"
              placeholder="อธิบายภาพรวมของคอร์ส เหมาะกับใคร เน้นเรื่องอะไร"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              สิ่งที่จะได้เรียนรู้
            </label>
            <p className="text-xs text-gray-500 mb-2">
              พิมพ์บรรทัดละ 1 ข้อ — จะแสดงเป็นรายการติ๊กถูกในหน้าคอร์สและหน้าสมัครเรียน
            </p>
            <textarea
              value={learningOutcomes}
              onChange={(e) => setLearningOutcomes(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 h-40 focus:ring-2 focus:ring-red-200 focus:border-[#CC0000] outline-none font-mono text-sm"
              placeholder={"การจับไม้และการวางท่าทางพื้นฐานที่ถูกต้อง\nฟุตเวิร์กพื้นฐาน การเคลื่อนที่เข้าออก 6 จุดในสนาม\nลูกตบ (Smash) และการรับลูกตบเบื้องต้น"}
            />
          </div>

          <CourseImageField value={imageUrl} onChange={setImageUrl} />
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 border-l-4 border-[#CC0000] pl-3">แพ็กเกจการเรียน</h2>
          <button 
            type="button" onClick={addPackage}
            className="flex items-center text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4 mr-1" /> เพิ่มแพ็กเกจ
          </button>
        </div>

        <div className="space-y-6">
          {packages.map((pkg, index) => (
            <div key={pkg.id} className="bg-gray-50 p-6 rounded-xl border border-gray-200 relative shadow-sm">
              {packages.length > 1 && (
                <button 
                  type="button" onClick={() => removePackage(pkg.id)}
                  className="absolute top-4 right-4 text-red-500 hover:bg-red-100 p-2 rounded-full transition-colors"
                  title="ลบแพ็กเกจ"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}

              <h3 className="font-bold text-gray-900 mb-4">แพ็กเกจที่ {index + 1}</h3>

              <label className="mb-4 flex w-fit cursor-pointer flex-wrap items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox" checked={!!pkg.is_trial} onChange={(e) => setTrial(pkg.id, e.target.checked)}
                  className="h-4 w-4 accent-[#CC0000]"
                />
                แพ็กเกจทดลองเรียนฟรี
                <span className="text-xs font-normal text-gray-400">(1 ครั้ง · ราคา 0 บาท · สมัครได้ครั้งเดียวต่อคนต่อคอร์ส)</span>
              </label>
              
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">จำนวนครั้ง (Sessions) <span className="text-red-500">*</span></label>
                  <input 
                    type="number" required min="1" disabled={!!pkg.is_trial} value={pkg.sessions_count} onChange={(e) => updatePackage(pkg.id, "sessions_count", e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-[#CC0000]" placeholder="เช่น 8"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">จำนวนชั่วโมงรวม <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Clock className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                    <input 
                      type="number" required min="1" value={pkg.hours_count} onChange={(e) => updatePackage(pkg.id, "hours_count", e.target.value)}
                      className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 outline-none focus:border-[#CC0000]" placeholder="เช่น 16"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">ที่นั่งสูงสุด <span className="text-red-500">*</span></label>
                  <input 
                    type="number" required min="1" value={pkg.max_seats} onChange={(e) => updatePackage(pkg.id, "max_seats", e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-[#CC0000]" placeholder="เช่น 10"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">ราคา (บาท) <span className="text-red-500">*</span></label>
                  <input
                    type="number" required min="0" disabled={!!pkg.is_trial} value={pkg.price} onChange={(e) => updatePackage(pkg.id, "price", e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-[#CC0000]" placeholder="เช่น 2000"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">อายุสิทธิ์ (วัน)</label>
                  <input
                    type="number" min="1" max="366" value={pkg.duration_days}
                    onChange={(e) => updatePackage(pkg.id, "duration_days", e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-[#CC0000]" placeholder="เว้นว่าง = 30"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    นับจากวันที่เริ่มเรียน · 1 เดือน = 30
                  </p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-bold text-gray-700 flex items-center">
                    <Calendar className="w-4 h-4 mr-2" /> ตารางเรียน
                  </span>
                  <button 
                    type="button" onClick={() => addSchedule(pkg.id)}
                    className="text-xs text-[#CC0000] font-bold hover:bg-red-50 px-2 py-1 rounded flex items-center"
                  >
                    <Plus className="w-3 h-3 mr-1" /> เพิ่มวันเรียน
                  </button>
                </div>

                {pkg.schedules.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-4 bg-gray-50 rounded border border-dashed border-gray-300">ยังไม่ได้ระบุตารางเรียน</p>
                ) : (
                  <div className="space-y-3">
                    {pkg.schedules.map((sch) => (
                      <div key={sch.id} className="flex flex-wrap md:flex-nowrap items-center gap-3 bg-gray-50 p-2 rounded-md border border-gray-100">
                        <select 
                          value={sch.day_of_week} onChange={(e) => updateSchedule(pkg.id, sch.id, "day_of_week", e.target.value)}
                          className="flex-1 border border-gray-300 rounded p-1.5 text-sm outline-none focus:border-[#CC0000]"
                        >
                          <option value="Monday">วันจันทร์</option>
                          <option value="Tuesday">วันอังคาร</option>
                          <option value="Wednesday">วันพุธ</option>
                          <option value="Thursday">วันพฤหัสบดี</option>
                          <option value="Friday">วันศุกร์</option>
                          <option value="Saturday">วันเสาร์</option>
                          <option value="Sunday">วันอาทิตย์</option>
                        </select>
                        <div className="flex items-center gap-2">
                          <input 
                            type="time" required value={sch.start_time} onChange={(e) => updateSchedule(pkg.id, sch.id, "start_time", e.target.value)}
                            className="border border-gray-300 rounded p-1.5 text-sm outline-none focus:border-[#CC0000]"
                          />
                          <span className="text-gray-500 font-bold">-</span>
                          <input 
                            type="time" required value={sch.end_time} onChange={(e) => updateSchedule(pkg.id, sch.id, "end_time", e.target.value)}
                            className="border border-gray-300 rounded p-1.5 text-sm outline-none focus:border-[#CC0000]"
                          />
                        </div>
                        <button type="button" onClick={() => removeSchedule(pkg.id, sch.id)} className="text-red-500 hover:text-red-700 hover:bg-red-100 p-1.5 rounded" title="ลบเวลานี้">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-[calc(60px+env(safe-area-inset-bottom))] z-40 flex justify-end border-t border-gray-200 bg-white/95 py-4 backdrop-blur md:bottom-0">
        <button 
          type="submit" disabled={isLoading}
          className="flex items-center justify-center w-full md:w-auto bg-[#CC0000] text-white font-bold px-8 py-3 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
          {isLoading ? "กำลังบันทึก..." : "บันทึกคอร์สใหม่"}
        </button>
      </div>
    </form>
  );
}