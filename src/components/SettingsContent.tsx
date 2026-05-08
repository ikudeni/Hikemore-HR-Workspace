import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { db, handleFirestoreError, OperationType, logActivity } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';

interface AccessRequest {
  id: string;
  email: string;
  name: string;
  status: string;
  timestamp: string;
}

export function SettingsContent() {
  const [emails, setEmails] = useState<string[]>([]);
  const [superAdmins, setSuperAdmins] = useState<string[]>(['deniakbarsaputro@gmail.com']);
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState<string | null>(null);

  useEffect(() => {
    const fetchEmailsAndRequests = async () => {
      try {
        const docRef = doc(db, 'settings', 'access');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setEmails(docSnap.data().emails || []);
          if (docSnap.data().superAdmins) {
            setSuperAdmins(docSnap.data().superAdmins);
          }
        } else {
          const initialData = ['deniakbarsaputro@gmail.com'];
          await setDoc(docRef, { emails: initialData, superAdmins: initialData });
          setEmails(initialData);
          setSuperAdmins(initialData);
        }

        const q = query(collection(db, 'accessRequests'), where('status', '==', 'pending'));
        const reqSnap = await getDocs(q);
        const reqs: AccessRequest[] = [];
        reqSnap.forEach(d => {
           reqs.push({ id: d.id, ...d.data() } as AccessRequest);
        });
        setPendingRequests(reqs.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'settings/access');
      } finally {
        setIsLoading(false);
      }
    };
    fetchEmailsAndRequests();
  }, []);

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes('@')) return;
    const emailToAdd = newEmail.toLowerCase();
    if (emails.includes(emailToAdd)) {
      setNewEmail('');
      return;
    }
    const updatedEmails = [...emails, emailToAdd];
    setEmails(updatedEmails);
    setNewEmail('');
    try {
      await updateDoc(doc(db, 'settings', 'access'), { emails: updatedEmails });
      logActivity('Akses Akun ditambahkan oleh', { email: emailToAdd });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/access');
      setEmails(emails); // revert
    }
  };

  const handleRemoveEmail = async (emailToRemove: string) => {
    if (superAdmins.length <= 1 && superAdmins.includes(emailToRemove)) return; // Cannot remove last super admin
    const updatedEmails = emails.filter(e => e !== emailToRemove);
    const updatedSuperAdmins = superAdmins.filter(e => e !== emailToRemove);
    setEmails(updatedEmails);
    setSuperAdmins(updatedSuperAdmins);
    try {
      await updateDoc(doc(db, 'settings', 'access'), { emails: updatedEmails, superAdmins: updatedSuperAdmins });
      logActivity('Akses Akun dihapus oleh', { email: emailToRemove });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/access');
      setEmails(emails); // revert
      setSuperAdmins(superAdmins);
    }
  };

  const toggleSuperAdmin = async (emailToToggle: string) => {
    if (superAdmins.length <= 1 && superAdmins.includes(emailToToggle)) return;
    let updatedSuperAdmins;
    if (superAdmins.includes(emailToToggle)) {
        updatedSuperAdmins = superAdmins.filter(e => e !== emailToToggle);
    } else {
        updatedSuperAdmins = [...superAdmins, emailToToggle];
    }
    setSuperAdmins(updatedSuperAdmins);
    try {
        await updateDoc(doc(db, 'settings', 'access'), { superAdmins: updatedSuperAdmins });
        logActivity('Hak Akses Super Admin diubah', { email: emailToToggle });
    } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'settings/access');
        setSuperAdmins(superAdmins); // revert
    }
  };

  const handleApproveRequest = async (req: AccessRequest) => {
    const updatedEmails = [...emails, req.email];
    setEmails(updatedEmails);
    setPendingRequests(prev => prev.filter(p => p.id !== req.id));
    
    try {
      await updateDoc(doc(db, 'settings', 'access'), { emails: updatedEmails });
      await deleteDoc(doc(db, 'accessRequests', req.id)); // we can just delete it once handled
      logActivity('Akses Akun diberikan', { email: req.email });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/access');
      // revert omitted for brevity
    }
  };

  const handleRejectRequest = async (req: AccessRequest) => {
    setPendingRequests(prev => prev.filter(p => p.id !== req.id));
    try {
      await deleteDoc(doc(db, 'accessRequests', req.id));
      logActivity('Permintaan Akses Akun ditolak', { email: req.email });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `accessRequests/${req.id}`);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 h-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-8 h-full overflow-y-auto hide-scrollbar animate-fadeIn">
      <div className="max-w-3xl mx-auto bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
            <Icon name="shield" size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-800">Akses Akun</h2>
            <p className="text-sm font-medium text-slate-500">Kelola daftar email yang diizinkan untuk login ke sistem.</p>
          </div>
        </div>

        <form onSubmit={handleAddEmail} className="flex gap-4 mb-8">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Tambahkan alamat email..."
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            required
          />
          <button
            type="submit"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <Icon name="plus" size={18} />
            Tambah Email
          </button>
        </form>

        {pendingRequests.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
              Permintaan Akses Baru
              <span className="bg-orange-100 text-orange-700 py-0.5 px-2 rounded-full text-xs ml-1">{pendingRequests.length}</span>
            </h3>
            <div className="border border-orange-200 rounded-xl overflow-hidden bg-orange-50/30">
              <table className="w-full text-left">
                <thead className="bg-orange-50 border-b border-orange-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-black text-orange-800 uppercase tracking-wider">Nama / Email</th>
                    <th className="px-6 py-4 text-xs font-black text-orange-800 uppercase tracking-wider">Waktu</th>
                    <th className="px-6 py-4 text-xs font-black text-orange-800 uppercase tracking-wider text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-100">
                  {pendingRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-orange-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-800">{req.name || 'Unknown'}</span>
                          <span className="text-[13px] text-slate-500">{req.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[13px] text-slate-500 font-medium">
                        {new Date(req.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleApproveRequest(req)}
                          className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
                        >
                          <Icon name="check" size={14} /> Berikan Akses
                        </button>
                        <button
                          onClick={() => handleRejectRequest(req)}
                          className="px-3 py-1.5 bg-white border border-slate-200 text-red-500 hover:bg-red-50 hover:border-red-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          <Icon name="x" size={14} /> Tolak
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Alamat Email</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {emails.map((email) => (
                <tr key={email} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-black text-xs">
                        {email.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-bold text-slate-700">{email}</span>
                      {superAdmins.includes(email) && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-black tracking-wide ml-2">SUPER ADMIN</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                    {!(superAdmins.length <= 1 && superAdmins.includes(email)) ? (
                      <>
                        <button
                          onClick={() => toggleSuperAdmin(email)}
                          className={superAdmins.includes(email) ? "text-purple-600 hover:text-purple-800 hover:bg-purple-50 p-2 rounded-lg transition-colors" : "text-slate-400 hover:text-purple-600 hover:bg-purple-50 p-2 rounded-lg transition-colors"}
                          title={superAdmins.includes(email) ? "Cabut akses Super Admin" : "Jadikan Super Admin"}
                        >
                          <Icon name="shield" size={18} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmEmail(email)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors"
                          title="Hapus Akses"
                        >
                          <Icon name="trash-2" size={18} />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium italic">Tidak dapat dihapus</span>
                    )}
                  </td>
                </tr>
              ))}
              {emails.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-6 py-8 text-center text-slate-500 text-sm font-medium">
                    Belum ada email yang diizinkan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteConfirmEmail && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-scaleIn">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center shrink-0">
                <Icon name="alert-triangle" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">Hapus Akses?</h3>
                <p className="text-sm text-slate-500 mt-1">Anda yakin ingin menghapus akses untuk <strong>{deleteConfirmEmail}</strong>?</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setDeleteConfirmEmail(null)}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  handleRemoveEmail(deleteConfirmEmail);
                  setDeleteConfirmEmail(null);
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-sm"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
