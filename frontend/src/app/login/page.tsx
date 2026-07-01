"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white font-sans px-4 pb-32">
      
      {/* กล่อง Card ของฟอร์มล็อกอิน */}
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        
        {/* ส่วนหัว */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">เข้าสู่ระบบ</h2>
          <p className="text-gray-500">Koyama Badminton School</p>
        </div>

        {/* ฟอร์ม */}
        <form className="space-y-6">
          
          {/* ช่องกรอกอีเมล */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              อีเมล หรือ ชื่อผู้ใช้งาน
            </label>
            <input
              type="text"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none transition-all"
              placeholder="กรอกอีเมลของคุณ"
              required
            />
          </div>

          {/* ช่องกรอกรหัสผ่าน */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              รหัสผ่าน
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none transition-all"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? (
                  // ไอคอนตาเปิด (เมื่อกดโชว์รหัสผ่าน)
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ) : (
                  // ไอคอนตาปิดแบบขีดฆ่า (ค่าเริ่มต้นตอนรหัสถูกซ่อน)
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* จดจำฉันไว้ & ลืมรหัสผ่าน */}
          <div className="flex items-center justify-between">
            <label className="flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-600" 
              />
              <span className="ml-2 text-sm text-gray-600">จดจำฉันไว้</span>
            </label>
            <Link href="#" className="text-sm text-red-600 hover:underline">
              ลืมรหัสผ่าน?
            </Link>
          </div>

          {/* ปุ่ม Submit */}
          <button
            type="submit"
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-md shadow-red-600/30"
          >
            เข้าสู่ระบบ
          </button>
        </form>

        {/* ลิงก์กลับไปหน้าแรก หรือ ติดต่อสมัครเรียน */}
        <div className="mt-8 text-center text-sm text-gray-600 flex flex-col gap-2">
          <p>
            ยังไม่มีบัญชีใช่หรือไม่?{" "}
            <Link href="/register" className="text-red-600 hover:underline font-medium">
              สร้างบัญชีใหม่
            </Link>
          </p>
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors mt-2">
            กลับหน้าหลัก
          </Link>
        </div>

      </div>
    </div>
  );
}