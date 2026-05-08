/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Icon } from './components/ui/Icon';
import { DashboardContent } from './components/DashboardContent';
import { KaryawanContent } from './components/KaryawanContent';
import { RekrutmenContent } from './components/RekrutmenContent';
import { ScheduleWidget } from './components/ScheduleWidget';
import { FileSharingContent } from './components/FileSharingContent';
import { PerformaContent } from './components/PerformaContent';
import { InventoryContent } from './components/InventoryContent';
import { LoginView } from './components/LoginView';
import { SettingsContent } from './components/SettingsContent';
import { ActivityLogDropdown } from './components/ActivityLogDropdown';
import { ProfileDropdown } from './components/ProfileDropdown';
import { Employee, JobListing, KanbanStage, Candidate, Schedule, DashboardWidget } from './types';
import { calculateDuration, calculateAge } from './utils';
import { auth, db, handleFirestoreError, OperationType, logActivity } from './firebase';
import { collection, onSnapshot, setDoc, doc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import { ResetPasswordView } from './components/ResetPasswordView';
import { PublicAssetView } from './components/PublicAssetView';

const UnderConstructionView = ({ menuName }: { menuName: string }) => (
  <div className="flex flex-col items-center justify-center h-full bg-white rounded-3xl border border-slate-100 shadow-sm opacity-80">
    <Icon name="hammer" size={48} className="text-slate-300 mb-4" />
    <h2 className="text-lg font-bold text-slate-800 mb-2">Halaman {menuName}</h2>
    <p className="text-sm text-slate-500">Modul ini sedang dalam tahap pengembangan.</p>
  </div>
);

export default function App() {
  const [resetOobCode, setResetOobCode] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'resetPassword') {
        const urlCode = params.get('oobCode');
        // clean up URL to remove params
        window.history.replaceState({}, document.title, window.location.pathname);
        return urlCode;
      }
    }
    return null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [currentUser, setCurrentUser] = useState({ name: '', username: '' });
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [accessReqUser, setAccessReqUser] = useState<{uid: string, username: string, name: string} | null>(null);
  const [accessReqStatus, setAccessReqStatus] = useState<'none' | 'needs_registration' | 'pending'>('none');
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('scan')) {
        return 'Inventory & Assets';
      }
    }
    return 'Dashboard';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const checkAuthStatus = useCallback(async (isLoginAttempt = false) => {
    if (!isLoginAttempt) setIsAuthChecking(true);
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      let user;
      try {
        user = JSON.parse(storedUser);
      } catch(e) {}
      
      if (user && (user.username || user.email)) {
        
        let allowedUsernames = [
          'deniakbar',
          'hrdhikemore'
        ];
        let superAdmins = ['deniakbar', 'hrdhikemore'];

        try {
          const docRef = doc(db, 'settings', 'access');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            allowedUsernames = docSnap.data().usernames || docSnap.data().emails || allowedUsernames;
            if (docSnap.data().superAdmins) {
              superAdmins = docSnap.data().superAdmins;
            }
          }
        } catch (error) {
          console.error('Failed to fetch allowed usernames', error);
        }

        if (!allowedUsernames.includes('deniakbar')) {
          allowedUsernames.push('deniakbar');
        }
        if (!superAdmins.includes('deniakbar')) {
          superAdmins.push('deniakbar');
        }

        const currentUsername = (user.username || user.email).toLowerCase();
        setIsSuperAdmin(superAdmins.includes(currentUsername));

        if (allowedUsernames.includes(currentUsername)) {
          setIsAuthenticated(true);
          setAccessReqUser(null);
          setAccessReqStatus('none');
          setCurrentUser({ 
            name: user.name || currentUsername.split('@')[0] || '', 
            username: currentUsername 
          });
          setLoginError('');
        } else {
          setIsAuthenticated(false);
          setCurrentUser({ name: '', username: '' });
          setRawEmployees([]);
          localStorage.removeItem('currentUser');
          setLoginError('Sesi anda telah berakhir atau akses dicabut.');
        }
      } else {
        setIsAuthenticated(false);
        setCurrentUser({ name: '', username: '' });
        setRawEmployees([]);
      }
    } else {
      setIsAuthenticated(false);
      setCurrentUser({ name: '', username: '' });
      setRawEmployees([]);
    }
    setIsAuthChecking(false);
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    let unsubscribeEmployees: (() => void) | undefined;

    if (isAuthenticated) {
      const q = collection(db, 'employees');
      unsubscribeEmployees = onSnapshot(q, (snapshot) => {
        const emps: Employee[] = [];
        snapshot.forEach((doc) => {
          emps.push({ id: doc.id, ...doc.data() } as Employee);
        });
        setRawEmployees(emps);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'employees');
      });
    }

    return () => {
      if (unsubscribeEmployees) unsubscribeEmployees();
    };
  }, [isAuthenticated]);
  
  const [kanbanStages, setKanbanStages] = useState<KanbanStage[]>([
    { id: 'Penjadwalan WA', label: 'PENJADWALAN WA', color: 'bg-slate-50 text-slate-600 border-slate-100', badgeColor: 'bg-slate-200/50 text-slate-700' },
    { id: 'Interview HR', label: 'INTERVIEW HR', color: 'bg-blue-50 text-blue-600 border-blue-100', badgeColor: 'bg-blue-200/50 text-blue-700' },
    { id: 'Psikotest Online', label: 'PSIKOTEST ONLINE', color: 'bg-indigo-50 text-indigo-600 border-indigo-100', badgeColor: 'bg-indigo-200/50 text-indigo-700' },
    { id: 'Test Teknikal', label: 'TEST TEKNIKAL', color: 'bg-violet-50 text-violet-600 border-violet-100', badgeColor: 'bg-violet-200/50 text-violet-700' },
    { id: 'Interview User', label: 'INTERVIEW USER', color: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100', badgeColor: 'bg-fuchsia-200/50 text-fuchsia-700' },
    { id: 'Offering Kontrak', label: 'OFFERING KONTRAK', color: 'bg-amber-50 text-amber-600 border-amber-100', badgeColor: 'bg-amber-200/50 text-amber-700' },
    { id: 'Kandidat Join', label: 'KANDIDAT JOIN', color: 'bg-emerald-50 text-emerald-600 border-emerald-100', badgeColor: 'bg-emerald-200/50 text-emerald-700' },
    { id: 'Talent Pool', label: 'TALENT POOL', color: 'bg-stone-50 text-stone-600 border-stone-100', badgeColor: 'bg-stone-200/50 text-stone-700' },
  ]);
  
  const [jobStagesMap, setJobStagesMap] = useState<Record<number, string[]>>({});

  const [jobListings, setJobListings] = useState<JobListing[]>([]);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const [performaDataMap, setPerformaDataMap] = useState<Record<string, any>>({});
  
  const [rawEmployees, setRawEmployees] = useState<Employee[]>([]);

  const globalEmployees = useMemo(() => {
    return rawEmployees.map((emp, idx) => {
      let contractType = emp.contractType;
      let contractStart = emp.contractStart;
      let contractEnd = emp.contractEnd;
      
      if (!contractType && emp.isActive) {
        if (emp.status === 'Kontrak' || emp.status === 'Karyawan') {
           if (idx % 7 === 0) {
             contractType = 'Kontrak Probation';
             const start = new Date('2026-03-27');
             const end = new Date(start);
             end.setMonth(start.getMonth() + 3);
             contractStart = start.toISOString().split('T')[0];
             contractEnd = end.toISOString().split('T')[0];
           } else {
             contractType = 'Kontrak Lanjutan';
             const start = new Date('2026-04-01');
             const end = new Date('2026-07-01');
             contractStart = start.toISOString().split('T')[0];
             contractEnd = end.toISOString().split('T')[0];
             if (idx % 5 === 0) {
               end.setDate(end.getDate() + (idx % 5)); 
               contractEnd = end.toISOString().split('T')[0];
             } else if (idx % 6 === 0) {
               end.setDate(end.getDate() - (idx % 5) - 1); 
               contractEnd = end.toISOString().split('T')[0];
             }
           }
        } else if (emp.status === 'Magang') {
           contractType = 'Kontrak Magang';
           const start = new Date('2025-11-03');
           const end = new Date('2026-05-03');
           contractStart = start.toISOString().split('T')[0];
           contractEnd = end.toISOString().split('T')[0];
        }
      }

      return {
      ...emp,
      contractType,
      contractStart,
      contractEnd,
      formattedJoinDate: new Date(emp.joinDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
      formattedResignDate: emp.resignDate ? new Date(emp.resignDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
      calculatedDuration: calculateDuration(emp.joinDate, !emp.isActive ? emp.resignDate! : null),
      formattedDob: new Date(emp.dob).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
      calculatedAge: calculateAge(emp.dob)
    }});
  }, [rawEmployees]);

  const [dashboardLayout, setDashboardLayout] = useState<DashboardWidget[]>([
    { id: 'sum', type: 'summaryStats', span: 3 },
    { id: 'dist', type: 'distribusiChart', span: 1 },
    { id: 'status', type: 'statusPekerjaChart', span: 1 },
    { id: 'pend', type: 'tingkatPendidikanChart', span: 1 },
    { id: 'data', type: 'dataKaryawanTable', span: 2 },
    { id: 'agama', type: 'statusAgamaChart', span: 1 },
  ]);

  const handleAddEmployee = async (newEmployeeData: Employee) => {
    const randomId = `DEF${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
    const newEmployee = { ...newEmployeeData, isActive: true };
    try {
      await setDoc(doc(db, 'employees', randomId), newEmployee);
      logActivity('Data Karyawan Ditambahkan', { nama: newEmployee.name, nip: randomId });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `employees/${randomId}`);
    }
  };

  const handleEditEmployee = async (updatedEmployeeData: Employee) => {
    try {
      const { id, ...data } = updatedEmployeeData;
      await updateDoc(doc(db, 'employees', id!), data as any);
      logActivity('Data Karyawan Diupdate', { nama: updatedEmployeeData.name, nip: updatedEmployeeData.id! });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `employees/${updatedEmployeeData.id}`);
    }
  };

  const handleResignEmployee = async (id: string, resignData: any) => {
    try {
      await updateDoc(doc(db, 'employees', id), { isActive: false, ...resignData });
      const emp = globalEmployees.find(e => e.id === id);
      if (emp) logActivity('Karyawan Resign', { nama: emp.name, alasan: resignData.resignReason });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `employees/${id}`);
    }
  };

  const handleCancelResign = async (id: string) => {
    try {
      await updateDoc(doc(db, 'employees', id), { isActive: true, resignDate: null as unknown as string, resignReason: null as unknown as string });
      const emp = globalEmployees.find(e => e.id === id);
      if (emp) logActivity('Resign Dibatalkan', { nama: emp.name });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `employees/${id}`);
    }
  };

  const handleRejoinEmployee = async (id: string) => {
    const d = new Date();
    const todayStr = d.toISOString().split('T')[0];
    try {
      await updateDoc(doc(db, 'employees', id), { isActive: true, joinDate: todayStr, resignDate: null as unknown as string, resignReason: null as unknown as string });
      const emp = globalEmployees.find(e => e.id === id);
      if (emp) logActivity('Karyawan Rejoin', { nama: emp.name });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `employees/${id}`);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'employees', id));
      const emp = globalEmployees.find(e => e.id === id);
      if (emp) logActivity('Data Karyawan Dihapus', { nama: emp.name });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `employees/${id}`);
    }
  };

  const menuItems = [
    { label: 'Main Menu', items: [
      { name: 'Dashboard', icon: 'home' as const },
      { name: 'Rekrutmen', icon: 'briefcase' as const },
      { name: 'Karyawan', icon: 'users' as const },
      { name: 'Performa', icon: 'target' as const },
      { name: 'Schedule', icon: 'calendar' as const },
      { name: 'File Sharing', icon: 'folder' as const },
      { name: 'Inventory', icon: 'box' as const },
    ]},
    { label: 'Settings', items: [
      ...(isSuperAdmin ? [{ name: 'Akses Akun', icon: 'shield' as const }] : []),
      { name: 'Logout', icon: 'log-out' as const }
    ]}
  ];

  const renderContent = () => {
    switch (activeMenu) {
      case 'Dashboard': return <DashboardContent layout={dashboardLayout} setLayout={setDashboardLayout} employees={globalEmployees} jobListings={jobListings} setJobListings={setJobListings} kanbanStages={kanbanStages} jobStagesMap={jobStagesMap} candidates={candidates} schedules={schedules} setSchedules={setSchedules} />;
      case 'Karyawan': return <KaryawanContent employees={globalEmployees} onAddEmployee={handleAddEmployee} onEditEmployee={handleEditEmployee} onResignEmployee={handleResignEmployee} onCancelResign={handleCancelResign} onRejoinEmployee={handleRejoinEmployee} onDeleteEmployee={handleDeleteEmployee} />;
      case 'Performa': return <PerformaContent employees={globalEmployees} performaDataMap={performaDataMap} setPerformaDataMap={setPerformaDataMap} />;
      case 'Rekrutmen': return <RekrutmenContent employees={globalEmployees} jobListings={jobListings} setJobListings={setJobListings} kanbanStages={kanbanStages} setKanbanStages={setKanbanStages} jobStagesMap={jobStagesMap} setJobStagesMap={setJobStagesMap} candidates={candidates} setCandidates={setCandidates} schedules={schedules} setSchedules={setSchedules} />;
      case 'Schedule': return (
        <div className="p-8 h-full overflow-y-auto hide-scrollbar animate-fadeIn">
          <div className="w-full mx-auto bg-white rounded-3xl p-8 border border-slate-100 shadow-sm min-h-full">
            <h2 className="text-2xl font-black tracking-tight text-slate-800 mb-6">Schedule Overview</h2>
            <ScheduleWidget schedules={schedules} setSchedules={setSchedules} candidates={candidates} employees={globalEmployees} />
          </div>
        </div>
      );
      case 'File Sharing': return <FileSharingContent />;
      case 'Inventory': return <InventoryContent employees={globalEmployees} />;
      case 'Akses Akun': return <SettingsContent />;
      default: return <UnderConstructionView menuName={activeMenu} />;
    }
  };

  const [scanParam, setScanParam] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('scan');
    }
    return null;
  });

  if (resetOobCode) {
    return <ResetPasswordView oobCode={resetOobCode} onSuccess={() => setResetOobCode(null)} />;
  }

  if (scanParam && !isAuthenticated) {
    return (
      <PublicAssetView 
        barcode={scanParam} 
        onClose={() => {
           window.history.replaceState({}, document.title, window.location.pathname);
           setScanParam(null);
        }}
        onGoToLogin={() => {
           window.history.replaceState({}, document.title, window.location.pathname);
           setScanParam(null);
        }}
      />
    );
  }

  if (isAuthChecking) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 font-sans">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <>
      {!isAuthenticated ? (
        <LoginView 
          onLogin={(username) => {
            checkAuthStatus(true);
          }} 
          externalError={loginError} 
          accessReqUser={accessReqUser}
          accessReqStatus={accessReqStatus}
          onRegisterRequest={async (reqName: string, reqUsername: string) => {
             if (accessReqUser) {
               try {
                 await setDoc(doc(db, 'accessRequests', accessReqUser.uid), {
                   username: reqUsername || accessReqUser.username,
                   name: reqName || accessReqUser.name,
                   status: 'pending',
                   timestamp: new Date().toISOString()
                 });
                 setAccessReqStatus('pending');
                 setAccessReqUser(null);
                 setLoginError('Silahkan menunggu verifikasi dari HR Hikemore.');
                 await auth.signOut();
               } catch(e) {
                 setLoginError('Gagal mengirim permintaan daftar.');
               }
             }
          }}
          onCancelRequest={async () => {
             await auth.signOut();
             setAccessReqStatus('none');
             setAccessReqUser(null);
             setLoginError('');
          }}
        />
      ) : (
        <div className="flex h-screen w-full bg-white font-sans overflow-hidden relative">
      <aside className={`bg-white flex flex-col h-full shrink-0 overflow-y-auto hide-scrollbar pb-6 z-20 transition-all duration-300 ${isSidebarOpen ? 'w-72' : 'w-24'}`}>
        <div className={`flex items-center gap-3 py-8 mb-4 relative ${isSidebarOpen ? 'px-8' : 'px-0 justify-center min-h-[100px]'}`}>
           <div className={`shrink-0 bg-black flex items-center justify-center rounded-2xl ${isSidebarOpen ? 'w-12 h-12 p-2.5' : 'w-14 h-14 p-3'}`}>
              <img src="/logo.svg" alt="Hikemore icon" className="w-full h-full object-contain" />
           </div>
           {isSidebarOpen && (
             <div className="flex flex-col overflow-hidden whitespace-nowrap animate-fadeIn">
               <span className="font-black text-[22px] leading-tight text-slate-900 font-sans tracking-tight">HIKEMORE</span>
               <span className="text-[12px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest leading-none">HR WORKSPACE</span>
             </div>
           )}
        </div>

        <div className={`flex-1 ${isSidebarOpen ? 'px-5 space-y-8' : 'px-0 flex flex-col items-center justify-center space-y-2 w-full'}`}>
          {menuItems.map((group, idx) => (
            <div key={idx} className={isSidebarOpen ? 'space-y-3' : 'space-y-1 w-full flex flex-col items-center'}>
              {isSidebarOpen && (
                <h4 className="px-5 text-[12px] font-black text-slate-400 mb-2 uppercase tracking-[0.15em] whitespace-nowrap overflow-hidden">{group.label}</h4>
              )}
              <ul className={isSidebarOpen ? 'space-y-1.5' : 'space-y-2 w-full flex flex-col items-center'}>
                {group.items.map((item) => (
                  <li key={item.name} className="flex justify-center w-full">
                    <button
                      onClick={() => {
                        if (item.name === 'Logout') {
                          setIsLogoutModalOpen(true);
                        } else {
                          setActiveMenu(item.name);
                        }
                      }}
                      title={!isSidebarOpen ? item.name : undefined}
                      className={`flex items-center transition-all duration-300 group ${
                        isSidebarOpen ? 'w-full px-5 py-3.5 rounded-2xl' : 'w-11 h-11 justify-center rounded-xl mx-auto'
                      } ${
                        activeMenu === item.name 
                          ? `bg-blue-600 text-white shadow-lg shadow-blue-500/25 ${isSidebarOpen ? 'translate-x-1' : 'scale-110'}` 
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`flex items-center ${isSidebarOpen ? 'gap-4' : 'gap-0'}`}>
                        <Icon name={item.icon} size={isSidebarOpen ? 22 : 20} className={`${activeMenu === item.name ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'} transition-colors`} />
                        {isSidebarOpen && <span className="text-[16px] font-bold whitespace-nowrap">{item.name}</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        
        <div className={`mt-6 transition-all duration-300 ${isSidebarOpen ? 'px-8' : 'px-4'}`}>
          <div className={`bg-white rounded-full p-1.5 flex items-center shadow-sm border border-slate-100 ${isSidebarOpen ? 'justify-between' : 'justify-center flex-col gap-2'}`}>
            <button 
              onClick={() => setIsDarkMode(false)}
              className={`p-2 rounded-full shadow-sm text-slate-800 ${!isDarkMode ? 'bg-slate-50' : 'text-slate-400 hover:text-slate-600 bg-transparent shadow-none'}`} 
              title="Light Mode"
            >
              <Icon name="sun" size={16} />
            </button>
            <button 
              onClick={() => setIsDarkMode(true)}
              className={`p-2 rounded-full shadow-sm text-slate-800 ${isDarkMode ? 'bg-slate-50' : 'text-slate-400 hover:text-slate-600 bg-transparent shadow-none'}`} 
              title="Dark Mode"
            >
              <Icon name="moon" size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className={`absolute top-9 z-50 transition-all duration-300 ${isSidebarOpen ? 'left-72' : 'left-24'} -translate-x-1/2`}>
        <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className={`w-7 h-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 shadow-sm hover:text-slate-700 hover:bg-slate-50 transition-all cursor-pointer ${!isSidebarOpen && 'rotate-180'}`}
        >
            <Icon name="chevron-left" size={14} />
        </button>
      </div>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-50 rounded-tl-[2.2rem] rounded-bl-[2.2rem] shadow-[inset_1px_0_0_rgba(255,255,255,1),-10px_0_40px_rgba(0,0,0,0.03)] border-l border-slate-200/60 dark:shadow-none dark:border-slate-800">
        <header className="h-24 px-10 flex items-center justify-between shrink-0 bg-transparent relative z-[1000]">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">{activeMenu}</h1>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
              <ActivityLogDropdown />
              <ProfileDropdown currentUser={currentUser} onLogoutRequest={() => setIsLogoutModalOpen(true)} />
            </div>
          </div>
        </header>
        <div className="flex-1 px-8 pb-0 flex flex-col min-h-0 overflow-hidden">
          {renderContent()}
        </div>
      </main>

      {isLogoutModalOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] animate-fadeIn" onClick={() => setIsLogoutModalOpen(false)}></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white rounded-3xl shadow-2xl p-6 lg:p-8 z-[100] animate-slideUp text-center">
            <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-rose-50">
              <Icon name="log-out" size={24} />
            </div>
            <h3 className="font-extrabold text-xl text-slate-900 mb-2">Logout</h3>
            <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">Apakah Anda yakin ingin keluar dari aplikasi HIKEMORE HR Workspace?</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsLogoutModalOpen(false)}
                className="flex-1 py-3 px-4 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-bold rounded-xl transition-colors border border-slate-200"
              >
                Batal
              </button>
              <button 
                onClick={async () => {
                  setIsLogoutModalOpen(false);
                  localStorage.removeItem('currentUser');
                  try {
                    await auth.signOut();
                  } catch (error) {
                    console.error("Logout failed", error);
                  }
                  setCurrentUser({ name: '', username: '' });
                  setRawEmployees([]);
                  setLoginError('');
                  setIsAuthenticated(false);
                }}
                className="flex-1 py-3 px-4 bg-rose-500 hover:bg-rose-600 focus:ring-4 focus:ring-rose-100 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
              >
                Ya, Logout
              </button>
            </div>
          </div>
        </>
      )}

    </div>
      )}
    </>
  );
}
