import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // สร้าง output แบบ standalone สำหรับ Docker (ได้ .next/standalone/server.js
  // ที่รวม dependency เท่าที่จำเป็น ทำให้ image เล็กลงมากและรันด้วย `node server.js` ได้เลย)
  output: "standalone",
};

export default nextConfig;
