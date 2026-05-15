import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { AsyncImage } from './ui/AsyncImage';

interface AssetHistory {
  id: string;
  employeeId: string;
  employeeNameSnapshot: string;
  dateAssigned: string;
  dateReturned?: string;
  notes?: string;
  giverName?: string;
  proofImageUrl?: string;
}

interface Asset {
  id: string;
  barcode: string;
  name: string;
  category: string;
  status: 'Tersedia' | 'Dipakai' | 'Rusak';
  condition?: 'Normal' | 'Rusak' | 'Perbaikan';
  assignedToId?: string; // Employee ID
  purchaseDate: string;
  history: AssetHistory[];
}

export const PublicAssetView = ({ barcode, onClose, onGoToLogin }: { barcode: string, onClose: () => void, onGoToLogin: () => void }) => {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchAsset = async () => {
      try {
        const q = query(collection(db, 'assets'), where('barcode', '==', barcode));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          setAsset({ id: doc.id, ...doc.data() } as Asset);
        } else {
          setError('Aset tidak ditemukan.');
        }
      } catch (err: any) {
        console.error(err);
        if (err.message && err.message.includes('offline')) {
          setError('Gagal memuat karena masalah koneksi internet. Pastikan koneksi stabil.');
        } else {
          setError('Gagal memuat detail aset.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchAsset();
  }, [barcode]);

  return (
    <div className="h-[100dvh] bg-white flex flex-col animate-fadeIn overflow-hidden">
      <div className="bg-slate-800 p-4 text-white flex shrink-0 items-center sticky top-0 z-10 shadow-md">
        <div className="flex items-center gap-2">
          <Icon name="layout" size={18} />
          <span className="font-bold text-sm tracking-wide">Detail Aset</span>
        </div>
      </div>
      
      <div className="p-5 sm:p-8 overflow-y-auto flex-1 relative hide-scrollbar pb-24">
          {loading ? (
             <div className="flex items-center justify-center h-full">
               <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
             </div>
          ) : error || !asset ? (
             <div className="flex flex-col items-center justify-center h-full text-center">
               <Icon name="alert-circle" size={48} className="text-red-400 mb-4" />
               <h3 className="text-xl font-bold text-slate-800 mb-2">Oops!</h3>
               <p className="text-slate-500 mb-6">{error || 'Data aset tidak tersedia.'}</p>
               <button onClick={onGoToLogin} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors">
                 Ke Halaman Utama
               </button>
             </div>
          ) : (
            <>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-black text-slate-800 mb-1">{asset.name}</h2>
                  <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 font-mono">
                    {asset.barcode}
                  </div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                  asset.status === 'Tersedia' ? 'bg-emerald-100 text-emerald-700' :
                  asset.status === 'Dipakai' ? 'bg-blue-100 text-blue-700' :
                  'bg-rose-100 text-rose-700'
                }`}>
                  {asset.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[11px] text-slate-500 font-bold mb-1 uppercase tracking-wider">Kategori</div>
                  <div className="text-sm font-bold text-slate-800">{asset.category}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[11px] text-slate-500 font-bold mb-1 uppercase tracking-wider">Kondisi</div>
                  <div className="text-sm font-bold flex items-center gap-1.5">
                    {asset.condition === 'Normal' || !asset.condition ? (
                      <Icon name="check-circle" size={14} className="text-emerald-500" />
                    ) : asset.condition === 'Rusak' ? (
                      <Icon name="alert-triangle" size={14} className="text-rose-500" />
                    ) : (
                      <Icon name="tool" size={14} className="text-amber-500" />
                    )}
                    <span className={
                      asset.condition === 'Normal' || !asset.condition 
                        ? 'text-emerald-700' 
                        : asset.condition === 'Rusak' 
                        ? 'text-rose-700' 
                        : 'text-amber-700'
                    }>
                      {asset.condition || 'Normal'}
                    </span>
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2">
                  <div className="text-[11px] text-slate-500 font-bold mb-1 uppercase tracking-wider">Tgl Pembelian</div>
                  <div className="text-sm font-bold text-slate-800">{asset.purchaseDate}</div>
                </div>
              </div>

              <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-2">
                <Icon name="list" size={18} className="text-slate-400" />
                Histori Pemakaian
              </h3>
              
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                {!(asset.history && asset.history.length > 0) ? (
                  <div className="text-center p-6 text-sm text-slate-500 italic border border-slate-100 rounded-xl bg-slate-50 relative z-10">
                    Belum ada histori pemakaian.
                  </div>
                ) : (
                  (asset.history || []).slice().reverse().map((hist, idx) => (
                    <div key={hist.id} className="relative flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-white border-4 border-slate-100 flex-shrink-0 flex items-center justify-center z-10 text-slate-400">
                        {idx === 0 && !hist.dateReturned ? (
                          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                        )}
                      </div>
                      <div 
                        className={`flex-1 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm z-10 transition-all ${idx === 0 && !hist.dateReturned ? 'border-blue-200 bg-blue-50/50' : 'hover:shadow-md'} ${(hist.giverName || hist.proofImageUrl) ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (hist.giverName || hist.proofImageUrl) {
                            setExpandedHistoryIds(prev => 
                              prev.includes(hist.id) ? prev.filter(id => id !== hist.id) : [...prev, hist.id]
                            );
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-800 text-sm">{hist.employeeNameSnapshot}</span>
                          <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">{hist.dateAssigned}</span>
                        </div>
                        <div className="text-xs text-slate-500 mb-2 flex flex-row items-center justify-between">
                          <div>
                            Status: {hist.dateReturned ? (
                              <span className="text-slate-600 font-medium">Dikembalikan tanggal {hist.dateReturned}</span>
                            ) : (
                              <span className="text-blue-600 font-medium">Sedang memegang aset</span>
                            )}
                          </div>
                          {(hist.giverName || hist.proofImageUrl) && (
                            <div className="text-slate-400 ml-2">
                              <Icon name={expandedHistoryIds.includes(hist.id) ? "chevron-up" : "chevron-down"} size={16} />
                            </div>
                          )}
                        </div>
                        
                        {(hist.giverName || hist.proofImageUrl) && expandedHistoryIds.includes(hist.id) && (
                          <div className="mt-3 pt-3 border-t border-slate-200 flex flex-col gap-3 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
                            {hist.giverName && (
                              <div className="text-[12px] text-slate-600 bg-white/50 p-2 rounded-lg border border-slate-100">
                                <span className="font-medium">Diberikan oleh:</span> <span className="font-bold text-slate-800 ml-1">{hist.giverName}</span>
                              </div>
                            )}
                            {hist.proofImageUrl && (
                              <div>
                                <span className="text-[11px] font-bold text-slate-500 mb-2 block uppercase tracking-wider">Foto Bukti</span>
                                <div className="block w-full max-w-sm rounded-xl overflow-hidden border-2 border-slate-100 shadow-sm transition-all relative">
                                  <AsyncImage src={hist.proofImageUrl} alt="Bukti Penugasan" className="w-full h-auto object-cover" />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {hist.notes && (
                          <p className="text-xs mt-2 text-slate-600 bg-yellow-50 p-2.5 rounded-xl border border-yellow-100 leading-relaxed font-medium">
                            "{hist.notes}"
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
    </div>
  );
};
