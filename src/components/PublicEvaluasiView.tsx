import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { db } from '../firebase';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { Employee } from '../types';
import { upgradePerformaData } from '../utils';

interface PublicEvaluasiViewProps {
  onGoToLogin: () => void;
}

export const PublicEvaluasiView: React.FC<PublicEvaluasiViewProps> = ({ onGoToLogin }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [evalId, setEvalId] = useState<string | null>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [allPerformaDataMap, setAllPerformaDataMap] = useState<Record<string, any>>({});
  const [allAtasanPins, setAllAtasanPins] = useState<Record<string, string>>({});
  
  // Active manager alignment
  const [activeManagerId, setActiveManagerId] = useState<string | null>(null);
  const [atasanName, setAtasanName] = useState('');
  const [subordinates, setSubordinates] = useState<Employee[]>([]);
  const [selectedSubordinate, setSelectedSubordinate] = useState<Employee | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [data, setData] = useState<any>({
    grit_1: "", grit_2: "", grit_3: "", grit_4: "", grit_5: "",
    growth_1: "", growth_2: "", growth_3: "", growth_4: "", growth_5: "",
    prof_1: "", prof_2: "", prof_3: "", prof_4: "", prof_5: "",
    sus_1: "", sus_2: "", sus_3: "", sus_4: "", sus_5: "",
    telat: 0, ijin: 0, mangkir: 0, sp: 0, 
    gaji: 0, levelJabatan: '', 
    periodeStart: '', periodeEnd: '', namaPenilai: '',
    weight_grit: 30, weight_growth: 20, weight_prof: 30, weight_sus: 20
  });

  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Secure PIN access state
  const [codeAttempt, setCodeAttempt] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [isAccessGranted, setIsAccessGranted] = useState(false);
  const [expectedPin, setExpectedPin] = useState('');

  const emptyData = {
    grit_1: "", grit_2: "", grit_3: "", grit_4: "", grit_5: "",
    growth_1: "", growth_2: "", growth_3: "", growth_4: "", growth_5: "",
    prof_1: "", prof_2: "", prof_3: "", prof_4: "", prof_5: "",
    sus_1: "", sus_2: "", sus_3: "", sus_4: "", sus_5: "",
    telat: 0, ijin: 0, mangkir: 0, sp: 0, 
    gaji: 0, levelJabatan: '', 
    periodeStart: '', periodeEnd: '', namaPenilai: '',
    weight_grit: 30, weight_growth: 20, weight_prof: 30, weight_sus: 20
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('evalId');
    if (id) {
      setEvalId(id);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');
        
        // 1. Fetch all employees
        const empsSnap = await getDocs(collection(db, 'employees'));
        const empsList: Employee[] = [];
        empsSnap.forEach((docSnap) => {
          const emp = { id: docSnap.id, ...docSnap.data() } as Employee;
          if (emp.isActive !== false) {
            empsList.push(emp);
          }
        });
        setAllEmployees(empsList);

        // 2. Fetch performaData settings doc
        const pDoc = await getDoc(doc(db, 'settings', 'performaData'));
        let pins: Record<string, string> = {};
        if (pDoc.exists()) {
          const pData = pDoc.data();
          const pMap = pData.performaDataMap || {};
          setAllPerformaDataMap(pMap);
          
          const globalSet = pMap.globalSettings || pData.globalSettings || {};
          pins = globalSet.atasanPins || {};
          setAllAtasanPins(pins);
        } else {
          setError('⚠️ Konfigurasi sistem evaluasi tidak ditemukan.');
        }

        // 3. Resolve if single employee evalId mode is used
        if (evalId) {
          const currentEmp = empsList.find(e => e.id === evalId);
          if (!currentEmp) {
            setError('Karyawan tidak ditemukan.');
            setLoading(false);
            return;
          }
          
          const managerId = currentEmp.managerId;
          if (!managerId) {
            setError('⚠️ Karyawan ini belum memiliki Atasan Langsung yang terdaftar di Bagan Organisasi. Silakan hubungi Admin HRD untuk menentukan Atasan Langsung karyawan ini terlebih dahulu sebelum melakukan penilaian.');
            setLoading(false);
            return;
          }

          let supervisorName = '';
          if (managerId.startsWith('__EXT__::')) {
            supervisorName = managerId.replace('__EXT__::', '');
          } else {
            const mgrEmp = empsList.find(e => e.id === managerId);
            supervisorName = mgrEmp ? mgrEmp.name : 'Atasan Terdaftar';
          }
          setAtasanName(supervisorName);

          const p = pins[managerId] || '';
          setExpectedPin(p);
          
          if (!p) {
            setError(`⚠️ Akses Terkunci: Atasan Langsung (${supervisorName}) belum memiliki Kode PIN Evaluasi yang diatur oleh Admin HRD. Silakan hubungi Admin HRD untuk menetapkan PIN Atasan Langsung di dashboard terlebih dahulu.`);
          }
        }
      } catch (err) {
        setError('Gagal memuat data penilaian dari Cloud Firestore.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [evalId]);

  // Sync Form data when changing active subordinate
  useEffect(() => {
    if (!selectedSubordinate) return;
    
    const savedForSub = allPerformaDataMap[selectedSubordinate.id];
    if (savedForSub) {
      setData({
        ...emptyData,
        ...upgradePerformaData(savedForSub),
        namaPenilai: savedForSub.namaPenilai || atasanName || ''
      });
    } else {
      setData({
        ...emptyData,
        namaPenilai: atasanName || ''
      });
    }
    setSuccessMsg('');
    setError('');
  }, [selectedSubordinate, allPerformaDataMap, atasanName]);

  const handleChange = (field: string, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (codeAttempt.trim() === '') {
      setPasscodeError('Harap isi Kode PIN terlebih dahulu.');
      return;
    }
    
    const pinInput = codeAttempt.trim();

    // Context A: Individual Link Mode
    if (evalId) {
      if (pinInput === expectedPin) {
        const currentEmp = allEmployees.find(e => e.id === evalId);
        if (currentEmp && currentEmp.managerId) {
          const mgrId = currentEmp.managerId;
          setActiveManagerId(mgrId);
          setIsAccessGranted(true);
          
          const subs = allEmployees.filter(empItem => empItem.managerId === mgrId);
          setSubordinates(subs);
          setSelectedSubordinate(currentEmp); // Autofocus evaluated staff
        }
      } else {
        // Cross divisional alert system
        const matchedOtherManagerEntry = Object.entries(allAtasanPins).find(([_, val]) => val === pinInput);
        if (matchedOtherManagerEntry) {
          const otherMgrId = matchedOtherManagerEntry[0];
          const otherMgr = allEmployees.find(empItem => empItem.id === otherMgrId);
          const otherName = otherMgr ? otherMgr.name : (otherMgrId.startsWith('__EXT__::') ? otherMgrId.replace('__EXT__::', '') : 'Manajer Lain');
          setPasscodeError(`⚠️ PIN Terdeteksi! Halo Bapak/Ibu ${otherName}, Anda adalah Atasan dari divisi lain. Anda hanya diizinkan menilai bawahan langsung Anda sendiri. Penilaian lintas divisi dilarang demi kerahasiaan & privasi divisi.`);
        } else {
          setPasscodeError('❌ Kode PIN yang Anda masukkan salah atau sudah tidak aktif. Silakan tanyakan kembali pada Admin HRD atau Atasan langsung Anda.');
        }
      }
    } else {
      // Context B: Unified Portal Link Mode
      const matchedManagerEntry = Object.entries(allAtasanPins).find(([_, val]) => val === pinInput);
      if (matchedManagerEntry) {
        const mgrId = matchedManagerEntry[0];
        setActiveManagerId(mgrId);
        
        // Find supervisor's identity name
        let supervisorName = '';
        if (mgrId.startsWith('__EXT__::')) {
          supervisorName = mgrId.replace('__EXT__::', '');
        } else {
          const mgrEmp = allEmployees.find(e => e.id === mgrId);
          supervisorName = mgrEmp ? mgrEmp.name : 'Atasan Terdaftar';
        }
        setAtasanName(supervisorName);

        // Fetch subordinates under this manager
        const subs = allEmployees.filter(empItem => empItem.managerId === mgrId);
        setSubordinates(subs);
        setIsAccessGranted(true);
        setSelectedSubordinate(null); // Keep as dashboard, select subordinate from left sidebar
      } else {
        setPasscodeError('❌ Kode PIN yang Anda masukkan salah atau tidak terdaftar di sistem. Silakan tanyakan PIN Anda pada Admin HRD.');
      }
    }
  };

  const handleSave = async () => {
    if (!selectedSubordinate) return;
    setSuccessMsg('');
    setError('');

    const subId = selectedSubordinate.id;
    const missingDataWarning: string[] = [];
    
    if (!data.namaPenilai || data.namaPenilai.trim() === "") {
      missingDataWarning.push("Nama Lengkap Penilai belum diisi");
    }

    const categoriesToCheck = [
      { name: 'GRIT', prefix: 'grit' },
      { name: 'GROWTH', prefix: 'growth' },
      { name: 'PROFESSIONALISM', prefix: 'prof' },
      { name: 'SUSTAINABLE', prefix: 'sus' }
    ];

    const emptyCategories: string[] = [];
    categoriesToCheck.forEach(cat => {
      const unansweredCount = [1, 2, 3, 4, 5].filter(num => {
        const key = `${cat.prefix}_${num}`;
        return data[key] === undefined || data[key] === null || data[key] === "";
      }).length;

      if (unansweredCount > 0) {
        emptyCategories.push(`${cat.name} (${unansweredCount} kriteria belum dinilai)`);
      }
    });

    if (emptyCategories.length > 0) {
      missingDataWarning.push(`Skor kriteria belum lengkap pada kategori: ${emptyCategories.join(', ')}`);
    }

    if (missingDataWarning.length > 0) {
      setError(`⚠️ Gagal menyimpan penilaian! Harap lengkapi seluruh data: ${missingDataWarning.join(' dan ')}.`);
      
      const scrollEl = document.querySelector('.overflow-y-auto');
      if (scrollEl) {
        scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    
    setIsSaving(true);
    
    try {
      const pDoc = await getDoc(doc(db, 'settings', 'performaData'));
      let currentMap: Record<string, any> = {};
      let globalSet = {};
      if (pDoc.exists()) {
        const d = pDoc.data();
        currentMap = d.performaDataMap || {};
        globalSet = currentMap.globalSettings || d.globalSettings || {};
      }

      const previousEmpData = currentMap[subId] || {};
      const existingHistory = previousEmpData.history || [];
      const wasPreviouslyEvaluated = previousEmpData.grit_1 !== undefined && previousEmpData.grit_1 !== "";
      
      let finalHistory = [...existingHistory];
      if (wasPreviouslyEvaluated) {
        const archiveLabel = previousEmpData.periodeStart || previousEmpData.periodeEnd
          ? `Periode ${previousEmpData.periodeStart ? new Date(previousEmpData.periodeStart).toLocaleDateString('id-ID', {month: 'short', year: '2-digit'}) : ''} - ${previousEmpData.periodeEnd ? new Date(previousEmpData.periodeEnd).toLocaleDateString('id-ID', {month: 'short', year: '2-digit'}) : ''}`
          : `Kontrak Lalu (${previousEmpData.namaPenilai || 'Penilai'})`;
          
        const oldSnapshot = {
          ...previousEmpData,
          id: `auto_${Date.now()}`,
          namaPeriode: `${archiveLabel} (Otomatis)`,
          history: undefined
        };
        finalHistory.push(oldSnapshot);
      }

      currentMap[subId] = {
        ...data,
        history: finalHistory
      };

      await setDoc(doc(db, 'settings', 'performaData'), { performaDataMap: currentMap, globalSettings: globalSet }, { merge: true });
      
      // Instantly update local map to change active subordinate status indicators dynamically
      setAllPerformaDataMap(currentMap);
      setSuccessMsg(`Penilaian untuk ${selectedSubordinate.name} berhasil disimpan!`);
      
      // Auto-scroll up to success notice
      const scrollEl = document.querySelector('.overflow-y-auto');
      if (scrollEl) {
        scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      console.error(err);
      setError('Gagal mengamankan data penilaian ke sistem database Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    setIsAccessGranted(false);
    setActiveManagerId(null);
    setSelectedSubordinate(null);
    setCodeAttempt('');
    setPasscodeError('');
    setSuccessMsg('');
    setError('');
  };

  if (loading) {
    return (
      <div className="h-[100dvh] bg-slate-50 flex items-center justify-center">
         <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  const renderScoreSection = (
    categoryTitle: string,
    weight: number,
    keyPrefix: string,
    fields: string[],
    legends: { title: string, desc: string, color: string }[]
  ) => {
    const keys = fields.map((_, i) => `${keyPrefix}_${i + 1}`);
    let sum = 0;
    let count = 0;
    keys.forEach(k => {
      const val = data[k];
      if (val !== undefined && val !== "") {
        sum += Number(val);
        count++;
      }
    });
    
    const avgScore100 = count > 0 ? (sum / count) : 0;
    const avgScale = count > 0 ? (avgScore100 / 25) : null;
    const totalScaled = count > 0 ? (avgScore100 * (weight / 100)) : 0;

    return (
      <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-5 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-3 gap-3">
          <div>
            <h3 className="font-black text-base text-slate-800 uppercase tracking-widest">{categoryTitle}</h3>
            <p className="text-xs font-bold text-slate-500 mt-1">Skor Rata-rata: {avgScale ? avgScale.toFixed(1) : '-'}</p>
          </div>
          <div className="bg-slate-50 text-indigo-700 px-4 py-2 rounded-xl text-xs font-black border border-slate-200 shadow-sm shrink-0">
             BOBOT: <span className="text-indigo-900">{weight}%</span>
          </div>
        </div>
  
        {/* Legend Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 pb-2">
           {legends.map((leg, i) => (
             <div key={i} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 hover:border-indigo-100 transition-all">
                <p className={`text-[10px] font-black mb-1 ${leg.color}`}>{leg.title}</p>
                <p className="text-[10px] text-slate-500 font-bold leading-relaxed">{leg.desc}</p>
             </div>
           ))}
        </div>
  
        {/* Questions */}
         <div className="flex flex-col gap-2.5 mt-2">
           {fields.map((f, i) => {
              const fieldKey = `${keyPrefix}_${i + 1}`;
              const val = data[fieldKey];
              const displayVal = (val !== "" && val !== undefined) ? Number(val) : '-';
              return (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50/30 hover:bg-indigo-50/20 transition-all gap-4">
                   <span className="text-xs font-bold text-slate-700 flex-1 leading-relaxed">{i + 1}. {f}</span>
                   <div className="flex items-center gap-2.5 shrink-0">
                      <div className="w-10 h-10 rounded-xl bg-white border border-indigo-100 flex items-center justify-center text-sm font-black text-indigo-600 shadow-sm font-mono">
                        {displayVal}
                      </div>
                      <div className="relative flex items-center shrink-0">
                        <select 
                          value={val === undefined || val === "" ? "" : val}
                          onChange={(e) => {
                            if (e.target.value === "") {
                               handleChange(fieldKey, "");
                            } else {
                               handleChange(fieldKey, parseInt(e.target.value));
                            }
                          }}
                          className={`appearance-none bg-white border border-slate-200 text-xs font-bold rounded-xl pl-3 pr-10 py-2.5 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all cursor-pointer shadow-sm w-[180px] ${val === undefined || val === "" ? "text-slate-400" : "text-slate-700"} font-sans`}
                        >
                           <option value="" disabled>Pilih Nilai</option>
                           <option value={125}>Skor 5 (Sangat Bagus)</option>
                           <option value={100}>Skor 4 (Bagus)</option>
                           <option value={75}>Skor 3 (Standar)</option>
                           <option value={50}>Skor 2 (Kurang)</option>
                           <option value={25}>Skor 1 (Sangat Kurang)</option>
                           <option value={0}>Tidak Ada</option>
                        </select>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {val !== undefined && val !== "" && (
                            <button
                              type="button"
                              onClick={() => handleChange(fieldKey, "")}
                              className="text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors p-1.5 rounded-md z-10 relative cursor-pointer flex items-center justify-center"
                              title="Reset nilai"
                            >
                              <Icon name="x" size={12} strokeWidth={3} />
                            </button>
                          )}
                          <div className="pointer-events-none text-slate-400">
                             <Icon name="chevron-down" size={14} />
                          </div>
                        </div>
                      </div>
                   </div>
                </div>
              );
           })}
        </div>
  
        {/* Summary Footer */}
        <div className="bg-indigo-50/30 rounded-2xl p-4 mt-2 border border-indigo-100/50 shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-50">
                 <Icon name="sigma" size={20} />
              </div>
              <div>
                 <p className="text-xs font-black text-slate-800 uppercase tracking-wide">Total Nilai {categoryTitle.split(' ')[0]}</p>
                 <p className="text-[10px] font-bold text-slate-400">Rata-rata ({avgScale ? avgScale.toFixed(1) : '-'}) × Bobot {weight}%</p>
              </div>
           </div>
           <div className="text-2xl font-black text-indigo-600 tracking-tight font-mono">
              {totalScaled > 0 ? totalScaled.toFixed(1) : '0.0'}
           </div>
        </div>
      </div>
    );
  };

  const getSubordinateStatus = (sub: Employee) => {
    const saved = allPerformaDataMap[sub.id];
    return !!(saved && (saved.grit_1 !== undefined && saved.grit_1 !== ""));
  };

  const currentEvaluatedCount = subordinates.filter(getSubordinateStatus).length;
  const progressPercent = subordinates.length > 0 ? (currentEvaluatedCount / subordinates.length) * 100 : 0;

  // Filter list of subordinates based on search bar query
  const filteredSubordinates = subordinates.filter(sub => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      sub.name.toLowerCase().includes(query) ||
      (sub.pos && sub.pos.toLowerCase().includes(query)) ||
      (sub.dept && sub.dept.toLowerCase().includes(query))
    );
  });

  return (
    <div className="h-[100dvh] bg-slate-50 flex flex-col animate-fadeIn overflow-hidden">
      
      {/* Dynamic Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-4 text-white flex shrink-0 items-center justify-between sticky top-0 z-10 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-sm">
            <Icon name="clipboard-check" size={16} />
          </div>
          <div>
            <span className="font-black text-xs sm:text-sm tracking-widest uppercase block">
              PORTAL EVALUASI KINERJA
            </span>
            {isAccessGranted && (
              <span className="text-[10px] text-indigo-300 font-bold tracking-wider uppercase block">
                Evaluator: <span className="text-slate-100 font-extrabold">{atasanName}</span>
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {isAccessGranted && (
            <button 
              onClick={handleLogout} 
              className="text-indigo-200 hover:text-white bg-white/10 border border-white/15 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
            >
              <Icon name="log-out" size={12} />
              Ganti PIN / Keluar
            </button>
          )}
          <button 
            onClick={onGoToLogin} 
            className="text-slate-400 hover:text-slate-200 text-xs font-bold transition-colors font-semibold"
          >
            Kembali
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* VIEW 1: SECURITY GATE (PIN ENTRY) */}
        {!isAccessGranted ? (
          <div className="flex-1 overflow-y-auto px-4 py-12 flex items-center justify-center">
            <div className="max-w-md w-full bg-white rounded-3xl border border-slate-100 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.06)] p-8 text-center flex flex-col items-center">
              
              {/* Lock Badge */}
              <div className="w-20 h-20 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
                <Icon name="lock" size={32} />
              </div>
              
              <h3 className="text-xl font-black text-slate-800 tracking-tight leading-tight">
                {evalId ? 'Akses Evaluasi Terkunci' : 'Portal Evaluasi Atasan'}
              </h3>
              
              <p className="text-xs font-black text-indigo-600 mt-1 uppercase tracking-widest bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-lg">
                Sistem Keamanan Aktif
              </p>
              
              <p className="text-slate-500 font-semibold text-xs mt-4 mb-6 leading-relaxed max-w-sm">
                {evalId ? (
                  <>Formulir penilaian untuk <span className="font-extrabold text-slate-700">{allEmployees.find(e => e.id === evalId)?.name}</span> dilindungi privasi. Harap masukkan Kode PIN Atasan Langsung Anda untuk membuka form ini.</>
                ) : (
                  <>Satu tautan praktis untuk semua bawahan Anda. Harap masukkan 6-digit Kode PIN Atasan Anda untuk membuka dan menilai seluruh tim bawahan langsung Anda.</>
                )}
              </p>

              {passcodeError && (
                <div className="mb-4 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold p-3.5 rounded-xl flex items-start gap-2 text-left w-full">
                  <Icon name="alert-triangle" size={16} className="shrink-0 mt-0.5" />
                  <div>{passcodeError}</div>
                </div>
              )}

              {!error && (
                <form onSubmit={handleVerifyPin} className="w-full space-y-4">
                  <div className="text-left">
                    <label className="block text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1.5 text-center">
                      MASUKKAN 6-DIGIT PIN ATASAN LANGSUNG
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      value={codeAttempt}
                      onChange={(e) => {
                        setPasscodeError('');
                        setCodeAttempt(e.target.value.replace(/\D/g, ''));
                      }}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-extrabold text-2xl tracking-[0.5em] text-center rounded-2xl py-3.5 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all shadow-inner placeholder:text-slate-200 font-mono"
                      placeholder="••••••"
                    />
                  </div>

                  {evalId && (
                    <div className="bg-slate-50/70 border border-slate-100 p-3 rounded-2xl text-[11px] text-slate-500 font-bold text-left space-y-1">
                      <div className="flex gap-1.5">
                        <span className="text-slate-400 font-medium">Atasan Berwenang:</span>
                        <span className="text-slate-700 font-extrabold">{atasanName}</span>
                      </div>
                      <p className="text-slate-400 font-medium leading-relaxed">
                        *Keamanan ketat: khusus Atasan Langsung terdaftar. Penilaian lintas divisi dilarang demi menjaga objektivitas dan kerahasiaan.
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs rounded-2xl shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-2 uppercase tracking-wider"
                  >
                    <Icon name="unlock" size={14} />
                    Masuk ke Dashboard Penilaian
                  </button>
                </form>
              )}

              {error && (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 p-4 rounded-2xl text-xs font-bold leading-relaxed text-left w-full mt-2">
                  {error}
                </div>
              )}

              <button
                onClick={onGoToLogin}
                className="text-slate-400 hover:text-slate-600 font-bold text-[11px] mt-6 transition-all"
              >
                Kembali ke Halaman Utama
              </button>
            </div>
          </div>
        ) : (
          
          /* VIEW 2: PORTAL GRANTED - LAYOUT TEAM BOARD */
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* SIDEBAR: LIST TIM BAWAHAN (Left on desktop, dynamic on mobile) */}
            <div className={`md:w-80 border-r border-slate-100 bg-white flex flex-col shrink-0 overflow-hidden ${selectedSubordinate ? 'hidden md:flex' : 'w-full flex'}`}>
              
              {/* Supervisor Info Mini Card */}
              <div className="p-4 bg-slate-50/70 border-b border-slate-100 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                    <Icon name="users" size={16} />
                  </div>
                  <div>
                    <h4 className="font-black text-xs text-slate-800 uppercase tracking-widest leading-none">
                      Bawahan Langsung Anda
                    </h4>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                      Satu link untuk seluruh tim
                    </p>
                  </div>
                </div>

                {/* Progress bar info */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-slate-500">Progress Penilaian</span>
                    <span className="text-indigo-600 font-black">{currentEvaluatedCount}/{subordinates.length} Staf</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden shadow-inner border border-slate-100">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 to-indigo-600 h-full transition-all duration-500 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Subordinate SEARCH BAR */}
              <div className="px-3 py-2 border-b border-slate-100 bg-white">
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Icon name="search" size={12} />
                  </span>
                  <input
                    type="text"
                    placeholder="Cari nama bawahan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 placeholder:text-slate-400 rounded-xl outline-none focus:bg-white focus:border-indigo-400 transition-all font-sans"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <Icon name="x" size={10} />
                    </button>
                  )}
                </div>
              </div>

              {/* Subordinate List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredSubordinates.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-150 m-2">
                    <p className="text-[11px] text-slate-400 font-bold leading-normal">
                      {searchQuery ? 'Pencarian tidak cocok.' : 'Belum ada bawahan langsung yang didaftarkan di dalam sistem untuk Atasan ini.'}
                    </p>
                  </div>
                ) : (
                  filteredSubordinates.map((sub) => {
                    const isSelected = selectedSubordinate?.id === sub.id;
                    const isEvaluated = getSubordinateStatus(sub);
                    
                    return (
                      <button
                        key={sub.id}
                        onClick={() => setSelectedSubordinate(sub)}
                        className={`w-full text-left p-3 rounded-2xl flex items-center justify-between transition-all gap-3 cursor-pointer border ${
                          isSelected 
                            ? 'bg-indigo-50/70 border-indigo-200/80 shadow-sm' 
                            : 'bg-white hover:bg-slate-50/50 border-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          {/* Circle Avatar initials */}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs shrink-0 border ${
                            isEvaluated 
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {sub.name.trim().charAt(0).toUpperCase()}
                          </div>
                          <div className="overflow-hidden leading-tight">
                            <span className="block text-xs font-black text-slate-800 truncate">
                              {sub.name}
                            </span>
                            <span className="block text-[10px] text-slate-500 font-bold truncate mt-0.5">
                              {sub.pos || "No Position"}
                            </span>
                          </div>
                        </div>

                        {/* Evaluation Status Stamp */}
                        <div className="shrink-0 flex items-center justify-center">
                          {isEvaluated ? (
                            <div className="flex items-center gap-0.5 text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-lg border border-emerald-100" title="Penilaian Selesai Ditulis">
                              <Icon name="check" size={10} strokeWidth={4} />
                              <span className="text-[8px] font-black uppercase tracking-wider">OK</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5 text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-lg border border-slate-200" title="Belum Dinilai">
                              <Icon name="clock" size={10} strokeWidth={3} />
                              <span className="text-[8px] font-black uppercase tracking-wider">WAIT</span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* DETAIL & FORM SECTION (Right on desktop, toggle on mobile) */}
            <div className={`flex-1 flex flex-col overflow-hidden bg-slate-50/30 ${!selectedSubordinate ? 'hidden md:flex' : 'flex'}`}>
              
              {/* Selected Subordinate Detail Column */}
              {!selectedSubordinate ? (
                
                /* SUB-VIEW 2A: EMPTY STATE WELCOME INSTRUCTIONS */
                <div className="flex-1 overflow-y-auto p-6 sm:p-12 flex items-center justify-center">
                  <div className="max-w-xl text-center bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center">
                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-2xl flex items-center justify-center mb-6">
                      <Icon name="users" size={28} />
                    </div>
                    
                    <h3 className="text-xl font-black text-slate-800 tracking-tight leading-snug">
                      Selamat Datang di Portal Penilaian Kinerja!
                    </h3>
                    
                    <p className="text-slate-500 font-semibold text-xs mt-3 mb-6 max-w-md leading-relaxed">
                      Halo Bapak/Ibu <strong className="text-slate-800 font-black">{atasanName}</strong>. Di sini Anda dapat melakukan pengisian form penilaian seluruh staf bawahan langsung Anda dalam satu tempat tanpa perlu membuka banyak tautan.
                    </p>

                    {/* Progress tracking stat in Dashboard */}
                    <div className="w-full bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner space-y-2 mb-6 text-left">
                      <div className="flex justify-between items-center text-xs font-black uppercase text-slate-500">
                        <span>Status Penilaian Tim Anda</span>
                        <span className="text-indigo-600">{currentEvaluatedCount} / {subordinates.length} Karyawan</span>
                      </div>
                      
                      <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden border border-slate-100">
                        <div 
                          className="bg-gradient-to-r from-emerald-500 to-indigo-600 h-full rounded-full transition-all duration-700"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-medium text-slate-400 text-center pt-1">
                        {progressPercent === 100 
                          ? '🎉 Sempurna! Seluruh tim bawahan langsung Anda telah selesai dievaluasi.' 
                          : `${subordinates.length - currentEvaluatedCount} karyawan belum dievaluasi. Luangkan waktu sejenak untuk melengkapi.`
                        }
                      </p>
                    </div>

                    <div className="text-left w-full border-t border-slate-100 pt-5 space-y-2">
                      <h4 className="font-extrabold text-xs text-slate-700 uppercase tracking-wider mb-2">
                        Petunjuk Evaluasi Praktis:
                      </h4>
                      <ol className="list-decimal list-inside text-[11px] text-slate-500 font-medium space-y-1.5 leading-relaxed">
                        <li>Pilih nama karyawan yang akan dinilai dari panel sebelah kiri.</li>
                        <li>Evaluasi secara objektif pada 4 pilar kompetensi utama (Grit, Growth, Profesionalisme, Sustainable).</li>
                        <li>Setiap pilar memiliki persentase bobot tersendiri sesuai sistem evaluasi HRD.</li>
                        <li>Masukkan nama lengkap Anda sebagai Penilai, lalu klik <strong>Simpan Penilaian Evaluator</strong>.</li>
                        <li>Gunakan bilah pencarian jika Anda memiliki tim berskala besar.</li>
                      </ol>
                    </div>

                    <div className="mt-8 md:hidden">
                      <span className="text-xs bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2 font-bold text-indigo-700">
                        Tap "Pilih Tim" di atas untuk memulai
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                
                /* SUB-VIEW 2B: EXTREME CRAFTSMAN EVALUATION FORM CONTAINER */
                <div className="flex-1 flex flex-col overflow-hidden">
                  
                  {/* Subordinate Header banner */}
                  <div className="bg-white p-4 border-b border-slate-100 shrink-0 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                      {/* Mobile Go Back to List button */}
                      <button 
                        onClick={() => setSelectedSubordinate(null)}
                        className="md:hidden bg-slate-50 p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer shrink-0"
                        title="Kembali ke Daftar Bawahan"
                      >
                        <Icon name="arrow-left" size={16} />
                      </button>
                      
                      <div className="w-11 h-11 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-black text-base shrink-0 border border-indigo-100">
                        {selectedSubordinate.name.trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="overflow-hidden leading-tight">
                        <h2 className="font-black text-sm text-slate-800 truncate leading-none">
                          {selectedSubordinate.name}
                        </h2>
                        <p className="text-[10px] text-slate-400 font-bold block truncate mt-1">
                          {selectedSubordinate.pos} • {selectedSubordinate.dept} {selectedSubordinate.status ? `(${selectedSubordinate.status})` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Evaluated Manager pre-configured */}
                    <div className="shrink-0 flex items-center gap-2">
                      <div className="text-right hidden sm:block">
                        <label className="block text-[9px] font-black text-slate-400 tracking-wider uppercase mb-0.5">Nama Atasan (Evaluator)</label>
                        <span className="text-xs font-black text-slate-800 bg-slate-50 border border-slate-150 px-3 py-1.5 rounded-lg">{atasanName}</span>
                      </div>
                    </div>
                  </div>

                  {/* FORM BODY SCROLL PANEL */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                    <div className="max-w-4xl mx-auto space-y-6">
                      
                      {error && (
                        <div className="bg-rose-50 text-rose-700 p-4 rounded-xl border border-rose-200 text-xs font-bold leading-relaxed flex items-start gap-2.5 shadow-sm">
                           <Icon name="alert-circle" size={16} className="shrink-0 mt-0.5" />
                           <div>{error}</div>
                        </div>
                      )}
                      
                      {successMsg && (
                        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-200 text-xs font-bold leading-relaxed flex items-center gap-2.5 shadow-sm">
                           <Icon name="check" size={16} className="shrink-0" />
                           <div>{successMsg}</div>
                        </div>
                      )}

                      {/* Header Input for Penilai's full name if needed */}
                      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-black text-slate-400 tracking-wider uppercase">Nama Lengkap Penilai</label>
                          <p className="text-xs text-slate-500 font-bold">Harap konfirmasi nama lengkap Anda di bawah ini sebelum menyimpan hasil penilaian.</p>
                        </div>
                        <input 
                          type="text" 
                          placeholder="Ketik nama lengkap penilai..." 
                          value={data.namaPenilai} 
                          onChange={e => handleChange('namaPenilai', e.target.value)} 
                          className="w-full md:w-80 text-xs font-bold bg-slate-50 border border-slate-200 p-3 rounded-xl focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-none" 
                        />
                      </div>

                      {/* Performance Appraisal Policy Card */}
                      <div className="bg-gradient-to-r from-indigo-50/80 to-blue-50/35 border border-indigo-100/50 p-5 rounded-3xl flex items-start gap-4 shadow-sm">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md">
                          <Icon name="shield" size={18} />
                        </div>
                        <div className="space-y-1">
                          <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">PAKTA INTEGRITAS APPRAISAL</h3>
                          <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                            Formulir evaluasi ini digunakan sebagai bentuk penilaian performa komprehensif tahunan. Harap mengisi setiap item indikator dengan penuh <strong>tanggung jawab, kejujuran, dan objektifitas tinggi</strong> demi menghasilkan kesimpulan penilaian yang akurat bagi perkembangan karier staf terkait.
                          </p>
                        </div>
                      </div>

                      {/*Pilars scoring sections lists */}
                      <div className="flex flex-col gap-1">
                         {renderScoreSection('GRIT (Pilar Ketahanan)', 30, 'grit', [
                            'Kemauan belajar hal baru yang menjadi tuntutan pekerjaan',
                            'Kemauan extra effort dalam penyelesaian hambatan pekerjaan',
                            'Menunjukkan sikap give & take pada pekerjaan',
                            'Fokus pada penyelesaian tugas hingga tuntas',
                            'Ketahanan dan pantang menyerah dalam menghadapi tekanan'
                         ], [
                            { title: 'Skor 1 (Sangat Kurang)', desc: 'Sangat mudah menyerah, menolak tugas.', color: 'text-rose-600' },
                            { title: 'Skor 2 (Kurang)', desc: 'Kurang tekun, inisiatif minim, banyak alasan.', color: 'text-amber-600' },
                            { title: 'Skor 3 (Standar)', desc: 'Penyelesaian standar, inisiatif butuh arahan.', color: 'text-slate-600' },
                            { title: 'Skor 4 (Bagus)', desc: 'Tekun, inisiatif mandiri, pantang menyerah.', color: 'text-blue-600' },
                            { title: 'Skor 5 (Sangat Bagus)', desc: 'Sangat gigih, proaktif, kualitas luar biasa.', color: 'text-emerald-600' }
                         ])}

                         {renderScoreSection('GROWTH (Pilar Perkembangan)', 20, 'growth', [
                            'Memiliki skill yang berkembang seiring waktu',
                            'Tidak mengulang kesalahan yang sama dalam pekerjaan',
                            'Keterbukaan terhadap saran & kritik dalam bekerja',
                            'Menunjukkan kesiapan saat diberikan tanggung jawab lebih',
                            'Kontribusi pada peningkatan sistem kerja'
                         ], [
                            { title: 'Skor 1 (Sangat Kurang)', desc: 'Menolak masukan, performa terus menurun.', color: 'text-rose-600' },
                            { title: 'Skor 2 (Kurang)', desc: 'Kurang proaktif, mengulang kesalahan sama.', color: 'text-amber-600' },
                            { title: 'Skor 3 (Standar)', desc: 'Belajar bila diminta, terbuka terhadap masukan ringan.', color: 'text-slate-600' },
                            { title: 'Skor 4 (Bagus)', desc: 'Terbuka inovasi, kinerja mulai terlihat meningkat.', color: 'text-blue-600' },
                            { title: 'Skor 5 (Sangat Bagus)', desc: 'Sangat proaktif belajar inovasi, kinerja melesat.', color: 'text-emerald-600' }
                         ])}

                         {renderScoreSection('PROFESSIONALISM (Pilar Etika)', 30, 'prof', [
                            'Tanggung jawab terhadap pekerjaan & komunikasi efektif',
                            'Bekerja dengan integritas dan etika',
                            'Kepatuhan pada prosedur dan aturan kerja',
                            'Kemampuan berkolaborasi dalam alur kerja tim',
                            'Kemampuan melakukan efisiensi dan produktifitas'
                         ], [
                             { title: 'Skor 1 (Sangat Kurang)', desc: 'Sering melanggar aturan, tidak bertanggung jawab.', color: 'text-rose-600' },
                             { title: 'Skor 2 (Kurang)', desc: 'Kurang tanggap, komunikasi seadanya, perlu diawasi.', color: 'text-amber-600' },
                             { title: 'Skor 3 (Standar)', desc: 'Tanggung jawab tercapai, komunikasi cukup, patuh.', color: 'text-slate-600' },
                             { title: 'Skor 4 (Bagus)', desc: 'Bertanggung jawab penuh, komunikasi lancar.', color: 'text-blue-600' },
                             { title: 'Skor 5 (Sangat Bagus)', desc: 'Integritas sangat tinggi, menjadi teladan profesional.', color: 'text-emerald-600' }
                         ])}

                         {renderScoreSection('SUSTAINABLE (Pilar Keberlanjutan)', 20, 'sus', [
                            'Kemampuan adaptasi pada perubahan pola kerja',
                            'Memiliki loyalitas bertahan di perusahaan',
                            'Konsistensi dalam memberikan hasil kerja yang berkualitas',
                            'Memiliki komitmen untuk tumbuh bersama tujuan perusahaan',
                            'Kemampuan mempertahankan motivasi kerja dalam jangka panjang'
                         ], [
                             { title: 'Skor 1 (Sangat Kurang)', desc: 'Menolak keras perubahan, banyak mengeluh.', color: 'text-rose-600' },
                             { title: 'Skor 2 (Kurang)', desc: 'Lambat beradaptasi, sering bingung metode baru.', color: 'text-amber-600' },
                             { title: 'Skor 3 (Standar)', desc: 'Bisa beradaptasi bila diajari, kualitas stabil.', color: 'text-slate-600' },
                             { title: 'Skor 4 (Bagus)', desc: 'Cepat menyesuaikan diri, mendukung inisiatif perusahaan.', color: 'text-blue-600' },
                             { title: 'Skor 5 (Sangat Bagus)', desc: 'Sangat efisien adaptasi, loyalitas kuat jangka panjang.', color: 'text-emerald-600' }
                         ])}
                      </div>

                      {/* Active Subordinate Save Buttons */}
                      <div className="flex flex-col sm:flex-row gap-3 pt-4 justify-end">
                         <button 
                           disabled={isSaving} 
                           onClick={handleSave} 
                           className="w-full sm:w-auto min-w-[240px] px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 cursor-pointer"
                         >
                           {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Icon name="save" size={14} />}
                           {isSaving ? 'Menyimpan...' : `Simpan Nilai ${selectedSubordinate.name}`}
                         </button>
                         {subordinates.length > 1 && (
                           <button 
                             onClick={() => setSelectedSubordinate(null)} 
                             className="w-full sm:w-auto px-6 py-3.5 bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-800 transition-all font-black text-xs uppercase tracking-wider rounded-2xl cursor-pointer flex items-center justify-center"
                           >
                             Form Tim Selesai
                           </button>
                         )}
                      </div>

                    </div>
                  </div>

                </div>
              )}

            </div>

          </div>
        )}

      </div>
    </div>
  );
};
