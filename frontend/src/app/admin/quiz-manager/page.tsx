"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Save, X, PlusCircle, CheckCircle2 } from "lucide-react";
import { 
  fetchAllQuestions, 
  createQuestion, 
  updateQuestion, 
  deleteQuestion, 
  addOption, 
  deleteOption 
} from "@/services/quizAPI";
import { fetchAllCourses } from "@/services/courseAPI";
import { QuizQuestion, QuizOption } from "@/types/quiz";
import { CourseDTO } from "@/types/course";

export default function QuizManagerPage() {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New Question State
  const [newQuestionText, setNewQuestionText] = useState("");

  // Options State
  const [addingOptionForId, setAddingOptionForId] = useState<number | null>(null);
  const [newOptionText, setNewOptionText] = useState("");
  const [newOptionCourseId, setNewOptionCourseId] = useState<string>("0");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token") || "";
      const [qData, cData] = await Promise.all([
        fetchAllQuestions(token),
        fetchAllCourses()
      ]);
      setQuestions(qData);
      setCourses(cData);
    } catch (err) {
      console.error(err);
      alert("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateQuestion = async () => {
    if (!newQuestionText.trim()) return;
    try {
      const token = localStorage.getItem("token") || "";
      await createQuestion({ 
        text: newQuestionText, 
        sequence: questions.length + 1, 
        is_active: true 
      }, token);
      setNewQuestionText("");
      loadData();
    } catch (err) {
      alert("Error creating question");
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    if (!confirm("ลบคำถามนี้พร้อมตัวเลือกทั้งหมด?")) return;
    try {
      const token = localStorage.getItem("token") || "";
      await deleteQuestion(id, token);
      loadData();
    } catch (err) {
      alert("Error deleting question");
    }
  };

  const handleToggleActive = async (q: QuizQuestion) => {
    try {
      const token = localStorage.getItem("token") || "";
      await updateQuestion(q.id, { is_active: !q.is_active }, token);
      loadData();
    } catch (err) {
      alert("Error updating question");
    }
  };

  const handleAddOption = async (questionId: number) => {
    if (!newOptionText.trim()) return;
    try {
      const token = localStorage.getItem("token") || "";
      const courseId = parseInt(newOptionCourseId);
      await addOption(questionId, { 
        text: newOptionText, 
        recommended_course_id: courseId > 0 ? courseId : null 
      }, token);
      
      setNewOptionText("");
      setNewOptionCourseId("0");
      setAddingOptionForId(null);
      loadData();
    } catch (err) {
      alert("Error adding option");
    }
  };

  const handleDeleteOption = async (optionId: number) => {
    try {
      const token = localStorage.getItem("token") || "";
      await deleteOption(optionId, token);
      loadData();
    } catch (err) {
      alert("Error deleting option");
    }
  };

  if (isLoading) {
    return <div className="p-8">กำลังโหลดข้อมูล...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">จัดการแบบสอบถามแนะนำคอร์ส</h1>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-8 flex gap-4">
        <input 
          type="text" 
          value={newQuestionText}
          onChange={(e) => setNewQuestionText(e.target.value)}
          placeholder="พิมพ์คำถามใหม่ที่นี่..." 
          className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#CC0000] focus:border-[#CC0000] outline-none"
        />
        <button 
          onClick={handleCreateQuestion}
          className="bg-[#CC0000] text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-red-700"
        >
          <Plus className="w-5 h-5" /> สร้างคำถาม
        </button>
      </div>

      <div className="space-y-6">
        {questions.length === 0 ? (
          <p className="text-gray-500 text-center py-10">ยังไม่มีคำถาม</p>
        ) : (
          questions.map((q, index) => (
            <div key={q.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <span className="w-8 h-8 rounded-full bg-[#CC0000] text-white flex items-center justify-center font-bold">
                    {index + 1}
                  </span>
                  <h3 className="text-lg font-bold text-gray-900">{q.text}</h3>
                  <button 
                    onClick={() => handleToggleActive(q)}
                    className={`px-3 py-1 text-xs font-bold rounded-full ${q.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}
                  >
                    {q.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                  </button>
                </div>
                <button onClick={() => handleDeleteQuestion(q.id)} className="text-red-500 p-2 hover:bg-red-50 rounded-lg">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                <h4 className="text-sm font-bold text-gray-700 mb-4">ตัวเลือก (Options)</h4>
                
                <div className="space-y-3 mb-4">
                  {q.options && q.options.map(opt => (
                    <div key={opt.id} className="flex justify-between items-center p-3 border border-gray-200 rounded-xl hover:bg-gray-50">
                      <div>
                        <span className="font-semibold text-gray-800">{opt.text}</span>
                        {opt.recommended_course_id ? (
                          <span className="ml-3 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-md font-bold">
                            ➔ แนะนำ: {courses.find(c => c.id === opt.recommended_course_id)?.course_name || 'ไม่พบคอร์ส'}
                          </span>
                        ) : (
                          <span className="ml-3 text-xs text-gray-400">- ไม่มีการผูกคอร์ส -</span>
                        )}
                      </div>
                      <button onClick={() => handleDeleteOption(opt.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {(!q.options || q.options.length === 0) && (
                    <p className="text-sm text-gray-400">ยังไม่มีตัวเลือกสำหรับคำถามนี้</p>
                  )}
                </div>

                {addingOptionForId === q.id ? (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200 mt-4">
                    <input 
                      type="text" 
                      value={newOptionText}
                      onChange={e => setNewOptionText(e.target.value)}
                      placeholder="ข้อความตัวเลือก..." 
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <select 
                      value={newOptionCourseId}
                      onChange={e => setNewOptionCourseId(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-w-[200px]"
                    >
                      <option value="0">-- ไม่โยงผลลัพธ์ --</option>
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.course_name}</option>
                      ))}
                    </select>
                    <button onClick={() => handleAddOption(q.id)} className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700">
                      <Save className="w-4 h-4" />
                    </button>
                    <button onClick={() => setAddingOptionForId(null)} className="text-gray-500 p-2 hover:bg-gray-200 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setAddingOptionForId(q.id)}
                    className="text-sm text-[#CC0000] font-bold flex items-center gap-1 hover:underline mt-2"
                  >
                    <PlusCircle className="w-4 h-4" /> เพิ่มตัวเลือก
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
