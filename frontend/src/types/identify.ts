// frontend/src/types/identify.ts
import { UserResponseDTO } from "@/types/auth";

export interface IdentifyUserData extends Partial<UserResponseDTO> {
  resetToken?: string;
}

export type IdentifyNextHandler = (data?: IdentifyUserData) => void;
