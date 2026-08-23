"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Save, Clock, Calendar, Loader2, X } from "lucide-react";
import { fetchCourseByIDAdmin, updateCourse, createPackage, updatePackage, deletePackage } from "@/services/courseAPI";
import CourseImageField from "./CourseImageField";
import { ScheduleFormInput, PackageFormInput, CoursePackageDTO, PackageScheduleInfoDTO } from "@/types/course";

export default function EditCourseForm({ courseId, onSuccess, onCancel }: { courseId: number, onSuccess: () => void, onCancel: () => void }) {
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [courseName, setCourseName] = useState("");
  const [description, setDescription] = useState("");
  const [learningOutcomes, setLearningOutcomes] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [status, setStatus] = useState("active");
  const [packages, setPackages] = useState<PackageFormInput[]>([]);
  const [initialPackageIds, setInitialPackageIds] = useState<string[]>([]);

  useEffect(() => {
    const loadCourse = async () => {
      try {
        const token = localStorage.getItem("token") || "";
        const data = await fetchCourseByIDAdmin(courseId, token);
        setCourseName(data.course_name);
        setDescription(data.description);
        setLearningOutcomes((data.learning_outcomes ?? []).join("\n"));
        setImageUrl(data.image_url ?? "");
        setStatus(data.status);
        
        const loadedPackages = (data.packages || []).map((pkg: CoursePackageDTO) => ({
          id: pkg.id?.toString(),
          isNew: false,
          sessions_count: pkg.sessions_count,
          hours_count: pkg.hours_count,
          max_seats: pkg.max_seats ?? ("" as const),
          price: pkg.price,
          duration_days: pkg.duration_days ?? ("" as const),
          schedules: (pkg.schedules || []).map((sch: PackageScheduleInfoDTO, i: number) => ({
            id: `sch-${i}-${Date.now()}`,
            day_of_week: sch.day_of_week,
            start_time: sch.start_time,
            end_time: sch.end_time
          }))
        }));

        setPackages(loadedPackages);
        setInitialPackageIds(loadedPackages.map((p) => p.id));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "ดึงข้อมูลคอร์สเรียนไม่สำเร็จ");
      } finally {
        setIsFetching(false);
      }
    };
    loadCourse();
  }, [courseId]);

  const addPackage = () => setPackages([...packages, { id: `temp-${Date.now()}`, isNew: true, sessions_count: "", hours_count: "", max_seats: "", price: "", duration_days: "", schedules: [] }]);
  
  const removePackage = (pkgId: string) => setPackages(packages.filter((pkg) => pkg.id !== pkgId));
  
  const updatePackageField = (pkgId: string, field: keyof PackageFormInput, value: string | number | boolean) => {
    setPackages(packages.map(pkg => pkg.id === pkgId ? { ...pkg, [field]: value } : pkg));
  };

  const addSchedule = (pkgId: string) => {
    setPackages(packages.map(pkg => pkg.id === pkgId ? { ...pkg, schedules: [...pkg.schedules, { id: `sch-temp-${Date.now()}`, day_of_week: "Monday", start_time: "18:00", end_time: "20:00" }] } : pkg));
  };
  
  const removeSchedule = (pkgId: string, schId: string) => {
    setPackages(packages.map(pkg => pkg.id === pkgId ? { ...pkg, schedules: pkg.schedules.filter(sch => sch.id !== schId) } : pkg));
  };
  
  const updateSchedule = (pkgId: string, schId: string, field: keyof ScheduleFormInput, value: string) => {
    setPackages(packages.map(pkg => pkg.id === pkgId ? { ...pkg, schedules: pkg.schedules.map(sch => sch.id === schId ? { ...sch, [field]: value } : sch) } : pkg));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const token = localStorage.getItem("token");
    if (!token) {
      setError("ไม่พบข้อมูลการยืนยันตัวตน กรุณาเข้าสู่ระบบใหม่");
      setIsSaving(false);
      return;
    }

    try {
      // 1. Update Course details
      await updateCourse(courseId, {
        course_name: courseName,
        description: description,
        status: status,
        image_url: imageUrl,
        learning_outcomes: learningOutcomes
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line !== ""),
      }, token);

      // 2. Manage Packages (Delete removed, Update existing, Create new)
      const currentPackageIds = packages.filter(p => !p.isNew).map(p => p.id);
      const deletedPackageIds = initialPackageIds.filter(id => !currentPackageIds.includes(id));

      // Delete packages
      for (const id of deletedPackageIds) {
        await deletePackage(Number(id), token);
      }

      // Create / Update packages
      for (const pkg of packages) {
        const schedulesDto = pkg.schedules.map(s => ({
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time
        }));

        const durationField =
          pkg.duration_days !== "" ? { duration_days: Number(pkg.duration_days) } : {};

        if (pkg.isNew) {
          await createPackage({
            course_id: courseId,
            sessions_count: Number(pkg.sessions_count),
            hours_count: Number(pkg.hours_count),
            max_seats: Number(pkg.max_seats),
            price: Number(pkg.price),
            ...durationField,
            schedules: schedulesDto
          }, token);
        } else {
          await updatePackage(Number(pkg.id), {
            sessions_count: Number(pkg.sessions_count),
            hours_count: Number(pkg.hours_count),
            max_seats: Number(pkg.max_seats),
            price: Number(pkg.price),
            ...durationField,
            schedules: schedulesDto
          }, token);
        }
      }
      
      alert("บันทึกการแก้ไขคอร์สสำเร็จ!");
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ไม่สามารถอัปเดตข้อมูลคอร์สได้ โปรดลองอีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  };

  if (isFetching) {
    return <div className="py-20 flex flex-col items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#CC0000] mb-2" /><p className="text-gray-500">กำลังโหลดข้อมูล...</p></div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-in fade-in duration-300">
      <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
        <h2 className="text-xl font-black text-gray-900">แก้ไขข้อมูลคอร์ส</h2>
        <button type="button" onClick={onCancel} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 border border-red-200">{error}</div>}

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4 border-l-4 border-[#CC0000] pl-3">ข้อมูลพื้นฐาน</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อคอร์ส <span className="text-red-500">*</span></label>
            <input 
              type="text" required value={courseName} onChange={(e) => setCourseName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-200 focus:border-[#CC0000] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">รายละเอียด <span className="text-red-500">*</span></label>
            <textarea
              required value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 h-24 focus:ring-2 focus:ring-red-200 focus:border-[#CC0000] outline-none"
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
              placeholder={"การจับไม้และการวางท่าทางพื้นฐานที่ถูกต้อง\nฟุตเวิร์กพื้นฐาน การเคลื่อนที่เข้าออก 6 จุดในสนาม"}
            />
          </div>

          <CourseImageField value={imageUrl} onChange={setImageUrl} />
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">สถานะ</label>
            <select 
              value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full md:w-1/3 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-200 focus:border-[#CC0000] outline-none"
            >
              <option value="active">เปิดสอน (Active)</option>
              <option value="inactive">ปิดชั่วคราว (Inactive)</option>
            </select>
          </div>
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
              <button 
                type="button" onClick={() => removePackage(pkg.id)}
                className="absolute top-4 right-4 text-red-500 hover:bg-red-100 p-2 rounded-full transition-colors"
                title="ลบแพ็กเกจ"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              <h3 className="font-bold text-gray-900 mb-4">แพ็กเกจที่ {index + 1} {pkg.isNew && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded ml-2">ใหม่</span>}</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">จำนวนครั้ง (Sessions) <span className="text-red-500">*</span></label>
                  <input 
                    type="number" required min="1" value={pkg.sessions_count} onChange={(e) => updatePackageField(pkg.id, "sessions_count", e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-[#CC0000]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">จำนวนชั่วโมงรวม <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Clock className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                    <input 
                      type="number" required min="1" value={pkg.hours_count} onChange={(e) => updatePackageField(pkg.id, "hours_count", e.target.value)}
                      className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 outline-none focus:border-[#CC0000]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">ที่นั่งสูงสุด <span className="text-red-500">*</span></label>
                  <input 
                    type="number" required min="1" value={pkg.max_seats} onChange={(e) => updatePackageField(pkg.id, "max_seats", e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-[#CC0000]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">ราคา (บาท) <span className="text-red-500">*</span></label>
                  <input
                    type="number" required min="0" value={pkg.price} onChange={(e) => updatePackageField(pkg.id, "price", e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-[#CC0000]"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">อายุสิทธิ์ (วัน)</label>
                  <input
                    type="number" min="1" max="366" value={pkg.duration_days}
                    onChange={(e) => updatePackageField(pkg.id, "duration_days", e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-[#CC0000]" placeholder="เว้นว่าง = คงเดิม"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    มีผลกับผู้สมัครใหม่เท่านั้น
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

      <div className="flex justify-end pt-6 border-t border-gray-200 gap-3">
        <button 
          type="button" onClick={onCancel} disabled={isSaving}
          className="px-6 py-3 rounded-lg text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors font-bold disabled:opacity-50"
        >
          ยกเลิก
        </button>
        <button 
          type="submit" disabled={isSaving}
          className="flex items-center justify-center bg-[#CC0000] text-white font-bold px-8 py-3 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
          {isSaving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
        </button>
      </div>
    </form>
  );
}
