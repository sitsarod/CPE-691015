import Navbar from "../components/Navbar";

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      
      {/* 1. เรียกใช้งาน Navbar ตรงส่วนหัว */}
      <Navbar />

      {/* 2. พื้นที่สำหรับใส่รูป (Hero Image) */}
      <main className="w-full flex-1">
        {/* กล่องสีเทา */}
        <div className="w-full h-[600px] bg-[#d9d9d9] flex items-center justify-center">
          <span className="text-3xl text-black font-medium">ใส่รูป</span>
        </div>
      </main>

    </div>
  );
}