'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Field, inputClass } from './primitives';
import { fetchLegalDocuments, updateLegalDocument } from '@/services/legalDocumentAPI';
import type {
  LegalDocument,
  FaceConsentContent,
  EnrollmentTermsContent,
} from '@/types/legalDocument';

import { useConfirm } from "@/components/ConfirmProvider";
// รายการแก้เป็นข้อความหลายบรรทัด หนึ่งบรรทัดต่อหนึ่งข้อ
const toLines = (items: string[] | undefined) => (items ?? []).join('\n');
const toItems = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

function formatSavedAt(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LegalConsentEditors() {
  const [docs, setDocs] = useState<LegalDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLegalDocuments()
      .then((list) => {
        if (!cancelled) setDocs(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'โหลดเอกสารไม่สำเร็จ');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const replaceDoc = (doc: LegalDocument) =>
    setDocs((prev) => (prev ?? []).map((d) => (d.key === doc.key ? doc : d)));

  const face = docs?.find((d) => d.key === 'face_consent');
  const terms = docs?.find((d) => d.key === 'enrollment_terms');

  return (
    <div className="mt-10 space-y-10 border-t border-gray-200 pt-8">
      <div>
        <h3 className="text-lg font-bold text-gray-900">เอกสารที่ผู้ใช้ต้องกดยอมรับ</h3>
        <p className="mt-1 text-xs text-gray-500">
          บันทึกแยกจากปุ่มบันทึกด้านบน · ทุกครั้งที่บันทึก ระบบเก็บฉบับเก่าไว้เป็นหลักฐานว่าผู้ใช้ยอมรับข้อความฉบับไหน
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!docs && !error && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-[#CC0000]" />
        </div>
      )}

      {/* key ผูกกับ revision — บันทึกเสร็จแล้ว editor เริ่มใหม่จากฉบับที่เพิ่งบันทึก */}
      {face && <FaceConsentEditor key={`face-${face.revision}`} doc={face} onSaved={replaceDoc} />}
      {terms && (
        <EnrollmentTermsEditor key={`terms-${terms.revision}`} doc={terms} onSaved={replaceDoc} />
      )}
    </div>
  );
}

// ─── ส่วนบันทึกที่ใช้ร่วมกัน ───

function SaveBar({
  doc,
  dirty,
  saving,
  error,
  reconsent,
  onReconsentChange,
  reconsentEffect,
  onSave,
}: {
  doc: LegalDocument;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  reconsent: boolean;
  onReconsentChange: (v: boolean) => void;
  reconsentEffect: string;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs text-gray-500">
        เวอร์ชัน <span className="font-semibold text-gray-700">{doc.version}</span> · ฉบับแก้ไขที่{' '}
        {doc.revision} · บันทึกล่าสุด {formatSavedAt(doc.updated_at)}
      </p>

      <div className="space-y-2">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            checked={!reconsent}
            onChange={() => onReconsentChange(false)}
            className="mt-1 accent-[#CC0000]"
          />
          <span>
            <span className="font-medium text-gray-800">แก้คำผิด / ปรับถ้อยคำ ไม่เปลี่ยนสาระ</span>
            <span className="block text-xs text-gray-500">
              เลขเวอร์ชันเท่าเดิม ผู้ที่ยอมรับไปแล้วไม่ต้องยอมรับใหม่
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            checked={reconsent}
            onChange={() => onReconsentChange(true)}
            className="mt-1 accent-[#CC0000]"
          />
          <span>
            <span className="font-medium text-gray-800">เปลี่ยนสาระสำคัญ</span>
            <span className="block text-xs text-gray-500">{reconsentEffect}</span>
          </span>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={onSave}
        disabled={saving || (!dirty && !reconsent)}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#CC0000] px-5 text-sm font-bold text-white transition hover:bg-[#990000] disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        บันทึกเอกสารนี้
      </button>
    </div>
  );
}

function useDocSave(doc: LegalDocument, onSaved: (doc: LegalDocument) => void, reconsentConfirm: string) {
  const confirmAction = useConfirm();
  const [reconsent, setReconsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (content: FaceConsentContent | EnrollmentTermsContent) => {
    if (reconsent && !(await confirmAction(reconsentConfirm))) return;

    setSaving(true);
    setError(null);
    try {
      onSaved(await updateLegalDocument(doc.key, content, reconsent, doc.revision));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
      setSaving(false);
    }
  };

  return { reconsent, setReconsent, saving, error, save };
}

// ─── หนังสือยินยอมเก็บข้อมูลใบหน้า ───

type FaceDraft = Record<
  | 'title'
  | 'summary'
  | 'data_collected'
  | 'purposes'
  | 'not_used_for'
  | 'disclosure'
  | 'retention'
  | 'rights'
  | 'decline_notice'
  | 'withdrawal_notice',
  string
>;

function faceToDraft(c: FaceConsentContent): FaceDraft {
  return {
    title: c.title ?? '',
    summary: c.summary ?? '',
    data_collected: toLines(c.data_collected),
    purposes: toLines(c.purposes),
    not_used_for: toLines(c.not_used_for),
    disclosure: toLines(c.disclosure),
    retention: c.retention ?? '',
    rights: toLines(c.rights),
    decline_notice: c.decline_notice ?? '',
    withdrawal_notice: c.withdrawal_notice ?? '',
  };
}

function draftToFace(d: FaceDraft): FaceConsentContent {
  return {
    title: d.title,
    summary: d.summary,
    data_collected: toItems(d.data_collected),
    purposes: toItems(d.purposes),
    not_used_for: toItems(d.not_used_for),
    disclosure: toItems(d.disclosure),
    retention: d.retention,
    rights: toItems(d.rights),
    decline_notice: d.decline_notice,
    withdrawal_notice: d.withdrawal_notice,
  };
}

const FACE_LIST_FIELDS: { key: keyof FaceDraft; label: string }[] = [
  { key: 'data_collected', label: 'ข้อมูลที่เก็บ (ม.23(3))' },
  { key: 'purposes', label: 'วัตถุประสงค์ (ม.23(1))' },
  { key: 'not_used_for', label: 'จะไม่นำไปใช้เพื่อ' },
  { key: 'disclosure', label: 'ผู้ที่อาจได้รับข้อมูล (ม.23(4))' },
  { key: 'rights', label: 'สิทธิของเจ้าของข้อมูล (ม.23(6))' },
];

function FaceConsentEditor({
  doc,
  onSaved,
}: {
  doc: LegalDocument;
  onSaved: (doc: LegalDocument) => void;
}) {
  const initial = useMemo(() => faceToDraft(doc.content as FaceConsentContent), [doc]);
  const [draft, setDraft] = useState<FaceDraft>(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const { reconsent, setReconsent, saving, error, save } = useDocSave(
    doc,
    onSaved,
    'บันทึกเป็นเวอร์ชันใหม่?\n\nทุกคนที่เคยยินยอมเรื่องใบหน้าจะต้องกดยินยอมใหม่ และสแกนใบหน้าเช็คชื่อไม่ได้จนกว่าจะยินยอม (QR ยังใช้ได้ตามปกติ)'
  );

  const bind = (key: keyof FaceDraft) => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  return (
    <div className="space-y-5">
      <div>
        <h4 className="font-bold text-gray-900">หนังสือยินยอมเก็บข้อมูลใบหน้า (PDPA)</h4>
        <p className="mt-0.5 text-xs text-gray-500">
          ขึ้นให้นักเรียนและโค้ชกดยินยอมก่อนใช้สแกนใบหน้า · ข้อมูลผู้ควบคุมข้อมูลดึงจากหัวข้อ &quot;ข้อมูลติดต่อ&quot;
        </p>
      </div>

      <Field label="หัวข้อ">
        <input {...bind('title')} className={inputClass} />
      </Field>
      <Field label="คำอธิบาย">
        <textarea rows={4} {...bind('summary')} className={`${inputClass} resize-y`} />
      </Field>

      {FACE_LIST_FIELDS.map((f) => (
        <Field key={f.key} label={f.label} hint="หนึ่งบรรทัดต่อหนึ่งข้อ">
          <textarea rows={4} {...bind(f.key)} className={`${inputClass} resize-y`} />
        </Field>
      ))}

      <Field label="ระยะเวลาเก็บ (ม.23(3))">
        <textarea rows={3} {...bind('retention')} className={`${inputClass} resize-y`} />
      </Field>
      <Field label="ผลหากไม่ยินยอม (ม.23(2))">
        <textarea rows={3} {...bind('decline_notice')} className={`${inputClass} resize-y`} />
      </Field>
      <Field label="ผลของการถอนความยินยอม (ม.19 วรรคหก)">
        <textarea rows={3} {...bind('withdrawal_notice')} className={`${inputClass} resize-y`} />
      </Field>

      <SaveBar
        doc={doc}
        dirty={dirty}
        saving={saving}
        error={error}
        reconsent={reconsent}
        onReconsentChange={setReconsent}
        reconsentEffect="ขึ้นเวอร์ชันใหม่ · ผู้ที่เคยยินยอมต้องกดยินยอมใหม่ และสแกนใบหน้าเช็คชื่อไม่ได้จนกว่าจะยินยอม"
        onSave={() => save(draftToFace(draft))}
      />
    </div>
  );
}

// ─── ข้อตกลงการสมัครเรียน ───

interface TermsDraft {
  title: string;
  sections: { heading: string; items: string }[];
}

function termsToDraft(c: EnrollmentTermsContent): TermsDraft {
  return {
    title: c.title ?? '',
    sections: (c.sections ?? []).map((s) => ({ heading: s.heading, items: toLines(s.items) })),
  };
}

function draftToTerms(d: TermsDraft): EnrollmentTermsContent {
  return {
    title: d.title,
    sections: d.sections.map((s) => ({ heading: s.heading, items: toItems(s.items) })),
  };
}

function EnrollmentTermsEditor({
  doc,
  onSaved,
}: {
  doc: LegalDocument;
  onSaved: (doc: LegalDocument) => void;
}) {
  const initial = useMemo(() => termsToDraft(doc.content as EnrollmentTermsContent), [doc]);
  const [draft, setDraft] = useState<TermsDraft>(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const { reconsent, setReconsent, saving, error, save } = useDocSave(
    doc,
    onSaved,
    'บันทึกเป็นเวอร์ชันใหม่?\n\nการสมัครเรียนครั้งถัดไปต้องยอมรับฉบับใหม่ ใบที่สมัครไปแล้วยังอ้างอิงฉบับเดิม'
  );

  const updateSection = (index: number, patch: Partial<TermsDraft['sections'][number]>) =>
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));

  return (
    <div className="space-y-5">
      <div>
        <h4 className="font-bold text-gray-900">ข้อตกลงการสมัครเรียน</h4>
        <p className="mt-0.5 text-xs text-gray-500">
          นักเรียนต้องติ๊กยอมรับก่อนกดยืนยันสมัครเรียนทุกครั้ง
        </p>
      </div>

      <Field label="หัวข้อ">
        <input
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className={inputClass}
        />
      </Field>

      {draft.sections.map((section, index) => (
        <div key={index} className="space-y-3 rounded-xl border border-gray-200 p-4">
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <Field label={`หมวดที่ ${index + 1}`}>
                <input
                  value={section.heading}
                  onChange={(e) => updateSection(index, { heading: e.target.value })}
                  placeholder="ชื่อหมวด"
                  className={inputClass}
                />
              </Field>
            </div>
            <button
              type="button"
              onClick={() =>
                setDraft((d) => ({ ...d, sections: d.sections.filter((_, i) => i !== index) }))
              }
              aria-label={`ลบหมวดที่ ${index + 1}`}
              className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-gray-200 text-gray-400 transition hover:border-red-200 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <Field label="ข้อความ" hint="หนึ่งบรรทัดต่อหนึ่งข้อ">
            <textarea
              rows={4}
              value={section.items}
              onChange={(e) => updateSection(index, { items: e.target.value })}
              className={`${inputClass} resize-y`}
            />
          </Field>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          setDraft((d) => ({ ...d, sections: [...d.sections, { heading: '', items: '' }] }))
        }
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#CC0000] hover:underline"
      >
        <Plus className="h-4 w-4" /> เพิ่มหมวด
      </button>

      <SaveBar
        doc={doc}
        dirty={dirty}
        saving={saving}
        error={error}
        reconsent={reconsent}
        onReconsentChange={setReconsent}
        reconsentEffect="ขึ้นเวอร์ชันใหม่ · การสมัครครั้งถัดไปต้องยอมรับฉบับใหม่ ใบที่สมัครไปแล้วยังอ้างอิงฉบับเดิม"
        onSave={() => save(draftToTerms(draft))}
      />
    </div>
  );
}
