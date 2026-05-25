import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { db } from '../firebase';
import { doc, getDoc, setDoc, query, collection, getDocs, where } from 'firebase/firestore';
import { Employee } from '../types';

interface PublicEvaluasiViewProps {
  onGoToLogin: () => void;
}

export const PublicEvaluasiView: React.FC<PublicEvaluasiViewProps> = ({ onGoToLogin }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [evalId, setEvalId] = useState<string | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [data, setData] = useState<any>({
    grit_1: 0, grit_2: 0, grit_3: 0, grit_4: 0, grit_5: 0,
    growth_1: 0, growth_2: 0, growth_3: 0, growth_4: 0, growth_5: 0,
    prof_1: 0, prof_2: 0, prof_3: 0, prof_4: 0, prof_5: 0,
    sus_1: 0, sus_2: 0, sus_3: 0, sus_4: 0, sus_5: 0,
    telat: 0, ijin: 0, mangkir: 0, sp: 0,
    gaji: 0, levelJabatan: 'Staff', customMultiplier: null, customLevelName: '',
    periodeStart: '', periodeEnd: '', namaPenilai: '',
    weight_grit: 30, weight_growth: 20, weight_prof: 30, weight_sus: 20
  });

  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  // Job levels for custom selection
  const [jobLevels, setJobLevels] = useState<{ id: string, label: string, multiplier: number }[]>([
    { id: 'Staff', label: 'Staff (1.0x)', multiplier: 1.0 },
    { id: 'Senior Staff', label: 'Senior Staff (1.35x)', multiplier: 1.35 },
    { id: 'Kepala Toko', label: 'Kepala Toko (1.75x)', multiplier: 1.75 },
    { id: 'Supervisor', label: 'Supervisor (1.8x)', multiplier: 1.8 },
    { id: 'Head Department', label: 'Head Department (2.8x)', multiplier: 2.8 },
    { id: 'Direktur', label: 'Direktur (4.5x)', multiplier: 4.5 },
  ]);

  useEffect(() => {
    // get evalId from URL ?evalId=xyz
    const params = new URLSearchParams(window.location.search);
    const id = params.get('evalId');
    if (id) {
      setEvalId(id);
    } else {
      // no id, load all employees so reviewer can select
      const fetchEmployees = async () => {
        try {
          const snapshot = await getDocs(collection(db, 'employees'));
          if (!snapshot.empty) {
            const list: Employee[] = [];
            snapshot.forEach(docSnap => {
              if (docSnap.id !== 'counter') {
                const docData = docSnap.data();
                if (!docData.isResigned && !docData.isExternal && !docData.isVirtualExternal) {
                  list.push({ id: docSnap.id, ...docData } as Employee);
                }
              }
            });
            list.sort((a,b) => a.name.localeCompare(b.name));
            setEmployees(list);
          }
        } catch(err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      };
      fetchEmployees();
    }
  }, []);

  useEffect(() => {
    if (!evalId) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        // Load Employee Details
        const empDoc = await getDoc(doc(db, 'employees', evalId));
        if (!empDoc.exists()) {
          setError('Karyawan tidak ditemukan.');
          setLoading(false);
          return;
        }
        setEmployee({ id: empDoc.id, ...empDoc.data() } as Employee);

        // Load Performa Data
        const pDoc = await getDoc(doc(db, 'settings', 'performaData'));
        if (pDoc.exists()) {
          const pData = pDoc.data();
          if (pData.globalSettings && pData.globalSettings.jobLevels) {
            setJobLevels(pData.globalSettings.jobLevels);
          }
          if (pData.performaDataMap && pData.performaDataMap[evalId]) {
            setData(prev => ({ ...prev, ...pData.performaDataMap[evalId] }));
          }
        }
      } catch (err) {
        setError('Gagal memuat data penilaian.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [evalId]);

  const handleChange = (field: string, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!evalId) return;
    setIsSaving(true);
    setSuccessMsg('');
    setError('');
    
    try {
      const pDoc = await getDoc(doc(db, 'settings', 'performaData'));
      let currentMap = {};
      let globalSet = {};
      if (pDoc.exists()) {
        const d = pDoc.data();
        currentMap = d.performaDataMap || {};
        globalSet = d.globalSettings || {};
      }
      currentMap[evalId] = data;
      await setDoc(doc(db, 'settings', 'performaData'), { performaDataMap: currentMap, globalSettings: globalSet }, { merge: true });
      
      setSuccessMsg('Penilaian berhasil disimpan!');
      setTimeout(() => setSuccessMsg(''), 5000); // hide after 5 sec
    } catch (err) {
      console.error(err);
      setError('Gagal menyimpan penilaian');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[100dvh] bg-slate-50 flex items-center justify-center">
         <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Helper render for Score Box
  const renderScoreInput = (category: string, title: string, keyPrefix: string, fields: any[]) => {
    return (
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-4">
        <h4 className="font-extrabold text-[15px] text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2 mb-2">{title}</h4>
        {fields.map((f, i) => {
          const fieldKey = `${keyPrefix}_${i + 1}`;
          const val = data[fieldKey] || 0;
          return (
            <div key={fieldKey}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[13px] font-bold text-slate-700">{i + 1}. {f.label}</span>
                <span className={`text-[15px] font-black w-14 text-center rounded-lg px-2 py-1 ${val >= 85 ? 'text-emerald-700 bg-emerald-50' : val >= 70 ? 'text-blue-700 bg-blue-50' : val >= 50 ? 'text-amber-700 bg-amber-50' : val > 0 ? 'text-rose-700 bg-rose-50' : 'text-slate-400 bg-slate-50'}`}>{val}</span>
              </div>
              <input 
                type="range" min="0" max="100" step="5" value={val} 
                onChange={(e) => handleChange(fieldKey, parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-[100dvh] bg-slate-50 flex flex-col animate-fadeIn overflow-hidden">
      <div className="bg-blue-600 p-4 text-white flex shrink-0 items-center justify-between sticky top-0 z-10 shadow-md">
        <div className="flex items-center gap-2">
          <Icon name="check-square" size={18} />
          <span className="font-bold text-sm tracking-wide">Input Penilaian Performa</span>
        </div>
        <button onClick={onGoToLogin} className="text-blue-100 hover:text-white text-xs font-bold transition-colors">
          Batal & Kembali
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-24">
          
          {error && (
            <div className="bg-rose-50 text-rose-700 p-4 rounded-xl border border-rose-200 text-sm font-bold flex items-center gap-2">
               <Icon name="alert-circle" size={16} /> {error}
            </div>
          )}
          {successMsg && (
            <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-200 text-sm font-bold flex items-center gap-2">
               <Icon name="check" size={16} /> {successMsg}
            </div>
          )}

          {!evalId ? (
            // Select Employee Mode
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
               <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                 <Icon name="users" size={32} />
               </div>
               <h3 className="text-lg font-black text-slate-800 mb-2">Pilih Karyawan yang Ingin Dinilai</h3>
               <p className="text-slate-500 text-sm mb-6">Silakan pilih karyawan dari daftar di bawah untuk memberikan penilaian kompetensi dan kedisiplinannya.</p>
               <div className="max-w-md mx-auto relative">
                 <select 
                   className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl px-4 py-3 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm"
                   onChange={(e) => {
                     if (e.target.value) {
                       window.location.search = `?mode=evaluasi&evalId=${e.target.value}`;
                     }
                   }}
                   defaultValue=""
                 >
                    <option value="" disabled>-- Pilih Karyawan --</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.pos})</option>)}
                 </select>
                 <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icon name="chevron-down" size={18} /></div>
               </div>
            </div>
          ) : employee && (
            // Form Mode
            <>
              {/* Header Info */}
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-[0_2px_15px_-5px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div className="flex gap-4 items-center">
                  <div className="w-16 h-16 rounded-full bg-blue-100/50 text-blue-600 border border-blue-200 flex items-center justify-center font-black text-2xl shrink-0">
                    {employee.name.trim().charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="font-black text-2xl text-slate-900 leading-tight mb-1">{employee.name}</h2>
                    <p className="text-slate-500 font-bold text-sm tracking-wide">{employee.pos} • {employee.dept}</p>
                  </div>
                </div>
                {/* Meta Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full sm:w-auto">
                    <div>
                      <label className="block text-[11px] font-black text-slate-500 mb-1">Periode Form</label>
                      <input type="month" value={data.periodeStart} onChange={e => handleChange('periodeStart', e.target.value)} className="w-full text-xs font-bold bg-slate-50 border border-slate-200 p-2 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black text-slate-500 mb-1">Nama Penilai</label>
                      <input type="text" placeholder="John Doe" value={data.namaPenilai} onChange={e => handleChange('namaPenilai', e.target.value)} className="w-full text-xs font-bold bg-slate-50 border border-slate-200 p-2 rounded-lg" />
                    </div>
                </div>
              </div>

              {/* Data Primer */}
              <div className="bg-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden text-white">
                <Icon name="database" size={140} className="absolute -bottom-8 -right-8 text-slate-700/50 rotate-12" />
                <h3 className="font-black text-lg mb-6 relative z-10 flex items-center gap-2"><Icon name="dollar-sign" size={20} className="text-emerald-400" /> Profiling Nilai & Gaji (Wajib)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Level Jabatan Aktif</label>
                    <div className="relative">
                      <select 
                        value={data.levelJabatan} onChange={e => handleChange('levelJabatan', e.target.value)}
                        className="w-full appearance-none bg-slate-700/50 border border-slate-600 text-white text-sm font-bold rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">-- Pilih Level Jabatan --</option>
                        {jobLevels.map((l: any) => <option key={l.id} value={l.id}>{l.label}</option>)}
                        <option value="Custom">Custom Jabatan</option>
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><Icon name="chevron-down" size={16} /></div>
                    </div>
                  </div>
                  {data.levelJabatan === 'Custom' && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nama Jabatan Custom</label>
                        <input type="text" placeholder="Misal: CTO" value={data.customLevelName} onChange={e => handleChange('customLevelName', e.target.value)} className="bg-slate-700/50 border border-slate-600 px-4 py-2.5 rounded-xl font-bold text-sm text-white" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Custom Multiplier</label>
                        <input type="number" step="0.01" placeholder="Misal: 3.5" value={data.customMultiplier || ''} onChange={e => handleChange('customMultiplier', parseFloat(e.target.value) || null)} className="bg-slate-700/50 border border-slate-600 px-4 py-2.5 rounded-xl font-bold text-sm text-white" />
                      </div>
                    </>
                  )}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">Gaji Total <span className="text-slate-500 font-medium">Rp</span></label>
                    <input type="number" placeholder="0" value={data.gaji || ''} onChange={e => handleChange('gaji', parseInt(e.target.value) || 0)} className="bg-slate-700/50 border border-slate-600 px-4 py-2.5 rounded-xl font-bold text-sm text-emerald-400 input-no-spinners" />
                  </div>
                </div>
              </div>

              {/* Kompetensi Container */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {renderScoreInput('grit', 'Grit (Ketangguhan) - 30%', 'grit', [
                    { label: 'Ulet / Semangat Mencapai Target' },
                    { label: 'Positif Terhadap Tekanan' },
                    { label: 'Tahan Banting / Resiliensi' },
                    { label: 'Proaktif / Inisiatif' },
                    { label: 'Adaptasi Terhadap Perubahan' }
                 ])}
                 {renderScoreInput('growth', 'Growth System (Pertumbuhan) - 20%', 'growth', [
                    { label: 'Keinginan Belajar (Growth Mindset)' },
                    { label: 'Perkembangan Skill Teknis' },
                    { label: 'Mendengarkan Feedback / Kritik' },
                    { label: 'Problem Solving Skill' },
                    { label: 'Membimbing / Membantu Rekan' }
                 ])}
                 {renderScoreInput('prof', 'Profesionalisme - 30%', 'prof', [
                    { label: 'Integritas / Kejujuran' },
                    { label: 'Tanggung Jawab Pekerjaan' },
                    { label: 'Komunikasi & Teamwork' },
                    { label: 'Kerapian / Standar Kualitas' },
                    { label: 'Attitude Terhadap Atasan / Rekan' }
                 ])}
                 {renderScoreInput('sus', 'System Under System - 20%', 'sus', [
                    { label: 'Kepatuhan Pada SOP' },
                    { label: 'Dokumentasi Tugas' },
                    { label: 'Kerapian Tools & Workspace' },
                    { label: 'Bekerja Sesuai Arahan/Sistem' },
                    { label: 'Efisiensi Waktu Kerja' }
                 ])}
              </div>

              {/* Kedisiplinan Container */}
              <div className="bg-rose-50 border border-rose-100 rounded-3xl p-6 mb-12 shadow-sm">
                <div className="flex items-center gap-2 mb-6 text-rose-700">
                  <Icon name="alert-triangle" size={24} />
                  <h3 className="font-black text-lg">Poin Pelanggaran Kedisiplinan</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl p-4 shadow-sm text-center">
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Terlambat (-1)</p>
                    <input type="number" min="0" value={data.telat} onChange={e => handleChange('telat', parseInt(e.target.value) || 0)} className="w-[80px] bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-xl py-2 rounded-lg text-center mx-auto outline-none transition-colors focus:border-rose-300 focus:bg-rose-50/30" />
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm text-center">
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Izin (-1)</p>
                    <input type="number" min="0" value={data.ijin} onChange={e => handleChange('ijin', parseInt(e.target.value) || 0)} className="w-[80px] bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-xl py-2 rounded-lg text-center mx-auto outline-none transition-colors focus:border-rose-300 focus:bg-rose-50/30" />
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm text-center">
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 text-rose-600">Alpa/Mangkir (-3)</p>
                    <input type="number" min="0" value={data.mangkir} onChange={e => handleChange('mangkir', parseInt(e.target.value) || 0)} className="w-[80px] bg-rose-50 border border-rose-200 text-rose-700 font-extrabold text-xl py-2 rounded-lg text-center mx-auto outline-none transition-colors focus:border-rose-300" />
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm text-center">
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 text-rose-600">Terkena SP (-5)</p>
                    <input type="number" min="0" value={data.sp} onChange={e => handleChange('sp', parseInt(e.target.value) || 0)} className="w-[80px] bg-rose-50 border border-rose-200 text-rose-700 font-extrabold text-xl py-2 rounded-lg text-center mx-auto outline-none transition-colors focus:border-rose-300" />
                  </div>
                </div>
              </div>

               {/* Fixed Save Button Panel */}
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-200/50 flex justify-end z-[100] drop-shadow-2xl">
                 <button disabled={isSaving} onClick={handleSave} className="w-full sm:w-auto px-10 py-3.5 bg-blue-600 hover:bg-blue-700 hover:scale-[1.02] active:scale-95 text-white rounded-2xl font-bold shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition-all flex items-center justify-center gap-2">
                   {isSaving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Icon name="save" size={18} />}
                   {isSaving ? 'Menyimpan...' : 'Simpan Penilaian'}
                 </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
};
