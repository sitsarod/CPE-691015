"use client";

import React, { useEffect, useState } from "react";
import Button from "@/components/Button";
import { getUserProfileAPI, type UserProfileResponseDTO } from "@/services/userAPI";
import { fetchMyEvaluations } from "@/services/evaluationAPI";
import type { Evaluation } from "@/types/evaluation";
import { fetchMyPosts } from "@/services/postAPI";
import type { PostItem } from "@/types/post";
import PostMediaThumb from "@/components/PostMediaThumb";
import PostViewerModal from "@/components/PostViewerModal";
import { Grid2X2, ClipboardCheck, ImageOff, Info } from "lucide-react";


const ROLE_LABEL: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  coach: "โค้ช",
  customer: "ผู้เรียน",
};

function formatBirthDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

function genderLabel(value?: string) {
  if (value === "male") return "ชาย";
  if (value === "female") return "หญิง";
  return null;
}

// weekLabelOf คำนวณช่วงสัปดาห์ (จ.-อา.) ที่ timestamp นั้นตกอยู่ — ใช้จัดกลุ่มผลการประเมิน
// เป็นรายสัปดาห์สำหรับการ์ดเลื่อนแนวนอนบนมือถือ
function weekLabelOf(epochMs: number): string {
  const d = new Date(epochMs);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  return `${fmt(start)} - ${fmt(end)} ${(start.getFullYear() + 543).toString()}`;
}

interface EvaluationWeekRow {
  weekLabel: string;
  items: Evaluation[];
}

// groupEvaluationsByWeekRows จัดสัปดาห์ล่าสุดไว้บนสุด แต่ละสัปดาห์เป็น "แถว" ของตัวเอง
// (ไม่ใช่การ์ดเดียวยัดทุกครั้งไว้ด้วยกัน) — ภายในแถวเลื่อนนิ้วแนวนอนได้ถ้าสัปดาห์นั้นมีหลายครั้ง
// พอถึงสัปดาห์ใหม่ก็ขึ้นแถวใหม่ด้านบน แถวของสัปดาห์นี้จะถูกดันลงล่างไปเรื่อยตามเวลา
function groupEvaluationsByWeekRows(evaluations: Evaluation[]): EvaluationWeekRow[] {
  const byWeek = new Map<string, Evaluation[]>();
  for (const ev of evaluations) {
    const label = weekLabelOf(new Date(ev.created_at).getTime());
    const list = byWeek.get(label) ?? [];
    list.push(ev);
    byWeek.set(label, list);
  }

  return Array.from(byWeek.entries())
    .map(([weekLabel, items]) => ({
      weekLabel,
      items: [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    }))
    .sort((a, b) => new Date(b.items[0].created_at).getTime() - new Date(a.items[0].created_at).getTime());
}

// เนื้อหาผลการประเมิน 1 ครั้ง — ใช้ร่วมกันทั้งรายการแนวตั้ง (จอกว้าง) และการ์ดรายสัปดาห์ (มือถือ)
function EvaluationEntryContent({ ev }: { ev: Evaluation }) {
  return (
    <div>
      <p className="text-base font-bold text-gray-900">โค้ช {ev.coach_name || "ไม่ทราบชื่อ"}</p>
      <p className="text-sm text-gray-400">
        {new Date(ev.created_at).toLocaleDateString("th-TH", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>
      <p className="mt-3 text-base leading-relaxed text-gray-700 whitespace-pre-line">{ev.assessment}</p>
    </div>
  );
}

interface ProfileViewProps {
  /** ชื่อที่แสดงระหว่างยังไม่รู้ชื่อจริง */
  fallbackName?: string;
  /** ปลายทางปุ่ม Edit profile — ไม่ส่งมา = ไม่แสดงปุ่ม */
  editHref?: string;
  /** ปลายทางปุ่ม View QR Code — ไม่ส่งมา = ไม่แสดงปุ่ม */
  qrHref?: string;
}

export default function ProfileView({
  fallbackName = "ผู้ใช้งาน",
  editHref,
  qrHref,
}: ProfileViewProps) {
  const [profile, setProfile] = useState<UserProfileResponseDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"posts" | "evaluation">("posts");
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);

  // ปิดหน้าต่างดูโพสต์อัตโนมัติถ้าโพสต์ที่เหลือหมดไป (เช่นลบจนว่าง) ไม่งั้นเลื่อน index ให้อยู่ในขอบเขตเสมอ
  useEffect(() => {
    setViewingIndex((i) => {
      if (i === null) return null;
      if (posts.length === 0) return null;
      return Math.min(i, posts.length - 1);
    });
  }, [posts.length]);

  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      setError("ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่");
      setIsLoading(false);
      return;
    }

    getUserProfileAPI(Number(userId))
      .then(setProfile)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "ไม่สามารถดึงข้อมูลโปรไฟล์ได้"))
      .finally(() => setIsLoading(false));
  }, []);

  const isStudentRole = profile?.role === "customer" || Boolean(profile?.isStudent);

  useEffect(() => {
    if (!isStudentRole) return;
    setEvalLoading(true);
    setEvalError(null);
    fetchMyEvaluations()
      .then(setEvaluations)
      .catch((err: unknown) => setEvalError(err instanceof Error ? err.message : "ไม่สามารถดึงข้อมูลการประเมินได้"))
      .finally(() => setEvalLoading(false));
  }, [isStudentRole]);

  useEffect(() => {
    if (!isStudentRole) return;
    setPostsLoading(true);
    setPostsError(null);
    fetchMyPosts()
      .then(setPosts)
      .catch((err: unknown) => setPostsError(err instanceof Error ? err.message : "ไม่สามารถดึงข้อมูลโพสต์ได้"))
      .finally(() => setPostsLoading(false));
  }, [isStudentRole]);

  const fullName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || fallbackName;

  const details = [
    // วางรหัสประจำตัวไว้บนสุด เพราะเป็นสิ่งที่ต้องหยิบไปบอกเจ้าหน้าที่บ่อยที่สุด
    { label: "รหัสประจำตัว", value: profile?.memberCode },
    { label: "ชื่อเล่น", value: profile?.nickname },
    { label: "อีเมล", value: profile?.email },
    { label: "สิทธิ์การใช้งาน", value: profile?.role ? ROLE_LABEL[profile.role] ?? profile.role : undefined },
    { label: "เบอร์โทรศัพท์", value: profile?.phoneNumber },
    { label: "วันเกิด", value: formatBirthDate(profile?.birthDate) },
    { label: "เพศ", value: genderLabel(profile?.gender) },
    { label: "อีเมลผู้ปกครอง", value: profile?.parentEmail },
    { label: "เบอร์ผู้ปกครอง", value: profile?.parentPhoneNumber },
  ].filter((item) => item.value);

  if (isLoading) return <ProfileViewSkeleton />;

  if (error) {
    return (
      <div className="w-full min-h-[calc(100vh-96px)] flex items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 text-red-600 px-6 py-4 rounded-xl">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-white flex items-center justify-center p-4 md:p-8">
      <div className="bg-white w-full max-w-5xl  text-left">

        {/* Profile Section สไตล์ IG */}
        <div className="flex flex-col mb-6">

          <div className="flex flex-row items-center gap-8 md:gap-14">
            <div className="relative flex-shrink-0">
              <div className="w-28 h-28 md:w-36 md:h-36 rounded-full border-4 border-gray-100 overflow-hidden bg-gray-100 shadow-xs grid place-items-center">
                {profile?.profile_picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.profile_picture} alt="รูปโปรไฟล์" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl md:text-5xl font-black text-white bg-gradient-to-br from-[#E63946] to-[#CC0000] w-full h-full grid place-items-center">
                    {(profile?.firstName?.[0] || profile?.nickname?.[0] || "?").toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col space-y-4 w-full">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl md:text-4xl font-black text-gray-900 tracking-tight">
                  {fullName}
                </h2>
                {profile?.nickname && (
                  <span className="text-lg md:text-2xl text-gray-500 font-medium">
                    ({profile.nickname})
                  </span>
                )}
                {profile?.isStudent && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                    กำลังเรียน
                  </span>
                )}
              </div>

              <div className="flex flex-row items-center gap-6 text-sm md:text-lg text-gray-600 font-medium">
                <span><strong className="text-gray-900 font-bold">{posts.length}</strong> posts</span>
              </div>
            </div>
          </div>

          {(editHref || qrHref) && (
            <div className="flex flex-row gap-4 w-full mt-8">
              {editHref && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => (window.location.href = editHref)}
                  className="flex-1 md:flex-initial py-3 text-sm md:text-base bg-gray-50 hover:bg-gray-100 border border-gray-200"
                >
                  Edit profile
                </Button>
              )}

              {qrHref && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => (window.location.href = qrHref)}
                  className="flex-1 md:flex-initial py-3 text-sm md:text-base bg-gray-50 hover:bg-gray-100 border border-gray-200"
                >
                  View QR Code
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ข้อมูลส่วนตัว (ดึงจาก /api/users/:id) */}
        {details.length > 0 && (
          <div className="w-full border-t border-gray-200 pt-8 mb-8">
            <h3 className="text-lg font-bold text-gray-900 mb-6">ข้อมูลส่วนตัว</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5">
              {details.map((item) => (
                <div key={item.label} className="flex flex-col gap-1">
                  <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {item.label}
                  </dt>
                  <dd className="text-base text-gray-900 font-medium break-words">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* แถบแท็บสไตล์ IG */}
        <div className="w-full border-t border-gray-200 flex justify-center text-gray-900 gap-8">
          
          {/* แท็บ Posts */}
          <button
            type="button"
            onClick={() => setActiveTab("posts")}
            className={`flex items-center gap-2 py-3 text-xs md:text-sm tracking-widest uppercase font-bold transition-all -mt-[2px] ${
              activeTab === "posts"
                ? "border-t-2 border-gray-900 text-gray-900"
                : "text-gray-400 hover:text-gray-600 border-t-2 border-transparent"
            }`}
          >
            <Grid2X2 className="w-4 h-4" />
            Posts
          </button>

          {/* แท็บ Evaluation (เฉพาะนักเรียน) */}
          {isStudentRole && (
            <button
              type="button"
              onClick={() => setActiveTab("evaluation")}
              className={`flex items-center gap-2 py-3 text-xs md:text-sm tracking-widest uppercase font-bold transition-all -mt-[2px] ${
                activeTab === "evaluation"
                  ? "border-t-2 border-gray-900 text-gray-900"
                  : "text-gray-400 hover:text-gray-600 border-t-2 border-transparent"
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              Evaluation
            </button>
          )}

        </div>

        {/* เนื้อหาแท็บ Posts — รูป/วิดีโอที่ถูกแท็ก (เฉพาะคนที่เคยยินยอมให้เก็บข้อมูลใบหน้าเท่านั้น
            ถึงจะมีโพสต์ให้เห็น — ฝั่ง backend กรองให้แล้วที่ /students/posts/me) */}
        {activeTab === "posts" && (
          <div className="w-full pt-8">
            {postsLoading ? (
              <p className="text-center text-sm text-gray-400">กำลังโหลดโพสต์...</p>
            ) : postsError ? (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                {postsError}
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-14 text-center text-gray-400">
                <ImageOff className="h-9 w-9 text-gray-300" />
                <p className="text-sm">ยังไม่มีรูปหรือวิดีโอที่คุณถูกแท็กไว้</p>
              </div>
            ) : (
              <>
                {/* แจ้งเตือนว่ารูป/วิดีโอต้นฉบับจะถูกลบอัตโนมัติ (ดู photoPostRetention ฝั่ง backend
                    cmd/serve/main.go) กันคนไม่รู้แล้วเสียดายทีหลัง — กดปุ่มดาวน์โหลดที่รูป/วิดีโอ
                    แต่ละอันเพื่อเก็บไว้เองก่อนหมดเวลา
                    ⚠️ นับ 7 วันจากตอนที่ถูกแท็กเข้าโปรไฟล์นี้ (ตอนที่เห็นในหน้านี้ครั้งแรก) ไม่ใช่
                    ตอนที่โค้ช/แอดมินอัปโหลดไฟล์ดิบเข้าระบบ (ดู DeleteOldRawPhotos/DeleteOldRawVideos) */}
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 sm:text-sm">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>
                    รูปและวิดีโอต้นฉบับจะถูกลบออกจากระบบอัตโนมัติภายใน 7 วันหลังถูกแท็กเข้าโปรไฟล์นี้
                    หากต้องการเก็บไว้ กรุณากดดาวน์โหลดก่อนหมดเวลา
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-2">
                  {posts.map((post, i) => (
                    <div key={`${post.type}-${post.id}`} className="relative aspect-square overflow-hidden bg-gray-100">
                      <PostMediaThumb
                        post={post}
                        onOpen={() => setViewingIndex(i)}
                        onDeleted={() =>
                          setPosts((prev) => prev.filter((p) => !(p.type === post.type && p.id === post.id)))
                        }
                      />
                      {post.type === "video" && (
                        <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          วิดีโอ
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* เนื้อหาแท็บ Evaluation (เฉพาะนักเรียน) */}
        {activeTab === "evaluation" && isStudentRole && (
          <div className="w-full pt-8">
            {evalLoading ? (
              <p className="text-center text-sm text-gray-400">กำลังโหลดผลการประเมิน...</p>
            ) : evalError ? (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                {evalError}
              </div>
            ) : evaluations.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">ยังไม่มีผลการประเมินจากโค้ช</p>
            ) : (
              <div className="flex flex-col gap-6">
                {/* จอกว้าง (sm+): รายการแนวตั้งเรียงล่าสุดก่อนเหมือนเดิม */}
                <ul className="hidden sm:flex sm:flex-col sm:gap-4">
                  {evaluations.map((ev) => (
                    <li key={ev.id} className="rounded-2xl border border-gray-200 p-5">
                      <EvaluationEntryContent ev={ev} />
                    </li>
                  ))}
                </ul>

                {/* มือถือ: สัปดาห์ล่าสุดอยู่บนสุด แต่ละสัปดาห์เป็นแถวของตัวเอง เลื่อนนิ้วแนวนอนได้
                    เฉพาะภายในแถว (ถ้าสัปดาห์นั้นมีมากกว่า 1 ครั้ง) ส่วนแถวต่อแถวเรียงแนวตั้งตามปกติ
                    ไม่มีสกรอลล์ซ้อนสองทิศทางในกล่องเดียวกัน — พอถึงสัปดาห์ใหม่ก็ขึ้นแถวใหม่ด้านบน
                    แถวของสัปดาห์นี้จะถูกดันลงล่างไปเรื่อย */}
                <div className="flex flex-col gap-5 sm:hidden">
                  {groupEvaluationsByWeekRows(evaluations).map((week) => (
                    <div key={week.weekLabel}>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{week.weekLabel}</p>
                      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
                        {week.items.map((ev) => (
                          <div
                            key={ev.id}
                            className="w-[88vw] max-w-[360px] shrink-0 snap-start rounded-2xl border border-gray-200 p-6"
                          >
                            <EvaluationEntryContent ev={ev} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {viewingIndex !== null && (
        <PostViewerModal
          posts={posts}
          index={viewingIndex}
          onClose={() => setViewingIndex(null)}
          onNavigate={setViewingIndex}
        />
      )}
    </div>
  );
}


// โครงหน้าตอนโหลด — ล้อ layout จริง (รูปกลม + ชื่อ + ปุ่ม + ตารางข้อมูล + แท็บ)
// เดิมเป็นข้อความ "กำลังโหลด..." กลางจอ พอข้อมูลมาถึงหน้าจะกระโดดทั้งหน้า
function ProfileViewSkeleton() {
  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-white flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-5xl animate-pulse bg-white">
        <div className="mb-6 flex flex-col">
          <div className="flex flex-row items-center gap-8 md:gap-14">
            <div className="h-28 w-28 flex-shrink-0 rounded-full bg-gray-200 md:h-36 md:w-36" />
            <div className="w-full space-y-4">
              <div className="h-8 w-64 max-w-full rounded bg-gray-200 md:h-10" />
              <div className="flex gap-6">
                <div className="h-5 w-20 rounded bg-gray-100" />
              </div>
            </div>
          </div>
          <div className="mt-8 flex gap-4">
            <div className="h-12 w-36 rounded-lg bg-gray-100" />
            <div className="h-12 w-36 rounded-lg bg-gray-100" />
          </div>
        </div>

        <div className="mb-8 w-full border-t border-gray-200 pt-8">
          <div className="mb-6 h-6 w-32 rounded bg-gray-200" />
          <div className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="h-3 w-24 rounded bg-gray-100" />
                <div className="h-5 w-40 max-w-full rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex w-full justify-center gap-8 border-t border-gray-200 pt-3">
          <div className="h-5 w-20 rounded bg-gray-200" />
          <div className="h-5 w-20 rounded bg-gray-100" />
        </div>

        <div className="mt-8 grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
