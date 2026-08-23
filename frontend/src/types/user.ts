export interface UserProfileResponseDTO {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isStudent: boolean;

  /**
   * รหัสประจำตัวแบบอ่านออกพูดได้ เช่น KYS0001 (นักเรียน) หรือ KYC0001 (โค้ช)
   *
   * ⚠️ ใช้อ้างอิงถึงคนเท่านั้น ห้ามใช้แทน personalQR ในการยืนยันตัวตน
   * เพราะเป็นเลขเรียงกันที่เดาต่อได้
   */
  memberCode?: string;

  nickname?: string;
  phoneNumber?: string;
  lineId?: string;
  facebook?: string;
  birthDate?: string;
  gender?: string;
  parentEmail?: string;
  parentPhoneNumber?: string;
  status?: string;
  profile_picture?: string;
}

export interface StudentListResponseDTO {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  nickname: string;
  phoneNumber: string;
  graceEnrollments?: number;
  lineId?: string;
  facebook?: string;
  birthDate?: string;
  gender?: string;
}

export interface UpdateProfileInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  phoneNumber?: string;
  parentEmail?: string;
  parentPhoneNumber?: string;
  lineId?: string;
  facebook?: string;
  profile_picture?: string;
}