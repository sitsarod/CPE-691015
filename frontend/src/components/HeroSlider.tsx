"use client";

import { useState, useEffect, useRef } from "react";

const images = [
  "/slide1.jpg", 
  "/slide2.jpg",
  "/slide3.jpg",
];

export default function HeroSlider() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0)   ;
  const [isDragging, setIsDragging] = useState(false);

  const isWheelCooldown = useRef(false);
  const minSwipeDistance = 50; 


  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => 
        prevIndex === images.length - 1 ? 0 : prevIndex + 1
      );
    }, 5000);
    
    return () => clearInterval(timer);
  }, [currentIndex]); // <--- เพิ่มตรงนี้

  const prevSlide = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === 0 ? images.length - 1 : prevIndex - 1
    );
  };

  const nextSlide = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === images.length - 1 ? 0 : prevIndex + 1
    );
  };

  const handleSwipe = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    
    if (distance > minSwipeDistance) nextSlide();
    else if (distance < -minSwipeDistance) prevSlide();
    
    setTouchStart(0);
    setTouchEnd(0);
  };

  const handleWheel = (e: React.WheelEvent) => {
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
      className="relative w-full h-[calc(100vh-96px)] overflow-hidden group cursor-grab active:cursor-grabbing"
      onTouchStart={(e) => {
        setTouchEnd(0);
        setTouchStart(e.targetTouches[0].clientX);
      }}
      onTouchMove={(e) => setTouchEnd(e.targetTouches[0].clientX)}
      onTouchEnd={handleSwipe}
      onMouseDown={(e) => {
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
        {images.map((src, index) => (
          <div key={index} className="min-w-full h-full relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={src} 
              alt={`Slide ${index + 1}`} 
              className="w-full h-full object-cover select-none pointer-events-none" 
              draggable={false}
            />
            <div className="absolute inset-0 bg-black/20 pointer-events-none"></div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-10">
        {images.map((_, index) => (
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

    </div>
  );
}