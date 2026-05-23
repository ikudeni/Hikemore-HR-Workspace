import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { db, handleFirestoreError, OperationType, logActivity } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';

interface AccessRequest {
  id: string;
  username: string;
  name: string;
  status: string;
  timestamp: string;
}

export function SettingsContent() {
  const [usernames, setUsernames] = useState<string[]>([]);
  const [superAdmins, setSuperAdmins] = useState<string[]>(['deniakbar']);
  const [menuAccessMap, setMenuAccessMap] = useState<Record<string, string[]>>({});
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([]);
  
  const [isMenuAccessModalOpen, setIsMenuAccessModalOpen] = useState(false);
  const [menuAccessTarget, setMenuAccessTarget] = useState<string | null>(null);
  const [currentMenuAccess, setCurrentMenuAccess] = useState<string[]>([]);

  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmUsername, setDeleteConfirmUsername] = useState<string | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editUsernameTarget, setEditUsernameTarget] = useState('');
  const [editNewUsername, setEditNewUsername] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    let unsubscribeSettings: (() => void) | undefined;
    let unsubscribeRequests: (() => void) | undefined;

    try {
      const docRef = doc(db, 'settings', 'access');
      unsubscribeSettings = onSnapshot(docRef, async (docSnap) => {
        if (docSnap.exists()) {
          setUsernames(docSnap.data().usernames || docSnap.data().emails || []);
          if (docSnap.data().superAdmins) {
            setSuperAdmins(docSnap.data().superAdmins);
          }
          if (docSnap.data().menuAccess) {
            setMenuAccessMap(docSnap.data().menuAccess);
          } else {
            setMenuAccessMap({});
          }
        } else {
          const initialData = ['deniakbar'];
          await setDoc(docRef, { usernames: initialData, superAdmins: initialData });
        }
        setIsLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/access');
        setIsLoading(false);
      });

      const q = query(collection(db, 'accessRequests'), where('status', '==', 'pending'));
      unsubscribeRequests = onSnapshot(q, (reqSnap) => {
        const reqs: AccessRequest[] = [];
        reqSnap.forEach(d => {
           reqs.push({ id: d.id, ...d.data() } as AccessRequest);
        });
        setPendingRequests(reqs.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'accessRequests');
      });
    } catch (error) {
      console.error(error);
      setIsLoading(false);
    }

    return () => {
      if (unsubscribeSettings) unsubscribeSettings();
      if (unsubscribeRequests) unsubscribeRequests();
    };
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword || !newName) return;
    
    setIsCreating(true);
    setCreateError('');
    
    const usernameToAdd = newUsername.toLowerCase();
    
    try {
      if (newPassword.length < 6) {
        throw new Error('Password terlalu lemah, minimal 6 karakter');
      }

      const docRefUsers = doc(db, 'settings', 'users');
      let firestoreUsers: Record<string, any> = {};
      try {
        const docSnapUsers = await Promise.race([
          getDoc(docRefUsers),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        if (docSnapUsers && docSnapUsers.exists()) {
          firestoreUsers = docSnapUsers.data().records || {};
        }
      } catch (e) {
        console.warn("Offline fallback for settings/users: ", e);
      }

      const localUsers = JSON.parse(localStorage.getItem('localUsers') || '{}');
      let combinedUsers = { ...localUsers, ...firestoreUsers };

      if (combinedUsers[usernameToAdd]) {
         if (!usernames.includes(usernameToAdd)) {
            const updatedUsernames = [...usernames, usernameToAdd];
            updateDoc(doc(db, 'settings', 'access'), { usernames: updatedUsernames }).catch(console.error);
            setUsernames(updatedUsernames);
            if (newPassword) {
                combinedUsers[usernameToAdd].password = newPassword;
                setDoc(docRefUsers, { records: combinedUsers }, { merge: true }).catch(console.error);
            }
            setNewName(''); setNewUsername(''); setNewPassword('');
            setIsCreating(false);
            return;
         } else {
           throw new Error('Username ini sudah terdaftar dan ada di whitelist.');
         }
      }

      combinedUsers[usernameToAdd] = { username: usernameToAdd, password: newPassword, name: newName };
      await setDoc(docRefUsers, { records: combinedUsers }, { merge: true });
      
      let updatedUsernames = usernames;
      if (!usernames.includes(usernameToAdd)) {
        updatedUsernames = [...usernames, usernameToAdd];
        updateDoc(doc(db, 'settings', 'access'), { usernames: updatedUsernames }).catch(console.error);
        setUsernames(updatedUsernames);
      }
      
      logActivity('Akun Baru dibuat oleh admin', { username: usernameToAdd, name: newName });
      
      setNewName('');
      setNewUsername('');
      setNewPassword('');
    } catch (error: any) {
      console.error(error);
      if (error.message) {
         setCreateError(error.message);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleRemoveUsername = async (usernameToRemove: string) => {
    if (superAdmins.length <= 1 && superAdmins.includes(usernameToRemove)) return; // Cannot remove last super admin
    const updatedUsernames = usernames.filter(e => e !== usernameToRemove);
    const updatedSuperAdmins = superAdmins.filter(e => e !== usernameToRemove);
    setUsernames(updatedUsernames);
    setSuperAdmins(updatedSuperAdmins);
    try {
      await updateDoc(doc(db, 'settings', 'access'), { usernames: updatedUsernames, superAdmins: updatedSuperAdmins });
      logActivity('Akses Akun dihapus oleh', { username: usernameToRemove });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/access');
      setUsernames(usernames); // revert
      setSuperAdmins(superAdmins);
    }
  };

  const allMenus = [
    'Dashboard',
    'Rekrutmen',
    'Karyawan',
    'Performa',
    'Schedule',
    'File Sharing',
    'Inventory',
    'Organization',
  ];

  const handleOpenMenuAccess = (username: string) => {
    setMenuAccessTarget(username);
    setCurrentMenuAccess(menuAccessMap[username] || allMenus);
    setIsMenuAccessModalOpen(true);
  };

  const handleToggleMenu = (menuId: string) => {
    if (currentMenuAccess.includes(menuId)) {
      setCurrentMenuAccess(currentMenuAccess.filter(m => m !== menuId));
    } else {
      setCurrentMenuAccess([...currentMenuAccess, menuId]);
    }
  };

  const handleSaveMenuAccess = async () => {
    if (!menuAccessTarget) return;
    const newMap = { ...menuAccessMap, [menuAccessTarget]: currentMenuAccess };
    
    try {
      await updateDoc(doc(db, 'settings', 'access'), { menuAccess: newMap });
      setMenuAccessMap(newMap);
      setIsMenuAccessModalOpen(false);
    } catch(e) {
      console.error(e);
      alert('Gagal merubah akses menu');
    }
  };

  const toggleSuperAdmin = async (usernameToToggle: string) => {
    if (superAdmins.length <= 1 && superAdmins.includes(usernameToToggle)) return;
    let updatedSuperAdmins;
    if (superAdmins.includes(usernameToToggle)) {
        updatedSuperAdmins = superAdmins.filter(e => e !== usernameToToggle);
    } else {
        updatedSuperAdmins = [...superAdmins, usernameToToggle];
    }
    setSuperAdmins(updatedSuperAdmins);
    try {
        await updateDoc(doc(db, 'settings', 'access'), { superAdmins: updatedSuperAdmins });
        logActivity('Hak Akses Super Admin diubah', { username: usernameToToggle });
    } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'settings/access');
        setSuperAdmins(superAdmins); // revert
    }
  };

  const handleApproveRequest = async (req: AccessRequest) => {
    const updatedUsernames = [...usernames, req.username];
    setUsernames(updatedUsernames);
    setPendingRequests(prev => prev.filter(p => p.id !== req.id));
    
    try {
      await updateDoc(doc(db, 'settings', 'access'), { usernames: updatedUsernames });
      await deleteDoc(doc(db, 'accessRequests', req.id)); // we can just delete it once handled
      logActivity('Akses Akun diberikan', { username: req.username });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/access');
      // revert omitted for brevity
    }
  };

  const handleRejectRequest = async (req: AccessRequest) => {
    setPendingRequests(prev => prev.filter(p => p.id !== req.id));
    try {
      await deleteDoc(doc(db, 'accessRequests', req.id));
      logActivity('Permintaan Akses Akun ditolak', { username: req.username });
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
            <p className="text-sm font-medium text-slate-500">Kelola daftar username yang diizinkan untuk login ke sistem.</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8">
          <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <Icon name="user-plus" size={20} className="text-blue-600" />
            Buat Akun Baru
          </h3>
          <form onSubmit={handleCreateUser} className="space-y-4">
            {createError && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2 font-medium">
                <Icon name="alert-circle" size={16} /> {createError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Nama Lengkap</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Username</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="johndoe"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Password</label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 6 karakter"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isCreating}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isCreating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    Memproses...
                  </>
                ) : (
                  <>
                    <Icon name="plus" size={18} />
                    Buat Akun & Tambah Akses
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

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
                    <th className="px-6 py-4 text-xs font-black text-orange-800 uppercase tracking-wider">Nama / Username</th>
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
                          <span className="text-[13px] text-slate-500">{req.username}</span>
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
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Username</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usernames.map((usernameItem) => (
                <tr key={usernameItem} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-black text-xs">
                        {usernameItem.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-bold text-slate-700">{usernameItem}</span>
                      {superAdmins.includes(usernameItem) && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-black tracking-wide ml-2">SUPER ADMIN</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                    {!(superAdmins.length <= 1 && superAdmins.includes(usernameItem)) ? (
                      <>
                        <button
                          onClick={() => handleOpenMenuAccess(usernameItem)}
                          className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                          title="Akses Menu"
                        >
                          <Icon name="layout" size={18} />
                        </button>
                        <button
                          onClick={() => toggleSuperAdmin(usernameItem)}
                          className={superAdmins.includes(usernameItem) ? "text-purple-600 hover:text-purple-800 hover:bg-purple-50 p-2 rounded-lg transition-colors" : "text-slate-400 hover:text-purple-600 hover:bg-purple-50 p-2 rounded-lg transition-colors"}
                          title={superAdmins.includes(usernameItem) ? "Cabut akses Super Admin" : "Jadikan Super Admin"}
                        >
                          <Icon name="shield" size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setEditUsernameTarget(usernameItem);
                            setEditNewUsername(usernameItem);
                            setEditNewPassword('');
                            setShowEditPassword(false);
                            setEditError('');
                            setIsEditModalOpen(true);
                          }}
                          className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                          title="Pengaturan Akun"
                        >
                          <Icon name="edit" size={18} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmUsername(usernameItem)}
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
              {usernames.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-6 py-8 text-center text-slate-500 text-sm font-medium">
                    Belum ada username yang diizinkan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isEditModalOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[2000] animate-fadeIn" onClick={() => setIsEditModalOpen(false)}></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-white rounded-[2rem] shadow-2xl p-6 md:p-8 z-[2000] animate-scaleIn">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none mb-1">Pengaturan Akun</h2>
                <p className="text-[14px] text-slate-500 font-medium">Kelola akses untuk {editUsernameTarget}</p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors">
                <Icon name="x" size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {editError && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2 font-medium">
                  <Icon name="alert-circle" size={16} /> {editError}
                </div>
              )}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 uppercase tracking-wider mb-2">Username Akses (Whitelist)</label>
                <input
                  type="text"
                  value={editNewUsername}
                  onChange={(e) => setEditNewUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium text-slate-900"
                />
                <p className="text-xs text-amber-600 mt-2 font-medium">Anda dapat mengubah kredensial login (Username & Password) untuk user ini secara langsung.</p>
              </div>

              <div>
                <label className="block text-[13px] font-bold text-slate-700 uppercase tracking-wider mb-2">Sandi Baru (Opsional)</label>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    value={editNewPassword}
                    onChange={(e) => setEditNewPassword(e.target.value)}
                    placeholder="Kosongkan jika tidak ingin diubah"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium text-slate-900 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    <Icon name={showEditPassword ? "eye-off" : "eye"} size={20} />
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2 font-medium">Isi field ini jika Anda ingin mengubah sandi untuk user bersangkutan.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors text-sm">
                Batal
              </button>
              <button 
                type="button"
                onClick={async () => {
                  try {
                    setEditError('');
                    if (!editNewUsername) return;
                    const newUsername = editNewUsername.toLowerCase();
                    
                    if (editNewPassword && editNewPassword.length < 6) {
                       setEditError('Sandi minimal 6 karakter');
                       return;
                    }

                    const docRefUsers = doc(db, 'settings', 'users');
                    let firestoreUsers: Record<string, any> = {};
                    try {
                      const docSnapUsers = await Promise.race([
                        getDoc(docRefUsers),
                        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                      ]);
                      if (docSnapUsers && docSnapUsers.exists()) {
                        firestoreUsers = docSnapUsers.data().records || {};
                      }
                    } catch (e) {
                      console.warn("Offline fallback for settings/users: ", e);
                    }

                    const localUsers = JSON.parse(localStorage.getItem('localUsers') || '{}');
                    let combinedUsers = { ...localUsers, ...firestoreUsers };

                    const userData = combinedUsers[editUsernameTarget || ''];
                    
                    if (userData) {
                       if (newUsername !== editUsernameTarget) {
                          if (combinedUsers[newUsername]) {
                             setEditError('Username ini sudah dipakai.');
                             return;
                          }
                          userData.username = newUsername;
                          combinedUsers[newUsername] = userData;
                          delete combinedUsers[editUsernameTarget || ''];
                       }
                       if (editNewPassword) {
                          userData.password = editNewPassword;
                       }
                       await setDoc(docRefUsers, { records: combinedUsers }, { merge: false });
                    } else if (editNewPassword) {
                        combinedUsers[editUsernameTarget || ''] = { username: newUsername, password: editNewPassword, name: newUsername };
                        await setDoc(docRefUsers, { records: combinedUsers }, { merge: false });
                    }

                    if (newUsername !== editUsernameTarget) {
                      const updatedUsernames = usernames.map(e => e === editUsernameTarget ? newUsername : e);
                      const updatedSuperAdmins = superAdmins.map(e => e === editUsernameTarget ? newUsername : e);
                      updateDoc(doc(db, 'settings', 'access'), { usernames: updatedUsernames, superAdmins: updatedSuperAdmins }).catch(e => {
                        console.error(e);
                      });
                      setUsernames(updatedUsernames);
                      setSuperAdmins(updatedSuperAdmins);
                    }
                    
                    setIsEditModalOpen(false);
                  } catch (err: any) {
                    console.error(err);
                    setEditError("Error pada sistem: " + err.message);
                  }
                }}
                className="px-5 py-2.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors text-sm flex items-center gap-2"
              >
                <Icon name="save" size={16} />
                Simpan Perubahan
              </button>
            </div>
          </div>
        </>
      )}

      {isMenuAccessModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] flex flex-col animate-scaleIn">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-800">Akses Menu: {menuAccessTarget}</h3>
              <button onClick={() => setIsMenuAccessModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50">
                <Icon name="x" size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-2 mb-6">
              {allMenus.map((menu) => (
                <label key={menu} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-blue-100 hover:bg-blue-50/50 cursor-pointer transition-colors group">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${currentMenuAccess.includes(menu) ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white group-hover:border-blue-400'}`}>
                    {currentMenuAccess.includes(menu) && <Icon name="check" size={14} />}
                  </div>
                  <span className={`text-sm font-semibold ${currentMenuAccess.includes(menu) ? 'text-slate-800' : 'text-slate-600'}`}>{menu}</span>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={currentMenuAccess.includes(menu)}
                    onChange={() => handleToggleMenu(menu)}
                  />
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-auto">
              <button
                onClick={() => setIsMenuAccessModalOpen(false)}
                className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveMenuAccess}
                className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm flex items-center gap-2"
              >
                <Icon name="check" size={16} />
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmUsername && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-scaleIn">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center shrink-0">
                <Icon name="alert-triangle" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">Hapus Akses?</h3>
                <p className="text-sm text-slate-500 mt-1">Anda yakin ingin menghapus akses untuk <strong>{deleteConfirmUsername}</strong>?</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setDeleteConfirmUsername(null)}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  handleRemoveUsername(deleteConfirmUsername);
                  setDeleteConfirmUsername(null);
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
