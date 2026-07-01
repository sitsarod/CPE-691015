import HeroSlider from "../components/HeroSlider";

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      
      <main className="w-full">
        {/* สไลด์รูป */}
        <HeroSlider />
      </main>

      {/* 2. พื้นที่ส่วนบุคลากร */}
      <section id="coaches" className="w-full min-h-screen bg-white flex items-center justify-center border-t">
        <h2 className="text-4xl font-bold text-gray-800">บุคลากร (Coaches)</h2>
      </section>

      {/* 3. พื้นที่ส่วนคอร์สเรียน */}
      <section id="courses" className="w-full min-h-screen bg-gray-50 flex items-center justify-center border-t">
        <h2 className="text-4xl font-bold text-gray-800">คอร์สเรียน (Courses)</h2>
      </section>

      {/* 4. พื้นที่ส่วนเกี่ยวกับฉัน */}
      <section id="about" className="w-full min-h-screen bg-white flex items-center justify-center border-t">
        <h2 className="text-4xl font-bold text-gray-800">เกี่ยวกับฉัน (About)</h2>
      </section>

    </div>
  );
}