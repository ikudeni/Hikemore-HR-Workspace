import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { auth, handleFirestoreError, OperationType } from '../firebase';
import { updateProfile, updateEmail, updatePassword, signOut } from 'firebase/auth';

interface ProfileDropdownProps {
  currentUser: { name: string; email: string };
}

export const ProfileDropdown = ({ currentUser }: ProfileDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Update local state when currentUser prop changes
  useEffect(() => {
    setName(currentUser.name);
    setEmail(currentUser.email);
  }, [currentUser]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    const user = auth.currentUser;
    if (!user) {
      setError('User not found.');
      setIsLoading(false);
      return;
    }

    try {
      if (name !== currentUser.name) {
        await updateProfile(user, { displayName: name });
      }
      
      if (email !== currentUser.email) {
        await updateEmail(user, email);
      }
      
      if (password) {
        if (password.length < 6) {
          setError('Password minimal 6 karakter.');
          setIsLoading(false);
          return;
        }
        await updatePassword(user, password);
      }
      
      setSuccessMsg('Profil berhasil diperbarui. Halaman akan dimuat ulang...');
      setPassword(''); // Clear password field
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      
    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || 'Gagal memperbarui profil.';
      if (err.code === 'auth/requires-recent-login') {
         errMsg = 'Membutuhkan login ulang untuk alasan keamanan. Silakan logout dan login kembali untuk mengubah email/password Anda.';
      }
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-4 hover:bg-slate-100 p-2 pr-4 rounded-2xl transition-colors"
      >
        <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-lg shadow-sm border-2 border-white ring-1 ring-blue-50">
          {currentUser.name ? currentUser.name.split(' ').map(n => n.charAt(0)).join('').substring(0, 2).toUpperCase() : 'U'}
        </div>
        <div className="hidden lg:block text-left relative flex flex-col justify-center gap-1">
          <p className="text-[15px] font-black text-slate-900 truncate w-44 leading-none">{currentUser.name ? currentUser.name : 'User'}</p>
          {currentUser.email && <p className="text-[12px] font-medium text-slate-500 truncate w-44 leading-none mt-0.5">{currentUser.email}</p>}
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 py-2 z-[100] animate-fadeIn">
          <button 
            onClick={() => {
              setIsOpen(false);
              setIsModalOpen(true);
            }}
            className="w-full text-left px-4 py-2.5 text-[15px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3"
          >
            <Icon name="user" size={18} />
            Pengaturan Akun
          </button>
          <div className="h-px bg-slate-100 my-1 mx-2"></div>
          <button 
            onClick={() => auth.signOut()}
            className="w-full text-left px-4 py-2.5 text-[15px] font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-3"
          >
            <Icon name="log-out" size={18} />
            Keluar
          </button>
        </div>
      )}

      {isModalOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] animate-fadeIn" onClick={() => setIsModalOpen(false)}></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-lg bg-white rounded-[2rem] shadow-2xl p-6 md:p-8 z-[200] animate-slideUp">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center border-4 border-blue-50">
                  <Icon name="user-check" size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1">Pengaturan Akun</h2>
                  <p className="text-[15px] text-slate-500 font-medium">Perbarui profil dan keamanan akun Anda</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors">
                <Icon name="x" size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-6 bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-sm font-medium border border-rose-100 flex items-center gap-2">
                <Icon name="alert-circle" size={18} className="shrink-0" />
                <p>{error}</p>
              </div>
            )}
            
            {successMsg && (
              <div className="mb-6 bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-sm font-medium border border-emerald-100 flex items-center gap-2">
                <Icon name="check-circle" size={18} className="shrink-0" />
                <p>{successMsg}</p>
              </div>
            )}

            <form onSubmit={handleUpdateAccount} className="space-y-5">
              <div>
                <label className="block text-[13px] font-bold text-slate-700 uppercase tracking-wider mb-2">Nama Akun</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-[13px] font-bold text-slate-700 uppercase tracking-wider mb-2">Email Akun</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-[13px] font-bold text-slate-700 uppercase tracking-wider mb-2">Password Baru <span className="text-slate-400 font-normal normal-case">(Opsional)</span></label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Biarkan kosong jika tidak ingin diubah"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium text-slate-900 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-2"
                  >
                    <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
                  </button>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading || (name === currentUser.name && email === currentUser.email && !password)}
                  className="px-6 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/20 disabled:opacity-50 transition-colors flex items-center justify-center min-w-[120px]"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    'Simpan'
                  )}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
