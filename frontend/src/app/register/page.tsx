'use client';

import { useState } from 'react';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
  });

  return (
    // คลุมพื้นที่แบบแยกอิสระ ตัดปัญหาโดนดึงสไตล์จาก Navbar และ Slider ด้วยการล็อก flex ทิศทาง column
    <div className="w-full min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center p-4 md:p-8 font-sans">
      
      {/* การ์ดสีขาวโครงหลัก (Main Card) บีบขนาดกว้างตรงกลาง ไม่แผ่หลุดขอบจอ */}
      <div className="w-full max-w-[1000px] bg-white rounded-3xl shadow-sm px-8 sm:px-16 py-12">
        
        {/* ปุ่มย้อนกลับ < */}
        <div className="mb-6">
          <button type="button" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        </div>

        {/* ชื่อแบรนด์ */}
        <h1 className="text-3xl font-bold text-[#3B82F6] mb-10 tracking-wide">
          KOYAMA
        </h1>

        {/* columns-2 จะหั่นครึ่งซ้ายขวาให้อัตโนมัติ และใช้ gap-x-8 เพื่อเว้นระยะห่างตรงกลาง */}
        <form className="w-full text-left">
          {/* ใช้ตารางแท้ๆ ล็อกโครงสร้างซ้าย-ขวา */}
          <table className="w-full border-separate border-spacing-x-8 border-spacing-y-6">
            <tbody>
              
              {/* แถวที่ 1: ชื่อ และ นามสกุล */}
              <tr>
                <td className="w-1/2 p-0 vertical-align-top">
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">ชื่อ</label>
                    <input type="text" placeholder="ชื่อจริง" className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white" />
                  </div>
                </td>
                <td className="w-1/2 p-0 vertical-align-top">
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">นามสกุล</label>
                    <input type="text" placeholder="นามสกุล" className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white" />
                  </div>
                </td>
              </tr>

              {/* แถวที่ 2 */}
              <tr>
                <td className="p-0"><input type="text" className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white" /></td>
                <td className="p-0"><input type="text" className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white" /></td>
              </tr>

              {/* แถวที่ 3 */}
              <tr>
                <td className="p-0"><input type="text" className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white" /></td>
                <td className="p-0"><input type="text" className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white" /></td>
              </tr>

              {/* แถวที่ 4 */}
              <tr>
                <td className="p-0"><input type="text" className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white" /></td>
                <td className="p-0"><input type="text" className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white" /></td>
              </tr>

              {/* แถวที่ 5 (ช่องเดี่ยวฝั่งซ้าย) */}
              <tr>
                <td className="p-0"><input type="text" className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white" /></td>
                <td className="p-0"></td> {/* ปล่อยฝั่งขวาว่างไว้ */}
              </tr>

            </tbody>
          </table>
        </form>

        {/* ปุ่มกดยกเลิก - สร้างบัญชีใหม่ */}
        <div className="flex justify-end space-x-4 mt-12 w-full">
          <button 
            type="button" 
            className="px-8 py-2.5 border border-gray-300 rounded-full text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors min-w-[120px] text-center"
          >
            ยกเลิก
          </button>
          <button 
            type="submit" 
            className="px-8 py-2.5 bg-[#3B82F6] text-white rounded-full text-sm font-medium hover:bg-blue-600 transition-colors min-w-[140px] text-center shadow-sm"
          >
            สร้างบัญชีใหม่
          </button>
        </div>

      </div>
    </div>
  );
}