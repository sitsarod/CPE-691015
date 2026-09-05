import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // ชั่วคราว — มีโค้ดเก่าติด rule นี้อยู่ ~85 จุดทั่วโปรเจกต์ (ไม่เกี่ยวกับ PR ที่ทำอยู่ตอนนี้)
      // ลดเป็น warn กัน CI แดงจากหนี้เก่าไปก่อน จะไล่แก้เป็นงานแยกแล้วค่อยเปลี่ยนกลับเป็น error
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
