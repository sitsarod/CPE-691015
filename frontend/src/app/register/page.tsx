'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function RegisterPage() {
  // 1. สร้าง State สำหรับเก็บข้อมูลในฟอร์ม
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 2. ฟังก์ชันอัปเดตค่าเมื่อผู้ใช้พิมพ์
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // 3. ฟังก์ชันจัดการเมื่อกด Submit ฟอร์ม
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validation เบื้องต้น
    if (formData.password !== formData.confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง');
      return;
    }

    setLoading(true);

    try {
      // TODO: ยิง API ไปยัง Backend ของคุณ เช่น /api/register
      // const res = await fetch('/api/register', { method: 'POST', body: JSON.stringify(formData) })
      
      console.log('ส่งข้อมูลสมัครสมาชิก:', formData);
      
      // จำลองการรอโหลด 2 วินาที
      await new Promise((resolve) => setTimeout(resolve, 2000));
      alert('สมัครสมาชิกสำเร็จ!');
      
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการสมัครสมาชิก');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          สร้างบัญชีใหม่ของคุณ
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          หรือ{' '}
          <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            เข้าสู่ระบบหากมีบัญชีอยู่แล้ว
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          
          {/* แสดงข้อความ Error ถ้ามี */}
          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* ชื่อ-นามสกุล */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                ชื่อ - นามสกุล
              </label>
              <div className="mt-1">
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="สมชาย ใจดี"
                />
              </div>
            </div>

            {/* อีเมล */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                อีเมล
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* รหัสผ่าน */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                รหัสผ่าน
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* ยืนยันรหัสผ่าน */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                ยืนยันรหัสผ่าน
              </label>
              <div className="mt-1">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* ยอมรับเงื่อนไข */}
            <div className="flex items-center">
              <input
                id="acceptTerms"
                name="acceptTerms"
                type="checkbox"
                required
                checked={formData.acceptTerms}
                onChange={handleChange}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label htmlFor="acceptTerms" className="ml-2 block text-sm text-gray-900">
                ฉันยอมรับ{' '}
                <Link href="/terms" className="text-indigo-600 hover:text-indigo-500 underline">
                  เงื่อนไขการให้บริการ
                </Link>
              </label>
            </div>

            {/* ปุ่มสมัครสมาชิกพร้อมสถานะ Loading */}
            <div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                  loading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {loading ? 'กำลังประมวลผล...' : 'สมัครสมาชิก'}
              </button>
            </div>
          </form>

          {/* ปุ่มสมัครผ่าน Social */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">หรือสมัครใช้งานด้วย</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => alert('เชื่อมต่อ Google Sign-In ตรงนี้')}
                className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                <span>Google</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}