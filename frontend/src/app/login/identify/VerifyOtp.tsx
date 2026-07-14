'use client';
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation"; 
import Button from "@/components/Button";

interface VerifyOtpProps {
  userData: any;
  onNext: (data?: any) => void;
  onBack: () => void;
}

export default function VerifyOtp({ userData, onNext, onBack }: VerifyOtpProps) {
    const router = useRouter(); 
  const [showPassword, setShowPassword] = useState(false);
  
 
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState(""); 
  const [isLoading, setIsLoading] = useState(false);

 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setIsLoading(true);

    try {

      const response = await fetch("http://localhost:8000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Email: email,       
          Password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
      
        throw new Error(data.error || "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      }


      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.user.role);
      localStorage.setItem("user_id", data.user.id.toString());
      localStorage.setItem("user_name", data.user.firstName);
      localStorage.setItem("user_email", data.user.email);


      if (data.user.role === "admin") {
        router.push("/admin/dashboard");
      } else if (data.user.role === "coach") {
        router.push("/coach/dashboard");
      } else {
        router.push("/customer/dashboard");
      }
      
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-gray-50 flex items-center justify-center p-4 md:p-8">
            <div className="bg-white w-full max-w-3xl p-8 md:p-12 rounded-3xl shadow-md">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">ยืนยัน OTP</h1>
                <p className="text-sm text-gray-500 mb-8">เราส่งรหัสไปที่อีเมลของคุณ ป้อนรหัสดังกล่าวเพื่อยืนยันบัญชีของคุณ</p>
                <form className="flex flex-col w-full gap-y-5 text-left">
                    <div className="w-full flex flex-col space-y-1.5">
                        <label className="text-sm font-semibold text-gray-700">รหัส OTP</label>
                        <input type="text" placeholder="ป้อนรหัส OTP" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base" />
                    </div>
                </form>

                    
                <div className="flex justify-end space-x-3 w-full mt-6 pt-4 border-t border-gray-100">
                    <Button onClick={() => onNext({ email: 'test@email.com' })} variant="secondary" type="submit">
                        ดำเนินการต่อ
                    </Button>
                </div>
            </div>
        </div>
  );
}