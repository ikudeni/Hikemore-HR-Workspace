import React, { useState } from 'react';
import { Icon } from './ui/Icon';
import { auth } from '../firebase';
import { confirmPasswordReset } from 'firebase/auth';

interface ResetPasswordViewProps {
  oobCode: string;
  onSuccess: () => void;
}

export const ResetPasswordView = ({ oobCode, onSuccess }: ResetPasswordViewProps) => {
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError('Password minimal 6 karakter');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || 'Gagal reset password. Tautan mungkin sudah kedaluwarsa atau tidak valid.';
      if (err.code === 'auth/expired-action-code') errMsg = 'Tautan reset password sudah kedaluwarsa. Silakan minta tautan baru.';
      if (err.code === 'auth/invalid-action-code') errMsg = 'Tautan tidak valid atau sudah pernah digunakan.';
      if (err.code === 'auth/weak-password') errMsg = 'Password terlalu lemah, minimal 6 karakter.';
      if (err.code === 'auth/operation-not-allowed') errMsg = 'Fitur Email/Password belum diaktifkan di Firebase Console Anda. Silahkan aktifkan terlebih dahulu pada menu Authentication > Sign-in method.';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f9] flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 md:p-10 w-full max-w-md border border-slate-100 flex flex-col items-center">
        <div className="w-12 h-12 bg-[#0958d9]/10 text-[#0958d9] rounded-2xl flex items-center justify-center mb-6">
          <Icon name="key" size={24} />
        </div>
        <h2 className="text-[24px] font-semibold text-slate-900 mb-2 tracking-tight">Buat Password Baru</h2>
        <p className="text-slate-500 mb-8 text-[14px] text-center">Silakan ketikkan password baru Anda di bawah ini.</p>
        
        {error && (
          <div className="w-full mb-6 bg-red-50 text-red-600 text-sm font-medium p-3 rounded-xl flex items-start gap-2">
            <Icon name="alert-circle" size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleReset} className="w-full space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
              Password Baru
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0958d9] focus:border-transparent text-[15px] transition-shadow pr-10"
                placeholder="Minimal 6 karakter"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none p-1"
                title={showPassword ? "Sembunyikan password" : "Lihat password"}
              >
                <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
              </button>
            </div>
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center items-center py-2.5 px-4 mt-6 rounded-lg shadow-sm text-[15px] font-semibold text-white bg-[#0958d9] hover:bg-[#0643a6] focus:ring-2 focus:ring-offset-2 focus:ring-[#0958d9] transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Menyimpan...' : 'Simpan Password Baru'}
          </button>
        </form>
      </div>
    </div>
  );
};
