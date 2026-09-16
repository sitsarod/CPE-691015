"use client";

import { useState, useEffect, useRef } from "react";
import { Images } from "lucide-react";

// รูปเริ่มต้น ใช้เป็น fallback เมื่อยังไม่มีประกาศที่ตั้งค่าให้ผู้เยี่ยมชมเห็น
const DEFAULT_SLIDES: HeroSlideItem[] = [
  { image_url: "/slide1.jpg" },
  { image_url: "/slide2.jpg" },
  { image_url: "/slide3.jpg" },
];

export interface HeroSlideItem {
  image_url: string;
  title?: string;
  // จุดโฟกัสภาพเป็น % (0-100) ใช้เป็น object-position ตอนครอปโหมด cover (ไม่ส่ง = กึ่งกลาง)
  focal_x?: number;
  focal_y?: number;
  // ระดับซูมเป็น % (100 = ปกติ, ไม่ส่ง = ไม่ซูม) ใช้เป็น transform: scale() รอบจุดโฟกัส เฉพาะโหมด cover
  zoom?: number;
}

interface HeroSliderProps {
  slides?: HeroSlideItem[];
  // ปุ่ม "ดูรูปทั้งหมด" มุมซ้ายล่าง — ส่งมาเมื่อมีแกลเลอรีให้เปิดดู (ไม่ส่ง = ไม่แสดงปุ่ม)
  onGalleryClick?: () => void;
  // วิธีจัดรูปในกรอบ:
  //  - "contain" (ค่าเริ่มต้น) โชว์เต็มใบไม่ตัดขอบ + พื้นหลังเบลอเติมขอบ เหมาะกับโปสเตอร์ประกาศ
  //  - "cover" ภาพเต็มกรอบแบบใหญ่ ยอมให้ถูกตัดขอบ เหมาะกับแบนเนอร์ hero
  fit?: "contain" | "cover";
}

export default function HeroSlider({ slides: slidesProp, onGalleryClick, fit = "contain" }: HeroSliderProps) {
  const isCover = fit === "cover";
  const slides = slidesProp && slidesProp.length > 0 ? slidesProp : DEFAULT_SLIDES;
  const isSingle = slides.length <= 1; // มีรูปเดียว = ไม่ต้องเลื่อน/ไม่มีปุ่ม
  const [currentIndex, setCurrentIndex] = useState(0);

  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const isWheelCooldown = useRef(false);
  const minSwipeDistance = 50;

  // รีเซ็ต index หากจำนวนรูปเปลี่ยน (เช่น โหลดรูปจาก API มาแทน fallback) กัน index เกินขอบเขต
  useEffect(() => {
    setCurrentIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (isSingle) return; // มีรูปเดียว ไม่ต้องตั้งเวลาเลื่อน

    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) =>
        prevIndex === slides.length - 1 ? 0 : prevIndex + 1
      );
    }, 5000);

    return () => clearInterval(timer);
  }, [currentIndex, isSingle, slides.length]);

  const prevSlide = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex === 0 ? slides.length - 1 : prevIndex - 1
    );
  };

  const nextSlide = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex === slides.length - 1 ? 0 : prevIndex + 1
    );
  };

  const handleSwipe = () => {
    if (isSingle) return;
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;

    if (distance > minSwipeDistance) nextSlide();
    else if (distance < -minSwipeDistance) prevSlide();

    setTouchStart(0);
    setTouchEnd(0);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isSingle) return;
    if (isWheelCooldown.current) return;

    if (Math.abs(e.deltaX) > 20) {
      if (e.deltaX > 0) {
        nextSlide();
      } else {
        prevSlide();
      }

      isWheelCooldown.current = true;
      setTimeout(() => {
        isWheelCooldown.current = false;
      }, 500);
    }
  };

  return (
    <div
      // ความสูงกรอบ ~ครึ่งจอทั้งมือถือและจอใหญ่ เพื่อให้เห็นเนื้อหาถัดไปโผล่ขึ้นมา บอกใบ้ว่าเลื่อนลงได้
      // ไม่ให้แบนเนอร์บังเต็มจอจนดูตัน — มือถือ 55svh, จอใหญ่ 60svh (สูงขึ้นเล็กน้อยให้สมส่วนกับจอกว้าง)
      // ใช้ svh กัน browser UI บนมือถือบังส่วนล่าง จับคู่กับ object-contain ที่รูปด้านใน
      // รูปจึงแสดงครบทุกสัดส่วนไม่ถูกตัดขอบ ไม่ว่าจะเป็นจอไหน
      className={`relative w-full overflow-hidden group ${
        isCover
          ? "h-[72svh] min-h-[440px] max-h-[860px]"
          : "h-[55svh] min-h-[260px] md:h-[60svh] max-h-[700px]"
      } ${isSingle ? "" : "cursor-grab active:cursor-grabbing"}`}
      onTouchStart={(e) => {
        if (isSingle) return;
        setTouchEnd(0);
        setTouchStart(e.targetTouches[0].clientX);
      }}
      onTouchMove={(e) => {
        if (isSingle) return;
        setTouchEnd(e.targetTouches[0].clientX);
      }}
      onTouchEnd={handleSwipe}
      onMouseDown={(e) => {
        if (isSingle) return;
        setIsDragging(true);
        setTouchEnd(0);
        setTouchStart(e.clientX);
      }}
      onMouseMove={(e) => {
        if (isDragging) setTouchEnd(e.clientX);
      }}
      onMouseUp={() => {
        if (isDragging) {
          setIsDragging(false);
          handleSwipe();
        }
      }}
      onMouseLeave={() => {
        if (isDragging) {
          setIsDragging(false);
          handleSwipe();
        }
      }}
      onWheel={handleWheel}
    >

      <div
        className="flex w-full h-full transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {slides.map((slide, index) => (
          // overflow-hidden สำคัญ — ตอนซูม (transform: scale) รูปจะขยายเกินกล่อง
          // ถ้าไม่ตัด รูปของสไลด์ข้าง ๆ จะล้นมาทับสไลด์ที่กำลังโชว์อยู่ (เห็นภาพถัดไปโผล่)
          <div key={index} className="min-w-full h-full relative overflow-hidden bg-black">
            {/* พื้นหลังเบลอจากรูปเดียวกัน เติมพื้นที่ขอบ (letterbox) — เฉพาะโหมด contain
                โหมด cover ภาพเต็มกรอบอยู่แล้วจึงไม่ต้องมี */}
            {!isCover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slide.image_url}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50 select-none pointer-events-none"
                draggable={false}
              />
            )}
            {/* รูปจริง — contain: โชว์เต็มใบไม่ตัดขอบ · cover: เต็มกรอบยอมตัดขอบ
                โหมด cover ใช้จุดโฟกัสที่แอดมินตั้ง (object-position) เพื่อคุมว่าจะเก็บส่วนไหนไว้
                ถ้าตั้งซูม > 100% จะ scale ภาพขึ้นโดยยึดจุดโฟกัสเป็นศูนย์กลาง (transform-origin)
                กรอบมี overflow-hidden อยู่แล้ว ส่วนที่เกินจึงถูกตัด = ซูมเข้าหาจุดโฟกัส */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.image_url}
              alt={slide.title || `Slide ${index + 1}`}
              className={`relative w-full h-full select-none pointer-events-none ${isCover ? "object-cover" : "object-contain"}`}
              style={
                isCover
                  ? {
                      objectPosition: `${slide.focal_x ?? 50}% ${slide.focal_y ?? 50}%`,
                      transform: (slide.zoom ?? 100) > 100 ? `scale(${(slide.zoom ?? 100) / 100})` : undefined,
                      transformOrigin: `${slide.focal_x ?? 50}% ${slide.focal_y ?? 50}%`,
                    }
                  : undefined
              }
              draggable={false}
            />
            {/* ไล่สีเข้มเฉพาะโซนล่างให้พาดหัวอ่านออก แทนการปิดทับทั้งรูปแบบเดิม (ทำให้รูปดูมืด) */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />
            {slide.title && (
              <div className="absolute bottom-16 sm:bottom-20 left-4 right-16 sm:left-8 sm:right-24">
                <p className="text-white font-bold text-lg sm:text-2xl leading-snug line-clamp-2 drop-shadow-md">
                  {slide.title}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ปุ่ม "ดูรูปทั้งหมด" — มุมซ้ายล่าง เปิดแกลเลอรีรวมประกาศทั้งหมด (รวมที่หมดอายุแล้ว) */}
      {onGalleryClick && (
        <button
          type="button"
          onClick={onGalleryClick}
          className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white text-xs sm:text-sm font-medium px-3 py-1.5 backdrop-blur-sm transition-colors"
          title="ดูรูปประกาศทั้งหมด"
        >
          <Images size={14} />
          <span className="hidden sm:inline">ดูรูปทั้งหมด</span>
        </button>
      )}

      {!isSingle && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 z-10">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(index);
              }}
              className={`h-3 rounded-full transition-all duration-300 ${
                currentIndex === index ? "bg-red-600 w-8" : "bg-white/60 hover:bg-white w-3"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            ></button>
          ))}
        </div>
      )}

    </div>
  );
}
