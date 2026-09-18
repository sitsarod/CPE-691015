import { apiFetch } from "./apiClient";
import type {
  LegalDocument,
  LegalDocumentKey,
  FaceConsentContent,
  EnrollmentTermsContent,
} from "@/types/legalDocument";

// [GET] เอกสารที่ผู้ใช้ต้องกดยอมรับ ฉบับล่าสุด (แอดมิน)
export async function fetchLegalDocuments(): Promise<LegalDocument[]> {
  const res = await apiFetch<{ data: LegalDocument[] }>("/admin/legal-documents");
  return res.data ?? [];
}

// [PUT] บันทึกฉบับใหม่ · requiresReconsent = แก้สาระ ขึ้นเวอร์ชันใหม่ ผู้ใช้ต้องยอมรับใหม่
export async function updateLegalDocument(
  key: LegalDocumentKey,
  content: FaceConsentContent | EnrollmentTermsContent,
  requiresReconsent: boolean,
  baseRevision: number
): Promise<LegalDocument> {
  const res = await apiFetch<{ data: LegalDocument }>(`/admin/legal-documents/${key}`, {
    method: "PUT",
    body: JSON.stringify({
      content,
      requires_reconsent: requiresReconsent,
      base_revision: baseRevision,
    }),
  });
  return res.data;
}
