import React, { useState, useMemo, useRef, useEffect } from "react";
// @ts-ignore
import html2pdf from "html2pdf.js";
import { Icon } from "./ui/Icon";
import { logActivity } from "../firebase";
import { Employee } from "../types";
import { upgradePerformaData } from "../utils";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

// Leverage complexity berdasarkan Jabatan (Hikemore)
const DEFAULT_JOB_LEVELS = [
  { id: "Staff", label: "Staff (1.0x)", multiplier: 1.0 },
  { id: "Senior Staff", label: "Senior Staff (1.35x)", multiplier: 1.35 },
  { id: "Kepala Toko", label: "Kepala Toko (1.75x)", multiplier: 1.75 },
  { id: "Supervisor", label: "Supervisor (1.8x)", multiplier: 1.8 },
  { id: "Head Department", label: "Head Department (2.8x)", multiplier: 2.8 },
  { id: "Direktur", label: "Direktur (4.5x)", multiplier: 4.5 },
];

interface PerformaContentProps {
  employees: Employee[];
  performaDataMap: Record<string, any>;
  setPerformaDataMap: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}

export const PerformaContent: React.FC<PerformaContentProps> = ({
  employees,
  performaDataMap,
  setPerformaDataMap,
}) => {
  const [activeTab, setActiveTab] = useState<"dashboard" | "input">(
    "dashboard",
  );
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [reportPreviewData, setReportPreviewData] = useState<any | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPDF = async () => {
    if (!reportPreviewData) return;
    const container = document.getElementById("pdf-report-content");
    if (!container) return;
    
    setIsDownloading(true);

    // Save original styles
    const originalContainerClass = container.className;
    const pages = Array.from(container.children) as HTMLElement[];
    const originalPageClasses = pages.map(p => p.className);

    // Apply print-friendly styles (remove gaps, shadow, background on container)
    container.className = "w-full max-w-[210mm] mx-auto bg-white";
    pages.forEach(p => {
      // Keep only necessary styles, remove shadow, borders, min-h, rounded, etc.
      p.className = "bg-white w-full p-6 sm:p-12 text-slate-800 relative";
    });

    // We can also insert an explicit page break between them for html2pdf
    // But since page 1 is one div, we can just append html2pdf__page-break to the end of page 1
    const pageBreakDiv = document.createElement("div");
    pageBreakDiv.className = "html2pdf__page-break";
    if (pages.length > 0) {
      pages[0].appendChild(pageBreakDiv);
    }

    try {
      const opt = {
        margin: [0, 0, 0, 0],
        filename: `Report_Assessment_${reportPreviewData.name}.pdf`,
        image: { type: "jpeg", quality: 1 },
        html2canvas: { scale: 2, useCORS: true, windowWidth: parseInt(window.innerWidth.toString()) > 1024 ? window.innerWidth : 1024 }, // Maintain high res for wide screens
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] }
      };

      await html2pdf().set(opt).from(container).save();
    } catch (err) {
      console.error("PDF Error:", err);
      alert("Terjadi kesalahan saat membuat PDF.");
    } finally {
      // Revert styles
      container.className = originalContainerClass;
      pages.forEach((p, i) => {
        p.className = originalPageClasses[i];
      });
      if (pages.length > 0) {
        pages[0].removeChild(pageBreakDiv);
      }
      setIsDownloading(false);
    }
  };

  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(
    employees.length > 0 ? employees[0].id : null,
  );

  const [filterDept, setFilterDept] = useState("All Departemen");
  const [filterLevel, setFilterLevel] = useState("All Level");
  const [filterPenilaian, setFilterPenilaian] = useState("All Penilaian");
  const [searchPerformaName, setSearchPerformaName] = useState("");
  const [inputEmpSearch, setInputEmpSearch] = useState("");
  const [dataToClear, setDataToClear] = useState<string | null>(null);

  const globalSettings = performaDataMap["globalSettings"] || {
    baselineSalary: 3480000,
  };
  const baselineSalary = globalSettings.baselineSalary;
  const jobLevels = globalSettings.jobLevels || DEFAULT_JOB_LEVELS;

  const getMultiplier = (levelId: string, customMultiplier?: number) => {
    if (levelId === "Custom") return customMultiplier || 1.0;
    const level = jobLevels.find((l: any) => l.id === levelId);
    if (level) return level.multiplier;
    // legacy fallback
    const legacy: Record<string, number> = {
      "Staff / Entry Level": 1.0,
      "Senior Staff / Specialist": 1.35,
      "Supervisor / Coordinator": 1.8,
      "Manager / AVP": 2.8,
      "Director / Eksekutif": 4.5,
    };
    return legacy[levelId] || 1.0;
  };

  const tableRef = useRef<HTMLDivElement>(null);
  const fakeScrollRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState<number>(0);

  const [isLevelDropdownOpen, setIsLevelDropdownOpen] = useState(false);
  const [newLevelName, setNewLevelName] = useState("");
  const [newLevelMultiplier, setNewLevelMultiplier] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsLevelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup temporary dummy data
  useEffect(() => {
    setPerformaDataMap((prev) => {
      let hasChanges = false;
      const nextData = { ...prev };
      for (const k in nextData) {
        if (nextData[k] && nextData[k].isDummy) {
          delete nextData[k];
          hasChanges = true;
        }
      }
      return hasChanges ? nextData : prev;
    });
  }, [setPerformaDataMap]);

  useEffect(() => {
    if (activeTab !== "dashboard") return;

    // Slight delay to ensure table is rendered
    const timer = setTimeout(() => {
      const tableEl = tableRef.current?.querySelector("table");
      if (tableEl) {
        const observer = new ResizeObserver((entries) => {
          setTableWidth(entries[0].target.scrollWidth);
        });
        observer.observe(tableEl);
        return () => observer.disconnect();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [activeTab, employees, performaDataMap]);

  const onTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (fakeScrollRef.current) {
      fakeScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const onFakeScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (tableRef.current) {
      tableRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleGlobalSettingChange = (field: string, value: any) => {
    setPerformaDataMap((prev) => ({
      ...prev,
      globalSettings: {
        ...(prev["globalSettings"] || { baselineSalary: 3480000 }),
        [field]: value,
      },
    }));
  };

  const handleAddJobLevel = () => {
    if (!newLevelName || !newLevelMultiplier) return;
    const newList = [
      ...jobLevels,
      {
        id: newLevelName.trim(),
        label: `${newLevelName.trim()} (${newLevelMultiplier}x)`,
        multiplier: parseFloat(newLevelMultiplier),
      },
    ];
    handleGlobalSettingChange("jobLevels", newList);
    setNewLevelName("");
    setNewLevelMultiplier("");
  };

  const handleDeleteJobLevel = (e: React.MouseEvent, idToDelete: string) => {
    e.stopPropagation();
    const newList = jobLevels.filter((lvl: any) => lvl.id !== idToDelete);
    handleGlobalSettingChange("jobLevels", newList);
  };

  const getGuessedLevelId = (pos: string) => {
    if (!pos) return "Staff";
    const p = pos.toLowerCase();
    if (
      p.includes("head") ||
      p.includes("manager") ||
      p.includes("direktur") ||
      p.includes("cfo") ||
      p.includes("ceo")
    )
      return "Head Department";
    if (p.includes("supervisor") || p.includes("spv")) return "Supervisor";
    if (p.includes("kepala") || p.includes("store manager"))
      return "Kepala Toko";
    if (p.includes("senior")) return "Senior Staff";
    return "Staff";
  };

  const handleAutoGenerateJobLevels = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (employees.length === 0) {
      handleGlobalSettingChange("jobLevels", DEFAULT_JOB_LEVELS);
      return;
    }

    // Hitung rata-rata gaji per kategori level untuk dijadikan multiplier
    const levelStats: Record<string, { totalSalary: number; count: number }> =
      {};

    employees.forEach((emp) => {
      const level = getGuessedLevelId(emp.pos);
      const data = performaDataMap[emp.id];
      if (data && data.gaji && data.gaji > 0) {
        if (!levelStats[level])
          levelStats[level] = { totalSalary: 0, count: 0 };
        levelStats[level].totalSalary += data.gaji;
        levelStats[level].count += 1;
      }
    });

    const newJobLevels: { id: string; label: string; multiplier: number }[] =
      [];

    // Gunakan standar default dari DEFAULT_JOB_LEVELS, tapi timpa multiplier-nya jika ada data gaji sesungguhnya
    DEFAULT_JOB_LEVELS.forEach((gl) => {
      let calcMultiplier = gl.multiplier;
      if (
        levelStats[gl.id] &&
        levelStats[gl.id].count > 0 &&
        baselineSalary > 0
      ) {
        const avgGaji = levelStats[gl.id].totalSalary / levelStats[gl.id].count;
        calcMultiplier = Number((avgGaji / baselineSalary).toFixed(2));
      }

      newJobLevels.push({
        id: gl.id,
        label: `${gl.id} (${calcMultiplier}x)`,
        multiplier: calcMultiplier,
      });
    });

    newJobLevels.sort((a, b) => a.multiplier - b.multiplier);
    handleGlobalSettingChange("jobLevels", newJobLevels);
  };

  const performaData = useMemo(() => {
    return employees
      .map((emp) => {
        const rawData = performaDataMap[emp.id] || {
          grit: 0,
          growth: 0,
          prof: 0,
          sus: 0,
          telat: 0,
          ijin: 0,
          mangkir: 0,
          sp: 0,
          gaji: 0,
          levelJabatan: "",
        };

        const data = upgradePerformaData(rawData);

        const safeCalc = (keys: string[]) => {
          const sum = keys.reduce((acc, k) => acc + (data[k] || 0), 0);
          return sum / keys.length;
        };

        const grit = safeCalc([
          "grit_1",
          "grit_2",
          "grit_3",
          "grit_4",
          "grit_5",
        ]);
        const growth = safeCalc([
          "growth_1",
          "growth_2",
          "growth_3",
          "growth_4",
          "growth_5",
        ]);
        const prof = safeCalc([
          "prof_1",
          "prof_2",
          "prof_3",
          "prof_4",
          "prof_5",
        ]);
        const sus = safeCalc(["sus_1", "sus_2", "sus_3", "sus_4", "sus_5"]);

        const wGrit = data.weight_grit ?? 30;
        const wGrowth = data.weight_growth ?? 20;
        const wProf = data.weight_prof ?? 30;
        const wSus = data.weight_sus ?? 20;

        const kompetensiScore =
          grit * (wGrit / 100) +
          growth * (wGrowth / 100) +
          prof * (wProf / 100) +
          sus * (wSus / 100); // max 125

        const telat = data.telat || 0;
        const ijin = data.ijin || 0;
        const mangkir = data.mangkir || 0;
        const sp = data.sp || 0;

        const kedisiplinanScore =
          telat * -1 + ijin * -1 + mangkir * -3 + sp * -5;

        const nilaiAkhir = kompetensiScore + kedisiplinanScore;

        const gaji = data.gaji || 0;
        const levelJabatan = data.levelJabatan || "";
        const multiplier = getMultiplier(levelJabatan, data.customMultiplier);
        const displayJabatan =
          levelJabatan === "Custom" && data.customLevelName
            ? `${data.customLevelName} (${multiplier}x)`
            : levelJabatan;

        // LOGIKA CERDAS VALUE-BASED METRIC (Tanpa Target Gaji)
        // 1. Value Per Point Kontribusi (VPC):
        //    Seberapa besar nilai 1 poin performa (Skor 75 = Standar)
        const valuePerPoint = baselineSalary / 75;

        // 2. Base Nilai Kontribusi:
        //    Berapa rupiah total nilai performa aktual yang diberikan karyawan ini ke perusahaan?
        const baseKontribusi = Math.max(0, nilaiAkhir) * valuePerPoint;

        // 3. Leverage Jabatan (Scale Nilai Kontribusi):
        //    Manager punya impact lebih besar dari Staff dengan nilai 100 yang sama.
        const nilaiKontribusi = baseKontribusi * multiplier;

        // 4. Value-to-Cost Ratio (VCR):
        //    Membandingkan Nilai Aktual (Kontribusi) vs Beban Aktual (Gaji)
        //    "Lu gua gaji segini, value kontribusi lu ke perusahaan berapa?"
        const vcr = gaji > 0 ? nilaiKontribusi / gaji : 0;

        let classification = "";
        let rekomendasi = "";
        if (gaji === 0 || kompetensiScore === 0 || !data.levelJabatan) {
          classification = "Belum Dinilai";
          rekomendasi = "-";
        } else if (vcr >= 1.3) {
          classification = "Sangat Bagus (Sangat Menguntungkan)";
          rekomendasi = "Layak Promosi / Naik Gaji";
        } else if (vcr >= 1.1) {
          classification = "Bagus (Di Atas Ekspektasi)";
          rekomendasi = "Layak Dipertahankan";
        } else if (vcr >= 0.95) {
          classification = "Standar (Sesuai Gaji)";
          rekomendasi = "Performa Aman / Stay";
        } else if (vcr >= 0.8) {
          classification = "Kurang (Underperforming)";
          rekomendasi = "Perlu Pembinaan Intensif";
        } else {
          classification = "Sangat Kurang (Overpaid / Rugi)";
          rekomendasi = "Layak SP / Diberhentikan";
        }

        return {
          ...emp,
          ...data,
          periodeStart: data.periodeStart || "",
          periodeEnd: data.periodeEnd || "",
          namaPenilai: data.namaPenilai || "",
          grit,
          growth,
          prof,
          sus,
          kompetensiScore,
          telat,
          ijin,
          mangkir,
          sp,
          kedisiplinanScore,
          nilaiAkhir,
          gaji,
          levelJabatan: displayJabatan,
          nilaiKontribusi,
          vcr,
          classification,
          rekomendasi,
        };
      })
      .sort((a, b) => b.vcr - a.vcr);
  }, [employees, performaDataMap, baselineSalary]);

  const uniqueDepts = useMemo(
    () => Array.from(new Set(performaData.map((d) => d.dept))).sort(),
    [performaData],
  );
  const uniqueLevels = useMemo(
    () => Array.from(new Set(performaData.map((d) => d.levelJabatan))).sort(),
    [performaData],
  );
  const uniquePenilaian = useMemo(
    () =>
      Array.from(new Set(performaData.map((d) => d.classification)))
        .filter((c) => c !== "Belum Dinilai")
        .sort(),
    [performaData],
  );

  const filteredPerformaData = useMemo(() => {
    return performaData.filter((d) => {
      const matchDept =
        filterDept === "All Departemen" || d.dept === filterDept;
      const matchLevel =
        filterLevel === "All Level" || d.levelJabatan === filterLevel;

      let matchPenilaian = true;
      if (filterPenilaian === "Sudah Dinilai") {
        matchPenilaian = d.classification !== "Belum Dinilai";
      } else if (filterPenilaian !== "All Penilaian") {
        matchPenilaian = d.classification === filterPenilaian;
      }

      const matchSearch = d.name
        .toLowerCase()
        .includes(searchPerformaName.toLowerCase());
      return matchDept && matchLevel && matchPenilaian && matchSearch;
    });
  }, [
    performaData,
    filterDept,
    filterLevel,
    filterPenilaian,
    searchPerformaName,
  ]);

  const radarData = useMemo(() => {
    const evaluated = filteredPerformaData.filter(
      (d) => d.classification !== "Belum Dinilai",
    );
    if (evaluated.length === 0)
      return [
        { subject: "Grit", A: 0, fullMark: 125 },
        { subject: "Growth", A: 0, fullMark: 125 },
        { subject: "Profesionalisme", A: 0, fullMark: 125 },
        { subject: "Sustainability", A: 0, fullMark: 125 },
      ];

    const vg =
      evaluated.reduce((sum, item) => sum + (item.grit || 0), 0) /
      evaluated.length;
    const vgw =
      evaluated.reduce((sum, item) => sum + (item.growth || 0), 0) /
      evaluated.length;
    const vpr =
      evaluated.reduce((sum, item) => sum + (item.prof || 0), 0) /
      evaluated.length;
    const vs =
      evaluated.reduce((sum, item) => sum + (item.sus || 0), 0) /
      evaluated.length;

    return [
      { subject: "Grit", A: vg, fullMark: 125 },
      { subject: "Growth", A: vgw, fullMark: 125 },
      { subject: "Profesionalisme", A: vpr, fullMark: 125 },
      { subject: "Sustainability", A: vs, fullMark: 125 },
    ];
  }, [filteredPerformaData]);

  return (
    <div className="px-8 pt-8 h-full overflow-y-auto hide-scrollbar animate-fadeIn flex flex-col relative">
      <div className="w-full flex-1 flex flex-col space-y-6 pb-8">
        {/* Header & Overview Cards Container */}
        <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-800">
                Evaluasi Kinerja vs Cost Salary
              </h2>
              <p className="text-sm font-bold text-slate-400 mt-1">
                Analisis efisiensi biaya kompensasi terhadap tingkat performa
                dan kontribusi karyawan
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsGuideModalOpen(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-800 transition-colors shadow-sm flex items-center gap-2"
              >
                <Icon name="help-circle" size={16} />
                <span>Panduan</span>
              </button>
              <div className="bg-slate-50 border border-slate-100 p-1 rounded-xl flex items-center">
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "dashboard" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Dashboard Visual
                </button>
                <button
                  onClick={() => setActiveTab("input")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "input" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Input Data Penilaian
                </button>
              </div>
            </div>
          </div>

          {activeTab === "dashboard" &&
            (() => {
              const evaluatedData = filteredPerformaData.filter(
                (d) => d.classification !== "Belum Dinilai",
              );
              const isFilterActive =
                filterDept !== "All Departemen" ||
                filterLevel !== "All Level" ||
                filterPenilaian !== "All Penilaian" ||
                searchPerformaName !== "";
              return (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2.5 justify-end w-full">
                    {isFilterActive && (
                      <button
                        onClick={() => {
                          setFilterDept("All Departemen");
                          setFilterLevel("All Level");
                          setFilterPenilaian("All Penilaian");
                          setSearchPerformaName("");
                        }}
                        className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-100 transition shadow-sm flex items-center gap-1.5 mr-1"
                      >
                        <Icon name="x" size={12} /> Hapus Filter
                      </button>
                    )}

                    {/* Search Name Select */}
                    <div className="relative">
                      <Icon
                        name="search"
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        placeholder="Cari nama karyawan..."
                        value={searchPerformaName}
                        onChange={(e) => setSearchPerformaName(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-slate-400 text-slate-700 w-full sm:w-[150px]"
                      />
                    </div>

                    {/* Dept Select */}
                    <div className="relative">
                      <select
                        className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[150px]"
                        value={filterDept}
                        onChange={(e) => setFilterDept(e.target.value)}
                      >
                        <option value="All Departemen">Semua Departemen</option>
                        {uniqueDepts.map((d) => (
                          <option key={d as string} value={d as string}>
                            {d as string}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <Icon name="chevron-down" size={16} />
                      </div>
                    </div>

                    {/* Level Select */}
                    <div className="relative">
                      <select
                        className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[150px]"
                        value={filterLevel}
                        onChange={(e) => setFilterLevel(e.target.value)}
                      >
                        <option value="All Level">Semua Level</option>
                        {uniqueLevels.map((l) => (
                          <option key={l as string} value={l as string}>
                            {l as string}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <Icon name="chevron-down" size={16} />
                      </div>
                    </div>

                    {/* Penilaian Select */}
                    <div className="relative">
                      <select
                        className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 transition-all cursor-pointer shadow-sm min-w-[150px]"
                        value={filterPenilaian}
                        onChange={(e) => setFilterPenilaian(e.target.value)}
                      >
                        <option value="All Penilaian">Semua Penilaian</option>
                        <option value="Sudah Dinilai">Sudah Dinilai</option>
                        <option value="Belum Dinilai">Belum Dinilai</option>
                        {uniquePenilaian.map((p) => (
                          <option key={p as string} value={p as string}>
                            {p as string}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <Icon name="chevron-down" size={16} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="relative bg-blue-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-[0_2px_10px_-2px_rgba(59,130,246,0.1)] hover:shadow-[0_4px_15px_-3px_rgba(59,130,246,0.15)] border border-blue-100/50 group cursor-default">
                      <div className="relative z-10 flex justify-between items-center w-full">
                        <div className="flex flex-col justify-center">
                          <p className="text-[10px] font-black text-blue-500 mb-1 uppercase tracking-widest">
                            Rata-Rata VCR
                          </p>
                          <p className="text-[32px] leading-none font-black text-blue-950">
                            {evaluatedData.length > 0
                              ? (
                                  evaluatedData.reduce(
                                    (acc, curr) => acc + curr.vcr,
                                    0,
                                  ) / evaluatedData.length
                                ).toFixed(2)
                              : "0.00"}
                            x
                          </p>
                        </div>
                        <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-blue-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                          <Icon name="activity" size={20} />
                        </div>
                      </div>
                      <div
                        className="absolute bottom-0 right-0 w-10 h-10 bg-blue-500"
                        style={{
                          clipPath: "polygon(100% 0, 0 100%, 100% 100%)",
                        }}
                      ></div>
                    </div>

                    <div className="relative bg-purple-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] shadow-[0_2px_10px_-2px_rgba(168,85,247,0.1)] hover:shadow-[0_4px_15px_-3px_rgba(168,85,247,0.15)] border border-purple-100/50 group cursor-default">
                      <div className="relative z-10 flex justify-between items-center w-full">
                        <div className="flex flex-col justify-center">
                          <p className="text-[10px] font-black text-purple-500 mb-1 uppercase tracking-widest">
                            Rata-Rata Nilai Akhir
                          </p>
                          <p className="text-[32px] leading-none font-black text-purple-950">
                            {evaluatedData.length > 0
                              ? (
                                  evaluatedData.reduce(
                                    (acc, curr) => acc + curr.nilaiAkhir,
                                    0,
                                  ) / evaluatedData.length
                                ).toFixed(1)
                              : "0.0"}
                          </p>
                        </div>
                        <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-purple-500 shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                          <Icon name="award" size={20} />
                        </div>
                      </div>
                      <div
                        className="absolute bottom-0 right-0 w-10 h-10 bg-purple-500"
                        style={{
                          clipPath: "polygon(100% 0, 0 100%, 100% 100%)",
                        }}
                      ></div>
                    </div>

                    <button
                      onClick={() =>
                        setFilterPenilaian(
                          filterPenilaian === "Sudah Dinilai"
                            ? "All Penilaian"
                            : "Sudah Dinilai",
                        )
                      }
                      className={`text-left relative bg-emerald-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] ${filterPenilaian === "Sudah Dinilai" ? "ring-2 ring-offset-2 ring-emerald-500 scale-[1.02]" : "hover:scale-[1.02]"} shadow-[0_2px_10px_-2px_rgba(16,185,129,0.1)] hover:shadow-[0_4px_15px_-3px_rgba(16,185,129,0.15)] border border-emerald-100/50 group`}
                    >
                      <div className="relative z-10 flex justify-between items-center w-full">
                        <div className="flex flex-col justify-center">
                          <p className="text-[10px] font-black text-emerald-500 mb-1 uppercase tracking-widest">
                            Sudah Dinilai
                          </p>
                          <p className="text-[32px] leading-none font-black text-emerald-950">
                            {evaluatedData.length}
                            <span className="text-sm text-emerald-600 font-bold ml-1 uppercase tracking-widest leading-none">
                              Orang
                            </span>
                          </p>
                        </div>
                        <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-emerald-500 shadow-sm shrink-0 transition-transform">
                          <Icon name="check-circle" size={20} />
                        </div>
                      </div>
                      <div
                        className="absolute bottom-0 right-0 w-10 h-10 bg-emerald-500"
                        style={{
                          clipPath: "polygon(100% 0, 0 100%, 100% 100%)",
                        }}
                      ></div>
                    </button>

                    <button
                      onClick={() =>
                        setFilterPenilaian(
                          filterPenilaian === "Belum Dinilai"
                            ? "All Penilaian"
                            : "Belum Dinilai",
                        )
                      }
                      className={`text-left relative bg-amber-50 rounded-2xl p-5 overflow-hidden transition-all flex flex-col justify-center min-h-[100px] ${filterPenilaian === "Belum Dinilai" ? "ring-2 ring-offset-2 ring-amber-500 scale-[1.02]" : "hover:scale-[1.02]"} shadow-[0_2px_10px_-2px_rgba(245,158,11,0.1)] hover:shadow-[0_4px_15px_-3px_rgba(245,158,11,0.15)] border border-amber-100/50 group`}
                    >
                      <div className="relative z-10 flex justify-between items-center w-full">
                        <div className="flex flex-col justify-center">
                          <p className="text-[10px] font-black text-amber-500 mb-1 uppercase tracking-widest">
                            Belum Dinilai
                          </p>
                          <p className="text-[32px] leading-none font-black text-amber-950">
                            {filteredPerformaData.length - evaluatedData.length}
                            <span className="text-sm text-amber-600 font-bold ml-1 uppercase tracking-widest leading-none">
                              Orang
                            </span>
                          </p>
                        </div>
                        <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-amber-500 shadow-sm shrink-0 transition-transform">
                          <Icon name="clock" size={20} />
                        </div>
                      </div>
                      <div
                        className="absolute bottom-0 right-0 w-10 h-10 bg-amber-500"
                        style={{
                          clipPath: "polygon(100% 0, 0 100%, 100% 100%)",
                        }}
                      ></div>
                    </button>
                  </div>
                </div>
              );
            })()}
        </div>

        {activeTab === "dashboard" ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* 9 Box Grid Distribution */}
              <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex flex-col min-h-[400px]">
                <div className="flex items-center justify-between mb-5 shrink-0">
                  <div>
                    <h3 className="font-extrabold text-slate-800">
                      Distribusi Kategori Kesimpulan
                    </h3>
                    <p className="text-sm font-medium text-slate-500">
                      Pemetaan jumlah individu berdasarkan kesimpulan performa
                      vs cost. Klik untuk filter.
                    </p>
                  </div>
                  {filterPenilaian !== "All Penilaian" && (
                    <button
                      onClick={() => setFilterPenilaian("All Penilaian")}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Icon name="x" size={14} /> Clear Filter
                    </button>
                  )}
                </div>

                <div className="flex-1 grid grid-cols-2 sm:grid-cols-6 gap-3 auto-rows-fr">
                  {[
                    {
                      id: "Sangat Bagus (Sangat Menguntungkan)",
                      label: "Sangat Bagus",
                      badge: "Sangat Menguntungkan",
                      bg: "bg-emerald-50",
                      border: "border-emerald-200",
                      text: "text-emerald-700",
                      icon: "zap",
                      gridClass: "col-span-2 sm:col-span-3",
                    },
                    {
                      id: "Bagus (Di Atas Ekspektasi)",
                      label: "Bagus",
                      badge: "Di Atas Ekspektasi",
                      bg: "bg-blue-50",
                      border: "border-blue-200",
                      text: "text-blue-700",
                      icon: "trending-up",
                      gridClass: "col-span-2 sm:col-span-3",
                    },
                    {
                      id: "Standar (Sesuai Gaji)",
                      label: "Standar",
                      badge: "Sesuai Gaji",
                      bg: "bg-slate-50",
                      border: "border-slate-200",
                      text: "text-slate-700",
                      icon: "minus",
                      gridClass: "col-span-2 sm:col-span-2",
                    },
                    {
                      id: "Kurang (Underperforming)",
                      label: "Kurang",
                      badge: "Underperforming",
                      bg: "bg-orange-50",
                      border: "border-orange-200",
                      text: "text-orange-700",
                      icon: "alert-triangle",
                      gridClass: "col-span-1 sm:col-span-2",
                    },
                    {
                      id: "Sangat Kurang (Overpaid / Rugi)",
                      label: "Sangat Kurang",
                      badge: "Overpaid / Rugi",
                      bg: "bg-red-50",
                      border: "border-red-200",
                      text: "text-red-700",
                      icon: "x-circle",
                      gridClass: "col-span-1 sm:col-span-2",
                    },
                  ].map((cat) => {
                    // Coba hitung berdasarkan filter yang lain agar akurat
                    const count = performaData.filter((d) => {
                      const matchDept =
                        filterDept === "All Departemen" ||
                        d.dept === filterDept;
                      const matchLevel =
                        filterLevel === "All Level" ||
                        d.levelJabatan === filterLevel;
                      const matchSearch = d.name
                        .toLowerCase()
                        .includes(searchPerformaName.toLowerCase());
                      return (
                        d.classification === cat.id &&
                        matchDept &&
                        matchLevel &&
                        matchSearch
                      );
                    }).length;

                    const isSelected = filterPenilaian === cat.id;

                    return (
                      <button
                        key={cat.id}
                        onClick={() =>
                          setFilterPenilaian(
                            isSelected ? "All Penilaian" : cat.id,
                          )
                        }
                        className={`p-4 rounded-xl border text-left transition-all ${isSelected ? `ring-2 ring-offset-1 ${cat.border.replace("border-", "ring-")}` : "hover:scale-[1.02]"} ${cat.bg} ${cat.border} flex flex-col justify-between ${cat.gridClass}`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <Icon
                              name={cat.icon as any}
                              size={14}
                              className={cat.text}
                            />
                            <span
                              className={`text-[9px] font-black uppercase tracking-wider ${cat.text}`}
                            >
                              {cat.badge}
                            </span>
                          </div>
                          <h4
                            className={`text-sm font-extrabold ${cat.text} leading-tight`}
                          >
                            {cat.label}
                          </h4>
                        </div>
                        <div className="mt-4 flex items-end justify-between w-full">
                          <div className="flex items-baseline gap-1">
                            <span
                              className={`text-4xl font-black ${cat.text} leading-none`}
                            >
                              {count}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-bold ${cat.text} uppercase tracking-widest opacity-80 mb-1`}
                          >
                            Orang
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Radar Chart Dashboard */}
              <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex flex-col min-h-[400px]">
                <div className="flex items-center justify-between mb-5 shrink-0">
                  <div>
                    <h3 className="font-extrabold text-slate-800">
                      Profil Kompetensi
                    </h3>
                    <p className="text-sm font-medium text-slate-500">
                      Rata-rata skor evaluasi area kompetensi (terpengaruh
                      filter).
                    </p>
                  </div>
                </div>
                <div className="flex-1 w-full relative -mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart
                      cx="50%"
                      cy="50%"
                      outerRadius="70%"
                      data={radarData}
                    >
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{
                          fill: "#64748b",
                          fontSize: 11,
                          fontWeight: "bold",
                        }}
                      />
                      <PolarRadiusAxis
                        angle={30}
                        domain={[0, "dataMax + 10"]}
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                      />
                      <Radar
                        name="Skor Rata-Rata"
                        dataKey="A"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.4}
                      />
                      <RechartsTooltip
                        formatter={(value: number) => value.toFixed(1)}
                        contentStyle={{
                          borderRadius: "12px",
                          border: "none",
                          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                          fontSize: "12px",
                          fontWeight: "bold",
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* Scatter Plot untuk Rekomendasi Visualisasi */}
              <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex flex-col min-h-[450px]">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-extrabold text-slate-800">
                      Evaluasi Kinerja vs Cost Salary
                    </h3>
                    <p className="text-sm font-medium text-slate-500">
                      Scatter plot membandingkan cost terhadap evaluasi kinerja
                      secara memanjang.
                    </p>
                  </div>
                </div>
                <div className="flex-1 w-full min-h-[350px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart
                      margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#f1f5f9"
                      />
                      <XAxis
                        type="number"
                        dataKey="nilaiAkhir"
                        name="Skor Akhir"
                        domain={[0, 130]}
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                        tickLine={false}
                        axisLine={false}
                        label={{
                          value: "Nilai Akhir (Total Performa)",
                          position: "insideBottom",
                          offset: -10,
                          fontSize: 12,
                          fill: "#64748b",
                          fontWeight: "bold",
                        }}
                      />
                      <YAxis
                        type="number"
                        dataKey="gaji"
                        name="Gaji"
                        tickFormatter={(v) =>
                          `Rp ${(v / 1000000).toFixed(0)}Jt`
                        }
                        domain={[
                          0,
                          Math.max(
                            10000000,
                            ...filteredPerformaData.map((d) => d.gaji || 0),
                          ),
                        ]}
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <RechartsTooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        formatter={(value: number, name: string) =>
                          name === "Gaji"
                            ? `Rp ${value.toLocaleString("id-ID")}`
                            : value
                        }
                        content={({ payload }) => {
                          if (payload && payload.length) {
                            const data = payload[0].payload;
                            if (data.dummy) return null;
                            return (
                              <div className="bg-white p-3 rounded-lg shadow-xl border border-slate-100 text-xs text-left min-w-[200px] z-50">
                                <p className="font-bold text-slate-800 mb-1">
                                  {data.name}
                                </p>
                                <p className="text-[10px] text-slate-500 mb-2 border-b border-slate-100 pb-2">
                                  {data.levelJabatan}
                                </p>
                                <div className="space-y-1 mb-2">
                                  <p className="text-slate-500 flex justify-between">
                                    <span>Nilai Akhir:</span>{" "}
                                    <span className="font-bold text-slate-800">
                                      {data.nilaiAkhir.toFixed(1)}
                                    </span>
                                  </p>
                                  <p className="text-slate-500 flex justify-between">
                                    <span>Gaji Aktual:</span>{" "}
                                    <span className="font-bold text-slate-800">
                                      Rp {data.gaji.toLocaleString("id-ID")}
                                    </span>
                                  </p>
                                  <p className="text-slate-500 flex justify-between">
                                    <span>Nilai Kontribusi:</span>{" "}
                                    <span className="font-bold text-emerald-600">
                                      Rp{" "}
                                      {Math.round(
                                        data.nilaiKontribusi,
                                      ).toLocaleString("id-ID")}
                                    </span>
                                  </p>
                                </div>
                                <div className="mt-2 border-t border-slate-100 pt-2 flex flex-col gap-1">
                                  <p className="text-slate-500 flex justify-between items-center">
                                    <span>Kesimpulan:</span>
                                    <span
                                      className="font-bold"
                                      style={{
                                        color: data.classification.startsWith(
                                          "Sangat Bagus",
                                        )
                                          ? "#10b981"
                                          : data.classification.startsWith(
                                                "Bagus",
                                              )
                                            ? "#3b82f6"
                                            : data.classification.startsWith(
                                                  "Standar",
                                                )
                                              ? "#64748b"
                                              : data.classification.startsWith(
                                                    "Kurang",
                                                  ) &&
                                                  !data.classification.startsWith(
                                                    "Sangat",
                                                  )
                                                ? "#f97316"
                                                : data.classification.startsWith(
                                                      "Sangat Kurang",
                                                    )
                                                  ? "#ef4444"
                                                  : "#94a3b8",
                                      }}
                                    >
                                      {data.classification.split(" (")[0]}
                                    </span>
                                  </p>
                                  {data.rekomendasi &&
                                    data.rekomendasi !== "-" && (
                                      <p
                                        className="text-[10px] font-bold text-right"
                                        style={{
                                          color: data.classification.startsWith(
                                            "Sangat Bagus",
                                          )
                                            ? "#10b981"
                                            : data.classification.startsWith(
                                                  "Bagus",
                                                )
                                              ? "#3b82f6"
                                              : data.classification.startsWith(
                                                    "Standar",
                                                  )
                                                ? "#64748b"
                                                : data.classification.startsWith(
                                                      "Kurang",
                                                    ) &&
                                                    !data.classification.startsWith(
                                                      "Sangat",
                                                    )
                                                  ? "#f97316"
                                                  : data.classification.startsWith(
                                                        "Sangat Kurang",
                                                      )
                                                    ? "#ef4444"
                                                    : "#94a3b8",
                                        }}
                                      >
                                        ({data.rekomendasi})
                                      </p>
                                    )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Scatter
                        name="Karyawan"
                        data={
                          filteredPerformaData.filter(
                            (d) => d.classification !== "Belum Dinilai",
                          ).length > 0
                            ? filteredPerformaData.filter(
                                (d) => d.classification !== "Belum Dinilai",
                              )
                            : [
                                {
                                  nilaiAkhir: 0,
                                  gaji: 0,
                                  classification: "Belum Dinilai",
                                  dummy: true,
                                },
                              ]
                        }
                      >
                        {(filteredPerformaData.filter(
                          (d) => d.classification !== "Belum Dinilai",
                        ).length > 0
                          ? filteredPerformaData.filter(
                              (d) => d.classification !== "Belum Dinilai",
                            )
                          : [
                              {
                                nilaiAkhir: 0,
                                gaji: 0,
                                classification: "Belum Dinilai",
                                dummy: true,
                              },
                            ]
                        ).map((entry: any, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              entry.dummy
                                ? "transparent"
                                : entry.classification.startsWith(
                                      "Sangat Bagus",
                                    )
                                  ? "#10b981"
                                  : entry.classification.startsWith("Bagus")
                                    ? "#3b82f6"
                                    : entry.classification.startsWith("Standar")
                                      ? "#64748b"
                                      : entry.classification.startsWith(
                                            "Kurang",
                                          ) &&
                                          !entry.classification.startsWith(
                                            "Sangat",
                                          )
                                        ? "#f97316"
                                        : entry.classification.startsWith(
                                              "Sangat Kurang",
                                            )
                                          ? "#ef4444"
                                          : "#94a3b8"
                            }
                          />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-100 shadow-sm rounded-[24px] flex flex-col flex-1 min-h-[400px] relative pb-[1px]">
              <div className="p-6 border-b border-slate-100 shrink-0 rounded-t-[24px] bg-white z-30">
                <h3 className="font-extrabold text-slate-800">
                  Evaluasi Kinerja vs Cost Salary
                </h3>
              </div>
              <div
                ref={tableRef}
                className="overflow-auto flex-1 max-h-[550px] pb-4 hide-scrollbar-x rounded-b-[24px]"
                onScroll={onTableScroll}
              >
                <table className="min-w-max w-full text-left border-collapse whitespace-nowrap">
                  <thead className="bg-slate-50 sticky top-0 z-20 shadow-sm shadow-slate-100">
                    <tr>
                      <th className="px-4 py-2 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center sticky left-0 z-20 bg-slate-50 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                        Nama Karyawan
                      </th>
                      <th className="px-4 py-2 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">
                        Jabatan & Level
                      </th>
                      <th className="px-4 py-2 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">
                        Nilai Core Value
                      </th>
                      <th className="px-4 py-2 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">
                        Nilai Kedisiplinan
                      </th>
                      <th className="px-4 py-2 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">
                        Nilai Akhir
                      </th>
                      <th className="px-4 py-2 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">
                        Analitik Gaji & Value
                      </th>
                      <th className="px-4 py-2 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">
                        Value-To-Cost Ratio
                      </th>
                      <th className="px-4 py-2 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">
                        Kesimpulan Penilaian
                      </th>
                      <th className="px-4 py-2 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">
                        Penilai
                      </th>
                      <th className="px-4 py-2 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">
                        Dokumen Report
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-100">
                    {filteredPerformaData.map((d, i) => (
                      <tr
                        key={i}
                        className={`group hover:bg-slate-50 cursor-pointer transition-colors ${searchPerformaName === d.name ? "bg-indigo-50/60" : ""}`}
                        onClick={() =>
                          setSearchPerformaName(
                            searchPerformaName === d.name ? "" : d.name,
                          )
                        }
                      >
                        <td
                          className={`px-4 py-2 sticky left-0 z-10 ${searchPerformaName === d.name ? "bg-indigo-50/60" : "bg-white"} group-hover:bg-slate-50 shadow-[2px_0_5px_rgba(0,0,0,0.05)] whitespace-nowrap`}
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-3">
                              <span className="text-slate-400 font-bold w-6 inline-block">
                                {i + 1}
                              </span>
                              <span className="font-bold text-slate-900">
                                {d.name}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium ml-9 mt-0.5 truncate max-w-[200px]">
                              {d.periodeStart || d.periodeEnd
                                ? `Periode: ${d.periodeStart ? new Date(d.periodeStart).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "?"} - ${d.periodeEnd ? new Date(d.periodeEnd).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "?"}`
                                : "Periode blm diatur"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-center">
                          <span className="text-[11px] text-slate-500 font-medium">
                            {d.levelJabatan || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {d.kompetensiScore.toFixed(1)}
                        </td>
                        <td className="px-4 py-2 text-red-500 text-center font-bold">
                          -{Math.abs(d.kedisiplinanScore)}
                        </td>
                        <td className="px-4 py-2 font-bold text-slate-900 text-center">
                          {d.nilaiAkhir.toFixed(1)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-1 w-32 py-1 mx-auto">
                            <div className="flex justify-between items-center w-full gap-2">
                              <span className="text-[10px] text-slate-400 font-bold">
                                Gaji
                              </span>
                              <span className="font-bold text-slate-900">
                                Rp {d.gaji.toLocaleString("id-ID")}
                              </span>
                            </div>
                            <div className="flex justify-between items-center w-full gap-2">
                              <span className="text-[10px] text-emerald-500 font-bold">
                                Value
                              </span>
                              <span className="font-bold text-emerald-600">
                                Rp{" "}
                                {Math.round(d.nilaiKontribusi).toLocaleString(
                                  "id-ID",
                                )}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className="font-black text-lg text-slate-800">
                            {d.vcr.toFixed(2)}x
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex flex-col items-center gap-1.5 mt-1">
                            <span
                              className={`px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest uppercase ${
                                d.classification === "Belum Dinilai"
                                  ? "bg-slate-100 text-slate-500"
                                  : d.classification.startsWith("Sangat Bagus")
                                    ? "bg-emerald-100 text-emerald-700"
                                    : d.classification.startsWith("Bagus")
                                      ? "bg-blue-100 text-blue-700"
                                      : d.classification.startsWith("Standar")
                                        ? "bg-slate-200 text-slate-700"
                                        : d.classification.startsWith(
                                              "Kurang",
                                            ) &&
                                            !d.classification.startsWith(
                                              "Sangat",
                                            )
                                          ? "bg-orange-100 text-orange-700"
                                          : "bg-rose-100 text-rose-700"
                              }`}
                            >
                              {d.classification.split(" (")[0]}
                            </span>
                            <span
                              className={`text-[11px] font-bold ${
                                d.classification === "Belum Dinilai"
                                  ? "text-slate-400"
                                  : d.classification.startsWith("Sangat Bagus")
                                    ? "text-emerald-600"
                                    : d.classification.startsWith("Bagus")
                                      ? "text-blue-600"
                                      : d.classification.startsWith("Standar")
                                        ? "text-slate-600"
                                        : d.classification.startsWith(
                                              "Kurang",
                                            ) &&
                                            !d.classification.startsWith(
                                              "Sangat",
                                            )
                                          ? "text-orange-600"
                                          : "text-rose-600"
                              }`}
                            >
                              {d.rekomendasi}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center whitespace-nowrap">
                          <span className="text-xs font-bold text-slate-700">
                            {d.namaPenilai || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center whitespace-nowrap">
                          {d.classification !== "Belum Dinilai" ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReportPreviewData(d);
                              }}
                              className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[11px] font-black tracking-wider uppercase hover:bg-blue-100 hover:text-blue-700 transition-all border border-blue-200 inline-flex items-center gap-1.5 shadow-sm"
                            >
                              <Icon name="file-text" size={14} />
                              Lihat PDF
                            </button>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-400">
                              -
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {performaData.length === 0 && (
                      <tr>
                        <td
                          colSpan={10}
                          className="px-4 py-8 text-center text-slate-400"
                        >
                          Belum ada data evaluasi
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div
                ref={fakeScrollRef}
                className="sticky bottom-0 z-50 overflow-x-auto w-full custom-scrollbar bg-slate-50/90 backdrop-blur-md border-t border-slate-200 hidden sm:block shadow-[0_-10px_15px_rgba(0,0,0,0.03)]"
                onScroll={onFakeScroll}
              >
                <div
                  style={{
                    height: "1px",
                    width: tableWidth ? `${tableWidth}px` : "100%",
                  }}
                ></div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Global Settings */}
            <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-800">
                  Target Gaji Baseline (Standar Level Staff / UMR)
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Nilai ini dijadikan acuan (Multiplier 1.0x) untuk mengukur
                  Ekspektasi Value tiap karyawan. Ubah jika Standar Gaji Dasar
                  perusahaan naik.
                </p>
              </div>
              <div className="flex-shrink-0 w-full sm:w-[250px]">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    Rp
                  </div>
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl pl-10 pr-4 py-3 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all text-right"
                    value={baselineSalary.toLocaleString("id-ID")}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      handleGlobalSettingChange(
                        "baselineSalary",
                        parseInt(val) || 0,
                      );
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-320px)] min-h-[600px]">
              {/* Left Sidebar: Employee List */}
              <div className="bg-white border border-slate-100 shadow-sm rounded-[24px] overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-3">
                  <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-widest">
                    Pilih Karyawan
                  </h3>
                  <div className="relative">
                    <Icon
                      name="search"
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Cari nama karyawan..."
                      value={inputEmpSearch}
                      onChange={(e) => setInputEmpSearch(e.target.value)}
                      className="pl-9 pr-3 py-2 w-full bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-slate-400 text-slate-700"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-1 hide-scrollbar">
                  {employees
                    .filter((emp) =>
                      emp.name
                        .toLowerCase()
                        .includes(inputEmpSearch.toLowerCase()),
                    )
                    .map((emp, index) => (
                      <button
                        key={emp.id}
                        onClick={() => setSelectedEmpId(emp.id)}
                        className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between group ${selectedEmpId === emp.id ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-700"}`}
                      >
                        <div className="w-full flex gap-3 items-start overflow-hidden relative pr-8">
                          <span
                            className={`text-[12px] font-bold mt-0.5 shrink-0 ${selectedEmpId === emp.id ? "text-blue-500" : "text-slate-400"}`}
                          >
                            {index + 1}.
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[13px] truncate">
                              {emp.name}
                            </p>
                            <p className="text-[11px] font-medium text-slate-400 mt-0.5 truncate">
                              {emp.pos}
                            </p>
                          </div>
                          <div
                            title="Salin Link Publik Penilaian Anak Ini"
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = `${window.location.origin}${window.location.pathname}?mode=evaluasi&evalId=${emp.id}`;
                              navigator.clipboard.writeText(url);
                              alert(
                                `Link penilaian untuk ${emp.name} berhasil disalin!`,
                              );
                            }}
                            className={`absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-white border border-slate-200 text-slate-400 opacity-0 group-hover:opacity-100 transition-all hover:text-blue-600 hover:border-blue-300 hover:shadow-sm ${selectedEmpId === emp.id ? "opacity-100" : ""}`}
                          >
                            <Icon name="link" size={14} />
                          </div>
                        </div>
                        {performaData.find((d) => d.id === emp.id)
                          ?.classification !== "Belum Dinilai" && (
                          <div className="w-2 h-2 rounded-full bg-emerald-400 ml-2 shrink-0"></div>
                        )}
                      </button>
                    ))}
                </div>
              </div>

              {/* Right Form: Input Data */}
              <div className="bg-white border border-slate-100 shadow-sm rounded-[24px] overflow-y-auto hide-scrollbar pb-8">
                {selectedEmpId ? (
                  (() => {
                    const emp = employees.find((e) => e.id === selectedEmpId)!;

                    const storedData = performaDataMap[selectedEmpId];
                    const rawData = storedData || {
                      grit: 0,
                      growth: 0,
                      prof: 0,
                      sus: 0,
                      telat: 0,
                      ijin: 0,
                      mangkir: 0,
                      sp: 0,
                      gaji: 0,
                      levelJabatan: "",
                    };

                    const data = upgradePerformaData(rawData);

                    const handleChange = (
                      field: string,
                      value: number | string,
                    ) => {
                      setPerformaDataMap((prev) => ({
                        ...prev,
                        [selectedEmpId]: { ...data, [field]: value },
                      }));
                      // logActivity debounced roughly
                      logActivity("Update Penilaian Performa", {
                        karyawan: emp?.name || selectedEmpId,
                        field,
                      });
                    };

                    // Kalkulasi total real-time
                    const safeCalc = (keys: string[]) => {
                      const sum = keys.reduce(
                        (acc, k) => acc + (data[k as keyof typeof data] || 0),
                        0,
                      ) as number;
                      return sum / keys.length;
                    };

                    const gritVal = safeCalc([
                      "grit_1",
                      "grit_2",
                      "grit_3",
                      "grit_4",
                      "grit_5",
                    ]);
                    const growthVal = safeCalc([
                      "growth_1",
                      "growth_2",
                      "growth_3",
                      "growth_4",
                      "growth_5",
                    ]);
                    const profVal = safeCalc([
                      "prof_1",
                      "prof_2",
                      "prof_3",
                      "prof_4",
                      "prof_5",
                    ]);
                    const susVal = safeCalc([
                      "sus_1",
                      "sus_2",
                      "sus_3",
                      "sus_4",
                      "sus_5",
                    ]);

                    const wGrit = data.weight_grit ?? 30;
                    const wGrowth = data.weight_growth ?? 20;
                    const wProf = data.weight_prof ?? 30;
                    const wSus = data.weight_sus ?? 20;

                    const totalKompetensi =
                      gritVal * (wGrit / 100) +
                      growthVal * (wGrowth / 100) +
                      profVal * (wProf / 100) +
                      susVal * (wSus / 100); // max 125

                    const telat = data.telat || 0;
                    const ijin = data.ijin || 0;
                    const mangkir = data.mangkir || 0;
                    const sp = data.sp || 0;

                    const pengurangMap: Record<string, number> = {
                      telat: telat * 1,
                      ijin: ijin * 1,
                      mangkir: mangkir * 3,
                      sp: sp * 5,
                    };

                    const totalPengurang = Object.values(pengurangMap).reduce(
                      (a, b) => a + b,
                      0,
                    );
                    const nilaiAkhirRealTime = Math.max(
                      0,
                      totalKompetensi - totalPengurang,
                    );

                    return (
                      <div>
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-white border border-blue-100 text-blue-600 flex items-center justify-center font-black text-lg shadow-sm">
                              {emp.name.trim().charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="font-black text-xl text-slate-800">
                                {emp.name}
                              </h3>
                              <p className="text-sm font-bold text-slate-500">
                                {emp.pos} • {emp.dept}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setDataToClear(selectedEmpId)}
                            className="text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                            title="Reset/Hapus Data Penilaian Karyawan Ini"
                          >
                            <Icon name="trash-2" size={14} />
                            Clear Data
                          </button>
                        </div>

                        <div className="p-8 space-y-8">
                          {/* Periode Section */}
                          <div>
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="font-black text-sm text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                <Icon
                                  name="calendar"
                                  size={16}
                                  className="text-blue-500"
                                />
                                Periode & Penilai
                              </h4>
                              {(emp.contractStart || emp.contractEnd) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPerformaDataMap((prev) => ({
                                      ...prev,
                                      [selectedEmpId]: {
                                        ...data,
                                        periodeStart: emp.contractStart || "",
                                        periodeEnd: emp.contractEnd || "",
                                      },
                                    }));
                                  }}
                                  className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  <Icon name="refresh-cw" size={12} />
                                  Samakan dengan Kontrak
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
                              <div>
                                <label className="block text-[11px] font-black tracking-widest text-slate-400 uppercase mb-2">
                                  Nama Penilai
                                </label>
                                <div className="relative">
                                  <input
                                    type="text"
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl pl-4 pr-10 py-3 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all font-sans"
                                    value={data.namaPenilai || ""}
                                    onChange={(e) =>
                                      handleChange(
                                        "namaPenilai",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="Tulis nama penilai..."
                                  />
                                  {data.namaPenilai && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleChange("namaPenilai", "")
                                      }
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors p-1 z-10 hover:bg-slate-200/50 rounded-md"
                                    >
                                      <Icon name="x" size={16} />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="block text-[11px] font-black tracking-widest text-slate-400 uppercase mb-2">
                                  Tanggal Mulai (Dari)
                                </label>
                                <div className="relative">
                                  <input
                                    type="date"
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl pl-4 pr-[70px] py-3 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all font-sans [&::-webkit-clear-button]:hidden"
                                    value={data.periodeStart || ""}
                                    onChange={(e) =>
                                      handleChange(
                                        "periodeStart",
                                        e.target.value,
                                      )
                                    }
                                  />
                                  {data.periodeStart && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleChange("periodeStart", "")
                                      }
                                      className="absolute right-12 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors p-1 z-10 hover:bg-slate-200/50 rounded-md"
                                    >
                                      <Icon name="x" size={16} />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="block text-[11px] font-black tracking-widest text-slate-400 uppercase mb-2">
                                  Tanggal Selesai (Sampai)
                                </label>
                                <div className="relative">
                                  <input
                                    type="date"
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl pl-4 pr-[70px] py-3 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all font-sans [&::-webkit-clear-button]:hidden"
                                    value={data.periodeEnd || ""}
                                    onChange={(e) =>
                                      handleChange("periodeEnd", e.target.value)
                                    }
                                  />
                                  {data.periodeEnd && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleChange("periodeEnd", "")
                                      }
                                      className="absolute right-12 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors p-1 z-10 hover:bg-slate-200/50 rounded-md"
                                    >
                                      <Icon name="x" size={16} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Gaji Section */}
                          <div>
                            <h4 className="font-black text-sm text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                              <Icon
                                name="dollar-sign"
                                size={16}
                                className="text-blue-500"
                              />
                              Informasi Gaji & Level
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                              <div>
                                <label className="block text-[11px] font-black tracking-widest text-slate-400 uppercase mb-2">
                                  Estimasi Gaji Bulanan (Rp)
                                </label>
                                <div className="relative">
                                  <input
                                    type="text"
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl pl-4 pr-10 py-3 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all"
                                    value={
                                      data.gaji
                                        ? data.gaji.toLocaleString("id-ID")
                                        : ""
                                    }
                                    onChange={(e) => {
                                      const val = e.target.value.replace(
                                        /\D/g,
                                        "",
                                      );
                                      handleChange("gaji", parseInt(val) || 0);
                                    }}
                                    placeholder="Contoh: 8.000.000"
                                  />
                                  {data.gaji ? (
                                    <button
                                      type="button"
                                      onClick={() => handleChange("gaji", 0)}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors p-1"
                                    >
                                      <Icon name="x" size={16} />
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                              <div>
                                <label className="block text-[11px] font-black tracking-widest text-slate-400 uppercase mb-2">
                                  Level Jabatan (Multiplier Ekspektasi)
                                </label>
                                <div className="relative" ref={dropdownRef}>
                                  <div
                                    className={`w-full bg-slate-50 border border-slate-200 font-bold max-w-sm rounded-xl pl-4 pr-4 py-3 outline-none focus:border-blue-400 focus:ring-[3px] focus:ring-blue-100 transition-all cursor-pointer text-sm flex items-center justify-between ${!data.levelJabatan ? "text-slate-500" : "text-slate-800"}`}
                                    onClick={() =>
                                      setIsLevelDropdownOpen(
                                        !isLevelDropdownOpen,
                                      )
                                    }
                                  >
                                    <span className="truncate">
                                      {data.levelJabatan === "Custom"
                                        ? data.customLevelName
                                          ? `${data.customLevelName} (${data.customMultiplier || 1.0}x)`
                                          : "Custom"
                                        : jobLevels.find(
                                            (l: any) =>
                                              l.id === data.levelJabatan,
                                          )?.label || "Silahkan pilih"}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      {data.levelJabatan && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleChange("levelJabatan", "");
                                          }}
                                          className="text-red-500 hover:text-red-600 transition-colors p-1"
                                        >
                                          <Icon name="x" size={16} />
                                        </button>
                                      )}
                                      <div className="pointer-events-none text-slate-400">
                                        <Icon
                                          name={
                                            isLevelDropdownOpen
                                              ? "chevron-up"
                                              : "chevron-down"
                                          }
                                          size={16}
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  {isLevelDropdownOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-[120%] max-w-md bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                                      <div className="p-3 bg-slate-50 border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                        Silahkan pilih
                                      </div>
                                      <div className="max-h-60 overflow-y-auto py-1">
                                        <div className="px-4 py-2 text-[10px] items-center flex justify-between font-black text-blue-500 uppercase tracking-widest">
                                          <span>Level Jabatan</span>
                                          <button
                                            type="button"
                                            onClick={
                                              handleAutoGenerateJobLevels
                                            }
                                            className="text-[9px] bg-blue-100 text-blue-700 px-2.5 py-1 rounded-md cursor-pointer hover:bg-blue-200 transition-colors"
                                          >
                                            Auto Generate
                                          </button>
                                        </div>
                                        {jobLevels.length === 0 && (
                                          <div className="px-4 py-3 text-xs text-slate-400 text-center italic">
                                            Belum ada data. Klik Auto Generate
                                            atau buat baru di bawah.
                                          </div>
                                        )}
                                        {jobLevels.map((lvl: any) => (
                                          <div
                                            key={lvl.id}
                                            className={`flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer transition-colors ${data.levelJabatan === lvl.id ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-700 hover:bg-slate-50"}`}
                                            onClick={() => {
                                              handleChange(
                                                "levelJabatan",
                                                lvl.id,
                                              );
                                              setIsLevelDropdownOpen(false);
                                            }}
                                          >
                                            <span>{lvl.label}</span>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteJobLevel(e, lvl.id);
                                              }}
                                              className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded transition-colors"
                                              title="Hapus opsi ini"
                                            >
                                              <Icon name="x" size={14} />
                                            </button>
                                          </div>
                                        ))}
                                      </div>

                                      <div className="p-3 border-t border-slate-100 bg-slate-50 space-y-2">
                                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                          Tambah Opsi Custom
                                        </div>
                                        <div className="flex gap-2">
                                          <input
                                            type="text"
                                            placeholder="Nama Level (CFO)"
                                            className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-400"
                                            value={newLevelName}
                                            onChange={(e) =>
                                              setNewLevelName(e.target.value)
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                          <input
                                            type="number"
                                            step="0.1"
                                            placeholder="Multiplier (4.0)"
                                            className="w-28 min-w-0 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-400"
                                            value={newLevelMultiplier}
                                            onChange={(e) =>
                                              setNewLevelMultiplier(
                                                e.target.value,
                                              )
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              handleAddJobLevel();
                                            }}
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center shrink-0 font-bold text-xs"
                                          >
                                            Tambah
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-8">
                            {/* Core Value Section */}
                            <div className="space-y-4">
                              <h4 className="font-black text-sm text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Icon
                                  name="award"
                                  size={16}
                                  className="text-blue-500"
                                />
                                Nilai Core Value
                              </h4>
                              {[
                                {
                                  id: "grit",
                                  label: "Grit",
                                  bobotKey: "weight_grit",
                                  defaultBobot: 30,
                                  desc1:
                                    "Sangat mudah menyerah, menolak tugas.",
                                  desc2:
                                    "Kurang tekun, inisiatif minim, banyak alasan.",
                                  desc3:
                                    "Penyelesaian standar, inisiatif butuh arahan.",
                                  desc4:
                                    "Tekun, inisiatif mandiri, pantang menyerah.",
                                  desc5:
                                    "Sangat gigih, proaktif, kualitas luar biasa.",
                                  questions: [
                                    {
                                      id: "grit_1",
                                      text: "Kemauan belajar hal baru yang menjadi tuntutan pekerjaan",
                                    },
                                    {
                                      id: "grit_2",
                                      text: "Kemauan extra effort dalam penyelesaian hambatan pekerjaan",
                                    },
                                    {
                                      id: "grit_3",
                                      text: "Menunjukkan sikap give & take pada pekerjaan",
                                    },
                                    {
                                      id: "grit_4",
                                      text: "Fokus pada penyelesaian tugas hingga tuntas",
                                    },
                                    {
                                      id: "grit_5",
                                      text: "Ketahanan dan pantang menyerah dalam menghadapi tekanan",
                                    },
                                  ],
                                },
                                {
                                  id: "growth",
                                  label: "Growth",
                                  bobotKey: "weight_growth",
                                  defaultBobot: 20,
                                  desc1:
                                    "Menolak masukan, performa terus menurun.",
                                  desc2:
                                    "Kurang proaktif, mengulang kesalahan sama.",
                                  desc3:
                                    "Belajar bila diminta, terbuka terhadap masukan ringan.",
                                  desc4:
                                    "Terbuka inovasi, kinerja mulai terlihat meningkat.",
                                  desc5:
                                    "Sangat proaktif belajar inovasi, kinerja melesat.",
                                  questions: [
                                    {
                                      id: "growth_1",
                                      text: "Memiliki skill yang berkembang seiring waktu",
                                    },
                                    {
                                      id: "growth_2",
                                      text: "Tidak mengulang kesalahan yang sama dalam pekerjaan",
                                    },
                                    {
                                      id: "growth_3",
                                      text: "Keterbukaan terhadap saran & kritik dalam bekerja",
                                    },
                                    {
                                      id: "growth_4",
                                      text: "Menunjukkan kesiapan saat diberikan tanggung jawab lebih",
                                    },
                                    {
                                      id: "growth_5",
                                      text: "Kontribusi pada peningkatan sistem kerja",
                                    },
                                  ],
                                },
                                {
                                  id: "prof",
                                  label: "Professionalism",
                                  bobotKey: "weight_prof",
                                  defaultBobot: 30,
                                  desc1:
                                    "Sering melanggar aturan, tidak bertanggung jawab.",
                                  desc2:
                                    "Kurang tanggap, komunikasi seadanya, perlu diawasi.",
                                  desc3:
                                    "Tanggung jawab tercapai, komunikasi cukup, patuh.",
                                  desc4:
                                    "Bertanggung jawab penuh, komunikasi lancar.",
                                  desc5:
                                    "Integritas sangat tinggi, menjadi teladan profesional.",
                                  questions: [
                                    {
                                      id: "prof_1",
                                      text: "Tanggung jawab terhadap pekerjaan & komunikasi efektif",
                                    },
                                    {
                                      id: "prof_2",
                                      text: "Bekerja dengan integritas dan etika",
                                    },
                                    {
                                      id: "prof_3",
                                      text: "Kepatuhan pada prosedur dan aturan kerja",
                                    },
                                    {
                                      id: "prof_4",
                                      text: "Kemampuan berkolaborasi dalam alur kerja tim",
                                    },
                                    {
                                      id: "prof_5",
                                      text: "Kemampuan melakukan efisiensi dan produktifitas",
                                    },
                                  ],
                                },
                                {
                                  id: "sus",
                                  label: "Sustainable",
                                  bobotKey: "weight_sus",
                                  defaultBobot: 20,
                                  desc1:
                                    "Menolak keras perubahan, banyak mengeluh.",
                                  desc2:
                                    "Lambat beradaptasi, sering bingung metode baru.",
                                  desc3:
                                    "Bisa beradaptasi bila diajari, kualitas stabil.",
                                  desc4:
                                    "Cepat menyesuaikan diri, mendukung inisiatif perusahaan.",
                                  desc5:
                                    "Sangat efisien adaptasi, loyalitas kuat jangka panjang.",
                                  questions: [
                                    {
                                      id: "sus_1",
                                      text: "Kemampuan adaptasi pada perubahan pola kerja",
                                    },
                                    {
                                      id: "sus_2",
                                      text: "Memiliki loyalitas bertahan di perusahaan",
                                    },
                                    {
                                      id: "sus_3",
                                      text: "Konsistensi dalam memberikan hasil kerja yang berkualitas",
                                    },
                                    {
                                      id: "sus_4",
                                      text: "Memiliki komitmen untuk tumbuh bersama tujuan perusahaan",
                                    },
                                    {
                                      id: "sus_5",
                                      text: "Kemampuan mempertahankan motivasi kerja dalam jangka panjang",
                                    },
                                  ],
                                },
                              ].map((komp) => {
                                const avgScore =
                                  komp.questions.reduce(
                                    (acc, q) =>
                                      acc +
                                      (data[q.id as keyof typeof data] || 0),
                                    0,
                                  ) / komp.questions.length;
                                const hasSelections = komp.questions.some(
                                  (q) => !!data[q.id as keyof typeof data],
                                );
                                return (
                                  <div
                                    key={komp.id}
                                    className="bg-slate-50 rounded-2xl p-4 border border-slate-100"
                                  >
                                    <div className="flex justify-between items-center mb-4">
                                      <div className="flex flex-col">
                                        <label className="text-sm font-black tracking-widest text-slate-800 uppercase">
                                          {komp.label}
                                        </label>
                                        <span className="text-[11px] font-bold text-slate-500">
                                          Skor Rata-rata:{" "}
                                          {hasSelections
                                            ? avgScore.toFixed(1)
                                            : "-"}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-sm bg-white border border-slate-200 pl-3 pr-1 py-1 rounded-lg shadow-sm">
                                        <span className="font-bold text-slate-500 text-xs uppercase tracking-wider">
                                          Bobot:
                                        </span>
                                        <div className="flex items-center relative w-16">
                                          <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            className="w-full text-right font-black text-blue-600 outline-none pr-4 py-1 [&::-webkit-inner-spin-button]:appearance-none leading-none bg-transparent"
                                            value={
                                              data[
                                                komp.bobotKey as keyof typeof data
                                              ] ?? komp.defaultBobot
                                            }
                                            onChange={(e) =>
                                              handleChange(
                                                komp.bobotKey,
                                                e.target.value === ""
                                                  ? ""
                                                  : parseInt(e.target.value),
                                              )
                                            }
                                          />
                                          <span className="absolute right-1 text-slate-400 font-bold pointer-events-none">
                                            %
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
                                      <div
                                        className={`p-3 rounded-xl border transition-all ${hasSelections && avgScore > 0 && avgScore <= 25 ? "bg-red-50 border-red-200 ring-1 ring-red-200" : "bg-white border-slate-200 opacity-70"}`}
                                      >
                                        <p className="text-[10px] font-black text-red-500 mb-1">
                                          Skor 1 (Sangat Kurang)
                                        </p>
                                        <p className="text-[11px] font-medium text-slate-600 leading-tight">
                                          {komp.desc1}
                                        </p>
                                      </div>
                                      <div
                                        className={`p-3 rounded-xl border transition-all ${hasSelections && avgScore > 25 && avgScore <= 50 ? "bg-orange-50 border-orange-200 ring-1 ring-orange-200" : "bg-white border-slate-200 opacity-70"}`}
                                      >
                                        <p className="text-[10px] font-black text-orange-500 mb-1">
                                          Skor 2 (Kurang)
                                        </p>
                                        <p className="text-[11px] font-medium text-slate-600 leading-tight">
                                          {komp.desc2}
                                        </p>
                                      </div>
                                      <div
                                        className={`p-3 rounded-xl border transition-all ${hasSelections && avgScore > 50 && avgScore <= 75 ? "bg-slate-50 border-slate-300 ring-1 ring-slate-300" : "bg-white border-slate-200 opacity-70"}`}
                                      >
                                        <p className="text-[10px] font-black text-slate-500 mb-1">
                                          Skor 3 (Standar)
                                        </p>
                                        <p className="text-[11px] font-medium text-slate-600 leading-tight">
                                          {komp.desc3}
                                        </p>
                                      </div>
                                      <div
                                        className={`p-3 rounded-xl border transition-all ${hasSelections && avgScore > 75 && avgScore <= 100 ? "bg-blue-50 border-blue-200 ring-1 ring-blue-200" : "bg-white border-slate-200 opacity-70"}`}
                                      >
                                        <p className="text-[10px] font-black text-blue-500 mb-1">
                                          Skor 4 (Bagus)
                                        </p>
                                        <p className="text-[11px] font-medium text-slate-600 leading-tight">
                                          {komp.desc4}
                                        </p>
                                      </div>
                                      <div
                                        className={`p-3 rounded-xl border transition-all ${hasSelections && avgScore > 100 ? "bg-emerald-50 border-emerald-200 ring-1 ring-emerald-200" : "bg-white border-slate-200 opacity-70"}`}
                                      >
                                        <p className="text-[10px] font-black text-emerald-500 mb-1">
                                          Skor 5 (Sangat Bagus)
                                        </p>
                                        <p className="text-[11px] font-medium text-slate-600 leading-tight">
                                          {komp.desc5}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="space-y-2">
                                      {komp.questions.map((q, idx) => (
                                        <div
                                          key={q.id}
                                          className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200"
                                        >
                                          <label className="text-[13px] font-semibold text-slate-700 flex-1 pr-4">
                                            {idx + 1}. {q.text}
                                          </label>
                                          <div className="flex items-center gap-2">
                                            <div className="w-14 h-9 bg-blue-50/80 border border-blue-100 rounded-lg flex items-center justify-center text-[13px] font-black text-blue-600 shadow-sm">
                                              {data[
                                                q.id as keyof typeof data
                                              ] === undefined ||
                                              data[
                                                q.id as keyof typeof data
                                              ] === "" ||
                                              data[
                                                q.id as keyof typeof data
                                              ] === 0
                                                ? "-"
                                                : Number(
                                                    data[
                                                      q.id as keyof typeof data
                                                    ],
                                                  )}
                                            </div>
                                            <div className="w-36 md:w-44 flex-shrink-0 relative">
                                              <select
                                                className={`appearance-none w-full bg-slate-50 border border-slate-200 font-bold rounded-lg pl-3 pr-16 py-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all text-[13px] cursor-pointer ${data[q.id as keyof typeof data] === undefined || data[q.id as keyof typeof data] === "" ? "text-slate-500" : "text-slate-800"}`}
                                                value={
                                                  data[
                                                    q.id as keyof typeof data
                                                  ] === undefined ||
                                                  data[
                                                    q.id as keyof typeof data
                                                  ] === ""
                                                    ? ""
                                                    : Number(
                                                        data[
                                                          q.id as keyof typeof data
                                                        ],
                                                      )
                                                }
                                                onChange={(e) => {
                                                  if (e.target.value === "") {
                                                    handleChange(q.id, "");
                                                  } else {
                                                    // Since the form outputs 25-base natively now, we just save it directly.
                                                    handleChange(
                                                      q.id,
                                                      parseInt(
                                                        e.target.value,
                                                      ) || 0,
                                                    );
                                                  }
                                                }}
                                              >
                                                <option value="" disabled>
                                                  Silahkan pilih
                                                </option>
                                                <option value="125">
                                                  5 - Sangat Bagus
                                                </option>
                                                <option value="100">
                                                  4 - Bagus
                                                </option>
                                                <option value="75">
                                                  3 - Standar / Cukup
                                                </option>
                                                <option value="50">
                                                  2 - Kurang
                                                </option>
                                                <option value="25">
                                                  1 - Sangat Kurang
                                                </option>
                                                <option value="0">
                                                  Tidak Ada
                                                </option>
                                              </select>
                                              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                                {data[
                                                  q.id as keyof typeof data
                                                ] !== undefined &&
                                                  data[
                                                    q.id as keyof typeof data
                                                  ] !== "" &&
                                                  data[
                                                    q.id as keyof typeof data
                                                  ] !== 0 && (
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        handleChange(q.id, "")
                                                      }
                                                      className="text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors p-1.5 rounded-md z-10 relative cursor-pointer flex items-center justify-center"
                                                      title="Kosongkan nilai"
                                                    >
                                                      <Icon
                                                        name="x"
                                                        size={14}
                                                        strokeWidth={3}
                                                      />
                                                    </button>
                                                  )}
                                                <div className="pointer-events-none text-slate-400">
                                                  <Icon
                                                    name="chevron-down"
                                                    size={16}
                                                  />
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    <div className="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50/50 p-4 rounded-xl border border-blue-100/60 flex items-center justify-between shadow-sm">
                                      <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-500 shadow-sm">
                                          <Icon name="sigma" size={20} />
                                        </div>
                                        <div>
                                          <h5 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-tight">
                                            Total Nilai{" "}
                                            {komp.label.split(" ")[0]}
                                          </h5>
                                          <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                                            Rata-rata (
                                            {hasSelections
                                              ? avgScore.toFixed(1)
                                              : "-"}
                                            ) × Bobot{" "}
                                            {data[
                                              komp.bobotKey as keyof typeof data
                                            ] ?? komp.defaultBobot}
                                            %
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex items-end gap-1">
                                        <span className="text-3xl font-black text-blue-600 leading-none">
                                          {hasSelections
                                            ? (
                                                avgScore *
                                                ((data[
                                                  komp.bobotKey as keyof typeof data
                                                ] ?? komp.defaultBobot) /
                                                  100)
                                              ).toFixed(1)
                                            : "0.0"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Kedisiplinan Section */}
                            <div className="space-y-4">
                              <h4 className="font-black text-sm text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Icon
                                  name="clock"
                                  size={16}
                                  className="text-rose-500"
                                />
                                Kedisiplinan (Pengurang)
                              </h4>
                              {[
                                {
                                  id: "telat",
                                  label: "Datang Lambat / Pulang Cepat",
                                  penalty: "-1 / kali",
                                },
                                {
                                  id: "ijin",
                                  label: "Sakit / Ijin",
                                  penalty: "-1 / kali",
                                },
                                {
                                  id: "mangkir",
                                  label: "Mangkir / Alfa",
                                  penalty: "-3 / kali",
                                },
                                {
                                  id: "sp",
                                  label: "Surat Peringatan",
                                  penalty: "-5 / kali",
                                },
                              ].map((dis) => (
                                <div key={dis.id}>
                                  <div className="flex justify-between items-center mb-2">
                                    <label className="text-[11px] font-black tracking-widest text-slate-500 uppercase">
                                      {dis.label}
                                    </label>
                                    <span className="text-[10px] font-bold text-rose-400 bg-rose-50 px-2 py-0.5 rounded-md">
                                      {dis.penalty}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                      <input
                                        type="number"
                                        min="0"
                                        className="w-full bg-white border border-slate-200 text-slate-800 font-bold rounded-xl px-4 py-2.5 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100 transition-all"
                                        value={
                                          data[dis.id as keyof typeof data] ===
                                          0
                                            ? 0
                                            : data[
                                                dis.id as keyof typeof data
                                              ] || ""
                                        }
                                        onChange={(e) =>
                                          handleChange(
                                            dis.id,
                                            e.target.value === ""
                                              ? ""
                                              : parseInt(e.target.value) || 0,
                                          )
                                        }
                                        placeholder="0"
                                      />
                                    </div>
                                    <div className="w-16 h-[46px] rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center font-black text-rose-600 shadow-sm">
                                      -{pengurangMap[dis.id] || 0}
                                    </div>
                                  </div>
                                </div>
                              ))}

                              <div className="mt-4 pt-2 bg-gradient-to-r from-rose-50 to-orange-50/50 p-4 rounded-xl border border-rose-100/60 flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-rose-500 shadow-sm">
                                    <Icon name="minus-circle" size={20} />
                                  </div>
                                  <div>
                                    <h5 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-tight">
                                      Total Potongan
                                    </h5>
                                    <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                                      Pengurang Kedisiplinan
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-end gap-1">
                                  <span className="text-3xl font-black text-rose-600 leading-none">
                                    -{totalPengurang}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-8 bg-slate-800 p-6 rounded-2xl flex items-center justify-between shadow-lg relative overflow-hidden">
                              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/4"></div>
                              <div className="relative z-10 flex flex-col">
                                <label className="text-slate-400 font-bold text-[11px] uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                  <Icon
                                    name="check-circle"
                                    size={14}
                                    className="text-emerald-400"
                                  />{" "}
                                  TOTAL NILAI AKHIR (VCR)
                                </label>
                                <span className="text-white font-black text-4xl">
                                  {nilaiAkhirRealTime.toFixed(1)}
                                </span>
                              </div>
                              <div className="relative z-10 flex items-center gap-3 text-right">
                                <div className="flex flex-col text-right">
                                  <span className="text-slate-300 font-bold text-xs">
                                    Total Kompetensi:{" "}
                                    <span className="text-white">
                                      {totalKompetensi.toFixed(1)}
                                    </span>
                                  </span>
                                  <span className="text-slate-300 font-bold text-xs mt-0.5 border-b border-dashed border-slate-600 pb-1">
                                    Total Pengurang:{" "}
                                    <span className="text-rose-400">
                                      -{totalPengurang}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 h-full text-slate-400">
                    <Icon
                      name="user"
                      size={48}
                      className="mb-4 text-slate-200"
                    />
                    <p className="font-bold text-lg">
                      Pilih karyawan dari daftar
                    </p>
                    <p className="text-sm">
                      Untuk mengisi data penilaian dan gaji
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {(() => {
        const renderCategoryRow = (cat: {
          id: string;
          label: string;
          questions: string[];
        }) => {
          if (!reportPreviewData) return null;
          const weightKey =
            `weight_${cat.id}` as keyof typeof reportPreviewData;
          const weightValue =
            reportPreviewData[weightKey] ??
            (cat.id === "grit" || cat.id === "prof" ? 30 : 20);
          const avgValue =
            reportPreviewData[cat.id as keyof typeof reportPreviewData] || 0;
          const weightedValue = avgValue * (weightValue / 100);

          return (
            <React.Fragment key={cat.id}>
              <tr className="bg-slate-100">
                <td
                  colSpan={5}
                  className="py-2 px-3 border border-slate-300 font-black text-slate-800 text-[11px] uppercase tracking-wider"
                >
                  {cat.label} (BOBOT: {weightValue}%)
                </td>
              </tr>
              {cat.questions.map((q, qIdx) => {
                const qKey =
                  `${cat.id}_${qIdx + 1}` as keyof typeof reportPreviewData;
                const qScore = reportPreviewData[qKey] || 0;
                let kategori = "-";
                if (qScore === 25) kategori = "Skor 1 (Sangat Kurang)";
                else if (qScore === 50) kategori = "Skor 2 (Kurang)";
                else if (qScore === 75) kategori = "Skor 3 (Standar)";
                else if (qScore === 100) kategori = "Skor 4 (Bagus)";
                else if (qScore === 125) kategori = "Skor 5 (Sangat Bagus)";

                return (
                  <tr key={qIdx} className="bg-white">
                    <td className="py-1 px-3 border border-slate-300 text-center text-xs font-bold text-slate-500">
                      {qIdx + 1}
                    </td>
                    <td className="py-1 px-3 border border-slate-300 text-xs text-slate-700">
                      {q}
                    </td>
                    <td className="py-1 px-3 border border-slate-300 text-center text-[10px] font-bold text-slate-600">
                      {kategori}
                    </td>
                    <td className="py-1 px-3 border border-slate-300 text-center text-[10px] font-medium text-slate-500">
                      {qScore > 0 ? `${qScore / 25} × 25` : "-"}
                    </td>
                    <td className="py-1 px-3 border border-slate-300 text-center font-bold text-slate-900 bg-slate-50">
                      {qScore}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50">
                <td
                  colSpan={3}
                  className="py-1.5 px-3 border border-slate-300 text-right text-[10px] font-black text-slate-600 uppercase tracking-wider"
                >
                  TOTAL NILAI {cat.label}
                </td>
                <td className="py-1.5 px-3 border border-slate-300 text-center text-[9px] font-medium text-slate-600">
                  Rata-rata ({avgValue.toFixed(1)}) <br /> × Bobot {weightValue}
                  %
                </td>
                <td className="py-1.5 px-3 border border-slate-300 text-center font-black text-blue-600 text-sm bg-blue-50/50">
                  {weightedValue.toFixed(1)}
                </td>
              </tr>
            </React.Fragment>
          );
        };

        return reportPreviewData ? (
          <div className="fixed inset-0 z-[2000] flex justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4 animate-fadeIn overflow-hidden print:absolute print:inset-auto print:left-0 print:top-0 print:w-full print:h-auto print:bg-white print:p-0 print:block print:overflow-visible">
            <div className="bg-white sm:shadow-2xl w-full max-w-[850px] flex flex-col h-full sm:max-h-[95vh] animate-scaleIn sm:rounded-xl overflow-hidden print:block print:max-w-none print:max-h-none print:shadow-none print:rounded-none print:h-auto my-auto print:my-0">
              <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50/50 print:hidden z-50 sticky top-0 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Icon name="file-text" size={16} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-800 tracking-tight text-sm">
                      Pratinjau Dokumen Report
                    </h3>
                    <p className="text-xs font-bold text-slate-400">
                      PDF Assessment Karyawan
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadPDF}
                    disabled={isDownloading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-[11px] font-black tracking-wider uppercase hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icon
                      name={isDownloading ? "refresh-cw" : "download"}
                      size={14}
                      className={isDownloading ? "animate-spin" : ""}
                    />
                    {isDownloading ? "Mengunduh..." : "Unduh PDF"}
                  </button>
                  <button
                    onClick={() => setReportPreviewData(null)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Icon name="x" size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-100 py-6 px-2 sm:p-8 flex flex-col items-center print:bg-white print:p-0 print:overflow-visible print:block hide-scrollbar">
                {/* PDF Document Styling container */}
                <div
                  id="pdf-report-content"
                  className="w-full flex justify-center flex-col gap-8 items-center font-sans tracking-normal print:block print:gap-0"
                >
                  {/* --- PERFORMA PREVIEW PAGE 1 --- */}
                  <div className="bg-white w-full max-w-[210mm] min-h-[297mm] shadow-[0_0_15px_rgba(0,0,0,0.1)] border border-slate-200 p-6 sm:p-12 text-slate-800 relative break-after-page print:m-0 print:border-none print:shadow-none print:w-[210mm]">
                  {/* Header Section */}
                  <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-slate-900">
                    <div className="flex items-center gap-3">
                      <img
                        src="/logo.svg"
                        alt="Hikemore Logo"
                        className="w-16 h-16 object-contain text-slate-900"
                        style={{ filter: "grayscale(100%) brightness(0%)" }}
                      />
                      <div className="font-sans">
                        <h1 className="text-2xl font-black tracking-tight text-slate-900 leading-none">
                          HIKEMORE
                        </h1>
                        <p className="text-[12px] font-bold tracking-widest text-slate-500 uppercase">
                          HR Workspace
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex justify-end">
                      <h2 className="text-3xl font-black tracking-widest text-slate-900 uppercase">
                        RAHASIA
                      </h2>
                    </div>
                  </div>

                  <div className="mb-8">
                    {/* Identitas Diri */}
                    <div className="w-full bg-slate-200 px-3 py-1.5 mb-2">
                      <h3 className="font-extrabold text-sm tracking-wide text-slate-800 uppercase">
                        Identitas Diri
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 px-2 text-sm">
                      <div className="grid grid-cols-[120px_1fr] border-b border-slate-300 py-1">
                        <span className="font-semibold text-slate-700">
                          Nama
                        </span>
                        <span className="font-medium text-slate-900">
                          : {reportPreviewData.name}
                        </span>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] border-b border-slate-300 py-1">
                        <span className="font-semibold text-slate-700">
                          Departemen
                        </span>
                        <span className="font-medium text-slate-900">
                          : {reportPreviewData.dept}
                        </span>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] border-b border-slate-300 py-1">
                        <span className="font-semibold text-slate-700">
                          Jabatan & Level
                        </span>
                        <span className="font-medium text-slate-900">
                          : {reportPreviewData.pos}{" "}
                          {reportPreviewData.levelJabatan
                            ? `(${reportPreviewData.levelJabatan})`
                            : ""}
                        </span>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] border-b border-slate-300 py-1">
                        <span className="font-semibold text-slate-700">
                          Periode Evaluasi
                        </span>
                        <span className="font-medium text-slate-900">
                          :{" "}
                          {reportPreviewData.periodeStart &&
                          reportPreviewData.periodeEnd
                            ? `${reportPreviewData.periodeStart} - ${reportPreviewData.periodeEnd}`
                            : "-"}
                        </span>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] border-b border-slate-300 py-1">
                        <span className="font-semibold text-slate-700">
                          Status Karyawan
                        </span>
                        <span className="font-medium text-slate-900">
                          : {reportPreviewData.status || "-"}
                        </span>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] border-b border-slate-300 py-1">
                        <span className="font-semibold text-slate-700">
                          Tanggal Cetak
                        </span>
                        <span className="font-medium text-slate-900">
                          :{" "}
                          {new Date().toLocaleDateString("id-ID", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Main Content Sections */}
                  <div className="space-y-6">
                    <table className="w-full text-sm border-collapse border-y-[2px] border-slate-400 mt-0 shadow-sm">
                      <thead>
                        <tr className="bg-slate-200">
                          <th className="py-2 px-3 border border-slate-300 text-center text-[10px] uppercase font-extrabold tracking-widest text-slate-700 w-12">
                            No
                          </th>
                          <th className="py-2 px-3 border border-slate-300 text-left text-[10px] uppercase font-extrabold tracking-widest text-slate-700">
                            Area Asesmen & Performa
                          </th>
                          <th className="py-2 px-3 border border-slate-300 text-center text-[10px] uppercase font-extrabold tracking-widest text-slate-700 w-28">
                            Kategori
                          </th>
                          <th className="py-2 px-3 border border-slate-300 text-center text-[10px] uppercase font-extrabold tracking-widest text-slate-700 w-32">
                            Kalkulasi
                            <div className="text-[8px] font-medium text-slate-500 normal-case tracking-normal mt-0.5 leading-tight">
                              (Skor × 25 Poin Base)
                            </div>
                          </th>
                          <th className="py-2 px-3 border border-slate-300 text-center text-[10px] uppercase font-extrabold tracking-widest text-slate-700 w-20">
                            Skor
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {
                            id: "grit",
                            label: "GRIT",
                            questions: [
                              "Kemauan belajar hal baru yang menjadi tuntutan pekerjaan",
                              "Kemauan extra effort dalam penyelesaian hambatan pekerjaan",
                              "Menunjukkan sikap give & take pada pekerjaan",
                              "Fokus pada penyelesaian tugas hingga tuntas",
                              "Ketahanan dan pantang menyerah dalam menghadapi tekanan",
                            ],
                          },
                          {
                            id: "growth",
                            label: "GROWTH",
                            questions: [
                              "Memiliki skill yang berkembang seiring waktu",
                              "Tidak mengulang kesalahan yang sama dalam pekerjaan",
                              "Keterbukaan terhadap saran & kritik dalam bekerja",
                              "Menunjukkan kesiapan saat diberikan tanggung jawab lebih",
                              "Kontribusi pada peningkatan sistem kerja",
                            ],
                          },
                          {
                            id: "prof",
                            label: "PROFESSIONALISM",
                            questions: [
                              "Tanggung jawab terhadap pekerjaan & komunikasi efektif",
                              "Bekerja dengan integritas dan etika",
                              "Kepatuhan pada prosedur dan aturan kerja",
                              "Kemampuan berkolaborasi dalam alur kerja tim",
                              "Kemampuan melakukan efisiensi dan produktifitas",
                            ],
                          },
                        ].map(renderCategoryRow)}
                      </tbody>
                    </table>

                  </div> {/* Mengakhiri div .space-y-6 pada Page 1 */}
                </div> {/* Mengakhiri div Page 1 */}

                {/* --- PERFORMA PREVIEW PAGE 2 --- */}
                <div className="bg-white w-full max-w-[210mm] min-h-[297mm] shadow-[0_0_15px_rgba(0,0,0,0.1)] border border-slate-200 p-6 sm:p-12 text-slate-800 relative break-after-page print:m-0 print:border-none print:shadow-none print:w-[210mm]">
                  <div className="space-y-6">
                    <table className="w-full text-sm border-collapse border-y-[2px] border-slate-400 mt-6 shadow-sm">
                      <thead>
                        <tr className="bg-slate-200">
                          <th className="py-2 px-3 border border-slate-300 text-center text-[10px] uppercase font-extrabold tracking-widest text-slate-700 w-12">
                            NO
                          </th>
                          <th className="py-2 px-3 border border-slate-300 text-left text-[10px] uppercase font-extrabold tracking-widest text-slate-700">
                            AREA ASESMEN (LANJUTAN)
                          </th>
                          <th className="py-2 px-3 border border-slate-300 text-center text-[10px] uppercase font-extrabold tracking-widest text-slate-700 w-28">
                            KATEGORI
                          </th>
                          <th className="py-2 px-3 border border-slate-300 text-center text-[10px] uppercase font-extrabold tracking-widest text-slate-700 w-32">
                            KALKULASI
                          </th>
                          <th className="py-2 px-3 border border-slate-300 text-center text-[10px] uppercase font-extrabold tracking-widest text-slate-700 w-20">
                            SKOR
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {
                            id: "sus",
                            label: "SUSTAINABLE",
                            questions: [
                              "Kemampuan adaptasi pada perubahan pola kerja",
                              "Memiliki loyalitas bertahan di perusahaan",
                              "Konsistensi dalam memberikan hasil kerja yang berkualitas",
                              "Memiliki komitmen untuk tumbuh bersama tujuan perusahaan",
                              "Kemampuan mempertahankan motivasi kerja dalam jangka panjang",
                            ],
                          },
                        ].map(renderCategoryRow)}

                        <tr className="bg-slate-50">
                          <td
                            colSpan={5}
                            className="py-1.5 px-3 border border-slate-300 text-xs font-bold text-rose-800 uppercase tracking-widest"
                          >
                            Pelanggaran Kedisiplinan (-)
                          </td>
                        </tr>
                        {[
                          {
                            label: "Datang Lambat/Pulang Cepat",
                            key: "telat",
                            mul: 1,
                          },
                          {
                            label: "Sakit/Ijin",
                            key: "ijin",
                            mul: 1,
                          },
                          {
                            label: "Mangkir/Alfa",
                            key: "mangkir",
                            mul: 3,
                          },
                          {
                            label: "Surat Peringatan",
                            key: "sp",
                            mul: 5,
                          },
                        ].map((item, idx) => {
                          const val =
                            reportPreviewData[
                              item.key as keyof typeof reportPreviewData
                            ] || 0;
                          const dec = val * item.mul;
                          return (
                            <tr
                              key={idx}
                              className={`${idx % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
                            >
                              <td className="py-1 px-3 border border-slate-300 text-center font-bold text-slate-500">
                                -
                              </td>
                              <td className="py-1 px-3 border border-slate-300 text-xs text-slate-700">
                                {item.label}
                              </td>
                              <td className="py-1 px-3 border border-slate-300 text-center text-[10px] font-bold text-slate-600 bg-slate-100/50">
                                Kasus: {val}
                              </td>
                              <td className="py-1 px-3 border border-slate-300 text-center text-[10px] font-medium text-slate-500">
                                {val > 0
                                  ? `${val} × (-${item.mul})`
                                  : `-${item.mul} / kali`}
                              </td>
                              <td
                                className={`py-1 px-3 border border-slate-300 text-center font-black bg-slate-100 ${dec > 0 ? "text-rose-600" : "text-slate-400"}`}
                              >
                                {dec > 0 ? `-${dec}` : "0"}
                              </td>
                            </tr>
                          );
                        })}

                        <tr className="bg-slate-50">
                          <td
                            colSpan={4}
                            className="py-1.5 px-3 border border-slate-300 text-right text-[10px] font-black uppercase tracking-wider text-slate-600"
                          >
                            Total Skor Kalkulasi
                          </td>
                          <td className="py-1.5 px-3 border border-slate-300 text-center font-black text-sm text-slate-900 bg-slate-50/50">
                            {reportPreviewData.nilaiAkhir}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Analisis Nilai Kontribusi */}
                    <div className="w-full mt-6 pt-6 border-t-2 border-slate-900 border-dashed break-inside-avoid print:border-none print:pt-0 print:mt-0">
                      <div className="bg-slate-50 border border-slate-300 rounded-xl p-5 shadow-sm">
                        <h3 className="font-extrabold text-sm tracking-wide text-slate-800 uppercase border-b border-slate-200 pb-3 mb-4 flex items-center gap-2">
                          <Icon
                            name="bar-chart-2"
                            size={16}
                            className="text-blue-600"
                          />
                          Analisis Evaluasi Kinerja (Executive Summary)
                        </h3>

                        <div className="space-y-4">
                          <p className="text-xs text-slate-600 leading-relaxed text-justify">
                            Nilai Kontribusi merupakan estimasi ekuivalensi
                            moneter dari output dan performa aktual yang
                            diberikan karyawan kepada perusahaan. Kalkulasi
                            efisiensi kinerja menggunakan rasio{" "}
                            <em>Value-to-Cost (VCR)</em> untuk mengkomparasi
                            nilai kontribusi tersebut dengan beban gaji aktual.
                          </p>

                          {/* Kalkulasi Box */}
                          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm text-xs text-slate-700">
                            <h4 className="font-bold text-slate-800 mb-3 uppercase tracking-wider text-[11px]">
                              Parameter Kalkulasi:
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 gap-y-3 font-mono text-[11px]">
                              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                <span className="text-slate-500">
                                  1. Gaji Aktual Karyawan
                                </span>
                                <span className="font-bold text-slate-800">
                                  Rp{" "}
                                  {(reportPreviewData.gaji || 0).toLocaleString(
                                    "id-ID",
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                <span className="text-slate-500">
                                  2. Skor Kinerja Akhir
                                </span>
                                <span className="font-bold text-blue-600">
                                  {reportPreviewData.nilaiAkhir} Point
                                </span>
                              </div>
                              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                <span className="text-slate-500">
                                  3. Multiplier Jabatan
                                </span>
                                <span className="font-bold text-slate-800">
                                  {getMultiplier(
                                    reportPreviewData.levelJabatan,
                                    reportPreviewData.customMultiplier,
                                  )}
                                  x ({reportPreviewData.levelJabatan})
                                </span>
                              </div>
                              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                <span className="text-slate-500">
                                  4. Nilai BEP Kinerja
                                </span>
                                <span className="font-medium bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                                  75 Point
                                </span>
                              </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col gap-3 font-mono">
                              {/* Rumus VCR */}
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-start gap-1.5 sm:gap-2">
                                <span className="text-slate-500 font-sans font-medium text-[11px] w-[95px] text-left">
                                  Ratio VCR:
                                </span>
                                <span className="font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded border border-blue-100 text-[11px]">
                                  (Skor {reportPreviewData.nilaiAkhir} ÷ 75) ×{" "}
                                  {getMultiplier(
                                    reportPreviewData.levelJabatan,
                                    reportPreviewData.customMultiplier,
                                  )}
                                </span>
                                <span className="font-sans font-bold text-slate-500 hidden sm:block">
                                  =
                                </span>
                                <span
                                  className={`font-black px-3 py-1.5 rounded border text-[12px] ${(reportPreviewData.nilaiKontribusi || 0) < (reportPreviewData.gaji || 0) ? "text-amber-600 bg-amber-50 border-amber-100" : "text-emerald-600 bg-emerald-50 border-emerald-100"}`}
                                >
                                  {(
                                    (reportPreviewData.nilaiAkhir / 75) *
                                    getMultiplier(
                                      reportPreviewData.levelJabatan,
                                      reportPreviewData.customMultiplier,
                                    )
                                  ).toFixed(2)}
                                  x Ratio
                                </span>
                              </div>

                              {/* Konversi Value */}
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-start gap-1.5 sm:gap-2">
                                <span className="text-slate-500 font-sans font-medium text-[11px] w-[95px] text-left">
                                  Nilai Kontribusi:
                                </span>
                                <span className="font-bold text-slate-700 bg-slate-50 px-3 py-1.5 rounded border border-slate-200 text-[11px]">
                                  VCR{" "}
                                  {(
                                    (reportPreviewData.nilaiAkhir / 75) *
                                    getMultiplier(
                                      reportPreviewData.levelJabatan,
                                      reportPreviewData.customMultiplier,
                                    )
                                  ).toFixed(2)}{" "}
                                  × Rp{" "}
                                  {(reportPreviewData.gaji || 0).toLocaleString(
                                    "id-ID",
                                  )}
                                </span>
                                <span className="font-sans font-bold text-slate-500 hidden sm:block">
                                  =
                                </span>
                                <span className="font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded border border-emerald-100 text-[13px]">
                                  Rp{" "}
                                  {Math.round(
                                    reportPreviewData.nilaiKontribusi || 0,
                                  ).toLocaleString("id-ID")}
                                </span>
                              </div>

                              {/* Penilaian Output */}
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-start gap-1.5 sm:gap-2">
                                <span className="text-slate-500 font-sans font-medium text-[11px] w-[95px] text-left">
                                  Penilaian Output:
                                </span>
                                <span className="font-bold text-slate-700 bg-slate-50 px-3 py-1.5 rounded border border-slate-200 text-[11px]">
                                  Rp{" "}
                                  {Math.round(
                                    reportPreviewData.nilaiKontribusi || 0,
                                  ).toLocaleString("id-ID")}{" "}
                                  - Rp{" "}
                                  {(reportPreviewData.gaji || 0).toLocaleString(
                                    "id-ID",
                                  )}
                                </span>
                                <span className="font-sans font-bold text-slate-500 hidden sm:block">
                                  =
                                </span>
                                {(() => {
                                  const diff =
                                    (reportPreviewData.nilaiKontribusi || 0) -
                                    (reportPreviewData.gaji || 0);
                                  const isMinus = diff < 0;
                                  const isZero = diff === 0;
                                  return (
                                    <span
                                      className={`font-black px-3 py-1.5 rounded border text-[13px] ${isMinus ? "text-rose-600 bg-rose-50 border-rose-100" : isZero ? "text-slate-600 bg-slate-50 border-slate-200" : "text-emerald-600 bg-emerald-50 border-emerald-100"}`}
                                    >
                                      {isMinus ? "-" : isZero ? "" : "+"}Rp{" "}
                                      {Math.abs(
                                        Math.round(diff),
                                      ).toLocaleString("id-ID")}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>

                          <p className="text-xs text-slate-600 leading-relaxed text-justify mt-4">
                            {(() => {
                              const diff =
                                (reportPreviewData.nilaiKontribusi || 0) -
                                (reportPreviewData.gaji || 0);
                              const isMinus = diff < 0;
                              const isZero = diff === 0;
                              const vcr = (
                                (reportPreviewData.nilaiKontribusi || 0) /
                                (reportPreviewData.gaji || 1)
                              ).toFixed(2);

                              const effText = isMinus
                                ? `defisit efisiensi kinerja sebesar - Rp ${Math.abs(Math.round(diff)).toLocaleString("id-ID")}`
                                : isZero
                                  ? `performa seimbang (break-even)`
                                  : `surplus efisiensi kinerja sebesar + Rp ${Math.abs(Math.round(diff)).toLocaleString("id-ID")}`;

                              return (
                                <>
                                  <strong>Kesimpulan:</strong> Berdasarkan
                                  metrik produktivitas aktual,{" "}
                                  <strong>{reportPreviewData.name}</strong>{" "}
                                  menghasilkan {effText}. Dengan Ratio VCR {vcr}
                                  x, performa karyawan terklasifikasi{" "}
                                  <strong>
                                    {reportPreviewData.classification}
                                  </strong>
                                  . Tindakan direkomendasikan:{" "}
                                  <strong>
                                    {reportPreviewData.rekomendasi}
                                  </strong>
                                  . Khusus untuk rekomendasi promosi/kenaikan gaji, keputusan akhir tetap disesuaikan dengan kondisi omset perusahaan.
                                </>
                              );
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer / Signature */}
                  <div className="mt-8 pt-4 break-inside-avoid">
                    <table className="w-full max-w-xl mx-auto border-collapse border border-slate-900 text-center">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-slate-900 py-2.5 text-xs sm:text-sm font-bold text-slate-800 w-1/3">
                            Kepala Divisi
                          </th>
                          <th className="border border-slate-900 py-2.5 text-xs sm:text-sm font-bold text-slate-800 w-1/3">
                            HRD
                          </th>
                          <th className="border border-slate-900 py-2.5 text-xs sm:text-sm font-bold text-slate-800 w-1/3">
                            Direktur
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-slate-900 h-24 sm:h-32"></td>
                          <td className="border border-slate-900 h-24 sm:h-32"></td>
                          <td className="border border-slate-900 h-24 sm:h-32"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  </div> {/* Mengakhiri div .space-y-6 pada Page 2 */}
                </div> {/* Mengakhiri div Page 2 */}
              </div> {/* Mengakhiri pdf-report-content */}
            </div> {/* Mengakhiri div flex-1 print:bg-white */}
          </div>
        ) : null;
      })()}

      {isGuideModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn overflow-y-auto">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden m-auto animate-scaleIn border border-slate-100">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Icon name="info" size={20} />
                </div>
                <div>
                  <h3 className="font-black text-xl text-slate-800">
                    Panduan Pengukuran Performa vs Cost Salary
                  </h3>
                  <p className="text-sm font-bold text-slate-500">
                    Memahami konsep dan metrik perhitungan Value Creation
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsGuideModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar flex flex-col gap-8">
              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6">
                <h4 className="text-blue-800 font-black text-lg mb-2">
                  Maksud dari Isi Performa Ini
                </h4>
                <p className="text-slate-700 leading-relaxed text-sm text-justify">
                  Berbeda dengan pengukuran performa tradisional yang hanya
                  fokus pada KPI target penyelesaian tugas harian, modul ini
                  dirancang untuk mengukur secara objektif{" "}
                  <strong>
                    besaran "Value" (nilai yang diciptakan) karyawan
                    dibandingkan dengan "Cost" (gaji yang dikeluarkan
                    perusahaan)
                  </strong>
                  . Ini adalah analisa tingkat investasi ROI (Return on
                  Investment) pada SDM perusahaan. Modul ini menjawab pertanyaan
                  krusial:{" "}
                  <em>
                    "Apakah perusahaan overpaying untuk hasil kerja saat ini?
                    Atau karyawan justru pantas mendapatkan apresiasi/promosi?"
                  </em>
                </p>
              </div>

              <div className="flex flex-col gap-6">
                <div className="border border-slate-200 rounded-2xl p-6 hover:border-blue-200 transition-colors shadow-sm bg-white">
                  <div className="flex items-center gap-3 mb-4 text-slate-800">
                    <div className="p-2 bg-slate-100 rounded-lg text-blue-600">
                      <Icon name="target" size={18} />
                    </div>
                    <h4 className="font-bold text-base">
                      1. Target Gaji Baseline
                    </h4>
                  </div>
                  <p className="text-slate-600 text-[13px] leading-relaxed mb-3">
                    Angka ini merupakan{" "}
                    <strong>nilai jangkar (anchor) utama</strong> dalam sistem
                    pengukuran nilai karyawan. Anchor ini mendefinisikan batas
                    ekspektasi paling dasar (garis start) dari perusahaan
                    terhadap kontribusi seorang karyawan tingkat pemula.
                  </p>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mt-3">
                    <h5 className="text-[12px] font-bold text-slate-700 mb-1">
                      Cara Menentukannya:
                    </h5>
                    <ul className="list-disc pl-4 text-[12px] text-slate-600 space-y-1">
                      <li>
                        Umumnya, nilai ini diisi dengan{" "}
                        <strong>UMR daerah setempat</strong> atau standar Gaji
                        Pokok untuk posisi Staff (Level 1) paling junior di
                        perusahaan Anda.
                      </li>
                      <li>
                        Jika UMR adalah Rp 4.000.000, maka Baseline adalah Rp
                        4.000.000.
                      </li>
                    </ul>
                  </div>
                  <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 mt-3">
                    <p className="text-[12px] text-slate-600">
                      <span className="font-bold text-blue-700">
                        Kenapa ini penting?
                      </span>
                      <br />
                      Karena angka Baseline ini akan dijadikan standar acuan
                      dasar (dengan multiplier absolut <code>1.0x</code>) untuk
                      membandingkan ekspektasi kinerja karyawan di level jabatan
                      yang lebih tinggi.
                    </p>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-2xl p-6 hover:border-blue-200 transition-colors shadow-sm bg-white">
                  <div className="flex items-center gap-3 mb-4 text-slate-800">
                    <div className="p-2 bg-slate-100 rounded-lg text-purple-600">
                      <Icon name="bar-chart-2" size={18} />
                    </div>
                    <h4 className="font-bold text-base">
                      2. Value to Cost Ratio (VCR)
                    </h4>
                  </div>
                  <p className="text-slate-600 text-[13px] leading-relaxed mb-3">
                    Pada akhirnya, modul ini akan menghitung rasio{" "}
                    <strong>Value to Cost (Efisiensi)</strong>. VCR adalah rasio
                    perbandingan antara Nilai Rupiah Kinerja (Value) yang
                    dihasilkan oleh Karyawan dengan nominal Gaji (Cost) yang
                    dibayarkan oleh Perusahaan.
                  </p>
                  <p className="text-slate-600 text-[13px] leading-relaxed mb-3">
                    Tujuan akhirnya adalah mengetahui{" "}
                    <strong>apakah perusahaan untung atau rugi</strong>{" "}
                    membayarkan gaji sebesar angka tersebut dibanding performa
                    aktual karyawan.
                  </p>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2 mt-3">
                    <div className="bg-blue-50/50 border border-blue-100 px-3 py-2 rounded-lg font-mono text-xs text-blue-900 border-dashed text-center">
                      V.C.R = Nilai Penciptaan (Rupiah) ÷ Beban Gaji Karyawan
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-2xl p-6 hover:border-blue-200 transition-colors shadow-sm bg-white">
                  <div className="flex items-center gap-3 mb-4 text-slate-800">
                    <div className="p-2 bg-slate-100 rounded-lg text-emerald-600">
                      <Icon name="award" size={18} />
                    </div>
                    <h4 className="font-bold text-base">
                      3. Level Jabatan (Multiplier)
                    </h4>
                  </div>
                  <p className="text-slate-600 text-[13px] leading-relaxed mb-3">
                    Multiplier adalah <strong>faktor pengali ekspektasi</strong>
                    . Pada dunia profesional, tingkat jabatan yang tinggi
                    dituntut memberikan dampak ganda (multiplier effect) pada
                    perusahaan, bukan sekadar bekerja lebih keras.
                  </p>
                  <p className="text-slate-600 text-[13px] leading-relaxed mb-3">
                    Contoh: Meskipun sama-sama mendapatkan skor performa '100',
                    ekspektasi nilai Rupiah ("Value Creation") dari Manajer
                    bergaji Rp 15 Juta harus jauh lebih besar secara
                    proporsional dibandingkan Staff bergaji Rp 4 Juta.
                  </p>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2 mt-3">
                    <h5 className="text-[12px] font-bold text-slate-700">
                      Contoh Hitungan Logis Multiplier:
                    </h5>
                    <div className="text-[12px] text-slate-600 flex justify-between items-center border-b border-slate-200 pb-1">
                      <span>
                        <strong>Staff (Level 1)</strong>
                      </span>
                      <span>
                        Gaji 4 Juta = <strong>1.0x</strong> Baseline
                      </span>
                    </div>
                    <div className="text-[12px] text-slate-600 flex justify-between items-center border-b border-slate-200 pb-1">
                      <span>
                        <strong>Supervisor (Level 2)</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        Gaji 6 Juta = <strong>1.5x</strong>
                        <span className="flex items-center text-[10px] text-slate-500">
                          (
                          <span className="inline-flex flex-col items-center justify-center align-middle mx-0.5 leading-none">
                            <span className="border-b border-slate-400 pb-[1px] px-0.5">
                              6jt
                            </span>
                            <span className="pt-[1px] px-0.5">4jt</span>
                          </span>
                          )
                        </span>
                      </span>
                    </div>
                    <div className="text-[12px] text-slate-600 flex justify-between items-center border-b border-slate-200 pb-1">
                      <span>
                        <strong>Manager (Level 4)</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        Gaji 10 Juta = <strong>2.5x</strong>
                        <span className="flex items-center text-[10px] text-slate-500">
                          (
                          <span className="inline-flex flex-col items-center justify-center align-middle mx-0.5 leading-none">
                            <span className="border-b border-slate-400 pb-[1px] px-0.5">
                              10jt
                            </span>
                            <span className="pt-[1px] px-0.5">4jt</span>
                          </span>
                          )
                        </span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 italic mt-1 leading-snug">
                      Angka pengali (misal: 1.5x, 2.5x) idealnya dihitung
                      berdasarkan rasio rata-rata gaji di level jabatan tersebut
                      dibagi dengan angka Target Baseline. Hal ini memastikan
                      target kontribusi sebanding dengan beban gaji per level
                      profesi.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-slate-800 font-black text-lg mb-4 flex items-center gap-2">
                  <Icon name="book-open" size={20} className="text-blue-500" />
                  Formula & Rumus Perhitungan
                </h4>

                <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl flex flex-col gap-6">
                  <div className="flex flex-col gap-2 relative">
                    <h5 className="font-bold text-[13px] text-slate-700 tracking-wide">
                      A. VALUE PER POINT (Harga per 1 Poin Skor)
                    </h5>
                    <div className="bg-white px-4 py-3 border border-slate-200 rounded-xl font-mono text-sm shadow-sm text-slate-800 flex items-center justify-between">
                      <span>
                        Value Per Point (VPC){" "}
                        <span className="text-slate-400 font-sans mx-2">=</span>{" "}
                        Baseline Salary{" "}
                        <span className="text-slate-400 font-sans mx-1">÷</span>{" "}
                        75
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-500">
                      Nilai skor <strong className="text-slate-700">75</strong>{" "}
                      dianggap sebagai standar batas bawah ('Memenuhi Ekspektasi
                      Dasar'). Rumus ini menetapkan berapa rupiah harga moneter
                      dari 1 poin performa.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <h5 className="font-bold text-[13px] text-slate-700 tracking-wide">
                      B. BASE KONTRIBUSI (Nilai Moneter Kontribusi)
                    </h5>
                    <div className="bg-white px-4 py-3 border border-slate-200 rounded-xl font-mono text-sm shadow-sm text-slate-800 flex items-center justify-between">
                      <span>
                        Nilai Kontribusi{" "}
                        <span className="text-slate-400 font-sans mx-2">=</span>{" "}
                        Skor Performa Akhir{" "}
                        <span className="text-slate-400 font-sans mx-1">×</span>{" "}
                        VPC{" "}
                        <span className="text-slate-400 font-sans mx-1">×</span>{" "}
                        Multiplier
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-500">
                      Konversi dari persentase skor performa (0-100) menjadi
                      nominal Rupiah nilai kontribusi (value) riil karyawan
                      kepada perusahaan.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <h5 className="font-bold text-[13px] text-slate-700 tracking-wide">
                      C. VALUE TO COST RATIO (Indikator Efisiensi)
                    </h5>
                    <div className="bg-blue-50 border border-blue-200 px-4 py-3 rounded-xl font-mono text-sm shadow-sm text-blue-900 flex items-center justify-between ring-2 ring-blue-100/50">
                      <span>
                        V.C.R. Ratio{" "}
                        <span className="text-slate-400/80 font-sans mx-2">
                          =
                        </span>{" "}
                        Nilai Kontribusi{" "}
                        <span className="text-slate-400/80 font-sans mx-1">
                          ÷
                        </span>{" "}
                        Estimasi Gaji Karyawan
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-500">
                      Goal utamanya adalah menemukan nilai komparasi ideal ratio
                      ini. Metric absolut dan obyektif yang menjadi acuan
                      keputusan promosi, peringatan, atau adjustment.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-slate-800 font-black text-lg mb-4">
                  Penjelasan Indikator VCR
                </h4>
                <div className="flex flex-col gap-3">
                  <div className="border border-rose-200 bg-rose-50/50 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:w-1/3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-200"></span>
                        <span className="font-bold text-rose-800 text-sm">
                          Sangat Kurang
                        </span>
                      </div>
                      <div className="text-[11px] font-black tracking-widest text-rose-500">
                        VCR &lt; 0.80x (&lt; 80%)
                      </div>
                    </div>
                    <div className="flex flex-col flex-1">
                      <p className="text-[12px] text-slate-700 font-bold mb-0.5">
                        Overpaid / Rugi.
                      </p>
                      <p className="text-[11.5px] text-slate-600 leading-relaxed">
                        Nilai kontribusi jauh lebih rendah daripada gaji yang
                        dibayarkan. Perusahaan menanggung kerugian efisiensi
                        (overpaying).
                      </p>
                    </div>
                    <div className="sm:w-1/4 sm:text-right">
                      <span className="inline-block bg-rose-100 text-rose-700 text-[10px] font-bold px-2.5 py-1.5 rounded-md text-center">
                        Layak SP / Diberhentikan
                      </span>
                    </div>
                  </div>

                  <div className="border border-orange-200 bg-orange-50/50 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:w-1/3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-sm shadow-orange-200"></span>
                        <span className="font-bold text-orange-800 text-sm">
                          Kurang
                        </span>
                      </div>
                      <div className="text-[11px] font-black tracking-widest text-orange-500">
                        VCR 0.80x - 0.94x
                      </div>
                    </div>
                    <div className="flex flex-col flex-1">
                      <p className="text-[12px] text-slate-700 font-bold mb-0.5">
                        Underperforming.
                      </p>
                      <p className="text-[11.5px] text-slate-600 leading-relaxed">
                        Kinerja masih di bawah rata-rata. Kontribusi belum
                        sepenuhnya menutupi ekspektasi biaya gaji bulanan.
                      </p>
                    </div>
                    <div className="sm:w-1/4 sm:text-right">
                      <span className="inline-block bg-orange-100 text-orange-700 text-[10px] font-bold px-2.5 py-1.5 rounded-md text-center">
                        Perlu Pembinaan Intensif
                      </span>
                    </div>
                  </div>

                  <div className="border border-slate-200 bg-slate-50/80 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:w-1/3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-500 shadow-sm shadow-slate-200"></span>
                        <span className="font-bold text-slate-800 text-sm">
                          Standar
                        </span>
                      </div>
                      <div className="text-[11px] font-black tracking-widest text-slate-500">
                        VCR 0.95x - 1.09x
                      </div>
                    </div>
                    <div className="flex flex-col flex-1">
                      <p className="text-[12px] text-slate-700 font-bold mb-0.5">
                        Sesuai Gaji.
                      </p>
                      <p className="text-[11.5px] text-slate-600 leading-relaxed">
                        Pencapaian kurang lebih seimbang dengan kapasitas gaji
                        dan wewenangnya (BEP). Menjalankan ekspektasi yang
                        ditetapkan.
                      </p>
                    </div>
                    <div className="sm:w-1/4 sm:text-right">
                      <span className="inline-block bg-slate-200 text-slate-700 text-[10px] font-bold px-2.5 py-1.5 rounded-md text-center">
                        Performa Aman / Stay
                      </span>
                    </div>
                  </div>

                  <div className="border border-blue-200 bg-blue-50/50 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:w-1/3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-200"></span>
                        <span className="font-bold text-blue-800 text-sm">
                          Bagus
                        </span>
                      </div>
                      <div className="text-[11px] font-black tracking-widest text-blue-500">
                        VCR 1.10x - 1.29x
                      </div>
                    </div>
                    <div className="flex flex-col flex-1">
                      <p className="text-[12px] text-slate-700 font-bold mb-0.5">
                        Di Atas Ekspektasi.
                      </p>
                      <p className="text-[11.5px] text-slate-600 leading-relaxed">
                        Menghasilkan nilai (kontribusi) yang melebihi standar
                        nilai gaji yang diterima. Mulai menguntungkan perusahaan
                        secara nyata.
                      </p>
                    </div>
                    <div className="sm:w-1/4 sm:text-right">
                      <span className="inline-block bg-blue-100 text-blue-700 text-[10px] font-bold px-2.5 py-1.5 rounded-md text-center">
                        Layak Dipertahankan
                      </span>
                    </div>
                  </div>

                  <div className="border border-emerald-200 bg-emerald-50/50 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:w-1/3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></span>
                        <span className="font-bold text-emerald-800 text-sm">
                          Sangat Bagus
                        </span>
                      </div>
                      <div className="text-[11px] font-black tracking-widest text-emerald-500">
                        VCR &ge; 1.30x (&ge; 130%)
                      </div>
                    </div>
                    <div className="flex flex-col flex-1">
                      <p className="text-[12px] text-slate-700 font-bold mb-0.5">
                        Sangat Menguntungkan.
                      </p>
                      <p className="text-[11.5px] text-slate-600 leading-relaxed">
                        Nilai kontribusi jauh melebihi kompensasi gajinya. Aset
                        kunci perusahaan yang kinerjanya luar biasa baik.
                      </p>
                    </div>
                    <div className="sm:w-1/4 sm:text-right">
                      <span className="inline-block bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2.5 py-1.5 rounded-md text-center shadow-sm">
                        Layak Promosi / Naik Gaji
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-8 mt-4">
                <h4 className="text-slate-800 font-black text-xl mb-6 flex items-center gap-2">
                  <Icon
                    name="help-circle"
                    size={24}
                    className="text-blue-500"
                  />
                  Frequently Asked Questions (FAQ)
                </h4>
                <div className="space-y-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h5 className="font-bold text-slate-800 text-[14px] mb-2 flex items-start gap-2">
                      <span className="text-blue-500 font-black shrink-0">
                        1.
                      </span>{" "}
                      Bagaimana jika Skor Performa 100, tapi Nilai Rupiahnya
                      lebih kecil dari Gaji Karyawan?
                    </h5>
                    <p className="text-[13px] text-slate-600 leading-relaxed pl-6">
                      <span className="text-emerald-600 font-black mr-1 shrink-0">
                        A:
                      </span>{" "}
                      Ini berarti{" "}
                      <strong>target kerjanya terlalu gampang</strong>. Karyawan
                      berhasil mengerjakan semua tugasnya (skor 100), tapi hasil
                      kerja tersebut harganya masih di bawah nilai gaji yang
                      dibayarkan perusahaan. Solusinya: Naikkan target tugas
                      atau tanggung jawabnya di bulan depan agar seimbang dengan
                      gajinya.
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h5 className="font-bold text-slate-800 text-[14px] mb-2 flex items-start gap-2">
                      <span className="text-blue-500 font-black shrink-0">
                        2.
                      </span>{" "}
                      Apa artinya jika VCR (Ratio) lebih dari 100%?
                    </h5>
                    <p className="text-[13px] text-slate-600 leading-relaxed pl-6">
                      <span className="text-emerald-600 font-black mr-1 shrink-0">
                        A:
                      </span>{" "}
                      Artinya Karyawan sangat{" "}
                      <strong>menguntungkan (High Performer)</strong>. Nilai
                      kontribusi yang dia hasilkan jauh lebih besar daripada
                      gaji yang dia minta. Jika rasio sangat tinggi (misal di
                      atas 130%), ini adalah lampu hijau bagi manajemen untuk
                      menaikkan gaji atau memberi bonus agar karyawan bintang
                      ini tidak pindah (resign).
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h5 className="font-bold text-slate-800 text-[14px] mb-2 flex items-start gap-2">
                      <span className="text-blue-500 font-black shrink-0">
                        3.
                      </span>{" "}
                      Kenapa kita perlu hitung ke Rupiah? Bukankah skor 1-100
                      saja sudah cukup?
                    </h5>
                    <p className="text-[13px] text-slate-600 leading-relaxed pl-6">
                      <span className="text-emerald-600 font-black mr-1 shrink-0">
                        A:
                      </span>{" "}
                      Skor biasa seringkali subjektif dan membingungkan (contoh:
                      "Apakah skor 80 berhak naik gaji?"). Dengan mengubah skor
                      jadi Rupiah, Manajemen dan tim Keuangan bisa membuat{" "}
                      <strong>keputusan pakai data bisnis nyata</strong>. Sangat
                      mudah menentukan Kenaikan Gaji jika terbukti perusahaan
                      untung puluhan juta dari karyawan tersebut.
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h5 className="font-bold text-slate-800 text-[14px] mb-2 flex items-start gap-2">
                      <span className="text-blue-500 font-black shrink-0">
                        4.
                      </span>{" "}
                      Dari mana saya harus mencari angka Target Gaji Baseline?
                    </h5>
                    <p className="text-[13px] text-slate-600 leading-relaxed pl-6">
                      <span className="text-emerald-600 font-black mr-1 shrink-0">
                        A:
                      </span>{" "}
                      Cara termudah: gunakan{" "}
                      <strong>Gaji UMR wilayah Anda</strong> atau Gaji Pokok
                      untuk posisi <strong>Staff Junior Level 1</strong> yang
                      baru masuk. Angka Baseline ini ibarat "Titik Start / KM
                      Nol" (Multiplier 1.0x) ekspektasi uang yang dikeluarkan
                      perusahaan.
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h5 className="font-bold text-slate-800 text-[14px] mb-2 flex items-start gap-2">
                      <span className="text-blue-500 font-black shrink-0">
                        5.
                      </span>{" "}
                      Mengapa Karyawan Level Manager butuh Multiplier yang
                      tinggi?
                    </h5>
                    <p className="text-[13px] text-slate-600 leading-relaxed pl-6">
                      <span className="text-emerald-600 font-black mr-1 shrink-0">
                        A:
                      </span>{" "}
                      Karena Manager digaji lebih mahal. Jika gaji Manager 3x
                      lebih besar dari Staff Junior, maka Manager{" "}
                      <strong>
                        wajib memberi hasil (Value) 3x lebih besar juga
                      </strong>
                      , minimalnya. Multiplier memastikan penilaian tetap
                      adil—tidak peduli tinggi jabatannya—target keuntungan
                      sebanding dengan beban gaji bulanannya.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setIsGuideModalOpen(false)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-[0_4px_12px_rgba(37,99,235,0.2)] transition-all active:scale-95"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Data Confirmation Modal */}
      {dataToClear &&
        (() => {
          const empToClear = employees.find((e) => e.id === dataToClear);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                onClick={() => setDataToClear(null)}
              ></div>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md relative animate-scaleIn overflow-hidden">
                <div className="p-6">
                  <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mb-6 mx-auto">
                    <Icon name="alert-triangle" size={32} />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 text-center mb-2 px-4">
                    Clear Data Penilaian?
                  </h3>
                  <p className="text-slate-500 text-center text-sm leading-relaxed mb-8 px-6">
                    Apakah Anda yakin ingin menghapus seluruh data penilaian,
                    skor core value, dan poin pelanggaran untuk{" "}
                    <strong className="text-slate-700">
                      {empToClear?.name}
                    </strong>
                    ? Data ini akan kembali menjadi "Belum Dinilai".
                  </p>

                  <div className="flex gap-4">
                    <button
                      onClick={() => setDataToClear(null)}
                      className="flex-1 px-4 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      onClick={() => {
                        setPerformaDataMap((prev: Record<string, any>) => {
                          const newData = { ...prev };
                          delete newData[dataToClear];
                          return newData;
                        });
                        const empName =
                          employees.find((e) => e.id === dataToClear)?.name ||
                          dataToClear;
                        logActivity("Hapus Data Penilaian", {
                          karyawan: empName,
                        });
                        setDataToClear(null);
                      }}
                      className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-[0_4px_12px_rgba(220,38,38,0.2)]"
                    >
                      Ya, Hapus
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
};
