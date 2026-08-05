"use client";

import ProfileView from "@/components/ProfileView";

export default function ProfilePage() {
  return (
    <ProfileView
      fallbackName="นักเรียน"
      editHref="/customer/settings/profile"
      qrHref="/customer/profile/viewQR"
    />
  );
}