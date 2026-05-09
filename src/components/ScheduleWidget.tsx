import React, { useState, useMemo } from 'react';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import { Schedule, Candidate, Employee, JobListing } from '../types';

interface ScheduleWidgetProps {
  schedules: Schedule[];
  setSchedules: React.Dispatch<React.SetStateAction<Schedule[]>>;
  candidates?: Candidate[];
  employees?: Employee[];
  jobListings?: JobListing[];
}

type FilterTab = 'All' | 'Scheduled' | 'Completed' | 'Overdue';

export const ScheduleWidget = ({ schedules, setSchedules, candidates = [], employees = [], jobListings = [] }: ScheduleWidgetProps) => {
  const [filter, setFilter] = useState<FilterTab>('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<Schedule>>({
    title: '',
    type: 'Meeting',
    customType: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '09:00',
    method: '',
    location: '',
    link: '',
    interviewer: '',
    description: '',
    participants: [],
  });

  const getStatus = (s: Schedule) => {
    if (s.attendance === 'Hadir' || s.attendance === 'Tidak Hadir' || s.attendance === 'Selesai') return 'Completed';
    
    const todayStr = new Date().toISOString().split('T')[0];
    
    if (s.date < todayStr) {
      return 'Overdue';
    }
    
    return 'Scheduled';
  };

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      const status = getStatus(s);
      if (filter === 'All') return true;
      return status === filter;
    });
  }, [schedules, filter]);

  const stats = useMemo(() => {
    return {
      All: schedules.length,
      Scheduled: schedules.filter(s => getStatus(s) === 'Scheduled').length,
      Completed: schedules.filter(s => getStatus(s) === 'Completed').length,
      Overdue: schedules.filter(s => getStatus(s) === 'Overdue').length,
    }
  }, [schedules]);

  const groupedSchedules = useMemo(() => {
    const groups: Record<string, Schedule[]> = {};
    const sorted = [...filteredSchedules].sort((a, b) => {
      const timeA = new Date(`${a.date}T${a.startTime}`).getTime();
      const timeB = new Date(`${b.date}T${b.startTime}`).getTime();
      return timeA - timeB;
    });

    sorted.forEach((s) => {
      if (!groups[s.date]) groups[s.date] = [];
      groups[s.date].push(s);
    });

    return groups;
  }, [filteredSchedules]);

  const openAddModal = () => {
    setEditingScheduleId(null);
    setFormData({
      title: '',
      type: 'Meeting',
      customType: '',
      date: new Date().toISOString().split('T')[0],
      startTime: '08:00',
      endTime: '09:00',
      method: '',
      location: '',
      link: '',
      interviewer: '',
      description: '',
      participants: [],
      candidateName: '',
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (schedule: Schedule) => {
    setEditingScheduleId(schedule.id);
    setFormData(schedule);
    setIsAddModalOpen(true);
  };

  const handleSaveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingScheduleId !== null) {
      setSchedules(prev => prev.map(s => s.id === editingScheduleId ? { ...formData as Schedule, id: editingScheduleId } : s));
    } else {
      const newSchedule: Schedule = {
        ...formData as Schedule,
        id: Date.now(),
      };
      setSchedules(prev => [...prev, newSchedule]);
    }
    setIsAddModalOpen(false);
    setFormData({
      title: '',
      type: 'Meeting',
      customType: '',
      date: new Date().toISOString().split('T')[0],
      startTime: '08:00',
      endTime: '09:00',
      method: '',
      location: '',
      link: '',
      interviewer: '',
      description: '',
      participants: [],
    });
  };

  const handleDelete = (id: number) => {
    const isConfirmed = window.confirm('Apakah Anda yakin ingin menghapus jadwal ini?');
    if (isConfirmed) {
      setSchedules(prev => prev.filter(s => s.id !== id));
    }
  };

  const formatTime24 = (time: string) => {
    const [h, m] = time.split(':');
    return `${h.padStart(2, '0')}.${m.padStart(2, '0')}`;
  };

  const getBorderColor = (s: Schedule, status: string) => {
    if (status === 'Overdue') return 'border-l-rose-500';
    if (status === 'Completed') return 'border-l-emerald-500';
    
    const colors = [
      'border-l-indigo-500',
      'border-l-blue-500',
      'border-l-emerald-500',
      'border-l-amber-500',
      'border-l-rose-500',
      'border-l-purple-500',
      'border-l-pink-500',
      'border-l-cyan-500',
      'border-l-orange-500',
      'border-l-teal-500'
    ];

    // Try to base color on Job ID if it's a candidate interview
    if (s.candidateId) {
      const candidate = candidates.find(c => c.id === s.candidateId);
      if (candidate) {
        return colors[candidate.jobId % colors.length];
      }
    }
    
    // Otherwise base it on the schedule title
    let hash = 0;
    const key = (s.title || '') + (s.type || '');
    for (let i = 0; i < key.length; i++) {
       hash = key.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const tabs: FilterTab[] = ['All', 'Scheduled', 'Completed', 'Overdue'];

  return (
    <div className="w-full flex flex-col pt-4">
      {/* Header and Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                filter === tab 
                  ? 'bg-white text-slate-800 shadow-sm border border-slate-200' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                filter === tab 
                  ? (tab === 'Overdue' ? 'bg-rose-500 text-white' : tab === 'Scheduled' ? 'bg-indigo-500 text-white' : tab === 'Completed' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white')
                  : 'bg-slate-200 text-slate-500'
              }`}>
                {stats[tab]}
              </span>
            </button>
          ))}
        </div>
        <button 
          onClick={openAddModal}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#314BF5] text-white text-sm font-bold hover:bg-blue-600 transition-all rounded-xl shadow-sm hover:shadow"
        >
          <Icon name={"plus" as any} size={16} /> Add Schedule
        </button>
      </div>

      {/* Timeline List */}
      <div className="flex flex-col max-h-[600px] overflow-y-auto hover-scrollbar pr-4 pb-12">
        {Object.keys(groupedSchedules).sort().map((dateStr, index) => {
          const dateObj = new Date(dateStr);
          const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'short' });
          const dayDate = dateObj.getDate();
          const items = groupedSchedules[dateStr];

          return (
            <div key={dateStr} className="flex gap-6 relative group z-0">
              {/* Date left block */}
              <div className="w-[60px] shrink-0 flex flex-col items-center pt-2 relative z-10">
                <div className="bg-slate-200/50 backdrop-blur-sm shadow-[inset_0_1px_rgba(255,255,255,0.8)] border border-slate-300 w-full aspect-square rounded-2xl flex flex-col justify-center items-center">
                  <span className="text-[11px] font-black uppercase text-slate-600 mb-[-2px]">{dayName}</span>
                  <span className="text-xl font-black text-slate-900 leading-none">{dayDate}</span>
                </div>
                {/* Connecting thin line between dates */}
                {index !== Object.keys(groupedSchedules).length - 1 && (
                  <div className="w-px bg-slate-200 flex-1 my-2 min-h-[50px] group-last:hidden"></div>
                )}
              </div>

              {/* Cards block for that day */}
              <div className="flex-1 space-y-3 pb-8">
                {items.map(s => {
                  const status = getStatus(s);
                  const displayType = s.type === 'Lainnya' ? (s.customType || 'Lainnya') : s.type;

                  return (
                    <div 
                      key={s.id} 
                      className={`relative bg-white border border-slate-200 rounded-2xl p-5 flex flex-col xl:flex-row justify-between xl:items-center gap-4 transition-all hover:border-slate-300 shadow-sm ${getBorderColor(s, status)} border-l-4`}
                    >
                      <div className="absolute top-3 right-3 flex flex-col gap-0.5 items-center">
                        <button 
                          onClick={() => setDeleteConfirmId(s.id)}
                          className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors"
                          title="Hapus Jadwal"
                        >
                          <Icon name="x" size={16} />
                        </button>
                        <button 
                          onClick={() => openEditModal(s)}
                          className="text-slate-300 hover:text-blue-500 hover:bg-blue-50 p-1.5 rounded-lg transition-colors"
                          title="Edit Jadwal"
                        >
                          <Icon name="edit" size={14} />
                        </button>
                      </div>

                      <div className="flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                          <h4 className="text-[17px] font-black text-slate-900 tracking-tight">
                            {formatTime24(s.startTime)} - {formatTime24(s.endTime)}
                          </h4>
                          <div className="flex gap-2 items-center">
                            {status === 'Scheduled' && <span className="bg-indigo-100 border border-indigo-200/60 text-indigo-700 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Scheduled</span>}
                            {status === 'Completed' && <span className="bg-emerald-100 border border-emerald-200/60 text-emerald-700 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Completed</span>}
                            {status === 'Overdue' && <span className="bg-rose-100 border border-rose-200/60 text-rose-700 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Overdue</span>}
                            
                            <span className="bg-blue-50 border border-blue-100/60 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-lg flex items-center gap-1.5 capitalize">{displayType}</span>
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-1 mt-3">
                          <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full bg-slate-900 border-2 border-white flex items-center justify-center text-[9px] font-black text-white shrink-0">HR</div>
                            <p className="text-[13px] font-bold text-slate-600">PIC: <strong className="text-slate-900">{employees?.find(e => e.id === s.interviewer)?.name || s.interviewer || 'N/A'}</strong></p>
                          </div>
                          
                          {s.candidateName && <span className="text-[11px] font-bold text-slate-500 truncate max-w-full pl-8">{s.title}</span>}
                        </div>
                        {s.type === 'Interview Online' && s.link && (
                          <div className="mt-3 flex items-center gap-2">
                             <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0"><Icon name="video" size={12} /></div>
                             <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-[12px] font-bold text-blue-600 hover:text-blue-800 hover:underline truncate max-w-[200px] xl:max-w-xs">{s.link}</a>
                          </div>
                        )}
                        {s.description && (
                          <div className="mt-3 bg-slate-50 border border-slate-100 p-3 rounded-xl">
                            <p className="text-[12px] font-medium text-slate-600 leading-relaxed italic">{s.description}</p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center xl:w-[40%] xl:justify-end pr-6 mt-4 xl:mt-0">
                         {s.candidateName ? (
                           <div className="flex gap-4 items-center">
                             <div className="w-10 h-10 bg-slate-200 rounded-full overflow-hidden shrink-0 shadow-sm border border-slate-100"><img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(s.candidateName)}&background=f8f9fa&color=0f172a&bold=true`} alt={s.candidateName} className="w-full h-full object-cover" /></div>
                             <div className="flex flex-col justify-center xl:items-end xl:text-right">
                               <p className="text-[13px] font-extrabold text-slate-900 leading-tight">{s.candidateName}</p>
                               {s.type !== 'Interview Online' && s.location && (
                                  <div className="flex items-start xl:justify-end gap-1.5 mt-2 text-slate-500">
                                    <Icon name="map-pin" size={12} className="mt-[1px] shrink-0 text-slate-400" />
                                    <span className="text-[11px] font-bold leading-snug">{s.location}</span>
                                  </div>
                               )}
                                 <div className="flex gap-2 mt-3 xl:justify-end w-full">
                                   {s.attendance === 'Hadir' || s.attendance === 'Selesai' ? (
                                     <button onClick={() => setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: null } : sch))} className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded-md flex items-center gap-1 hover:bg-emerald-200 transition-colors" title="Batal">
                                       <Icon name="check-circle" size={12} /> {s.type === 'Task' ? 'Selesai' : 'Hadir'}
                                     </button>
                                   ) : s.attendance === 'Tidak Hadir' ? (
                                     <button onClick={() => setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: null } : sch))} className="text-[10px] bg-rose-100 text-rose-700 font-bold px-2 py-1 rounded-md flex items-center gap-1 hover:bg-rose-200 transition-colors" title="Batal">
                                       <Icon name="x-circle" size={12} /> Tidak Hadir
                                     </button>
                                   ) : (
                                     <>
                                       <button onClick={() => setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: s.type === 'Task' ? 'Selesai' : 'Hadir' } : sch))} className="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold px-2 py-1 rounded-md flex items-center gap-1 transition-colors border border-emerald-200" title={s.type === 'Task' ? 'Tandai Selesai' : 'Tandai Hadir'}>
                                         <Icon name="check" size={12} /> {s.type === 'Task' ? 'Selesai' : 'Hadir'}
                                       </button>
                                       {s.type !== 'Task' && (
                                         <button onClick={() => setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, attendance: 'Tidak Hadir' } : sch))} className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-2 py-1 rounded-md flex items-center gap-1 transition-colors border border-rose-200" title="Tandai Tidak Hadir">
                                           <Icon name="x" size={12} /> Tidak Hadir
                                         </button>
                                       )}
                                     </>
                                   )}
                                 </div>
                             </div>
                           </div>
                         ) : (
                           <div className="flex flex-col w-full xl:items-end xl:text-right">
                             <p className="text-sm font-extrabold text-slate-800 mb-0.5">{s.title}</p>
                             {s.type !== 'Interview Online' && s.location && (
                                <div className="flex items-start xl:justify-end gap-1.5 mt-1 text-slate-500">
                                  <Icon name="map-pin" size={12} className="mt-[1px] shrink-0 text-slate-400" />
                                  <span className="text-[11px] font-bold leading-snug">{s.location}</span>
                                </div>
                             )}
                           </div>
                         )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filteredSchedules.length === 0 && (
          <div className="py-20 text-center font-bold text-slate-400">
            No schedules found for this category.
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 animate-fadeIn" onClick={() => setIsAddModalOpen(false)}></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-lg bg-white rounded-3xl shadow-2xl p-6 lg:p-8 z-50 animate-slideUp overflow-y-auto max-h-[90vh] hover-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-extrabold text-xl text-slate-900">{editingScheduleId ? 'Edit Schedule Target' : 'Add Schedule Target'}</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-xl transition-colors">
                <Icon name={"x" as any} size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveSchedule} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Judul Schedule</label>
                <input 
                  type="text" required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                  value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}
                  placeholder="Misal: Psikotes Calon Designer"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Tanggal</label>
                  <input 
                    type="date" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Tipe</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as any})}
                  >
                    <option value="Meeting">Meeting</option>
                    <option value="Interview Online">Interview Online</option>
                    <option value="Interview Offline">Interview Offline</option>
                    <option value="Event">Event</option>
                    <option value="Tugas">Tugas</option>
                    <option value="Lainnya">Lainnya...</option>
                  </select>
                </div>
              </div>

              {formData.type === 'Lainnya' && (
                <div className="animate-fadeIn">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Tipe Custom</label>
                  <input 
                    type="text" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.customType} onChange={e => setFormData({...formData, customType: e.target.value})}
                    placeholder="Masukkan tipe kegiatan"
                  />
                </div>
              )}

              {formData.type === 'Interview Online' && (
                <div className="animate-fadeIn">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Link Interview Online</label>
                  <input 
                    type="url" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.link || ''} onChange={e => setFormData({...formData, link: e.target.value})}
                    placeholder="Contoh: https://meet.google.com/..."
                  />
                </div>
              )}

              {formData.type !== 'Interview Online' && (
                <div className="animate-fadeIn">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Lokasi / Ruangan</label>
                  <input 
                    type="text" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})}
                    placeholder="Contoh: Gedung A, Ruang Meeting 3"
                  />
                </div>
              )}

              {formData.type?.includes('Interview') && (
                <div className="animate-fadeIn">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Interviewer / PIC</label>
                  <input 
                    type="text" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.interviewer} onChange={e => setFormData({...formData, interviewer: e.target.value})}
                    placeholder="Siapa yang akan meng-interview?"
                  />
                </div>
              )}

              {!formData.type?.includes('Interview') && (
                <div className="animate-fadeIn">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Penanggung Jawab (PIC)</label>
                  <input 
                    type="text"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.interviewer} onChange={e => setFormData({...formData, interviewer: e.target.value})}
                    placeholder="Nama penanggung jawab"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Waktu Mulai</label>
                  <input 
                    type="time" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Waktu Selesai</label>
                  <input 
                    type="time" required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                    value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Keterangan / Deskripsi</label>
                <textarea 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:border-indigo-500 outline-none transition-all resize-y min-h-[80px]"
                  value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="Tambahkan detail jadwal (opsional)"
                ></textarea>
              </div>

              <div className="pt-2">
                <button type="submit" className="w-full bg-[#314BF5] text-white font-extrabold py-3.5 rounded-xl hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/30 flex justify-center items-center gap-2">
                  <Icon name={"check" as any} size={18} /> Simpan Jadwal
                </button>
              </div>
            </form>
          </div>
        </>
      )}
      {deleteConfirmId !== null && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] animate-fadeIn" onClick={() => setDeleteConfirmId(null)}></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white rounded-3xl shadow-2xl p-6 z-[60] animate-slideUp">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-5 mt-2">
                <Icon name="alert-triangle" size={28} />
              </div>
              <h3 className="font-extrabold text-[19px] text-slate-900 mb-2">Hapus Jadwal?</h3>
              <p className="text-sm rounded-xl text-slate-500 mb-8 font-medium">Apakah Anda yakin ingin menghapus jadwal ini? Data yang terhapus tidak dapat dikembalikan.</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Batal</button>
                <button 
                  onClick={() => { 
                    setSchedules(prev => prev.filter(s => s.id !== deleteConfirmId)); 
                    setDeleteConfirmId(null); 
                  }} 
                  className="flex-1 px-4 py-3 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-colors"
                >
                  Hapus Jadwal
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
