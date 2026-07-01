"use client";

import Button from "../components/Button";

export default function Home() {

  return (
    <div className="pb-16">
      
      {/* HERO SECTION */}
      <section className="py-16 px-6 max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-12">
        <div className="w-full md:w-1/2 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight mb-6">
            ยกระดับทักษะ <br/><span className="text-green-600">แบดมินตัน</span> ของคุณ
          </h1>
          <p className="text-lg text-slate-600 mb-8 max-w-lg mx-auto md:mx-0">
            ระบบจัดการโรงเรียนสอนแบดมินตันที่ทันสมัย ลงทะเบียนง่าย จัดตารางเรียนสะดวก
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
            <Button variant="secondary" href="/register" className="px-8 py-3.5 text-lg">
              เริ่มต้นใช้งาน
            </Button>
          </div>
        </div>
        
      </section>


    </div>
  );
}