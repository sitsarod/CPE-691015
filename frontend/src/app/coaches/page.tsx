interface Coach {
  id: number;
  name: string;
  specialty: string;
}

// ฟังก์ชันดึงข้อมูลจาก Go Backend ฝั่ง Server
async function getCoaches(): Promise<Coach[]> {
  const res = await fetch('http://localhost:8080/api/coaches', {
    cache: 'no-store', // ปิด Cache เพื่อดึงข้อมูลใหม่เสมอ
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch coaches');
  }
  
  return res.json();
}

export default async function CoachesPage() {
  const coaches = await getCoaches();

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">รายชื่อผู้ฝึกสอน (Coaches)</h1>
      <div className="grid gap-4">
        {coaches.map((coach) => (
          <div key={coach.id} className="p-4 border rounded-lg shadow-sm bg-white">
            <h2 className="text-xl font-semibold">{coach.name}</h2>
            <p className="text-gray-600">ความเชี่ยวชาญ: {coach.specialty}</p>
          </div>
        ))}
      </div>
    </main>
  );
}