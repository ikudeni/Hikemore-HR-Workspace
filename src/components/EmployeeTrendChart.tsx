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
  const [rangeMonths, setRangeMonths] = useState<6 | 12>(12);
  const now = useMemo(() => new Date(), []);

  // Compute 12 trailing months (or 6 trailing months) of datasets
  const chartData = useMemo(() => {
    const result = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    for (let i = rangeMonths - 1; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
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
    }
    return result;
  }, [employees, rangeMonths, now]);

  // Compute KPIs for header comparisons
  const kpis = useMemo(() => {
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth();

    // Previous month (May 2026 if today is June 2026)
    const lastMonthDate = new Date(currentYear, currentMonthNum - 1, 1);
    const lastMonthYear = lastMonthDate.getFullYear();
    const lastMonthNum = lastMonthDate.getMonth();

    let thisMonthCount = 0;
    let lastMonthCount = 0;

    employees.forEach(emp => {
      if (isEmployeeActiveInMonth(emp, currentYear, currentMonthNum)) {
        thisMonthCount++;
      }
      if (isEmployeeActiveInMonth(emp, lastMonthYear, lastMonthNum)) {
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
      pctChange
    };
  }, [employees, now]);

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
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

        {/* Range Buttons Toggle */}
        <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/40 select-none self-end sm:self-auto">
          <button 
            id="toggle-6-month-trend"
            onClick={() => setRangeMonths(6)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
              rangeMonths === 6 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-850'
            }`}
          >
            6 Bulan
          </button>
          <button 
            id="toggle-12-month-trend"
            onClick={() => setRangeMonths(12)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
              rangeMonths === 12 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-850'
            }`}
          >
            12 Bulan
          </button>
        </div>
      </div>

      {/* KPI Highlight row mirroring original user requirements */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Karyawan Bulan Ini</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-slate-900 leading-none">{kpis.thisMonthCount}</span>
            <span className="text-xs font-bold text-slate-400">karyawan aktif</span>
          </div>
        </div>

        <div className="flex flex-col border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Karyawan Bulan Lalu</span>
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
