import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full bg-white h-24 flex items-center px-4 md:px-12 border-b border-gray-100">
      <div className="w-full flex justify-between items-center">
        {/* โลโก้ฝั่งซ้าย */}
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="Koyama Badminton School Logo"
            width={220}
            height={60}
            className="object-contain w-auto h-auto"
            priority
          />
        </Link>

        {/* เมนูฝั่งขวา */}
        <div className="hidden md:flex items-center gap-8 text-black text-lg font-medium">
          <Link href="/#coaches" className="text-black hover:text-red-600 transition-colors">
            บุคลากร
          </Link>
          <Link href="/#courses" className="text-black hover:text-red-600 transition-colors">
            คอร์สเรียน
          </Link>
          <Link href="/#about" className="text-black hover:text-red-600 transition-colors">
            เกี่ยวกับฉัน
          </Link>

          {/* เส้นกั้นแนวตั้ง */}
          <div className="h-6 w-px bg-gray-400 mx-2"></div>

          <Link href="/login" className="hover:text-red-600 transition-colors">เข้าสู่ระบบ</Link>
        </div>

      </div>
    </nav>
  );
}