"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { uploadCourseImage } from "@/services/courseAPI";
import { IMAGE_ACCEPT, validateImageFile } from "@/utils/imageUpload";
import CourseCover from "@/components/course/CourseCover";

import { useGlobalToast } from "@/components/ToastProvider";
interface Props {
  value: string;
  onChange: (url: string) => void;
}

// ช่องเลือกรูปปกคอร์ส ใช้ร่วมกันทั้งฟอร์มสร้างและแก้ไข
//
// อัปโหลดทันทีที่เลือกไฟล์ ไม่รอตอนกดบันทึก — ไม่งั้นผู้ใช้ไม่เห็นว่ารูปขึ้นจริงไหม
export default function CourseImageField({ value, onChange }: Props) {
  const showToast = useGlobalToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handlePick = async (file: File) => {
    // ด่านแรกเท่านั้น — backend ตรวจซ้ำจากเนื้อไฟล์จริงอีกชั้น
    const problem = validateImageFile(file);
    if (problem) {
      showToast(problem, "error");
      return;
    }

    setIsUploading(true);
    try {
      onChange(await uploadCourseImage(file));
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ", "error");
    } finally {
      setIsUploading(false);
      // ล้างค่า input ไม่งั้นเลือกไฟล์เดิมซ้ำจะไม่เกิด onChange
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">
        รูปปกคอร์ส
      </label>
      <p className="text-xs text-gray-500 mb-2">
        ใช้แสดงในหน้ารายการคอร์สและหน้ารายละเอียด — แนะนำภาพแนวนอน ไม่เกิน 5 MB
      </p>

      {value ? (
        <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-gray-200">
          <CourseCover
            src={value}
            alt="รูปปกคอร์ส"
            className="aspect-[16/9] w-full bg-gray-50 object-cover"
          />

          <div className="flex gap-2 border-t border-gray-200 bg-gray-50 p-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              เปลี่ยนรูป
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={isUploading}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              ลบรูป
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="flex aspect-[16/9] w-full max-w-md flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 transition-colors hover:border-[#CC0000] hover:bg-red-50 hover:text-[#CC0000] disabled:opacity-50"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm font-semibold">กำลังอัปโหลด...</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-8 w-8" strokeWidth={1.5} />
              <span className="text-sm font-semibold">เลือกรูปปกคอร์ส</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handlePick(file);
        }}
      />
    </div>
  );
}
