'use client';

// 1. ประกาศบอก TypeScript ว่า คอมโพเนนต์นี้จะรับอะไรเข้ามาบ้าง
interface ResetPasswordProps {
  userData: any;
  onNext: (data?: any) => void;
  onBack: () => void;
}

// 2. ใส่ Type กำกับไว้ที่ตัวแปรรับค่า (Props) ตรงนี้
export default function ResetPassword({ userData, onNext, onBack }: ResetPasswordProps) {
  return (
    <div>
      {/* โค้ดปุ่มหรืออินพุตของคุณ */}
      <button type="button" onClick={() => onNext({ email: 'test@email.com' })}>
        ถัดไป
      </button>
    </div>
  );
}