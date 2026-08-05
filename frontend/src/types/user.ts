export interface UserProfileResponseDTO {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isStudent: boolean;

  nickname?: string;
  phoneNumber?: string;
  birthDate?: string;
  gender?: string;
  parentEmail?: string;
  parentPhoneNumber?: string;
  status?: string;
}

export interface StudentListResponseDTO {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  nickname: string;
  phoneNumber: string;
}

export interface UpdateProfileInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  phoneNumber?: string;
  parentEmail?: string;
  parentPhoneNumber?: string;
}