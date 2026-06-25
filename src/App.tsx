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
import { OrganizationContent } from './components/OrganizationContent';
import { InventoryContent } from './components/InventoryContent';
import { KehadiranContent } from './components/KehadiranContent';
import { LoginView } from './components/LoginView';
import { SettingsContent } from './components/SettingsContent';
import { ActivityLogDropdown } from './components/ActivityLogDropdown';
import { NotificationDropdown } from './components/NotificationDropdown';
import { ProfileDropdown } from './components/ProfileDropdown';
import { Employee, JobListing, KanbanStage, Candidate, Schedule, DashboardWidget } from './types';
import { calculateDuration, calculateAge, removeUndefined } from './utils';
import { generateNIP } from './utils/nipUtils';
import { auth, db, handleFirestoreError, OperationType, logActivity } from './firebase';
import { collection, onSnapshot, setDoc, doc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import { ResetPasswordView } from './components/ResetPasswordView';
import { PublicAssetView } from './components/PublicAssetView';
import { PublicEvaluasiView } from './components/PublicEvaluasiView';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

const UnderConstructionView = ({ menuName }: { menuName: string }) => (
  <div className="flex flex-col items-center justify-center h-full bg-white rounded-3xl border border-slate-100 shadow-sm opacity-80">
    <Icon name="hammer" size={48} className="text-slate-300 mb-4" />
    <h2 className="text-lg font-bold text-slate-800 mb-2">Halaman {menuName}</h2>
    <p className="text-sm text-slate-500">Modul ini sedang dalam tahap pengembangan.</p>
  </div>
);

const saveTimeouts: Record<string, NodeJS.Timeout> = {};
const debouncedSetDoc = (key: string, docRef: any, data: any, options?: any) => {
  if (saveTimeouts[key]) clearTimeout(saveTimeouts[key]);
  saveTimeouts[key] = setTimeout(() => {
    if (options) {
      setDoc(docRef, data, options).catch(console.error);
    } else {
      setDoc(docRef, data).catch(console.error);
    }
  }, 1000);
};

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
  const [menuAccessList, setMenuAccessList] = useState<string[] | null>(null);
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
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
    const storedUser = sessionStorage.getItem('currentUser');
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
        let menuAccessMap: Record<string, string[]> = {};

        try {
          const docRef = doc(db, 'settings', 'access');
          const docSnap = await Promise.race([
            getDoc(docRef),
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
          ]);
          if (docSnap && docSnap.exists()) {
            allowedUsernames = docSnap.data().usernames || docSnap.data().emails || allowedUsernames;
            if (docSnap.data().superAdmins) {
              superAdmins = docSnap.data().superAdmins;
            }
            if (docSnap.data().menuAccess) {
              menuAccessMap = docSnap.data().menuAccess;
            }
          }
        } catch (error) {
          // Silent offline fallback
        }

        if (!allowedUsernames.includes('deniakbar')) {
          allowedUsernames.push('deniakbar');
        }
        if (!superAdmins.includes('deniakbar')) {
          superAdmins.push('deniakbar');
        }

        const currentUsername = (user.username || user.email).toLowerCase();
        setIsSuperAdmin(superAdmins.includes(currentUsername));
        setMenuAccessList(menuAccessMap[currentUsername] || null);

        if (allowedUsernames.includes(currentUsername)) {
          setIsAuthenticated(true);
          setAccessReqUser(null);
          setAccessReqStatus('none');
          setCurrentUser({ 
            name: user.name || currentUsername. split('@')[0] || '', 
            username: currentUsername 
          });
          setLoginError('');
        } else {
          setIsAuthenticated(false);
          setCurrentUser({ name: '', username: '' });
          setRawEmployees([]);
          sessionStorage.removeItem('currentUser');
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
  
  const [kanbanStagesReact, setKanbanStagesReact] = useState<KanbanStage[]>([
    { id: 'Penjadwalan WA', label: 'PENJADWALAN WA', color: 'bg-slate-50 text-slate-600 border-slate-100', badgeColor: 'bg-slate-200/50 text-slate-700' },
    { id: 'Interview HR', label: 'INTERVIEW HR', color: 'bg-blue-50 text-blue-600 border-blue-100', badgeColor: 'bg-blue-200/50 text-blue-700' },
    { id: 'Psikotest Online', label: 'PSIKOTEST ONLINE', color: 'bg-indigo-50 text-indigo-600 border-indigo-100', badgeColor: 'bg-indigo-200/50 text-indigo-700' },
    { id: 'Test Teknikal', label: 'TEST TEKNIKAL', color: 'bg-violet-50 text-violet-600 border-violet-100', badgeColor: 'bg-violet-200/50 text-violet-700' },
    { id: 'Interview User', label: 'INTERVIEW USER', color: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100', badgeColor: 'bg-fuchsia-200/50 text-fuchsia-700' },
    { id: 'Offering Kontrak', label: 'OFFERING KONTRAK', color: 'bg-amber-50 text-amber-600 border-amber-100', badgeColor: 'bg-amber-200/50 text-amber-700' },
    { id: 'Kandidat Join', label: 'KANDIDAT JOIN', color: 'bg-emerald-50 text-emerald-600 border-emerald-100', badgeColor: 'bg-emerald-200/50 text-emerald-700' },
    { id: 'Talent Pool', label: 'TALENT POOL', color: 'bg-stone-50 text-stone-600 border-stone-100', badgeColor: 'bg-stone-200/50 text-stone-700' },
  ]);
  
  const [jobStagesMapReact, setJobStagesMapReact] = useState<Record<number, string[]>>({});

  const [jobListingsReact, setJobListingsReact] = useState<JobListing[]>([]);

  const [candidatesReact, setCandidatesReact] = useState<Candidate[]>([]);
  const [schedulesReact, setSchedulesReact] = useState<Schedule[]>([]);

  const kanbanStages = kanbanStagesReact;
  const setKanbanStages: React.Dispatch<React.SetStateAction<KanbanStage[]>> = useCallback((valOrFn) => {
     setKanbanStagesReact(prev => {
        const newVal = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
        const sanitizedVal = removeUndefined(newVal);
        debouncedSetDoc('kanbanStages', doc(db, 'settings', 'recruitmentData'), { kanbanStages: sanitizedVal }, { merge: true });
        return newVal;
     });
  }, []);

  const jobStagesMap = jobStagesMapReact;
  const setJobStagesMap: React.Dispatch<React.SetStateAction<Record<number, string[]>>> = useCallback((valOrFn) => {
     setJobStagesMapReact(prev => {
        const newVal = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
        const sanitizedVal = removeUndefined(newVal);
        debouncedSetDoc('jobStagesMap', doc(db, 'settings', 'recruitmentData'), { jobStagesMap: sanitizedVal }, { merge: true });
        return newVal;
     });
  }, []);

  const jobListings = jobListingsReact;
  const setJobListings: React.Dispatch<React.SetStateAction<JobListing[]>> = useCallback((valOrFn) => {
     setJobListingsReact(prev => {
        const newVal = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
        const sanitizedVal = removeUndefined(newVal);
        debouncedSetDoc('jobListings', doc(db, 'settings', 'recruitmentData'), { jobListings: sanitizedVal }, { merge: true });
        return newVal;
     });
  }, []);

  const candidates = candidatesReact;
  const setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>> = useCallback((valOrFn) => {
     setCandidatesReact(prev => {
        const newVal = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
        const sanitizedVal = removeUndefined(newVal);
        debouncedSetDoc('candidates', doc(db, 'settings', 'recruitmentData'), { candidates: sanitizedVal }, { merge: true });
        return newVal;
     });
  }, []);

  const schedules = schedulesReact;
  const setSchedules: React.Dispatch<React.SetStateAction<Schedule[]>> = useCallback((valOrFn) => {
     setSchedulesReact(prev => {
        const newVal = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
        const sanitizedVal = removeUndefined(newVal);
        debouncedSetDoc('schedules', doc(db, 'settings', 'recruitmentData'), { schedules: sanitizedVal }, { merge: true });
        return newVal;
     });
  }, []);

  useEffect(() => {
    let unsubscribeRecruitment: (() => void) | undefined;
    if (isAuthenticated) {
      const q = doc(db, 'settings', 'recruitmentData');
      unsubscribeRecruitment = onSnapshot(q, (snapshot) => {
        if (snapshot.exists() && !snapshot.metadata.hasPendingWrites) {
           const data = snapshot.data();
           if (data.jobListings) setJobListingsReact(data.jobListings);
           if (data.candidates) setCandidatesReact(data.candidates);
           if (data.schedules) setSchedulesReact(data.schedules);
           if (data.kanbanStages) setKanbanStagesReact(data.kanbanStages);
           if (data.jobStagesMap) setJobStagesMapReact(data.jobStagesMap);
        }
      });
    }
    return () => {
      if (unsubscribeRecruitment) unsubscribeRecruitment();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    // ONE TIME INJECT FOR SCHED
    if (schedulesReact.length > 0 && jobListingsReact.length > 0 && candidatesReact.length > 0) {
      if (!schedulesReact.some(s => String(s.id) === "INJECT_HC_05")) {
         let injectCandidates = [...candidatesReact];
         let candidatesModified = false;
         
         const fixCandidateName = (oldName: string, newName: string) => {
            const cand = injectCandidates.find(c => c.name.toLowerCase().includes(oldName.toLowerCase()));
            if (cand) {
                cand.name = newName;
                candidatesModified = true;
            }
         };
         
         // Fix names
         fixCandidateName('rizal', 'Farrel');
         fixCandidateName('nahrowi', 'Bandi');
         fixCandidateName('budi', 'Farrel');
         fixCandidateName('agus', 'Bandi');

         const newSchedules = [...schedulesReact];
         let schedModified = false;
         
         newSchedules.forEach(s => {
             if (s.candidateName.toLowerCase().includes('rizal') || s.candidateName.toLowerCase().includes('budi')) {
                 s.candidateName = 'Farrel';
                 s.title = `Interview Offline - ${s.candidateName}`;
                 (s as any).id = "INJECT_HC_05"; // ensure it doesn't run again
                 schedModified = true;
             }
             if (s.candidateName.toLowerCase().includes('nahrowi') || s.candidateName.toLowerCase().includes('agus')) {
                 s.candidateName = 'Bandi';
                 s.title = `Interview Offline - ${s.candidateName}`;
                 schedModified = true;
             }
         });
         
         if (schedModified) {
            setSchedulesReact(newSchedules);
            if (candidatesModified) setCandidatesReact(injectCandidates);
            
            // save to db
            debouncedSetDoc('schedules_inject_names', doc(db, 'settings', 'recruitmentData'), { 
               schedules: newSchedules,
               ...(candidatesModified ? { candidates: injectCandidates } : {})
            }, { merge: true });
         }
      }
    }
  }, [schedulesReact, jobListingsReact, candidatesReact]);

  const [performaDataMapReact, setPerformaDataMapReact] = useState<Record<string, any>>({});
  
  const performaDataMap = performaDataMapReact;
  const setPerformaDataMap: React.Dispatch<React.SetStateAction<Record<string, any>>> = useCallback((valOrFn) => {
     setPerformaDataMapReact(prev => {
        const newVal = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
        const sanitizedVal = removeUndefined(newVal);
        debouncedSetDoc('performaData', doc(db, 'settings', 'performaData'), { performaDataMap: sanitizedVal });
        return newVal;
     });
  }, []);

  useEffect(() => {
    let unsubscribePerforma: (() => void) | undefined;
    if (isAuthenticated) {
      const q = doc(db, 'settings', 'performaData');
      unsubscribePerforma = onSnapshot(q, (snapshot) => {
        if (snapshot.exists() && !snapshot.metadata.hasPendingWrites) {
           const data = snapshot.data();
           if (data.performaDataMap) setPerformaDataMapReact(data.performaDataMap);
        }
      });
    }
    return () => {
      if (unsubscribePerforma) unsubscribePerforma();
    };
  }, [isAuthenticated]);
  
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

  const [dashboardLayoutReact, setDashboardLayoutReact] = useState<DashboardWidget[]>([
    { id: 'sum', type: 'summaryStats', span: 3 },
    { id: 'dist', type: 'distribusiChart', span: 1 },
    { id: 'status', type: 'statusPekerjaChart', span: 1 },
    { id: 'pend', type: 'tingkatPendidikanChart', span: 1 },
    { id: 'data', type: 'dataKaryawanTable', span: 2 },
    { id: 'agama', type: 'statusAgamaChart', span: 1 },
    { id: 'trend', type: 'trenKaryawanChart', span: 3 },
  ]);

  const dashboardLayout = dashboardLayoutReact;
  const setDashboardLayout: React.Dispatch<React.SetStateAction<DashboardWidget[]>> = useCallback((valOrFn) => {
     setDashboardLayoutReact(prev => {
        const newVal = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
        const sanitizedVal = removeUndefined(newVal);
        debouncedSetDoc('dashboardLayout', doc(db, 'settings', 'dashboardData'), { dashboardLayout: sanitizedVal }, { merge: true });
        return newVal;
     });
  }, []);

  useEffect(() => {
    let unsubscribeDashboard: (() => void) | undefined;
    let unsubscribeAccess: (() => void) | undefined;

    if (isAuthenticated) {
      const q = doc(db, 'settings', 'dashboardData');
      unsubscribeDashboard = onSnapshot(q, (snapshot) => {
        if (snapshot.exists() && !snapshot.metadata.hasPendingWrites) {
           const data = snapshot.data();
           if (data.dashboardLayout) {
              let loadedLayout: DashboardWidget[] = data.dashboardLayout;
              const filtered = loadedLayout.filter(w => w.type !== 'trenKaryawanChart');
              loadedLayout = [
                ...filtered,
                { id: 'trend', type: 'trenKaryawanChart', span: 3 }
              ];
              setDashboardLayoutReact(loadedLayout);
           }
        }
      });

      const accessRef = doc(db, 'settings', 'access');
      unsubscribeAccess = onSnapshot(accessRef, (snapshot) => {
        if (snapshot.exists()) {
           const data = snapshot.data();
           if (data.superAdmins) {
             setIsSuperAdmin(data.superAdmins.includes(currentUser.username));
           }
           if (data.menuAccess) {
             setMenuAccessList(data.menuAccess[currentUser.username] || null);
           }
        }
      });
    }
    return () => {
      if (unsubscribeDashboard) unsubscribeDashboard();
      if (unsubscribeAccess) unsubscribeAccess();
    };
  }, [isAuthenticated, currentUser.username]);

  useEffect(() => {
    if (globalEmployees.length > 0) {
      // Auto-repair missing or out-of-sync NIPs
      let updatesCount = 0;
      globalEmployees.forEach(emp => {
        let existingRand = '';
        if (emp.nip) {
          const parts = emp.nip.split('-');
          if (parts.length >= 4) {
            existingRand = parts[parts.length - 1]; // Keep random sequence
          }
        }
        
        const expectedNip = generateNIP(emp.joinDate, emp.dept, emp.status, existingRand, globalEmployees);
        
        if (emp.nip !== expectedNip || !emp.nip) {
           updateDoc(doc(db, 'employees', emp.id), { nip: expectedNip }).catch(console.error);
           updatesCount++;
        }
      });
      if (updatesCount > 0) {
        console.log(`Auto-repaired ${updatesCount} out-of-sync NIPs`);
      }
    }
  }, [globalEmployees]);

  const handleAddEmployee = async (newEmployeeData: Employee) => {
    const randomId = `DEF${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
    const nip = newEmployeeData.nip || generateNIP(newEmployeeData.joinDate, newEmployeeData.dept, newEmployeeData.status, '', globalEmployees);
    const newEmployee = { ...newEmployeeData, nip, isActive: true, hideFromOrgChart: true };
    try {
      const sanitizedVal = removeUndefined(newEmployee);
      await setDoc(doc(db, 'employees', randomId), sanitizedVal);
      logActivity('Data Karyawan Ditambahkan', { nama: newEmployee.name, nip: nip || randomId });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `employees/${randomId}`);
    }
  };

  const handleEditEmployee = async (updatedEmployeeData: Employee) => {
    try {
      const { id, ...data } = updatedEmployeeData;
      const sanitizedVal = removeUndefined(data);
      await updateDoc(doc(db, 'employees', id!), sanitizedVal as any);
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

  const allMainMenus = [
    { name: 'Dashboard', icon: 'home' as const },
    { name: 'Rekrutmen', icon: 'briefcase' as const },
    { name: 'Karyawan', icon: 'users' as const },
    { name: 'Kehadiran', icon: 'calendar-check' as const },
    { name: 'Performa', icon: 'target' as const },
    { name: 'Schedule', icon: 'calendar' as const },
    { name: 'File Sharing', icon: 'folder' as const },
    { name: 'Inventory', icon: 'box' as const },
    { name: 'Organization', icon: 'network' as const },
  ];

  const filteredMainMenu = allMainMenus.filter(item => {
    if (menuAccessList !== null) return menuAccessList.includes(item.name);
    return true;
  });

  const menuItems = [
    ...(filteredMainMenu.length > 0 ? [{ label: 'Main Menu', items: filteredMainMenu }] : []),
    { label: 'Settings', items: [
      ...(isSuperAdmin ? [{ name: 'Akses Akun', icon: 'shield' as const }] : []),
      { name: 'Logout', icon: 'log-out' as const }
    ]}
  ];

  const renderContent = () => {
    const regularEmployees = globalEmployees.filter(e => !e.isExternal && !e.isVirtualExternal);
    switch (activeMenu) {
      case 'Dashboard': return <DashboardContent layout={dashboardLayout} setLayout={setDashboardLayout} employees={regularEmployees} jobListings={jobListings} setJobListings={setJobListings} kanbanStages={kanbanStages} jobStagesMap={jobStagesMap} candidates={candidates} schedules={schedules} setSchedules={setSchedules} />;
      case 'Karyawan': return <KaryawanContent employees={regularEmployees} onAddEmployee={handleAddEmployee} onEditEmployee={handleEditEmployee} onResignEmployee={handleResignEmployee} onCancelResign={handleCancelResign} onRejoinEmployee={handleRejoinEmployee} onDeleteEmployee={handleDeleteEmployee} />;
      case 'Kehadiran': return <KehadiranContent employees={regularEmployees} />;
      case 'Organization': return <OrganizationContent employees={globalEmployees} />;
      case 'Performa': return <PerformaContent employees={regularEmployees} performaDataMap={performaDataMap} setPerformaDataMap={setPerformaDataMap} />;
      case 'Rekrutmen': return <RekrutmenContent employees={regularEmployees} jobListings={jobListings} setJobListings={setJobListings} kanbanStages={kanbanStages} setKanbanStages={setKanbanStages} jobStagesMap={jobStagesMap} setJobStagesMap={setJobStagesMap} candidates={candidates} setCandidates={setCandidates} schedules={schedules} setSchedules={setSchedules} />;
      case 'Schedule': {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const todaySchedules = schedules.filter(s => s.date === todayStr);
        const totalCount = todaySchedules.length;

        let briefingText = '';
        if (totalCount > 0) {
          briefingText = `Tetap fokus! Ada ${totalCount} schedule hari ini.`;
        } else {
          briefingText = 'Tetap fokus! Tidak ada schedule hari ini.';
        }

        const formattedToday = format(new Date(), 'd MMMM yyyy', { locale: idLocale });

        return (
          <div className="p-8 h-full overflow-y-auto hide-scrollbar animate-fadeIn">
            <div className="w-full mx-auto bg-white rounded-3xl p-8 border border-slate-100 shadow-sm min-h-full">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-800">Schedule Overview</h2>
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-lg sm:text-xl font-bold tracking-tight text-slate-800">{formattedToday}</div>
                  <div className="text-xs sm:text-sm text-slate-500 font-bold">{briefingText}</div>
                </div>
              </div>
              <ScheduleWidget schedules={schedules} setSchedules={setSchedules} candidates={candidates} employees={regularEmployees} jobListings={jobListings} />
            </div>
          </div>
        );
      }
      case 'File Sharing': return <FileSharingContent />;
      case 'Inventory': return <InventoryContent employees={regularEmployees} />;
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

  const [isEvaluasiMode, setIsEvaluasiMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('mode') === 'evaluasi';
    }
    return false;
  });

  if (resetOobCode) {
    return <ResetPasswordView oobCode={resetOobCode} onSuccess={() => setResetOobCode(null)} />;
  }

  if (isEvaluasiMode) {
    return (
      <PublicEvaluasiView 
        onGoToLogin={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsEvaluasiMode(false);
        }}
      />
    );
  }

  if (scanParam) {
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
        <div className="flex h-screen w-full bg-white font-sans overflow-hidden relative print:block print:h-auto print:overflow-visible">
      <aside className={`bg-white flex flex-col h-full shrink-0 overflow-y-auto hide-scrollbar pb-6 z-50 transition-all duration-300 fixed md:relative print:hidden ${isSidebarOpen ? 'w-72 md:w-72 translate-x-0' : 'w-72 md:w-24 -translate-x-full md:translate-x-0'}`}>
        <div className={`flex items-center gap-3 py-8 mb-4 relative ${isSidebarOpen ? 'px-8' : 'px-8 md:px-0 md:justify-center min-h-[100px]'}`}>
           <div className={`shrink-0 bg-black flex items-center justify-center rounded-2xl ${isSidebarOpen ? 'w-12 h-12 p-2.5' : 'w-12 h-12 p-2.5 md:w-14 md:h-14 md:p-3'}`}>
              <img src="/logo.svg" alt="Hikemore icon" className="w-full h-full object-contain" />
           </div>
           {isSidebarOpen && (
             <div className="flex flex-col overflow-hidden whitespace-nowrap animate-fadeIn">
               <span className="font-black text-[22px] leading-tight text-slate-900 font-sans tracking-tight">HIKEMORE</span>
               <span className="text-[12px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest leading-none">HR WORKSPACE</span>
             </div>
           )}
           {/* Mobile close button when sidebar is collapsed (which means open on mobile since it forces w-72) */}
           <button 
             className="md:hidden ml-auto flex items-center justify-center w-8 h-8 rounded-lg bg-slate-50 text-slate-500"
             onClick={() => setIsSidebarOpen(false)}
           >
             <Icon name="x" size={18} />
           </button>
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
                          if (window.innerWidth < 768) {
                            setIsSidebarOpen(false);
                          }
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

      <div className={`hidden md:block absolute top-9 z-50 transition-all duration-300 ${isSidebarOpen ? 'left-72' : 'left-24'} -translate-x-1/2`}>
        <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className={`w-7 h-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 shadow-sm hover:text-slate-700 hover:bg-slate-50 transition-all cursor-pointer ${!isSidebarOpen && 'rotate-180'}`}
        >
            <Icon name="chevron-left" size={14} />
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden animate-fadeIn"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <main className="flex-1 flex flex-col h-full print:block print:h-auto overflow-hidden print:overflow-visible relative bg-slate-50 print:bg-white md:rounded-tl-[2.2rem] md:rounded-bl-[2.2rem] shadow-[inset_1px_0_0_rgba(255,255,255,1),-10px_0_40px_rgba(0,0,0,0.03)] border-l border-slate-200/60 print:shadow-none print:border-none print:rounded-none dark:shadow-none dark:border-slate-800">
        <header className="h-16 md:h-24 px-6 md:px-10 flex items-center justify-between shrink-0 bg-transparent relative z-[1000] border-b border-slate-100 md:border-b-0 print:hidden">
          <div className="flex items-center gap-3">
            <button 
              className="md:hidden flex items-center justify-center w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-200 text-slate-700"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Icon name="menu" size={20} />
            </button>
            <h1 className="text-xl md:text-3xl font-black text-slate-900 tracking-tight truncate">{activeMenu}</h1>
          </div>
          <div className="flex items-center gap-4 md:gap-8">
            <div className="flex items-center gap-2 md:gap-4">
              <div className="hidden sm:block"><NotificationDropdown employees={globalEmployees.filter(e => !e.isExternal && !e.isVirtualExternal)} /></div>
              <div className="hidden sm:block"><ActivityLogDropdown /></div>
              <ProfileDropdown currentUser={currentUser} onLogoutRequest={() => setIsLogoutModalOpen(true)} />
            </div>
          </div>
        </header>
        <div className="flex-1 px-4 md:px-8 pb-0 flex flex-col min-h-0 overflow-hidden print:block print:h-auto print:overflow-visible print:px-0">
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
                  sessionStorage.removeItem('currentUser');
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
