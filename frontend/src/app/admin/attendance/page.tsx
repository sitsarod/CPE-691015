"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  RefreshCw,
  PlayCircle,
  LogIn,
  Lock,
  Clock,
  Users,
  History,
  Camera,
  CameraOff,
  AlertTriangle,
  Maximize,
} from "lucide-react";

import {
  fetchOpenablePackages,
  fetchOpenSessions,
  openSession,
  fetchSession,
  checkInByQR,
  faceLookup,
  faceCheckIn,
  manualCheckIn,
  closeSession,
  updateAttendanceStatus,
} from "@/services/attendanceAPI";
import type {
  OpenablePackage,
  OpenSessionSummary,
  AttendanceSession,
  RosterItem,
  AttendanceStatus,
  FaceScanResult,
} from "@/types/attendance";

import QRScanner from "./components/QRScanner";
import ScanResultBanner, { type ScanOutcome } from "./components/ScanResult";
import RosterList from "./components/RosterList";
import CoachRosterList from "./components/CoachRosterList";
import KioskMode, { KioskSetupDialog } from "./components/KioskMode";
import EditStatusModal from "./components/EditStatusModal";
import FaceConfirmCard from "./components/FaceConfirmCard";


const SCAN_COOLDOWN_SECONDS = 3;

// จำโหมดสนามไว้ข้ามการรีโหลด — ไม่งั้นกด F5 ครั้งเดียวก็หลุดออกจากล็อก
const KIOSK_STORAGE_KEY = "attendance_kiosk";

type KioskState = { sessionId: number; pin: string };

function readKiosk(): KioskState | null {
  try {
    const raw = localStorage.getItem(KIOSK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.sessionId === "number" && typeof parsed?.pin === "string") {
      return parsed as KioskState;
    }
  } catch {
    // ignore
  }
  return null;
}

// session_date มาเป็น date ล้วน (UTC midnight ของวันตามเวลาสนาม)
function formatSessionDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export default function AdminAttendancePage() {
  const [openable, setOpenable] = useState<OpenablePackage[]>([]);
  const [openSessions, setOpenSessions] = useState<OpenSessionSummary[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [enteringSessionId, setEnteringSessionId] = useState<number | null>(null);

  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [busyPackageId, setBusyPackageId] = useState<number | null>(null);

  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);

  // เปิดกล้องไว้ตั้งแต่แรก — เครื่องที่สนามตั้งไว้เพื่อรับสแกนอย่างเดียว
  // การให้กดเปิดกล้องเองทุกครั้งที่เข้ารอบเป็นขั้นที่ไม่ได้ให้ทางเลือกอะไรจริง ๆ
  // ใครไม่ต้องการก็กดปิดได้ แต่ค่าเริ่มต้นควรเป็นสิ่งที่จะใช้ 99% ของเวลา
  const [useCamera, setUseCamera] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  const [editing, setEditing] = useState<RosterItem | null>(null);
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  const [kioskPin, setKioskPin] = useState<string | null>(null);
  const [isSettingUpKiosk, setIsSettingUpKiosk] = useState(false);

  // เริ่มที่ true เสมอ เพื่อบังหน้าแอดมินไม่ให้แวบขึ้นมาตอนเครื่องที่สนามรีโหลด
  const [isRestoringKiosk, setIsRestoringKiosk] = useState(true);

  // ─── ช่วงพักกล้องหลังจบคนหนึ่งคน ───────────────────────────────────────────
  //
  // QR ใบเดิมยังอยู่ในกรอบหลังบันทึกเสร็จ ถ้าอ่านต่อทันทีจะอ่านซ้ำแล้วโดนด่านกันซ้ำ
  // ปฏิเสธ — แถบแดงจะขึ้นทับแถบเขียวที่เพิ่งสำเร็จไป
  //
  // สามวินาทีพอให้เดินออกจากกรอบ และพอให้อ่านผลบนแถบสีทันก่อนจอเปลี่ยน
  const [cooldown, setCooldown] = useState(0);

  // นับถอยหลังทีละวินาที — setState อยู่ใน callback ของ setTimeout ไม่ใช่ในตัว effect
  // จึงไม่ผิดกฎ react-hooks/set-state-in-effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const startCooldown = useCallback(() => setCooldown(SCAN_COOLDOWN_SECONDS), []);


  // เครื่องที่สนามถูกรีโหลดระหว่างคาบได้ ต้องกลับเข้าโหมดเอง
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const saved = readKiosk();
      if (saved) {
        try {
          const restored = await fetchSession(saved.sessionId);
          if (cancelled) return;
          setSession(restored);
          setKioskPin(saved.pin);
        } catch {
          // โหลดรอบไม่สำเร็จก็ต้องคงล็อกไว้ ไม่ใช่ปลดออก
          if (!cancelled) setKioskPin(saved.pin);
        }
      }
      if (!cancelled) setIsRestoringKiosk(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const enterKiosk = useCallback(
    (pin: string) => {
      if (!session) return;
      localStorage.setItem(
        KIOSK_STORAGE_KEY,
        JSON.stringify({ sessionId: session.id, pin } satisfies KioskState)
      );
      setKioskPin(pin);
      setIsSettingUpKiosk(false);
    },
    [session]
  );

  const exitKiosk = useCallback(() => {
    localStorage.removeItem(KIOSK_STORAGE_KEY);
    setKioskPin(null);
  }, []);

  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // ต้องได้ทั้งคู่ — รายการรอบที่เปิดค้างคือตาข่ายกันลืมปิดรอบ
        // ถ้าปล่อยให้มันพังเงียบ ๆ ก็เท่ากับไม่มีตั้งแต่แรก
        const [packages, sessions] = await Promise.all([
          fetchOpenablePackages(),
          fetchOpenSessions(),
        ]);
        if (cancelled) return;
        setOpenable(packages);
        setOpenSessions(sessions);
        setListError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setListError(err instanceof Error ? err.message : "ไม่สามารถโหลดรายการแพ็กเกจได้");
      } finally {
        if (!cancelled) setIsLoadingList(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const loadOpenable = useCallback(() => {
    setIsLoadingList(true);
    setRefreshTick((t) => t + 1);
  }, []);

  // ─── เปิด / เข้าสู่รอบ ─────────────────────────────────────────────────────

  const handleOpen = async (pkg: OpenablePackage) => {
    setBusyPackageId(pkg.package_id);
    try {
      // มีรอบของวันนี้อยู่แล้วก็เข้าไปเลย ไม่ต้องเปิดใหม่
      // (เปิดซ้ำจะถูก unique index ปฏิเสธและได้ 409 กลับมาเปล่า ๆ)
      const data = pkg.existing_session_id
        ? await fetchSession(pkg.existing_session_id)
        : await openSession(pkg.package_id);
      setSession(data);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถเปิดรอบเช็คชื่อได้");
      loadOpenable();
    } finally {
      setBusyPackageId(null);
    }
  };

  const handleEnterSession = async (sessionId: number) => {
    setEnteringSessionId(sessionId);
    try {
      setSession(await fetchSession(sessionId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถเข้าสู่รอบเช็คชื่อได้");
      loadOpenable();
    } finally {
      setEnteringSessionId(null);
    }
  };

  const refreshSession = useCallback(async () => {
    if (!session) return;
    try {
      setSession(await fetchSession(session.id));
    } catch {
      // รีเฟรชไม่สำเร็จไม่ควรล้างจอที่แอดมินกำลังใช้อยู่ ปล่อยข้อมูลเดิมค้างไว้
    }
  }, [session]);

  // ─── สแกนแล้วบันทึกทันที ───────────────────────────────────────────────────
  //
  // ไม่มีขั้นให้กดยืนยัน เพราะ PersonalQRCode เป็นค่าสุ่ม 128 บิตที่เดาไม่ได้
  // การอ่านใบนั้นได้จึงเป็นหลักฐานตัวตนในตัวเอง
  //
  // ⚠️ จริงเฉพาะกับ PersonalQRCode — ทางเช็คชื่อด้วยรหัสที่เดาต่อได้
  // (เช่น MemberCode ดู services/member_code.go) ต้องมีขั้นยืนยันของตัวเอง
  const runScan = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code || !session) return;

      setIsCheckingIn(true);
      setOutcome(null);
      try {
        const result = await checkInByQR(session.id, code);

        // โค้ชไม่มีโควตาให้พูดถึง
        if (result.kind === "coach") {
          const coach = result.coach;
          setOutcome({
            ok: true,
            title: `เช็คชื่อสำเร็จ — โค้ช${coach.full_name.trim() || coach.nickname}`,
            // เตือนตรงหน้าเครื่องเลย เพราะตารางงานที่ระบบสร้างให้ยังไม่มีสนาม
            // ถ้าไม่บอกตอนนี้จะไม่มีใครรู้ว่าต้องกลับไปเติม
            detail: coach.is_scheduled
              ? `บันทึกเข้าสอนคาบ ${session.course_name} แล้ว`
              : "ยังไม่ได้ลงตารางงานคาบนี้ไว้ — เพิ่มให้อัตโนมัติแล้ว กรุณาไปเติมสนาม",
          });
        } else {
          const student = result.student;
          setOutcome({
            ok: true,
            title: `เช็คชื่อสำเร็จ — ${student.full_name.trim() || student.nickname}`,
            detail: student.is_off_schedule
              ? `ไม่ได้ยืนยันว่าจะมาคาบนี้ — บันทึกเป็น "มาไม่ตรงวัน" · เหลือ ${student.remaining_sessions} ครั้ง`
              : `เหลือ ${student.remaining_sessions} ครั้ง`,
          });
        }
      } catch (err: unknown) {
        setOutcome({
          ok: false,
          title: "เช็คชื่อไม่สำเร็จ",
          detail: err instanceof Error ? err.message : "ไม่ทราบสาเหตุ",
        });
      } finally {
        setIsCheckingIn(false);
        // พักกล้องทั้งกรณีสำเร็จและล้มเหลว — ทั้งสองกรณี QR ใบเดิมยังอยู่ในกรอบ
        startCooldown();
      }

      // รีเฟรชแม้ตอนล้มเหลว เพราะบางกรณีบันทึกลงแล้วแต่คำตอบกลับมาไม่ถึง
      await refreshSession();
    },
    [session, startCooldown, refreshSession]
  );

  // ─── สแกนใบหน้า ─────────────────────────────────────────────────────────────
  //
  // ทำงานคู่ขนานกับ QR บนกล้องตัวเดียวกัน ไม่มีปุ่มสลับโหมด
  // เจอคนที่มั่นใจพอ → หยุดสแกน → เด้งการ์ดให้แอดมินยืนยัน → ค่อยบันทึก

  const [faceCandidate, setFaceCandidate] = useState<FaceScanResult | null>(null);
  const [faceFrame, setFaceFrame] = useState<Blob | null>(null);
  const [isConfirmingFace, setIsConfirmingFace] = useState(false);

  // กันยิงซ้อน — เฟรมมาทุก 1.5 วิ แต่ backend อาจตอบช้ากว่านั้น
  // ใช้ ref ไม่ใช่ state เพราะต้องอ่านค่าล่าสุดทันทีในรอบเดียวกัน ไม่รอ re-render
  const faceInFlight = useRef(false);

  const handleFaceFrame = useCallback(
    async (frame: Blob) => {
      if (!session || faceInFlight.current) return;

      faceInFlight.current = true;
      try {
        const result = await faceLookup(session.id, frame);
        if (result.matched) {
          setFaceCandidate(result);
          // เก็บเฟรมที่ทำให้แมตช์ไว้ใช้ตอนกดยืนยัน
          // backend จะ resolve ตัวตนใหม่จากรูปนี้อีกครั้ง ไม่ได้เชื่อ enrollment_id ที่เราส่ง
          setFaceFrame(frame);
        }
      } catch {
        // ⚠️ ต้องเงียบ — เฟรมส่วนใหญ่ไม่มีหน้าคนหรือจำไม่ได้ ซึ่งเป็นเรื่องปกติ
        // ถ้าเด้ง error ทุกครั้งจอจะกระพริบข้อความตลอดเวลาที่ไม่มีใครยืนอยู่
        // ความล้มเหลวที่ผู้ใช้ต้องรู้คือตอน "กดยืนยันแล้วบันทึกไม่ได้" เท่านั้น
      } finally {
        faceInFlight.current = false;
      }
    },
    [session]
  );

  const cancelFace = useCallback(() => {
    setFaceCandidate(null);
    setFaceFrame(null);
  }, []);

  const confirmFace = useCallback(async () => {
    if (!session || !faceFrame) return;

    setIsConfirmingFace(true);
    setOutcome(null);
    try {
      const result = await faceCheckIn(session.id, faceFrame);
      setOutcome({
        ok: true,
        title: `เช็คชื่อสำเร็จ — ${result.full_name.trim() || result.nickname}`,
        detail: result.is_off_schedule
          ? `ไม่ได้ยืนยันว่าจะมาคาบนี้ — บันทึกเป็น "มาไม่ตรงวัน" · เหลือ ${result.remaining_sessions} ครั้ง`
          : `เหลือ ${result.remaining_sessions} ครั้ง`,
      });
    } catch (err: unknown) {
      setOutcome({
        ok: false,
        title: "เช็คชื่อไม่สำเร็จ",
        detail: err instanceof Error ? err.message : "ไม่ทราบสาเหตุ",
      });
    } finally {
      setIsConfirmingFace(false);
      cancelFace();
      // พักกล้องเหมือนหลังสแกน QR — คนเดิมยังยืนอยู่หน้ากล้อง
      startCooldown();
    }

    await refreshSession();
  }, [session, faceFrame, cancelFace, startCooldown, refreshSession]);

  // ─── เช็คชื่อให้ (manual) ───────────────────────────────────────────────────

  const handleManualCheckIn = async (enrollmentId: number) => {
    if (!session) return;
    try {
      const result = await manualCheckIn(session.id, enrollmentId, "แอดมินเช็คชื่อให้ที่สนาม");
      setOutcome({
        ok: true,
        title: `เช็คชื่อให้ ${result.full_name.trim() || result.nickname} แล้ว`,
        detail: result.is_off_schedule
          ? `ไม่ได้ยืนยันว่าจะมาคาบนี้ — บันทึกเป็น "มาไม่ตรงวัน" · เหลือ ${result.remaining_sessions} ครั้ง`
          : `เหลือ ${result.remaining_sessions} ครั้ง`,
      });
      await refreshSession();
    } catch (err: unknown) {
      setOutcome({
        ok: false,
        title: "เช็คชื่อให้ไม่สำเร็จ",
        detail: err instanceof Error ? err.message : "ไม่ทราบสาเหตุ",
      });
    }
  };

  // ─── แก้สถานะ ──────────────────────────────────────────────────────────────

  const handleSaveStatus = async (status: AttendanceStatus, remarks: string) => {
    if (!editing?.attendance_id) return;

    setIsSavingStatus(true);
    try {
      const result = await updateAttendanceStatus(editing.attendance_id, status, remarks);
      const note =
        result.quota_delta === 1
          ? "คืนโควตา 1 ครั้ง"
          : result.quota_delta === -1
            ? "หักโควตา 1 ครั้ง"
            : "โควตาไม่เปลี่ยน";
      setOutcome({
        ok: true,
        title: "แก้สถานะแล้ว",
        detail: `${note} — เหลือ ${result.remaining_sessions} ครั้ง`,
      });
      setEditing(null);
      await refreshSession();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถแก้สถานะได้");
    } finally {
      setIsSavingStatus(false);
    }
  };

  // ─── ปิดรอบ ────────────────────────────────────────────────────────────────

  const handleClose = async () => {
    if (!session) return;

    const pending = session.pending_count;
    const confirmed = window.confirm(
      pending > 0
        ? `ปิดรอบแล้วคนที่ยืนยันว่าจะมาแล้วไม่มา ${pending} คนจะถูกบันทึกเป็นขาดเรียน\n\nไม่หักโควตา (ยังไม่ได้เรียน) แต่ยังถูกคิดค่าสนามด้วย เพราะสนามถูกจองเผื่อไว้แล้ว\n\nยืนยันปิดรอบ?`
        : "ยืนยันปิดรอบเช็คชื่อ?"
    );
    if (!confirmed) return;

    setIsClosing(true);
    try {
      setSession(await closeSession(session.id));
      setUseCamera(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ไม่สามารถปิดรอบได้");
      await refreshSession();
    } finally {
      setIsClosing(false);
    }
  };

  // ─── จอเลือกแพ็กเกจ ────────────────────────────────────────────────────────

  // รอบที่เปิดค้างและไม่มีทางเข้าถึงจากรายการแพ็กเกจอีกแล้ว จึงยกมาแสดงแยก
  // ตัวที่ยังกดเข้าได้จากรายการปกติไม่ต้องเอามาซ้ำ
  const reachableSessionIds = new Set(
    openable
      .map((pkg) => pkg.existing_session_id)
      .filter((id): id is number => id !== null)
  );
  const staleSessions = openSessions.filter((row) => !reachableSessionIds.has(row.id));

  if (isRestoringKiosk) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
      </div>
    );
  }

  // ⚠️ คืนเฉพาะจอสนาม ไม่ซ้อนทับหน้าแอดมิน — QRScanner ใช้ element id ตายตัว
  // มีสองตัวพร้อมกันกล้องพัง · และต้องอยู่ก่อนด่าน !session เพื่อให้ล็อกค้างไว้เสมอ
  if (kioskPin !== null) {
    return (
      <KioskMode
        pin={kioskPin}
        canScan={!!session && session.status === "open" && session.can_scan}
        notice={
          session
            ? "หมดเวลาเช็คชื่อของคาบนี้แล้ว"
            : "โหลดข้อมูลรอบไม่สำเร็จ — ลองรีเฟรชหน้านี้"
        }
        onScan={runScan}
        // session อาจเป็น null ตอนกู้โหมดสนามแล้วโหลดรอบไม่สำเร็จ — ล็อกต้องอยู่ต่อ
        coaches={session?.coaches ?? []}
        // หยุดสแกนตอนมีการ์ดยืนยันค้างอยู่ด้วย ไม่งั้นจะทายคนถัดไปทับการ์ดที่เปิดอยู่
        paused={isCheckingIn || cooldown > 0 || faceCandidate !== null}
        pausedReason={
          faceCandidate
            ? "รอยืนยันตัวตน"
            : cooldown > 0
              ? `พร้อมสแกนคนถัดไปใน ${cooldown} วินาที`
              : "กำลังบันทึก..."
        }
        outcome={outcome}
        onDismissOutcome={() => setOutcome(null)}
        onExit={exitKiosk}
        onFaceFrame={handleFaceFrame}
        faceCandidate={faceCandidate}
        isConfirmingFace={isConfirmingFace}
        onConfirmFace={confirmFace}
        onCancelFace={cancelFace}
      />
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* จอมือถือสูงจำกัด หัวข้อกับคำอธิบายกินไปเกือบ 80px โดยไม่ได้บอกอะไร
              ที่เมนูด้านล่างไม่ได้บอกอยู่แล้ว — ดันรายการแพ็กเกจตกจอไปเปล่า ๆ */}
          <div className="hidden sm:block">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">เช็คชื่อเข้าเรียน</h1>
            <p className="mt-1 text-gray-500">
              เลือกแพ็กเกจที่กำลังอยู่ในคาบเรียน แล้วเปิดรอบเช็คชื่อ
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <Link
              href="/admin/attendance/history"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-50 sm:flex-none"
            >
              <History className="h-4 w-4" />
              ประวัติ
            </Link>
            <button
              onClick={loadOpenable}
              disabled={isLoadingList}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 sm:flex-none"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingList ? "animate-spin" : ""}`} />
              รีเฟรช
            </button>
          </div>
        </div>

        {listError && (
          <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{listError}</div>
        )}

        {staleSessions.length > 0 && (
          <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900">รอบที่เปิดค้างไว้ ยังไม่ได้ปิด</p>
                <p className="mt-0.5 text-sm text-amber-800">
                  คนที่ยืนยันว่าจะมาแล้วไม่มา จะยังไม่ถูกมาร์คขาดเรียนจนกว่าจะปิดรอบ —
                  ระบบจะปิดให้อัตโนมัติหลังเลยเวลาคาบ แต่เข้าไปตรวจและปิดเองก่อนได้
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {staleSessions.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-4"
                >
                  <div>
                    <p className="font-semibold text-gray-900">
                      {row.course_name || "ไม่ทราบคอร์ส"}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {formatSessionDate(row.session_date)} · {row.schedule_start_time} –{" "}
                        {row.schedule_end_time}
                      </span>
                      <span
                        className={
                          row.pending_count > 0 ? "font-medium text-amber-700" : undefined
                        }
                      >
                        ยังไม่เช็ค {row.pending_count} / {row.total_count} คนที่ยืนยันไว้
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleEnterSession(row.id)}
                    disabled={enteringSessionId !== null}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60 sm:w-auto"
                  >
                    {enteringSessionId === row.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Lock className="h-5 w-5" />
                    )}
                    เข้าไปปิดรอบ
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoadingList ? (
          <div className="mt-16 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : openable.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-gray-200 p-12 text-center">
            <Clock className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-4 text-lg font-medium text-gray-700">
              ตอนนี้ไม่มีแพ็กเกจที่อยู่ในคาบเรียน
            </p>
            <p className="mt-2 text-gray-500">
              เปิดรอบเช็คชื่อได้ตั้งแต่ 30 นาทีก่อนคาบเริ่ม จนถึง 30 นาทีหลังคาบจบ
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {openable.map((pkg) => {
              const isClosed = pkg.existing_session_status === "closed";
              return (
                <div
                  key={pkg.package_id}
                  className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{pkg.course_name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {pkg.start_time} – {pkg.end_time}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        ยืนยันแล้ว {pkg.confirmed_count} / {pkg.student_count} คน
                      </span>
                      <span>{pkg.sessions_count} ครั้ง/แพ็กเกจ</span>
                    </div>
                  </div>

                  {isClosed ? (
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
                        <Lock className="h-4 w-4" />
                        ปิดรอบแล้ววันนี้
                      </span>
                      <button
                        onClick={() => handleOpen(pkg)}
                        disabled={busyPackageId !== null}
                        className="min-h-11 flex-1 rounded-xl border border-gray-300 px-4 py-2.5 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 sm:flex-none"
                      >
                        ดูรายชื่อ
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleOpen(pkg)}
                      disabled={busyPackageId !== null}
                      className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#CC0000] px-5 py-3 font-semibold text-white transition hover:bg-[#A30A0E] disabled:opacity-60 sm:w-auto"
                    >
                      {busyPackageId === pkg.package_id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : pkg.existing_session_id ? (
                        <LogIn className="h-5 w-5" />
                      ) : (
                        <PlayCircle className="h-5 w-5" />
                      )}
                      {pkg.existing_session_id ? "เข้าสู่รอบ" : "เปิดรอบเช็คชื่อ"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── จอสแกนในรอบ ───────────────────────────────────────────────────────────

  const isOpen = session.status === "open";

  // เปิดอยู่ ≠ สแกนได้ — รอบที่เลยเวลาแล้วยังต้องเข้ามาดูรายชื่อและกด "ปิดรอบ" ได้
  // แต่ backend ปฏิเสธการสแกนทุกครั้ง (ErrAttendanceExpired) โชว์กล้องต่อ = หลอกให้กดเปล่า
  const canScan = isOpen && session.can_scan;

  const totalCount = session.roster.length;
  const checkedCount = totalCount - session.pending_count;

  // กล้องโชว์อยู่จริงหรือไม่ — ตัวตัดสินว่าผลการเช็คชื่อจะไปขึ้นที่ไหน
  // ถ้าดูแค่ useCamera ผลจะไม่โผล่ที่ไหนเลยตอนบล็อกกล้องไม่ถูกเรนเดอร์
  const showResultOnCamera = canScan && useCamera;

  return (
    // สองคอลัมน์บนจอ lg ขึ้นไป (iPad วางนอนเข้าเกณฑ์) — กล้องซ้าย รายชื่อขวา
    //
    // ล็อกความสูงไว้เท่าจอแล้วให้ "รายชื่อ" เลื่อนในตัวเอง (ดู RosterList)
    // เพื่อไม่ให้ทั้งหน้าเลื่อน ซึ่งจะทำให้กล้องหลุดออกจากจอตอนไถหารายชื่อ
    //
    // 11rem มาจาก admin/layout.tsx: pt-24 (96px) + main lg:p-8 หัวท้าย (32+32)
    // = 160px = 10rem แล้วเผื่อไว้อีก 1rem กันไม่ให้ล้นจนเกิด scrollbar ของทั้งหน้า
    // ⚠️ ถ้าใครแก้ padding ใน admin/layout.tsx ต้องมาแก้เลขนี้ตาม
    <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:h-[calc(100vh-11rem)]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => {
              setSession(null);
              loadOpenable();
            }}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ← กลับไปเลือกแพ็กเกจ
          </button>
          <h1 className="truncate text-2xl font-bold text-gray-900 sm:text-3xl">
            {session.course_name}
          </h1>
          <p className="text-gray-500">
            คาบ {session.schedule_start_time} – {session.schedule_end_time} ·{" "}
            {!isOpen ? (
              <span className="font-medium text-gray-600">ปิดรอบแล้ว</span>
            ) : canScan ? (
              <span className="font-medium text-green-600">รอบเปิดอยู่</span>
            ) : (
              <span className="font-medium text-amber-600">เปิดค้างอยู่ · เลยเวลาแล้ว</span>
            )}
          </p>
        </div>

        <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-end">
          {/* ตัวเลขเดียวพอ — ใครมา/ขาด/มาไม่ตรงวัน ดูได้จากรายชื่อที่อยู่ข้าง ๆ */}
          <div className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-sm text-gray-500">เช็คแล้ว</span>
            <span className="text-2xl font-bold leading-none text-gray-900">
              {checkedCount}
            </span>
            <span className="text-gray-400">/ {totalCount}</span>
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              onClick={refreshSession}
              aria-label="รีเฟรช"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 px-4 font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            {isOpen && (
              <button
                onClick={() => setIsSettingUpKiosk(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 px-4 font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <Maximize className="h-4 w-4" />
                โหมดสนาม
              </button>
            )}
            {isOpen && (
              <button
                onClick={handleClose}
                disabled={isClosing}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gray-800 px-4 font-semibold text-white transition hover:bg-gray-900 disabled:opacity-60"
              >
                {isClosing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                ปิดรอบ
              </button>
            )}
          </div>
        </div>
      </div>

      {isOpen && !canScan && (
        <div className="flex shrink-0 items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-900">เลยเวลาคาบแล้ว — สแกนเพิ่มไม่ได้</p>
            <p className="mt-0.5 text-sm text-amber-800">
              {session.pending_count > 0
                ? `กด "ปิดรอบ" เพื่อบันทึกคนที่ยืนยันว่าจะมาแล้วไม่มา ${session.pending_count} คนเป็นขาดเรียน — ไม่หักโควตา แต่ยังถูกคิดค่าสนาม`
                : 'คนที่ยืนยันไว้มาครบแล้ว กด "ปิดรอบ" เพื่อปิดงานของคาบนี้ได้เลย'}
            </p>
          </div>
        </div>
      )}

      {/* ปิดรอบแล้วคอลัมน์ซ้ายหายไป ต้องสลับเป็นคอลัมน์เดียวด้วย
          ไม่งั้นรายชื่อจะไปนั่งในช่องซ้ายที่กว้างแค่ 380px แล้วตารางแน่นจนอ่านยาก */}
      <div
        className={`grid min-h-0 flex-1 gap-4 ${
          canScan ? "lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]" : "lg:grid-cols-1"
        }`}
      >
        {/* ── ซ้าย: รับการเช็คชื่อ ── */}
        {canScan && (
          <div className="flex min-h-0 flex-col gap-3">
            {useCamera ? (
              <QRScanner
                onScan={runScan}
                onFaceFrame={handleFaceFrame}
                paused={isCheckingIn || cooldown > 0 || faceCandidate !== null}
                pausedReason={
                  faceCandidate
                    ? "รอยืนยันตัวตน"
                    : cooldown > 0
                      ? `พร้อมสแกนคนถัดไปใน ${cooldown} วินาที`
                      : "กำลังบันทึก..."
                }
                overlay={
                  outcome && (
                    <ScanResultBanner
                      variant="overlay"
                      outcome={outcome}
                      onDismiss={() => setOutcome(null)}
                    />
                  )
                }
              />
            ) : (
              <div className="space-y-3">
                <div className="flex aspect-[4/3] max-h-[52vh] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50">
                  <CameraOff className="h-12 w-12 text-gray-400" strokeWidth={1.5} />
                  <p className="text-lg font-semibold text-gray-600">กล้องปิดอยู่</p>
                </div>

                {/* บรรทัดสถานะให้อยู่ตำแหน่งเดียวกับของ QRScanner */}
                <p className="flex items-center gap-2 text-gray-500">
                  <CameraOff className="h-4 w-4" />
                  ปิดกล้องไว้ — เช็คชื่อจากรายชื่อด้านขวาแทน
                </p>
              </div>
            )}

            {/* ปิดกล้องอยู่ → ผลมาขึ้นเป็นแถบตรงนี้ (ตอนเปิดกล้องมันไปขึ้นทับบนภาพ)
                ต้องเลือกอย่างใดอย่างหนึ่ง ไม่งั้นผลเดียวกันโผล่สองที่
                แล้วจะได้ยินเสียงซ้อนสองครั้งด้วย (แต่ละตัวเรียก beep ของตัวเอง) */}
            {outcome && !showResultOnCamera && (
              <ScanResultBanner outcome={outcome} onDismiss={() => setOutcome(null)} />
            )}

            <button
              onClick={() => setUseCamera((v) => !v)}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              {useCamera ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {useCamera ? "ปิดกล้อง" : "เปิดกล้องสแกน"}
            </button>
          </div>
        )}

        {/* ── ขวา: รายชื่อ ── */}
        <div className="flex min-h-0 flex-col gap-3">
          <CoachRosterList coaches={session.coaches} />
          <RosterList
            session={session}
            onManualCheckIn={handleManualCheckIn}
            onEditStatus={setEditing}
          />
        </div>
      </div>

      {editing?.attendance_id && (
        <EditStatusModal
          studentName={editing.full_name.trim() || editing.nickname}
          currentStatus={editing.status ?? "present"}
          currentRemarks={editing.remarks}
          isSubmitting={isSavingStatus}
          onSubmit={handleSaveStatus}
          onClose={() => setEditing(null)}
        />
      )}

      {isSettingUpKiosk && (
        <KioskSetupDialog
          onConfirm={enterKiosk}
          onCancel={() => setIsSettingUpKiosk(false)}
        />
      )}

      {/* โหมดปกติก็สแกนใบหน้าได้ ไม่ใช่เฉพาะโหมดสนาม */}
      {faceCandidate && (
        <FaceConfirmCard
          candidate={faceCandidate}
          isSubmitting={isConfirmingFace}
          onConfirm={confirmFace}
          onCancel={cancelFace}
        />
      )}
    </div>
  );
}
