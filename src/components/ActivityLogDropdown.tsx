import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './ui/Icon';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { AppLog } from '../types';

function getTimeAgo(dateString: string) {
  const diffInMinutes = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 60000);
  if (diffInMinutes < 1) return 'Baru saja';
  if (diffInMinutes < 60) return `${diffInMinutes} menit yang lalu`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours === 1) return 'sejam yang lalu';
  if (diffInHours < 24) return `${diffInHours} jam yang lalu`;
  return `${Math.floor(diffInHours / 24)} hari yang lalu`;
}

function formatDate(dateString: string) {
  const d = new Date(dateString);
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${minutes}`;
}

export function ActivityLogDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [hasNew, setHasNew] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isInitialRender = useRef(true);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  useEffect(() => {
    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newLogs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AppLog[];
      
      setLogs(newLogs);
      
      if (!isInitialRender.current && snapshot.docChanges().some(change => change.type === 'added')) {
        setHasNew(true);
      }
      isInitialRender.current = false;
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'logs');
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => { setIsOpen(!isOpen); setHasNew(false); }}
        className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors relative"
      >
        <Icon name="clock" size={20} />
        {hasNew && (
          <span className="absolute top-2.5 right-2 w-2 h-2 bg-blue-500 rounded-full border border-white animate-pulse"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-[120%] right-0 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-fadeIn">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800 text-sm">Aktivitas Terakhir</h3>
          </div>
          <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-0">
            {logs.length > 0 ? (
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-[88px] top-4 bottom-4 w-px bg-slate-200"></div>
                
                {logs.map((log, index) => (
                  <div key={log.id} className="relative flex gap-4 p-4 hover:bg-slate-50 transition-colors">
                    {/* Time block */}
                    <div className="w-[60px] flex-shrink-0 text-right pt-0.5">
                      <span className="text-[11px] font-medium text-slate-500">
                        {getTimeAgo(log.timestamp)}
                      </span>
                    </div>

                    {/* Timeline dot */}
                    <div className="relative z-10 w-[14px] flex-shrink-0 flex justify-center pt-1.5">
                      <div className="w-[10px] h-[10px] bg-slate-400 rounded-full ring-4 ring-white"></div>
                    </div>

                    {/* Content block */}
                    <div className="flex-1 pb-4 border-b border-slate-100/0 last:border-0 last:pb-0">
                      <p className="text-[13px] text-slate-600 leading-tight">
                        {log.action} <span className="font-bold text-slate-800">{log.userName}</span>
                      </p>
                      
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="mt-2 space-y-1">
                          {Object.entries(log.details).map(([key, value]) => (
                            <p key={key} className="text-[11px] text-slate-500">
                              {key}: <span className="text-slate-700">{value}</span>
                            </p>
                          ))}
                        </div>
                      )}
                      
                      <div className="mt-2 text-[10px] text-slate-400 font-medium">
                        {formatDate(log.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 text-sm">
                Belum ada aktivitas.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
