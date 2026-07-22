"use client";

import { useState } from "react";
import { List, PlusCircle } from "lucide-react";
import CourseListView from "./components/CourseListView";
import CreateCourseForm from "./components/CreateCourseForm";
import EditCourseForm from "./components/EditCourseForm";

export default function AdminCoursesPage() {
  const [activeTab, setActiveTab] = useState<"list" | "create" | "edit">("list");
  const [editingCourseId, setEditingCourseId] = useState<number | null>(null);

  const handleEdit = (id: number) => {
    setEditingCourseId(id);
    setActiveTab("edit");
  };

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900">จัดการคอร์สเรียน (Courses)</h1>
        <p className="text-gray-500 mt-2">ดูรายการคอร์สทั้งหมด หรือเพิ่มคอร์สใหม่</p>
      </div>

      {/* ---------------- Tab Bar ---------------- */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab("list")}
          className={`flex items-center px-6 py-3 font-bold text-sm transition-colors ${
            activeTab === "list"
              ? "border-b-2 border-[#CC0000] text-[#CC0000]"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}
        >
          <List className="w-4 h-4 mr-2" />
          คอร์สทั้งหมด
        </button>
        <button
          onClick={() => setActiveTab("create")}
          className={`flex items-center px-6 py-3 font-bold text-sm transition-colors ${
            activeTab === "create"
              ? "border-b-2 border-[#CC0000] text-[#CC0000]"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          สร้างคอร์สใหม่
        </button>
      </div>

      {/* ---------------- Tab Content ---------------- */}
      <div className="mt-6 w-full">
        {activeTab === "list" && <CourseListView onEdit={handleEdit} />}
        
        {activeTab === "create" && <CreateCourseForm onSuccess={() => setActiveTab("list")} />}
        
        {activeTab === "edit" && editingCourseId && (
          <EditCourseForm 
            courseId={editingCourseId} 
            onSuccess={() => {
              setEditingCourseId(null);
              setActiveTab("list");
            }} 
            onCancel={() => {
              setEditingCourseId(null);
              setActiveTab("list");
            }}
          />
        )}
      </div>
    </div>
  );
}