import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Employee } from '../types';

interface PublicEvaluasiViewProps {
  onGoToLogin: () => void;
}

export const PublicEvaluasiView: React.FC<PublicEvaluasiViewProps> = ({ onGoToLogin }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [evalId, setEvalId] = useState<string | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);

  const [data, setData] = useState<any>({
    grit_1: 0, grit_2: 0, grit_3: 0, grit_4: 0, grit_5: 0,
    growth_1: 0, growth_2: 0, growth_3: 0, growth_4: 0, growth_5: 0,
    prof_1: 0, prof_2: 0, prof_3: 0, prof_4: 0, prof_5: 0,
    sus_1: 0, sus_2: 0, sus_3: 0, sus_4: 0, sus_5: 0,
    telat: 0, ijin: 0, mangkir: 0, sp: 0, // Even though concealed, keep data shape
    gaji: 0, levelJabatan: '', 
    periodeStart: '', periodeEnd: '', namaPenilai: '',
    weight_grit: 30, weight_growth: 20, weight_prof: 30, weight_sus: 20
  });

  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('evalId');
    if (id) {
      setEvalId(id);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!evalId) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        const empDoc = await getDoc(doc(db, 'employees', evalId));
        if (!empDoc.exists()) {
          setError('Karyawan tidak ditemukan.');
          setLoading(false);
          return;
        }
        setEmployee({ id: empDoc.id, ...empDoc.data() } as Employee);

        const pDoc = await getDoc(doc(db, 'settings', 'performaData'));
        if (pDoc.exists()) {
          const pData = pDoc.data();
          if (pData.performaDataMap && pData.performaDataMap[evalId]) {
             // Let any existing values map. 
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
      setTimeout(() => setSuccessMsg(''), 5000);
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
      if (data[k]) {
        sum += data[k];
        count++;
      }
    });
    
    // Scale is 20 points per step (1=20, 2=40, etc.)
    // Max per item = 100, so real sum is out of 500 max.
    const avgScore100 = count > 0 ? (sum / count) : 0;
    const avgScale = count > 0 ? (avgScore100 / 20) : null;
    const totalScaled = count > 0 ? (avgScore100 * (weight / 100)) : 0;

    return (
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-blue-50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col gap-6 mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 gap-4">
          <div>
            <h3 className="font-black text-xl text-slate-800 uppercase tracking-widest">{categoryTitle}</h3>
            <p className="text-sm font-bold text-slate-500 mt-1">Skor Rata-rata: {avgScale ? avgScale.toFixed(1) : '-'}</p>
          </div>
          <div className="bg-white text-blue-700 px-5 py-2.5 rounded-xl text-sm font-black border border-blue-100 shadow-sm shrink-0">
             BOBOT: <span className="text-blue-900">{weight}%</span>
          </div>
        </div>
  
        {/* Legend Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
           {legends.map((leg, i) => (
             <div key={i} className="border border-slate-100 rounded-xl p-4 bg-white hover:border-blue-200 transition-colors shadow-sm">
                <p className={`text-[12px] font-black mb-1.5 ${leg.color}`}>{leg.title}</p>
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{leg.desc}</p>
             </div>
           ))}
        </div>
  
        {/* Questions */}
        <div className="flex flex-col gap-3 mt-4">
           {fields.map((f, i) => {
              const fieldKey = `${keyPrefix}_${i + 1}`;
              const val = data[fieldKey] || 0;
              return (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-blue-50/30 transition-colors gap-4 shadow-sm">
                   <span className="text-[14px] font-bold text-slate-700 flex-1 leading-snug">{i + 1}. {f}</span>
                   <div className="flex items-center gap-3 shrink-0">
                      <div className="w-11 h-11 rounded-xl bg-white border border-blue-100 flex items-center justify-center text-base font-black text-blue-600 shadow-sm">
                        {val ? (val / 20) : '-'}
                      </div>
                      <select 
                        value={val}
                        onChange={(e) => handleChange(fieldKey, parseInt(e.target.value))}
                        className="bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl px-4 py-3 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm appearance-none min-w-[160px] relative"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '16px' }}
                      >
                         <option value={0} disabled>Silahkan pilih</option>
                         <option value={20}>Skor 1</option>
                         <option value={40}>Skor 2</option>
                         <option value={60}>Skor 3</option>
                         <option value={80}>Skor 4</option>
                         <option value={100}>Skor 5</option>
                      </select>
                   </div>
                </div>
              );
           })}
        </div>
  
        {/* Summary Footer */}
        <div className="bg-blue-50/50 rounded-2xl p-5 mt-4 border border-blue-100 shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-50">
                 <Icon name="sigma" size={24} />
              </div>
              <div>
                 <p className="text-sm font-black text-slate-800 uppercase tracking-wide mb-1">Total Nilai {categoryTitle.split(' ')[0]}</p>
                 <p className="text-[11px] font-bold text-slate-500">Rata-rata ({avgScale ? avgScale.toFixed(1) : '-'}) × Bobot {weight}%</p>
              </div>
           </div>
           <div className="text-4xl font-black text-blue-600 tracking-tight">
              {totalScaled > 0 ? totalScaled.toFixed(1) : '0.0'}
           </div>
        </div>
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
        <div className="max-w-6xl mx-auto flex flex-col gap-6 pb-24">
          
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
            <div className="bg-white p-10 rounded-3xl shadow-sm border border-rose-100 text-center max-w-xl mx-auto w-full">
               <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
                 <Icon name="alert-circle" size={40} />
               </div>
               <h3 className="text-xl font-black text-rose-800 mb-3">Link Penilaian Tidak Lengkap</h3>
               <p className="text-slate-600 text-sm mb-6 max-w-sm mx-auto leading-relaxed">Harap gunakan link spesifik karyawan yang diberikan oleh admin/HR. Link saat ini tidak menunjuk ke karyawan manapun.</p>
               <button onClick={onGoToLogin} className="bg-rose-50 text-rose-700 font-bold px-6 py-3 rounded-xl hover:bg-rose-100 transition-colors">
                  Kembali
               </button>
            </div>
          ) : employee && (
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
                {/* Meta Inputs (Period removed) */}
                <div className="w-full sm:w-auto">
                    <div>
                      <label className="block text-[11px] font-black text-slate-500 mb-1">Nama Penilai</label>
                      <input type="text" placeholder="Masukkan nama..." value={data.namaPenilai} onChange={e => handleChange('namaPenilai', e.target.value)} className="w-full text-sm font-bold bg-slate-50 border border-slate-200 p-3 rounded-xl focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 outline-none transition-all shadow-sm min-w-[250px]" />
                    </div>
                </div>
              </div>

              {/* Kompetensi Container */}
              <div className="flex flex-col gap-4">
                 {renderScoreSection('GRIT', 30, 'grit', [
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

                 {renderScoreSection('GROWTH', 20, 'growth', [
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

                 {renderScoreSection('PROFESSIONALISM', 30, 'prof', [
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

                 {renderScoreSection('SUSTAINABLE', 20, 'sus', [
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

               {/* Fixed Save Button Panel */}
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-200/50 flex justify-end z-[100] drop-shadow-2xl">
                 <button disabled={isSaving} onClick={handleSave} className="w-full sm:w-auto px-12 py-4 bg-blue-600 hover:bg-blue-700 hover:scale-[1.02] active:scale-95 text-white rounded-2xl font-black text-lg shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition-all flex items-center justify-center gap-3">
                   {isSaving ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Icon name="save" size={20} />}
                   {isSaving ? 'Menyimpan...' : 'Simpan Penilaian Evaluator'}
                 </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
};

