'use client';

import { useState } from 'react';
import FindAccount from './FindAccount';
import SelectVerification from './SelectVerification';
import VerifyOtp from './VerifyOtp';
import ResetPassword from './ResetPassword';
import { IdentifyUserData } from '@/types/identify';

export default function IdentifyPage() {
  const [step, setStep] = useState<number>(1);
  const [userData, setUserData] = useState<IdentifyUserData>({});
  const nextStep = (data?: IdentifyUserData) => {
    setUserData((prev) => ({ ...prev, ...data }));
    setStep((prev) => prev + 1);
  };
  const prevStep = () => {
    setStep((prev) => prev - 1);
  };

  return (
    <main>
      {step === 1 && (
        <FindAccount onNext={nextStep} />
      )}

      {step === 2 && (
        <SelectVerification userData={userData} onNext={nextStep} onBack={prevStep} />
      )}

      {step === 3 && (
        <VerifyOtp userData={userData} onNext={nextStep} onBack={prevStep} />
      )}

      {step === 4 && (
        <ResetPassword userData={userData} onNext={nextStep} onBack={prevStep} />
      )}
    </main>
  );
}