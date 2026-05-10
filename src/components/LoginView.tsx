import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface LoginViewProps {
  onLogin: (username: string) => void;
  externalError?: string;
  accessReqUser?: {uid: string, username: string, name: string} | null;
  accessReqStatus?: 'none' | 'needs_registration' | 'pending';
  onRegisterRequest?: (name: string, username: string) => void;
  onCancelRequest?: () => void;
}

export const LoginView = ({ 
  onLogin, 
  externalError, 
  accessReqUser, 
  accessReqStatus = 'none', 
  onRegisterRequest,
  onCancelRequest
}: LoginViewProps) => {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // dummy states for aesthetic
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [justSignedUp, setJustSignedUp] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [reqName, setReqName] = useState('');
  const [reqUsername, setReqUsername] = useState('');

  useEffect(() => {
    if (accessReqUser) {
      setReqName(accessReqUser.name);
      setReqUsername(accessReqUser.username);
    }
  }, [accessReqUser]);

  useEffect(() => {
    // Automatically submit register request if user just signed up and is not allowed immediately
    if (accessReqStatus === 'needs_registration' && justSignedUp && onRegisterRequest) {
      if (!isLoading) {
         onRegisterRequest(reqName || accessReqUser?.name || '', reqUsername || accessReqUser?.username || '');
         setJustSignedUp(false); // Reset to prevent infinite loops
      }
    }
  }, [accessReqStatus, justSignedUp, onRegisterRequest, isLoading, reqName, reqUsername, accessReqUser]);

  const handleResetPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username) {
      setError('Silakan masukkan alamat username Anda terlebih dahulu');
      setSuccessMessage('');
      return;
    }
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    
    setTimeout(() => {
      setSuccessMessage('Fitur reset password tidak aktif dalam mode lokal.');
      setIsLoading(false);
    }, 1000);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const docRef = doc(db, 'settings', 'users');
      let firestoreUsers: Record<string, any> = {};
      let fetchFailed = false;
      try {
        const docSnap = await Promise.race([
          getDoc(docRef),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        if (docSnap && docSnap.exists()) {
          firestoreUsers = docSnap.data().records || {};
        }
      } catch (e: any) {
        console.warn('Failed to fetch from Firestore', e);
        fetchFailed = true;
      }

      // Merge with any leftover localUsers for backward compatibility temporarily
      const storedLocalUsers = localStorage.getItem('localUsers');
      let localUsers = storedLocalUsers ? JSON.parse(storedLocalUsers) : {};
      
      let users = { ...localUsers, ...firestoreUsers };

      let updatedFirestore = false;
      // Auto seed default users if not exist
      if (!users['deniakbar']) {
        users['deniakbar'] = { username: 'deniakbar', password: 'password123', name: 'Deni Akbar' };
        updatedFirestore = true;
      }
      if (!users['hrdhikemore']) {
        users['hrdhikemore'] = { username: 'hrdhikemore', password: 'password123', name: 'HRD Hikemore' };
        updatedFirestore = true;
      }

      if (isSignUp) {
        if (!name.trim()) throw new Error('Nama harus diisi');
        if (users[username]) {
          throw new Error('Username ini sudah terdaftar. Silakan klik "Sudah punya akun? Masuk" di bawah.');
        }
        if (password.length < 6) {
          throw new Error('Password minimal 6 karakter');
        }
        
        users[username] = { username, password, name };
        updatedFirestore = true;
        
        const user = { username, name };
        localStorage.setItem('currentUser', JSON.stringify(user));
        setJustSignedUp(true);
      } else {
        const user = users[username];
        
        // Cek fallback auth whitelist (jika admin sudah menambahkannya tapi belum ada password di users)
        // Kita tidak bisa cek whitelist dari sini langsung tanpa await getDoc('settings', 'access'), jadi kita langsung cek users collection
        if (!user || user.password !== password) {
          throw new Error('Username atau password salah');
        }
        localStorage.setItem('currentUser', JSON.stringify({ username: user.username, name: user.name }));
      }

      if (updatedFirestore && !fetchFailed) {
         try {
           await setDoc(docRef, { records: users }, { merge: true });
         } catch(e) {
           console.error('Failed to sync users', e);
         }
      }

      onLogin(username);

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f9] flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col md:flex-row w-full max-w-6xl min-h-[640px] xl:min-h-[720px] overflow-hidden border border-slate-100">
        
        {/* Left Form Side */}
        <div className="flex-1 flex flex-col justify-between p-8 xl:p-14 md:max-w-[480px] w-full shrink-0 relative bg-white">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-8 h-8 bg-slate-900 flex items-center justify-center rounded-lg p-1.5 shadow-sm">
              <img src="/logo.svg" alt="Hikemore Logo" className="w-full h-full object-contain filter invert brightness-0" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-800">Hikemore HR</span>
          </div>

          <div className="w-full max-w-[360px] mx-auto mt-4 mb-8">
            <h2 className="text-[28px] font-semibold text-slate-900 mb-2 tracking-tight leading-tight">
              {isForgotPasswordMode ? 'Lupa kata sandi?' : isSignUp ? 'Buat akun Anda' : 'Masuk ke akun Anda'}
            </h2>
            <p className="text-slate-500 mb-8 text-[15px]">
              {isForgotPasswordMode ? 'Informasi pemulihan akun' : isSignUp ? 'Daftar untuk memulai' : 'Silakan masukkan detail Anda'}
            </p>

            {(error || externalError) && accessReqStatus === 'none' && (
              <div className="mb-6 bg-red-50 border border-red-100 text-red-600 text-sm font-medium p-3 rounded-xl flex items-start gap-2">
                <Icon name="alert-circle" size={18} className="shrink-0 mt-0.5" />
                <span>{error || externalError}</span>
              </div>
            )}
            {successMessage && accessReqStatus === 'none' && (
              <div className="mb-6 bg-green-50 border border-green-100 text-green-600 text-sm font-medium p-3 rounded-xl flex items-start gap-2">
                <Icon name="check" size={18} className="shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            {accessReqStatus === 'needs_registration' && accessReqUser ? (
              <div className="space-y-6 animate-fadeIn">
                 <div className="bg-amber-50 text-amber-800 p-4 rounded-xl border border-amber-200 text-sm">
                   <div className="flex gap-2">
                     <Icon name="alert-triangle" size={18} className="shrink-0 mt-0.5 text-amber-500" />
                     <p>Username Anda Belum Terdaftar. Silahkan daftar terlebih dahulu untuk mendapatkan akses.</p>
                   </div>
                 </div>
                 
                 <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-4">
                   <div>
                     <label className="text-[13px] text-slate-700 font-medium mb-1.5 block">Nama Akun</label>
                     <input
                       type="text"
                       value={reqName}
                       onChange={(e) => setReqName(e.target.value)}
                       className="block w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-[15px] transition-shadow"
                       placeholder="Nama Anda"
                     />
                   </div>
                   <div>
                     <label className="text-[13px] text-slate-700 font-medium mb-1.5 block">Username</label>
                     <input
                       type="text"
                       value={reqUsername}
                       onChange={(e) => setReqUsername(e.target.value)}
                       className="block w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-[15px] transition-shadow"
                       placeholder="Username Anda"
                     />
                   </div>
                 </div>

                 <div className="flex flex-col gap-3 pt-2">
                   <button 
                     onClick={() => onRegisterRequest && onRegisterRequest(reqName, reqUsername)}
                     className="w-full flex justify-center items-center py-2.5 px-4 rounded-lg shadow-sm text-[15px] font-semibold text-white bg-amber-500 hover:bg-amber-600 focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-colors"
                     disabled={isLoading || !reqName.trim() || !reqUsername.trim()}
                   >
                     Daftar Akses
                   </button>
                   <button 
                     onClick={onCancelRequest} 
                     className="w-full flex justify-center items-center py-2.5 px-4 rounded-lg text-[15px] font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                     disabled={isLoading}
                   >
                     Kembali
                   </button>
                 </div>
              </div>
            ) : accessReqStatus === 'pending' ? (
              <div className="space-y-6 animate-fadeIn">
                 <div className="flex flex-col items-center justify-center p-8 bg-blue-50 text-blue-800 rounded-2xl border border-blue-100 text-center">
                   <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                     <Icon name="clock" size={24} className="text-blue-500" />
                   </div>
                   <h3 className="text-lg font-bold mb-2 tracking-tight">Menunggu Verifikasi</h3>
                   <p className="text-sm text-blue-700/80 leading-relaxed max-w-[260px] mx-auto">
                     Permintaan akses Anda telah berhasil dikirim. Silahkan menunggu verifikasi dari HR Hikemore.
                   </p>
                 </div>
                 
                 <button 
                   onClick={onCancelRequest} 
                   className="w-full flex justify-center items-center py-2.5 px-4 rounded-lg text-[15px] font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                 >
                   Kembali ke Login
                 </button>
              </div>
            ) : isForgotPasswordMode ? (
              <div className="space-y-6 animate-fadeIn">
                 <div className="flex flex-col items-center justify-center p-8 bg-blue-50 text-blue-800 rounded-2xl border border-blue-100 text-center">
                   <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                     <Icon name="info" size={24} className="text-blue-500" />
                   </div>
                   <h3 className="text-lg font-bold mb-2 tracking-tight">Hubungi HRD</h3>
                   <p className="text-sm text-blue-700/80 leading-relaxed max-w-[260px] mx-auto">
                     Silakan hubungi HRD Hikemore untuk mendapatkan sandi akun Anda.
                   </p>
                 </div>
                 
                 <button 
                   onClick={() => {
                     setIsForgotPasswordMode(false);
                     setError('');
                     setSuccessMessage('');
                   }}
                   className="w-full flex justify-center items-center py-2.5 px-4 rounded-lg text-[15px] font-semibold text-slate-500 hover:bg-slate-100 transition-colors border border-slate-200"
                 >
                   Kembali ke Login
                 </button>
              </div>
            ) : (
            <form onSubmit={handleAuth} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 mb-1.5" htmlFor="name">
                    Nama
                  </label>
                  <div className="relative">
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0958d9] focus:border-transparent text-[15px] transition-shadow"
                      placeholder="Masukkan nama lengkap Anda"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5" htmlFor="username">
                  Username
                </label>
                <div className="relative">
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0958d9] focus:border-transparent text-[15px] transition-shadow"
                    placeholder="Masukkan username Anda"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5" htmlFor="password">
                  Kata Sandi
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0958d9] focus:border-transparent text-[15px] transition-shadow pr-10"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none flex items-center justify-center p-1 rounded transition-colors"
                    title={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  >
                    <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
                  </button>
                </div>
              </div>

              {!isSignUp && (
                <div className="flex items-center justify-between mt-5 mb-6">
                  <div className="flex items-center">
                    <input
                      id="remember-me"
                      type="checkbox"
                      className="h-4 w-4 text-[#0958d9] focus:ring-[#0958d9] border-slate-300 rounded transition-colors cursor-pointer"
                    />
                    <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-600 cursor-pointer">
                      Ingat saya 30 hari
                    </label>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => {
                      setIsForgotPasswordMode(true);
                      setError('');
                      setSuccessMessage('');
                    }} 
                    className="text-[13px] font-semibold text-[#0958d9] hover:text-[#0643a6] transition-colors"
                  >
                    Lupa kata sandi?
                  </button>
                </div>
              )}

              <div className={`pt-2 flex flex-col gap-4 ${isSignUp || isForgotPasswordMode ? 'mt-6' : ''}`}>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center items-center py-2.5 px-4 outline-none border border-transparent rounded-lg shadow-sm text-[15px] font-semibold text-white bg-[#0958d9] hover:bg-[#0643a6] focus:ring-2 focus:ring-offset-2 focus:ring-[#0958d9] transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Memproses...' : isForgotPasswordMode ? 'Kirim link reset' : isSignUp ? 'Daftar' : 'Masuk'}
                </button>
                
                {isForgotPasswordMode ? (
                  <div className="text-center mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPasswordMode(false);
                        setError('');
                        setSuccessMessage('');
                      }}
                      className="text-[#0958d9] hover:text-[#0643a6] font-semibold text-[14px] transition-colors flex items-center justify-center gap-1.5 w-full"
                    >
                      <Icon name="arrow-left" size={16} /> Kembali ke login
                    </button>
                  </div>
                ) : (
                  <div className="text-center mt-2">
                    <span className="text-[14px] text-slate-500 block mb-1">
                      Belum punya akun? 
                    </span>
                    <span className="text-[14px] text-slate-600 block">
                      Silahkan hubungi HRD untuk dibuatkan akun.
                    </span>
                  </div>
                )}
              </div>
            </form>
            )}
          </div>

          <p className="text-center text-[13px] text-slate-400 mt-auto">
            Dengan membuat akun, Anda menyetujui <button type="button" onClick={(e) => e.preventDefault()} className="underline hover:text-slate-600">Syarat Ketentuan</button> kami
          </p>
        </div>

        {/* Right Design Side */}
        <div className="hidden md:block md:flex-1 p-3">
          <div className="w-full h-full bg-[#0958d9] rounded-[24px] relative overflow-hidden flex flex-col shadow-[inset_0_2px_20px_rgba(0,0,0,0.1)]">
            {/* Background circular decorations */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
               <div className="absolute -top-[30%] -left-[20%] w-[100%] h-[100%] rounded-full bg-white/5 blur-3xl mix-blend-overlay"></div>
               <div className="absolute top-[20%] -right-[30%] w-[80%] h-[80%] rounded-full bg-white/5 blur-2xl mix-blend-overlay"></div>
               <div className="absolute -bottom-[40%] left-[10%] w-[120%] h-[120%] rounded-full bg-white/10 blur-3xl mix-blend-overlay"></div>
            </div>
            
            <div className="relative z-10 p-12 text-white">
              <div className="flex items-center gap-2 mb-8 opacity-80">
                <div className="w-6 h-6 rounded-md flex items-center justify-center">
                  <img src="/logo.svg" alt="Hikemore Logo" className="w-full h-full object-contain filter brightness-0 invert" />
                </div>
                <span className="font-semibold text-sm tracking-wide text-white uppercase">HIKEMORE</span>
              </div>
              <h1 className="text-[36px] font-semibold leading-[1.15] tracking-tight text-white mb-8">
                Core Value Hikemore
              </h1>
              <div className="grid grid-cols-2 gap-3 max-w-[480px]">
                <div className="flex items-center gap-3 bg-white/5 p-2.5 rounded-2xl border border-white/10 backdrop-blur-sm">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/5 shadow-sm">
                    <span className="text-xs font-bold text-white/90">01</span>
                  </div>
                  <div>
                    <p className="text-[15px] font-bold tracking-tight text-white/95 leading-tight">Grit</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white/5 p-2.5 rounded-2xl border border-white/10 backdrop-blur-sm">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/5 shadow-sm">
                    <span className="text-xs font-bold text-white/90">02</span>
                  </div>
                  <div>
                    <p className="text-[15px] font-bold tracking-tight text-white/95 leading-tight">Growth</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white/5 p-2.5 rounded-2xl border border-white/10 backdrop-blur-sm">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/5 shadow-sm">
                    <span className="text-xs font-bold text-white/90">03</span>
                  </div>
                  <div>
                    <p className="text-[15px] font-bold tracking-tight text-white/95 leading-tight">Profesionalism</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white/5 p-2.5 rounded-2xl border border-white/10 backdrop-blur-sm">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/5 shadow-sm">
                    <span className="text-xs font-bold text-white/90">04</span>
                  </div>
                  <div>
                    <p className="text-[15px] font-bold tracking-tight text-white/95 leading-tight">Sustainable</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Faux Tablet Mockup sticking out from bottom right */}
            <div className="absolute -bottom-[20%] -right-[5%] w-[85%] h-[80%] bg-black rounded-[40px] p-2 xl:p-3 shadow-2xl rotate-[-4deg] transform origin-bottom-right border border-white/10">
              <div className="w-full h-full bg-slate-100 rounded-[28px] xl:rounded-[32px] overflow-hidden flex shadow-[inset_0_0_10px_rgba(0,0,0,0.05)] border border-slate-200">
                
                {/* Mockup Sidebar */}
                <div className="w-[110px] bg-white h-full border-r border-slate-100 flex flex-col p-4 shrink-0">
                  <div className="flex items-center gap-2 mb-8 mt-2">
                    <div className="w-6 h-6 bg-slate-900 rounded-md shrink-0"></div>
                  </div>
                  <div className="space-y-4 flex-1">
                    <div className="flex items-center gap-3 bg-blue-600 rounded-xl p-2.5 shadow-sm">
                      <div className="w-4 h-4 bg-white/30 rounded shrink-0"></div>
                      <div className="h-2 w-full bg-white rounded"></div>
                    </div>
                    <div className="flex items-center gap-3 p-2.5">
                      <div className="w-4 h-4 bg-slate-200 rounded shrink-0"></div>
                      <div className="h-2 w-[80%] bg-slate-200 rounded"></div>
                    </div>
                    <div className="flex items-center gap-3 p-2.5">
                      <div className="w-4 h-4 bg-slate-200 rounded shrink-0"></div>
                      <div className="h-2 w-[90%] bg-slate-200 rounded"></div>
                    </div>
                    <div className="flex items-center gap-3 p-2.5">
                      <div className="w-4 h-4 bg-slate-200 rounded shrink-0"></div>
                      <div className="h-2 w-[75%] bg-slate-200 rounded"></div>
                    </div>
                  </div>
                </div>

                {/* Mockup Content */}
                <div className="flex-1 bg-slate-50 p-5 xl:p-6 flex flex-col rounded-tl-[1.8rem] border-l border-slate-200/60 shadow-[inset_1px_0_0_rgba(255,255,255,1)]">
                   <div className="flex justify-between items-center mb-6">
                     <div className="h-5 w-28 bg-slate-800 rounded"></div>
                     <div className="flex gap-2">
                       <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400">
                         <div className="w-3 h-3 border-2 border-current rounded-full"></div>
                       </div>
                       <div className="w-7 h-7 rounded-xl bg-blue-100 border-2 border-white shadow-sm"></div>
                     </div>
                   </div>
                   
                   {/* 3 top widget cards */}
                   <div className="flex gap-3 mb-4">
                     <div className="flex-1 bg-white shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-100 rounded-2xl p-3 flex flex-col justify-between h-[88px] relative overflow-hidden">
                       <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-500 mb-2"></div>
                       <div className="h-6 w-10 bg-slate-800 rounded"></div>
                       <div className="h-2 w-16 bg-slate-300 rounded mt-1"></div>
                       <div className="absolute right-[-10px] bottom-[-10px] w-12 h-12 bg-blue-50 rounded-full opacity-50"></div>
                     </div>
                     <div className="flex-1 bg-white shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-100 rounded-2xl p-3 flex flex-col justify-between h-[88px] relative overflow-hidden">
                       <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-500 mb-2"></div>
                       <div className="h-6 w-10 bg-slate-800 rounded"></div>
                       <div className="h-2 w-16 bg-slate-300 rounded mt-1"></div>
                       <div className="absolute right-[-10px] bottom-[-10px] w-12 h-12 bg-amber-50 rounded-full opacity-50"></div>
                     </div>
                     <div className="flex-1 bg-white shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-100 rounded-2xl p-3 flex flex-col justify-between h-[88px] border-dashed border-2 bg-slate-50/50 items-center justify-center">
                       <div className="w-8 h-8 rounded-full bg-slate-200"></div>
                     </div>
                   </div>

                   {/* Main chart/widget area */}
                   <div className="flex-1 flex gap-4 min-h-0">
                     <div className="flex-[2] border border-slate-100 rounded-2xl bg-white p-4 shadow-sm flex flex-col relative overflow-hidden">
                       <div className="flex justify-between items-center mb-4">
                         <div className="h-3 w-32 bg-slate-700 rounded"></div>
                         <div className="h-4 w-12 bg-slate-100 rounded-full"></div>
                       </div>
                       <div className="flex-1 border-b border-l border-slate-100 relative">
                         <div className="absolute bottom-2 left-6 w-3 h-3 rounded-full bg-blue-400"></div>
                         <div className="absolute top-8 left-12 w-3 h-3 rounded-full bg-rose-400"></div>
                         <div className="absolute top-16 right-12 w-4 h-4 rounded-full bg-emerald-400"></div>
                         <div className="absolute bottom-10 right-20 w-3 h-3 rounded-full bg-amber-400"></div>
                       </div>
                     </div>
                     <div className="flex-1 border border-slate-100 rounded-2xl bg-slate-800 p-4 shadow-sm flex flex-col relative overflow-hidden">
                       <div className="h-3 w-24 bg-slate-600 rounded mb-4"></div>
                       <div className="space-y-3">
                         <div className="h-10 bg-slate-700/50 rounded-xl"></div>
                         <div className="h-10 bg-slate-700/50 rounded-xl"></div>
                       </div>
                     </div>
                   </div>
                </div>

              </div>
            </div>

          </div>
        </div>
        
      </div>
    </div>
  );
};
