/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const calculateDuration = (joinDateStr: string, endDateStr: string | null = null): string => {
  const start = new Date(joinDateStr);
  const end = endDateStr ? new Date(endDateStr) : new Date(); 
  
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  
  if (months < 0 || (months === 0 && end.getDate() < start.getDate())) {
    years--;
    months += 12;
  }
  
  if (end.getDate() < start.getDate()) {
    months--;
    if (months < 0) {
        months += 12;
    }
  }
  
  if (years <= 0 && months <= 0) return "Kurang dari 1 bulan";
  if (years <= 0) return `${months} bulan`;
  if (months <= 0) return `${years} tahun`;
  return `${years} tahun, ${months} bulan`;
};

export const calculateAge = (dobStr: string): number => {
  const dob = new Date(dobStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return Math.max(0, age); 
};

export const getSourceBadgeClass = (source: string): string => {
  const s = source?.toLowerCase() || '';
  if (s.includes('glints')) return 'bg-red-50 text-red-600 border-red-100/50 shadow-[0_0_8px_rgba(239,68,68,0.1)]';
  if (s.includes('pintarnya')) return 'bg-cyan-50 text-cyan-600 border-cyan-100/50 shadow-[0_0_8px_rgba(6,182,212,0.1)]';
  if (s.includes('indeed')) return 'bg-blue-50 text-blue-600 border-blue-100/50 shadow-[0_0_8px_rgba(59,130,246,0.1)]';
  if (s.includes('jobstreet')) return 'bg-amber-50 text-amber-600 border-amber-100/50 shadow-[0_0_8px_rgba(245,158,11,0.1)]';
  if (s.includes('linkedin')) return 'bg-indigo-50 text-indigo-600 border-indigo-100/50 shadow-[0_0_8px_rgba(99,102,241,0.1)]';
  if (s.includes('internal')) return 'bg-emerald-50 text-emerald-600 border-emerald-100/50 shadow-[0_0_8px_rgba(16,185,129,0.1)]';
  return 'bg-slate-50 text-slate-500 border-slate-200/50'; 
};

export const saveToSpreadsheet = (action: string, data: any) => {
  // @ts-ignore
  if (typeof google !== 'undefined' && google.script) {
    // @ts-ignore
    google.script.run
      .withSuccessHandler(() => console.log(`Berhasil sinkronisasi data ${action} ke Spreadsheet`))
      .withFailureHandler((err: any) => console.error("Gagal sinkronisasi:", err))
      .processAction(action, data);
  } else {
    console.warn("Gagal terhubung. Pastikan aplikasi berjalan di dalam ekosistem Google Apps Script.");
  }
};
