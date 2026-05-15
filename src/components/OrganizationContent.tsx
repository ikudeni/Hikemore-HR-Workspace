import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Employee } from '../types';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import { doc, updateDoc, collection, addDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity } from '../firebase';
import { ManagerSelect } from './ui/ManagerSelect';

export function OrganizationContent({ employees }: { employees: Employee[] }) {
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isManageStructureOpen, setIsManageStructureOpen] = useState(false);
  const [manageStructureSearch, setManageStructureSearch] = useState('');
  const [extName, setExtName] = useState('');
  const [extPos, setExtPos] = useState('');
  const [extDept, setExtDept] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [showBackToCenter, setShowBackToCenter] = useState(false);

  const centerView = () => {
    if (scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      el.scrollTo({ left: (el.scrollWidth - el.clientWidth) / 2, behavior: 'smooth' });
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const centerPoint = (el.scrollWidth - el.clientWidth) / 2;
    // Show button if scrolled more than 100px away from the center
    if (Math.abs(el.scrollLeft - centerPoint) > 100) {
      setShowBackToCenter(true);
    } else {
      setShowBackToCenter(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollContainerRef.current) {
        const el = scrollContainerRef.current;
        el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [employees]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoom(prev => {
          const newZoom = prev - e.deltaY * 0.001;
          return Math.min(Math.max(0.3, newZoom), 2);
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleAddExternalEmployee = async () => {
    if (!extName.trim()) return;
    try {
      await addDoc(collection(db, 'employees'), {
        name: extName.trim(),
        pos: extPos.trim() || 'Eksternal',
        isActive: true,
        isExternal: true,
        hideFromOrgChart: true,
        gender: "Laki-Laki",
        dob: "",
        joinDate: new Date().toISOString(),
        religion: "",
        maritalStatus: "",
        edu: "",
        major: "",
        dept: extDept.trim() || 'Eksternal',
        status: "Aktif",
      });
      setExtName('');
      setExtPos('');
      setExtDept('');
      logActivity('Karyawan Eksternal Ditambahkan', { nama: extName.trim() });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'employees');
    }
  };

  const handleDeleteExternalEmployee = async (id: string, name: string) => {
    try {
      await deleteDoc(doc(db, 'employees', id));
      logActivity('Karyawan Eksternal Dihapus', { nama: name });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `employees/${id}`);
    }
  };

  // Build tree
  const organizationTree = useMemo(() => {
    const activeEmployees = employees.filter(e => e.isActive && !e.hideFromOrgChart);
    const map = new Map<string, any>();
    
    activeEmployees.forEach(emp => {
      map.set(emp.id, { ...emp, children: [] });
    });

    let roots: any[] = [];

    activeEmployees.forEach(emp => {
      const node = map.get(emp.id);
      if (emp.managerId) {
        if (map.has(emp.managerId)) {
          map.get(emp.managerId).children.push(node);
        } else if (emp.managerId.startsWith('__EXT__::')) {
          if (!map.has(emp.managerId)) {
            const parts = emp.managerId.split('::');
            const extNode = { 
              id: emp.managerId, 
              name: parts[1] || 'Unknown', 
              pos: parts[2] || '', 
              dept: parts[3] || '',
              children: [], 
              isVirtualExternal: true 
            };
            map.set(emp.managerId, extNode);
            roots.push(extNode);
          }
          map.get(emp.managerId).children.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    // Sort roots & children by department
    map.forEach(node => {
      if (node.children) {
        node.children.sort((a: any, b: any) => {
          const deptA = a.dept || '';
          const deptB = b.dept || '';
          if (deptA === deptB) {
             return (a.name || '').localeCompare(b.name || '');
          }
          return deptA.localeCompare(deptB);
        });
      }
    });

    roots.sort((a: any, b: any) => {
      const deptA = a.dept || '';
      const deptB = b.dept || '';
      if (deptA === deptB) {
        return (a.name || '').localeCompare(b.name || '');
      }
      return deptA.localeCompare(deptB);
    });

    // Sort roots & children by department
    const sortChildrenByDept = (children: any[]) => {
      if (!children || children.length <= 1) return children;
      children.sort((a: any, b: any) => {
         const deptA = a.dept || '';
         const deptB = b.dept || '';
         if (deptA === deptB) {
            return (a.name || '').localeCompare(b.name || '');
         }
         return deptA.localeCompare(deptB);
      });
      return children;
    };

    // Apply grouping recursively
    const processNode = (node: any) => {
       if (node.children && node.children.length > 0) {
          node.children = sortChildrenByDept(node.children);
          node.children.forEach(processNode);
       }
    };
    
    roots = sortChildrenByDept(roots);
    roots.forEach(processNode);
    return roots;
  }, [employees]);

  const handleAssignManager = async (empId: string, managerId: string) => {
    try {
      await updateDoc(doc(db, 'employees', empId), { managerId });
      logActivity('Manajer Diubah', { karyawan: employees.find(e => e.id === empId)?.name, manager_baru: managerId === '' ? 'Tidak ada' : (employees.find(e => e.id === managerId)?.name || 'Unknown') });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `employees/${empId}`);
    }
  };

  const handleToggleVisibility = async (empId: string, hide: boolean) => {
    try {
      await updateDoc(doc(db, 'employees', empId), { hideFromOrgChart: hide });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `employees/${empId}`);
    }
  };

  const getAvatarInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const activeEmployeesCount = employees.filter(e => e.isActive && !e.hideFromOrgChart).length;

  // Recursive Tree Node component
  const TreeNode: React.FC<{ node: any, deptGroupPosition?: string }> = ({ node, deptGroupPosition }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
      <li className="relative text-center transition-all inline-block align-top">
        {deptGroupPosition === 'start' && (
           <div className="absolute top-[80px] left-1/2 w-1/2 h-[3px] bg-indigo-400 z-0"></div>
        )}
        {deptGroupPosition === 'middle' && (
           <div className="absolute top-[80px] left-0 w-full h-[3px] bg-indigo-400 z-0"></div>
        )}
        {deptGroupPosition === 'end' && (
           <div className="absolute top-[80px] left-0 w-1/2 h-[3px] bg-indigo-400 z-0"></div>
        )}
        
        <div className="relative z-10">
          {/* Node Card */}
          <div 
            className="relative inline-flex flex-col items-center group bg-white border border-indigo-100 shadow-[0_2px_12px_rgba(129,140,248,0.1)] rounded-[18px] w-[260px] z-10 transition-shadow hover:shadow-md hover:border-indigo-200"
          >
          {!node.isVirtualExternal && (
            <button
              onClick={() => handleToggleVisibility(node.id, true)}
              className="absolute top-2 right-2 text-red-500 hover:bg-red-50 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-30"
              title="Sembunyikan dari Chart"
            >
              <Icon name="x" size={16} />
            </button>
          )}
          {node.dept && (
             <div className="absolute -top-[14px] left-1/2 -translate-x-1/2 bg-white px-2.5 py-0.5 text-[10px] font-black text-indigo-600 rounded drop-shadow-sm border border-indigo-100 uppercase tracking-wider whitespace-nowrap z-20">
               {node.dept}
             </div>
          )}
          <div className="flex items-center gap-4 w-full p-4 pt-5">
            <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-black shrink-0 shadow-sm overflow-hidden">
               {node.avatar ? <img src={node.avatar} alt={node.name} className="w-full h-full object-cover" /> : getAvatarInitials(node.name)}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <h3 className="text-[13px] font-bold text-slate-800 truncate tracking-tight">{node.name}</h3>
              <p className="text-[11px] text-slate-500 truncate mt-0.5 font-medium">{node.pos}</p>
            </div>
          </div>
          <div className="w-full border-t border-indigo-50 p-2.5 flex justify-center items-center relative">
             {!node.isVirtualExternal && (
               <button 
                 onClick={() => { setSelectedEmp(node); setIsAssignModalOpen(true); }}
                 className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors w-full text-center"
               >
                 Setel Posisi
               </button>
             )}
             {node.children && node.children.length > 0 && (
                <button 
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className={`absolute -bottom-3 left-1/2 -translate-x-1/2 w-[26px] h-[26px] ${isCollapsed ? 'bg-slate-400 border-slate-400' : 'bg-indigo-600 border-white'} text-white flex items-center justify-center rounded-full text-[11px] font-bold z-20 border-2 shadow-sm hover:scale-110 transition-transform cursor-pointer`}
                  title={isCollapsed ? "Tampilkan Bawahan" : "Sembunyikan Bawahan"}
                >
                  {node.children.length}
                </button>
             )}
          </div>
        </div>
        </div>

        {/* Children */}
        {!isCollapsed && node.children && node.children.length > 0 && (
          <ul className="flex justify-center relative">
            {node.children.map((child: any, index: number) => {
              const nextChild = node.children[index + 1];
              const prevChild = node.children[index - 1];
              const hasPrevSameDept = prevChild && child.dept && prevChild.dept === child.dept;
              const hasNextSameDept = nextChild && child.dept && nextChild.dept === child.dept;
              
              let deptGroupPosition = 'none';
              if (hasPrevSameDept && hasNextSameDept) deptGroupPosition = 'middle';
              else if (hasPrevSameDept && !hasNextSameDept) deptGroupPosition = 'end';
              else if (!hasPrevSameDept && hasNextSameDept) deptGroupPosition = 'start';

              return (
                <TreeNode key={child.id} node={child} deptGroupPosition={deptGroupPosition} />
              );
            })}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white relative dot-bg">
      <div className="pt-8 pb-4 flex flex-col items-center relative z-20 shrink-0">
        <div className="text-center font-bold text-sm text-slate-800 mb-4 bg-white rounded-full py-2.5 px-6 inline-block border border-indigo-100 shadow-[0_2px_12px_rgba(129,140,248,0.05)]">
          Total: <span className="text-indigo-600 px-0.5">{activeEmployeesCount}</span> karyawan
        </div>
        <button 
          onClick={() => setIsManageStructureOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 hover:-translate-y-0.5 transition-all"
        >
          <Icon name="layout" size={16} /> Atur Susunan Chart
        </button>
      </div>

      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-auto hide-scrollbar-y w-full px-8 pb-8 relative">
        <div 
          className="w-max mx-auto p-6 pb-24 origin-top transition-transform" 
          style={{ transform: `scale(${zoom})` }}
        >
          {organizationTree.length === 0 ? (
            <div className="text-center text-slate-500 mt-20">
              <Icon name="users" size={48} className="mx-auto text-slate-300 mb-4" />
              Belum ada karyawan aktif.
            </div>
          ) : (
            <div className="org-tree min-w-max pb-16 mx-auto w-max">
              <ul className="flex justify-center pt-0">
                {organizationTree.map((root, index) => {
                  const nextRoot = organizationTree[index + 1];
                  const prevRoot = organizationTree[index - 1];
                  const hasPrevSameDept = prevRoot && root.dept && prevRoot.dept === root.dept;
                  const hasNextSameDept = nextRoot && root.dept && nextRoot.dept === root.dept;
                  
                  let deptGroupPosition = 'none';
                  if (hasPrevSameDept && hasNextSameDept) deptGroupPosition = 'middle';
                  else if (hasPrevSameDept && !hasNextSameDept) deptGroupPosition = 'end';
                  else if (!hasPrevSameDept && hasNextSameDept) deptGroupPosition = 'start';

                  return <TreeNode key={root.id} node={root} deptGroupPosition={deptGroupPosition} />
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-8 right-8 flex flex-col gap-2 z-30">
        {showBackToCenter && (
          <button 
            onClick={centerView}
            className="flex items-center justify-center p-2.5 bg-white text-indigo-600 rounded-xl shadow-lg border border-slate-100 hover:bg-slate-50 transition-all animate-fadeIn"
            title="Kembali ke Tengah"
          >
            <Icon name="target" size={20} />
          </button>
        )}
        <div className="flex flex-col gap-2 bg-white rounded-xl shadow-lg border border-slate-100 p-1">
          {zoom !== 1 && (
            <>
              <button 
                onClick={() => setZoom(1)}
              className="p-2 text-slate-600 hover:text-red-600 hover:bg-slate-50 rounded-lg transition-colors"
              title="Reset Zoom"
            >
              <Icon name="x" size={20} />
            </button>
            <div className="w-full h-px bg-slate-100"></div>
          </>
        )}
        <button 
          onClick={() => setZoom(z => Math.min(2, z + 0.1))}
          className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
          title="Zoom In"
        >
          <Icon name="plus" size={20} />
        </button>
        <div className="w-full h-px bg-slate-100"></div>
        <button 
          onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}
          className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
          title="Zoom Out"
        >
          <Icon name="minus" size={20} />
        </button>
        </div>
      </div>

      {isAssignModalOpen && selectedEmp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
           <div className="bg-white rounded-3xl w-full max-w-sm flex flex-col shadow-2xl relative p-6">
              <div className="flex justify-between items-center mb-6">
               <h3 className="font-bold text-slate-800 text-lg">Assign Atasan</h3>
               <button onClick={() => setIsAssignModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                 <Icon name="x" size={20} />
               </button>
             </div>
             
             <div className="mb-4">
               <p className="text-sm text-slate-500 mb-2">Pilih atasan untuk <strong className="text-slate-800">{selectedEmp.name}</strong></p>
               <ManagerSelect 
                 value={selectedEmp.managerId || ''}
                 onChange={(val) => {
                   handleAssignManager(selectedEmp.id, val);
                   setIsAssignModalOpen(false);
                 }}
                 employees={employees}
                 currentEmpId={selectedEmp.id}
               />
             </div>
           </div>
        </div>
      )}

      {isManageStructureOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
           <div className="bg-white rounded-3xl w-full max-w-3xl flex flex-col shadow-2xl relative h-[80vh]">
             <div className="flex justify-between items-center p-6 border-b border-slate-100 shrink-0">
               <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                 <Icon name="layout" size={20} className="text-indigo-600" />
                 Atur Susunan Chart
               </h3>
               <button onClick={() => setIsManageStructureOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
                 <Icon name="x" size={18} />
               </button>
             </div>
             
             <div className="flex-1 flex flex-col overflow-hidden p-6 bg-slate-50 gap-4">
                <div className="shrink-0">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Icon name="search" size={16} className="text-slate-400" />
                    </div>
                    <input
                      type="text"
                      className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm transition-all"
                      placeholder="Cari karyawan..."
                      value={manageStructureSearch}
                      onChange={(e) => setManageStructureSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col flex-1 min-h-0">
                  <div className="overflow-y-auto flex-1">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 z-20 bg-slate-50 shadow-sm border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4 text-xs font-black uppercase text-slate-500 tracking-wider whitespace-nowrap w-24">Tampil</th>
                          <th className="py-3 px-4 text-xs font-black uppercase text-slate-500 tracking-wider w-1/3">Karyawan</th>
                          <th className="py-3 px-4 text-xs font-black uppercase text-slate-500 tracking-wider w-1/4">Posisi</th>
                          <th className="py-3 px-4 text-xs font-black uppercase text-slate-500 tracking-wider">Atasan</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                    <tbody className="divide-y divide-slate-100">
                      {employees.filter(e => e.isActive && e.name.toLowerCase().includes(manageStructureSearch.toLowerCase())).map(emp => (
                        <tr key={emp.id} className={`hover:bg-slate-50/50 transition-colors ${emp.hideFromOrgChart ? 'opacity-60' : ''}`}>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleToggleVisibility(emp.id, !emp.hideFromOrgChart)}
                              className={`w-10 h-6 rounded-full relative transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${!emp.hideFromOrgChart ? 'bg-indigo-500' : 'bg-slate-300'}`}
                            >
                              <span className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${!emp.hideFromOrgChart ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0 text-xs shadow-sm overflow-hidden">
                                {emp.avatar ? <img src={emp.avatar} alt={emp.name} className="w-full h-full object-cover" /> : getAvatarInitials(emp.name)}
                              </div>
                              <span className="text-sm font-bold text-slate-800">{emp.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs font-medium text-slate-600">{emp.pos}</span>
                          </td>
                          <td className="py-3 px-4">
                            <ManagerSelect 
                              value={emp.managerId || ''}
                              onChange={(val) => handleAssignManager(emp.id, val)}
                              employees={employees}
                              currentEmpId={emp.id}
                              disabled={emp.hideFromOrgChart}
                            />
                          </td>
                          <td className="py-3 px-4 text-right">
                            {emp.isExternal && (
                              <button 
                                onClick={() => handleDeleteExternalEmployee(emp.id, emp.name)}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                title="Hapus Karyawan Eksternal"
                              >
                                <Icon name="x" size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {employees.filter(e => e.isActive && e.name.toLowerCase().includes(manageStructureSearch.toLowerCase())).length === 0 && (
                    <div className="p-8 text-center text-slate-500 text-sm">Tidak ada karyawan yang ditemukan.</div>
                  )}
                  </div>
                </div>

                <div className="shrink-0 bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
                  <h4 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                    <Icon name="user-plus" size={16} className="text-indigo-600" />
                    Tambah Karyawan Eksternal
                  </h4>
                  <div className="flex flex-col sm:flex-row gap-3 items-end">
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5 ml-1">Nama</label>
                      <input 
                        type="text" 
                        value={extName}
                        onChange={e => setExtName(e.target.value)}
                        placeholder="Cth: John Doe"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
                      />
                    </div>
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5 ml-1">Posisi / Keterangan</label>
                      <input 
                        type="text" 
                        value={extPos}
                        onChange={e => setExtPos(e.target.value)}
                        placeholder="Cth: Owner / Vendor"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
                      />
                    </div>
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5 ml-1">Departemen</label>
                      <input 
                        type="text" 
                        value={extDept}
                        onChange={e => setExtDept(e.target.value)}
                        placeholder="Cth: Eksternal"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
                      />
                    </div>
                    <button 
                      onClick={handleAddExternalEmployee}
                      disabled={!extName.trim()}
                      className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap h-[42px]"
                    >
                      <Icon name="plus" size={16} />
                      Tambah
                    </button>
                  </div>
                </div>
             </div>
           </div>
        </div>
      )}
      
      <style>{`
        .dot-bg {
          background-image: radial-gradient(#e0e7ff 1.5px, transparent 1.5px);
          background-size: 24px 24px;
        }

        /* Tree Lines using pseudo-elements */
        .org-tree ul {
          padding-top: 36px;
          position: relative;
        }
        .org-tree li {
          float: left;
          text-align: center;
          list-style-type: none;
          position: relative;
          padding: 36px 24px 0 24px;
        }

        /* Vertical connectors between parents and children */
        .org-tree li::before, .org-tree li::after {
          content: '';
          position: absolute;
          top: 0;
          right: 50%;
          border-top: 3px solid #c7d2fe;
          width: 50%;
          height: 36px;
        }
        .org-tree li::after {
          right: auto;
          left: 50%;
          border-left: 3px solid #c7d2fe;
        }

        /* Remove lines for only child */
        .org-tree li:only-child::after, .org-tree li:only-child::before {
          display: none;
        }
        /* Remove space from top if only child */
        .org-tree li:only-child {
          padding-top: 0;
        }

        /* First and last child rules */
        .org-tree li:first-child::before, .org-tree li:last-child::after {
          border: 0 none;
        }
        .org-tree li:last-child::before {
          border-right: 3px solid #c7d2fe;
          border-radius: 0 24px 0 0;
        }
        .org-tree li:first-child::after {
          border-radius: 24px 0 0 0;
        }

        /* Add vertical line down to nodes */
        .org-tree ul ul::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          border-left: 3px solid #c7d2fe;
          width: 0;
          height: 36px;
          margin-left: -1.5px;
        }

        /* Hide top line of root nodes */
        .org-tree > ul {
          padding-top: 0;
        }
        .org-tree > ul > li {
          padding-top: 0;
        }
        .org-tree > ul > li::before, .org-tree > ul > li::after {
          display: none;
        }
      `}</style>
    </div>
  );
}
