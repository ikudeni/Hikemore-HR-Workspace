import React, { useState, useMemo } from 'react';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { Employee } from '../types';

interface EmployeeTrendChartProps {
  employees: Employee[];
}

const parseDateSafe = (dateStr: string | undefined): Date | null => {
  if (!dateStr) return null;
  const cleanStr = dateStr.trim();
  if (cleanStr.includes('-')) {
    const parts = cleanStr.split('-');
    if (parts.length >= 3) {
      let year = parseInt(parts[0], 10);
      let month = parseInt(parts[1], 10) - 1; // 0-indexed month
      let day = parseInt(parts[2].split('T')[0], 10);

      // Check if format is DD-MM-YYYY instead of YYYY-MM-DD
      if (parts[2].substring(0, 4).length === 4 && !isNaN(parseInt(parts[2].substring(0, 4), 10)) && parts[0].length < 4) {
        year = parseInt(parts[2].substring(0, 4), 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[0], 10);
      }

      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month, day);
      }
    }
  }
  const d = new Date(cleanStr);
  return isNaN(d.getTime()) ? null : d;
};

const isEmployeeActiveInMonth = (emp: Employee, year: number, month: number) => {
  const hireDate = parseDateSafe(emp.joinDate);
  if (!hireDate) return false;

  // start & end of evaluation month
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

  if (hireDate > endOfMonth) return false;

  if (emp.isActive === false) {
    const rDate = parseDateSafe(emp.resignDate);
    if (rDate) {
      if (rDate < startOfMonth) {
        return false;
      }
    } else {
      const evalDate = new Date(year, month, 1);
      const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      if (evalDate >= currentMonthStart) {
        return false;
      }
    }
  }

  return true;
};

export const EmployeeTrendChart: React.FC<EmployeeTrendChartProps> = ({ employees }) => {
  const [filterType, setFilterType] = useState<'quick' | 'custom'>('quick');
  const [rangeMonths, setRangeMonths] = useState<6 | 12>(12);
  const now = useMemo(() => new Date(), []);

  // Default custom range: trailing 12 months
  const [startDateStr, setStartDateStr] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  });

  const [endDateStr, setEndDateStr] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(new Date(year, d.getMonth() + 1, 0).getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const targetMonths = useMemo(() => {
    if (filterType === 'custom') {
      const start = parseDateSafe(startDateStr);
      const end = parseDateSafe(endDateStr);
      if (start && end && start <= end) {
        const list = [];
        let current = new Date(start.getFullYear(), start.getMonth(), 1);
        const limit = new Date(end.getFullYear(), end.getMonth(), 1);
        let count = 0;
        // Limit to maximum 48 months to prevent over-dense chart
        while (current <= limit && count < 48) {
          list.push(new Date(current));
          current.setMonth(current.getMonth() + 1);
          count++;
        }
        if (list.length > 0) return list;
      }
    }

    const list = [];
    for (let i = rangeMonths - 1; i >= 0; i--) {
      list.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    }
    return list;
  }, [filterType, rangeMonths, startDateStr, endDateStr, now]);

  const isCustomFilterIncomplete = filterType === 'custom' && (!startDateStr || !endDateStr);
  const isCustomFilterInvalid = filterType === 'custom' && startDateStr && endDateStr && new Date(startDateStr) > new Date(endDateStr);

  // ComputeTrailing month datasets based on targeted months list
  const chartData = useMemo(() => {
    const result = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    targetMonths.forEach(targetDate => {
      const targetYear = targetDate.getFullYear();
      const targetMonth = targetDate.getMonth();

      // Comparison targets: Previous Year equivalent month
      const prevYearYear = targetYear - 1;
      const prevYearMonth = targetMonth;

      let currentActive = 0;
      let previousActive = 0;

      employees.forEach(emp => {
        if (isEmployeeActiveInMonth(emp, targetYear, targetMonth)) {
          currentActive++;
        }
        if (isEmployeeActiveInMonth(emp, prevYearYear, prevYearMonth)) {
          previousActive++;
        }
      });

      const monthLabel = `${monthNames[targetMonth]} ${String(targetYear).substring(2)}`;
      const fullCurrentLabel = `${monthNames[targetMonth]} ${targetYear}`;
      const fullPreviousLabel = `${monthNames[prevYearMonth]} ${prevYearYear}`;

      result.push({
        name: monthLabel,
        current: currentActive,
        previous: previousActive,
        currentLabel: fullCurrentLabel,
        previousLabel: fullPreviousLabel,
        rawMonthIndex: targetMonth,
        rawYear: targetYear,
      });
    });

    return result;
  }, [employees, targetMonths]);

  // Compute KPIs for header comparisons
  const kpis = useMemo(() => {
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    let labelThis = "Bulan Ini";
    let labelLast = "Bulan Lalu";

    let targetThisYear = now.getFullYear();
    let targetThisMonth = now.getMonth();
    let targetLastYear = targetThisYear;
    let targetLastMonth = targetThisMonth - 1;
    if (targetLastMonth < 0) {
      targetLastMonth = 11;
      targetLastYear--;
    }

    if (filterType === 'custom' && targetMonths.length > 0) {
      const lastMonthDate = targetMonths[targetMonths.length - 1];
      targetThisYear = lastMonthDate.getFullYear();
      targetThisMonth = lastMonthDate.getMonth();
      labelThis = `${monthNames[targetThisMonth]} ${targetThisYear}`;

      if (targetMonths.length > 1) {
        const prevMonthDate = targetMonths[targetMonths.length - 2];
        targetLastYear = prevMonthDate.getFullYear();
        targetLastMonth = prevMonthDate.getMonth();
        labelLast = `${monthNames[targetLastMonth]} ${targetLastYear}`;
      } else {
        const prevMonthDate = new Date(targetThisYear, targetThisMonth - 1, 1);
        targetLastYear = prevMonthDate.getFullYear();
        targetLastMonth = prevMonthDate.getMonth();
        labelLast = `${monthNames[targetLastMonth]} ${targetLastYear}`;
      }
    }

    let thisMonthCount = 0;
    let lastMonthCount = 0;

    employees.forEach(emp => {
      if (isEmployeeActiveInMonth(emp, targetThisYear, targetThisMonth)) {
        thisMonthCount++;
      }
      if (isEmployeeActiveInMonth(emp, targetLastYear, targetLastMonth)) {
        lastMonthCount++;
      }
    });

    const diffCount = thisMonthCount - lastMonthCount;
    const pctChange = lastMonthCount > 0 
      ? ((diffCount / lastMonthCount) * 100).toFixed(1) 
      : diffCount > 0 ? '100.0' : '0.0';

    return {
      thisMonthCount,
      lastMonthCount,
      diffCount,
      pctChange,
      labelThis,
      labelLast
    };
  }, [employees, filterType, targetMonths, now]);

  // High contrast custom tooltip styling
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const currentEntry = payload.find((p: any) => p.dataKey === 'current');
      const prevEntry = payload.find((p: any) => p.dataKey === 'previous');

      const currentVal = currentEntry?.value ?? 0;
      const previousVal = prevEntry?.value ?? 0;
      const currentLabel = currentEntry?.payload?.currentLabel || label;
      const previousLabel = currentEntry?.payload?.previousLabel || 'Sama (Tahun Lalu)';

      return (
        <div id="trend-chart-tooltip" className="bg-slate-900 border border-slate-800 text-slate-150 p-4 rounded-2xl shadow-2xl flex flex-col gap-2.5 backdrop-blur-md bg-opacity-95 max-w-[280px]">
          <p className="text-xs font-bold text-slate-400 border-b border-slate-800/80 pb-2 flex items-center justify-between">
            <span>📅 {currentLabel}</span>
            <span className="text-[10px] text-orange-400 font-extrabold uppercase tracking-widest bg-orange-950/40 px-2 py-0.5 rounded-full">Tren</span>
          </p>
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#f97316] ring-2 ring-orange-950"></span>
                <span className="text-[11px] font-medium text-slate-300">Periode Sekarang</span>
              </div>
              <span className="text-xs font-black text-white">{currentVal} Karyawan</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500 ring-2 ring-slate-900"></span>
                <span className="text-[11px] font-medium text-slate-400">Tahun Sebelumnya ({previousLabel.split(' ')[1] || ''})</span>
              </div>
              <span className="text-xs font-black text-slate-300">{previousVal} Karyawan</span>
            </div>
          </div>
          
          <div className="text-[10px] text-slate-400 mt-2 border-t border-slate-800/80 pt-2 flex justify-between items-center font-bold">
            <span>Perbandingan YoY:</span>
            <span className={`px-2 py-0.5 rounded-md font-extrabold flex items-center gap-1 ${
              currentVal >= previousVal 
                ? 'text-emerald-400 bg-emerald-950/30' 
                : 'text-rose-400 bg-rose-950/30'
            }`}>
              {currentVal > previousVal ? '↑' : currentVal < previousVal ? '↓' : '•'} 
              {Math.abs(currentVal - previousVal)} ({previousVal > 0 ? `${((currentVal - previousVal)/previousVal*100).toFixed(0)}%` : '0%'})
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="flex flex-col p-6 min-h-[460px] overflow-hidden bg-white shadow-sm border border-slate-100 rounded-2xl">
      {/* Header controls & titles */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-50 text-orange-500 rounded-xl">
              <Icon name="trending-up" size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-slate-800 tracking-tight">Tren & Perbandingan Karyawan</h3>
              <p className="text-xs font-medium text-slate-400 mt-0.5">Analisis pertumbuhan headcount bulan ke bulan vs tahun lalu</p>
            </div>
          </div>
        </div>

        {/* Range Buttons & Custom Date Toggle */}
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 self-stretch xl:self-auto w-full xl:w-auto">
          {filterType === 'custom' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100 w-full sm:w-auto">
              <div className="flex items-center gap-1 flex-1 sm:flex-initial">
                <span className="text-[10px] uppercase font-bold text-slate-400 px-1 select-none">Mulai</span>
                <div className="relative flex items-center bg-white rounded-lg border border-slate-200/60 focus-within:ring-2 focus-within:ring-orange-500/10 focus-within:border-orange-500 transition-all flex-1 sm:flex-initial pr-1.5">
                  <input 
                    type="date" 
                    value={startDateStr}
                    onChange={(e) => setStartDateStr(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-700 px-2.5 py-1.5 focus:outline-none cursor-pointer"
                  />
                  {startDateStr && (
                    <button 
                      type="button"
                      onClick={() => setStartDateStr('')}
                      className="text-slate-400 hover:text-rose-500 p-0.5 rounded transition-all hover:bg-rose-50"
                      title="Hapus Tanggal Mulai"
                    >
                      <Icon name="x" size={13} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-1 sm:flex-initial">
                <span className="text-[10px] uppercase font-bold text-slate-400 px-1 select-none">Sampai</span>
                <div className="relative flex items-center bg-white rounded-lg border border-slate-200/60 focus-within:ring-2 focus-within:ring-orange-500/10 focus-within:border-orange-500 transition-all flex-1 sm:flex-initial pr-1.5">
                  <input 
                    type="date" 
                    value={endDateStr}
                    onChange={(e) => setEndDateStr(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-700 px-2.5 py-1.5 focus:outline-none cursor-pointer"
                  />
                  {endDateStr && (
                    <button 
                      type="button"
                      onClick={() => setEndDateStr('')}
                      className="text-slate-400 hover:text-rose-500 p-0.5 rounded transition-all hover:bg-rose-50"
                      title="Hapus Tanggal Selesai"
                    >
                      <Icon name="x" size={13} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/40 select-none w-full sm:w-auto justify-between sm:justify-start">
            <button 
              id="toggle-6-month-trend"
              onClick={() => {
                setFilterType('quick');
                setRangeMonths(6);
              }}
              className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                filterType === 'quick' && rangeMonths === 6 
                  ? 'bg-white text-slate-800 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-850'
              }`}
            >
              6 Bulan
            </button>
            <button 
              id="toggle-12-month-trend"
              onClick={() => {
                setFilterType('quick');
                setRangeMonths(12);
              }}
              className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                filterType === 'quick' && rangeMonths === 12 
                  ? 'bg-white text-slate-800 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-850'
              }`}
            >
              12 Bulan
            </button>
            <button 
              id="toggle-custom-trend"
              onClick={() => setFilterType('custom')}
              className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                filterType === 'custom'
                  ? 'bg-white text-slate-800 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-850'
              }`}
            >
              Kustom
            </button>
          </div>
        </div>
      </div>

      {/* KPI Highlight row mirroring original user requirements */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Karyawan {kpis.labelThis}</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-slate-900 leading-none">{kpis.thisMonthCount}</span>
            <span className="text-xs font-bold text-slate-400">karyawan aktif</span>
          </div>
        </div>

        <div className="flex flex-col border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Karyawan {kpis.labelLast}</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-slate-700 leading-none">{kpis.lastMonthCount}</span>
            <span className="text-xs font-bold text-slate-400">karyawan aktif</span>
          </div>
        </div>

        <div className="flex flex-col border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-5 justify-center">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Bulan Ini vs Bulan Lalu</span>
          <div className="flex items-center gap-2 mt-1">
            {kpis.diffCount > 0 ? (
              <div className="flex items-center gap-1 bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-xl text-xs font-black shadow-sm border border-emerald-100 animate-pulse">
                <Icon name="trending-up" size={12} strokeWidth={3} />
                <span>+{kpis.pctChange}%</span>
                <span className="font-medium text-[10px] text-emerald-500/80 ml-0.5">({kpis.diffCount} rekrutmen baru)</span>
              </div>
            ) : kpis.diffCount < 0 ? (
              <div className="flex items-center gap-1 bg-rose-50 text-rose-600 px-2.5 py-1 rounded-xl text-xs font-black shadow-sm border border-rose-100">
                <Icon name="trending-down" size={12} strokeWidth={3} />
                <span>{kpis.pctChange}%</span>
                <span className="font-medium text-[10px] text-rose-500/80 ml-0.5">({Math.abs(kpis.diffCount)} resigned)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-xl text-xs font-black shadow-sm border border-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-0.5"></span>
                <span>Konsisten (-0%)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart container */}
      <div className="w-full h-[320px] min-h-[300px] relative">
        {isCustomFilterIncomplete ? (
          <div id="filter-incomplete-placeholder" className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/45 rounded-2xl border border-dashed border-slate-200 p-6 text-center">
            <div className="p-4 bg-orange-50 rounded-2xl text-orange-500 mb-3 shadow-sm border border-orange-100/60">
              <Icon name="calendar" size={24} strokeWidth={2.5} />
            </div>
            <h4 className="text-sm font-black text-slate-800 tracking-tight">Tentukan Rentang Tanggal</h4>
            <p className="text-xs text-slate-450 mt-1.5 leading-relaxed font-bold max-w-xs">
              Silakan pilih <span className="text-orange-500 font-extrabold">Tanggal Mulai</span> dan <span className="text-orange-500 font-extrabold">Tanggal Selesai</span> untuk melihat visualisasi data tren karyawan.
            </p>
          </div>
        ) : isCustomFilterInvalid ? (
          <div id="filter-invalid-placeholder" className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/45 rounded-2xl border border-dashed border-slate-200 p-6 text-center">
            <div className="p-4 bg-rose-50 rounded-2xl text-rose-500 mb-3 shadow-sm border border-rose-100/60">
              <Icon name="alert-circle" size={24} strokeWidth={2.5} />
            </div>
            <h4 className="text-sm font-black text-slate-800 tracking-tight">Rentang Tanggal Tidak Valid</h4>
            <p className="text-xs text-slate-450 mt-1.5 leading-relaxed font-bold max-w-xs">
              Tanggal Mulai tidak boleh melewati Tanggal Selesai. Silakan tentukan rentang tanggal yang sesuai.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart 
              data={chartData} 
              margin={{ top: 15, right: 10, left: -20, bottom: 5 }}
            >
              <defs>
                <linearGradient id="colorCurrentTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid 
                strokeDasharray="4 4" 
                vertical={false} 
                stroke="#f1f5f9" 
              />
              <XAxis 
                dataKey="name" 
                stroke="#94a3b8" 
                fontSize={11} 
                fontWeight={700} 
                tickLine={false} 
                axisLine={false} 
                dy={10} 
              />
              <YAxis 
                stroke="#94a3b8" 
                fontSize={11} 
                fontWeight={700} 
                tickLine={false} 
                axisLine={false} 
                dx={-5} 
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#f1f5f9', strokeWidth: 1.5 }} />
              
              {/* Previous Year Comparison Line (Dashed Slate) */}
              <Area 
                type="monotone" 
                dataKey="previous" 
                stroke="#94a3b8" 
                strokeWidth={2} 
                strokeDasharray="6 4" 
                fill="none" 
                name="Tahun Sebelumnya" 
                dot={{ r: 3, stroke: '#94a3b8', strokeWidth: 1.5, fill: '#fff' }} 
                activeDot={{ r: 5, stroke: '#64748b', strokeWidth: 2, fill: '#fff' }} 
                isAnimationActive={true}
              />

              {/* Current Selected Range Area (Solid Orange with Gradient fill) */}
              <Area 
                type="monotone" 
                dataKey="current" 
                stroke="#f97316" 
                strokeWidth={3} 
                fillOpacity={1} 
                fill="url(#colorCurrentTrend)" 
                name="Tahun Sekarang" 
                dot={{ r: 4, stroke: '#f97316', strokeWidth: 2.5, fill: '#fff' }} 
                activeDot={{ r: 7, stroke: '#ea580c', strokeWidth: 3, fill: '#fff' }} 
                isAnimationActive={true}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend and explanation section */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-4 pt-4 border-t border-slate-100 text-xs font-bold text-slate-500">
        <div className="flex items-center gap-2">
          <span className="w-4 h-2.5 rounded-[3px] bg-[#f97316] opacity-90"></span>
          <span>Jumlah Karyawan (Tahun Sekarang)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-0.5 border-t-2 border-dashed border-slate-400"></span>
          <span>Jumlah Karyawan (Tahun Sebelumnya)</span>
        </div>
      </div>
    </Card>
  );
};
