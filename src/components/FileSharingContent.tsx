import React, { useState } from 'react';
import { Icon } from './ui/Icon';
import { logActivity } from '../firebase';

type FileType = 'folder' | 'document';

interface FileItem {
  id: string;
  name: string;
  type: FileType;
  itemsCount: number;
  isStarred: boolean;
  colorScheme: 'blue' | 'sky';
  collaborators: string[];
  createdAt: string;
  parentId: string | null;
  fileUrl?: string;
}

const COLORS = {
  blue: { text: 'text-[#314BF5]', bg: 'bg-[#314BF5]', lightBg: 'bg-blue-50/50', border: 'border-[#314BF5]', ring: 'ring-[#314BF5]/20' },
  sky: { text: 'text-sky-500', bg: 'bg-sky-500', lightBg: 'bg-sky-50', border: 'border-sky-500', ring: 'ring-sky-500/20' },
};

const AVATAR_COLORS = ['bg-amber-100 text-amber-700', 'bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700'];

export const FileSharingContent = () => {
  const [items, setItems] = useState<FileItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FileType | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'newest' | 'oldest'>('name-asc');
  const [searchQuery, setSearchQuery] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');

  const currentFolder = items.find(i => i.id === currentFolderId);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    const newItem: FileItem = {
      id: Date.now().toString(),
      name: newItemName.trim(),
      type: 'folder',
      itemsCount: 0,
      isStarred: false,
      colorScheme: 'blue',
      collaborators: ['ME'], 
      createdAt: new Date().toLocaleDateString(),
      parentId: currentFolderId
    };
    
    // Update parent item count if applicable
    const updatedItems = currentFolderId 
      ? items.map(item => item.id === currentFolderId ? { ...item, itemsCount: item.itemsCount + 1 } : item)
      : [...items];

    setItems([newItem, ...(currentFolderId ? updatedItems : items)]);
    logActivity('Folder Dibuat', { nama: newItemName.trim() });
    setIsModalOpen(false);
    setNewItemName('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const newItem: FileItem = {
      id: Date.now().toString(),
      name: file.name,
      type: 'document',
      itemsCount: 1,
      isStarred: false,
      colorScheme: 'sky',
      collaborators: ['ME'],
      createdAt: new Date().toLocaleDateString(),
      parentId: currentFolderId,
      fileUrl: URL.createObjectURL(file)
    };

    // Update parent item count if applicable
    let updatedItems = [...items];
    if (currentFolderId) {
      updatedItems = updatedItems.map(item => 
        item.id === currentFolderId ? { ...item, itemsCount: item.itemsCount + 1 } : item
      );
    }

    setItems([newItem, ...updatedItems]);
    e.target.value = '';
  };

  const toggleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setItems(items.map(item => item.id === id ? { ...item, isStarred: !item.isStarred } : item));
  };
  
  const confirmDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const deleteItem = () => {
     if (!deleteConfirmId) return;
     const id = deleteConfirmId;
     const itemToDelete = items.find(i => i.id === id);
     let updatedItems = items.filter(item => item.id !== id && item.parentId !== id);
     
     if (itemToDelete?.parentId) {
        updatedItems = updatedItems.map(i => i.id === itemToDelete.parentId ? { ...i, itemsCount: Math.max(0, i.itemsCount - 1) } : i);
     }
     
     setItems(updatedItems);
     if (currentFolderId === id) setCurrentFolderId(null);
     setDeleteConfirmId(null);
  };

  const handleItemClick = (item: FileItem) => {
    if (item.type === 'folder') {
      setCurrentFolderId(item.id);
      setSearchQuery('');
    }
  };

  const goBack = () => {
    if (currentFolder) {
      setCurrentFolderId(currentFolder.parentId);
    }
  };

  const breadcrumbs = (() => {
    const path: FileItem[] = [];
    let currentId = currentFolderId;
    while (currentId) {
      const folder = items.find(i => i.id === currentId);
      if (folder) {
        path.unshift(folder);
        currentId = folder.parentId;
      } else {
        break;
      }
    }
    return path;
  })();

  const filteredItems = items.filter(item => {
    const matchFolder = searchQuery ? true : item.parentId === currentFolderId;
    const matchTab = activeTab === 'all' || item.type === activeTab;
    const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchFolder && matchTab && matchSearch;
  }).sort((a, b) => {
    if (a.isStarred && !b.isStarred) return -1;
    if (!a.isStarred && b.isStarred) return 1;

    switch (sortBy) {
      case 'name-asc': return a.name.localeCompare(b.name);
      case 'name-desc': return b.name.localeCompare(a.name);
      case 'newest': return parseInt(b.id) - parseInt(a.id);
      case 'oldest': return parseInt(a.id) - parseInt(b.id);
      default: return 0;
    }
  });

  const typeIconMap = {
    folder: 'folder',
    document: 'file-text'
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden text-slate-800 font-sans border border-slate-100 shadow-sm rounded-[2rem] animate-fadeIn">
      {/* Top Header / Search */}
      <div className="h-[84px] border-b border-slate-100 px-8 flex items-center gap-6 shrink-0 bg-white z-10">
        <div className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-2 -ml-2 rounded-xl transition-colors">
          <div className="w-11 h-11 rounded-xl bg-[#314BF5] text-white flex items-center justify-center shadow-lg shadow-[#314BF5]/25 shrink-0">
            <Icon name="folder" size={20} />
          </div>
          <span className="font-black text-[17px] text-slate-900 tracking-tight whitespace-nowrap">HR Workspace</span>
        </div>

        <div className="w-[1px] h-8 bg-slate-200 shrink-0 mx-2"></div>

        <div className="relative w-full max-w-3xl flex items-center">
          <Icon name="search" size={20} className="absolute left-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search folder or document..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200/60 rounded-xl text-[15px] font-medium focus:outline-none focus:border-[#314BF5] focus:ring-1 focus:ring-[#314BF5]/20 transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar px-8 py-6">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          
          {/* Action Buttons & Current Path */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex items-center gap-2 mr-auto overflow-x-auto no-scrollbar">
              <button 
                onClick={() => setCurrentFolderId(null)}
                className={`flex items-center gap-2 text-[15px] font-bold transition-colors ${!currentFolderId ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Icon name="home" size={18} />
                <span>Documents</span>
              </button>

              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  <Icon name="chevron-right" size={16} className="text-slate-300 shrink-0" />
                  <button 
                    onClick={() => setCurrentFolderId(crumb.id)}
                    className={`text-[15px] font-bold transition-colors whitespace-nowrap ${idx === breadcrumbs.length - 1 ? 'text-slate-800 cursor-default' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Tabs Row (Repositioned Actions Here) */}
          <div className="flex items-center justify-between border-b border-slate-100 mb-6 pb-2">
            <div className="flex items-center gap-8">
              <button 
                onClick={() => setActiveTab('all')}
                className={`text-[13px] font-bold pb-3 -mb-[9px] transition-colors border-b-[3px] ${activeTab === 'all' ? 'text-[#314BF5] border-[#314BF5]' : 'text-slate-500 border-transparent hover:text-slate-700'}`}
              >
                All <span className="text-[11px] font-semibold text-slate-400 ml-1.5">{items.filter(i => i.parentId === currentFolderId || searchQuery).length}</span>
              </button>
              <button 
                onClick={() => setActiveTab('folder')}
                className={`text-[13px] font-bold pb-3 -mb-[9px] transition-colors border-b-[3px] ${activeTab === 'folder' ? 'text-[#314BF5] border-[#314BF5]' : 'text-slate-500 border-transparent hover:text-slate-700'}`}
              >
                Folder <span className="text-[11px] font-semibold text-slate-400 ml-1.5">{items.filter(i => (i.parentId === currentFolderId || searchQuery) && i.type === 'folder').length}</span>
              </button>
              <button 
                onClick={() => setActiveTab('document')}
                className={`text-[13px] font-bold pb-3 -mb-[9px] transition-colors border-b-[3px] ${activeTab === 'document' ? 'text-[#314BF5] border-[#314BF5]' : 'text-slate-500 border-transparent hover:text-slate-700'}`}
              >
                Document <span className="text-[11px] font-semibold text-slate-400 ml-1.5">{items.filter(i => (i.parentId === currentFolderId || searchQuery) && i.type === 'document').length}</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative border border-slate-200 rounded-xl bg-slate-50 shadow-sm hover:bg-slate-100 transition-colors hidden sm:flex mr-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="appearance-none bg-transparent pl-4 pr-10 py-2.5 text-[13px] font-bold text-slate-600 focus:outline-none cursor-pointer"
                >
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
                <Icon name="chevron-down" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              <div className="flex items-center gap-2 bg-white border border-slate-200 p-1 rounded-xl shadow-sm mr-2">
                <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2.5 px-4 py-2 rounded-lg hover:bg-blue-50 text-[#314BF5] transition-all font-bold text-[13px]">
                  <Icon name="folder-plus" size={16} /> New Folder
                </button>
                <div className="w-[1px] h-5 bg-slate-200 mx-1"></div>
                <button 
                  onClick={() => document.getElementById('file-upload')?.click()} 
                  className="flex items-center gap-2.5 px-4 py-2 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-all font-bold text-[13px]"
                >
                  <Icon name="upload-cloud" size={16} /> Upload
                </button>
                <input 
                  type="file" 
                  id="file-upload" 
                  className="hidden" 
                  onChange={handleFileUpload} 
                />
              </div>

              <div className="flex items-center gap-1 border border-slate-200 rounded-xl p-1 bg-slate-50 shadow-sm">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white text-[#314BF5] shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-500 border border-transparent'}`}
                >
                  <Icon name="layout-grid" size={16} />
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white text-[#314BF5] shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-500 border border-transparent'}`}
                >
                  <Icon name="list" size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto hide-scrollbar pb-8 relative">
            {filteredItems.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-70">
                <div className="w-28 h-28 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                  <Icon name={activeTab === 'folder' ? 'folder' : activeTab === 'document' ? 'file-text' : 'folder'} size={48} className="text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-600 mb-2">No files or folders found</h3>
                <p className="text-[13px] text-slate-400 max-w-[280px] text-center mb-8">
                  {searchQuery ? `We couldn't find anything matching "${searchQuery}"` : currentFolderId ? "This folder is empty. Upload files or create a subfolder." : "Get started by creating a new folder or uploading a file."}
                </p>
                {!searchQuery && (
                  <button onClick={() => setIsModalOpen(true)} className="px-6 py-3 bg-[#314BF5] text-white rounded-xl text-sm font-bold hover:bg-[#283EDB] transition-colors shadow-md shadow-blue-500/20">
                    Create New Folder
                  </button>
                )}
              </div>
            ) : viewMode === 'grid' ? (
                 // GRID VIEW
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                    {filteredItems.map(item => (
                       <div 
                         key={item.id} 
                         onClick={() => handleItemClick(item)}
                          className={`bg-white border rounded-2xl p-5 h-[230px] flex flex-col justify-between transition-all cursor-pointer group shadow-sm hover:shadow-md ${COLORS[item.colorScheme].border} ${COLORS[item.colorScheme].ring}`}
                       >
                          <div className="flex items-start justify-between">
                             <button onClick={(e) => toggleStar(e, item.id)} className={`p-1.5 rounded-full transition-colors ${item.isStarred ? 'text-amber-400 hover:bg-amber-50' : 'text-slate-300 hover:text-slate-400 hover:bg-slate-50'}`}>
                                <Icon name="star" size={18} className={item.isStarred ? "fill-current" : ""} />
                             </button>
                             <div className="flex items-center transition-opacity">
                               {item.type === 'document' && (
                                 <a href={item.fileUrl || '#'} download={item.name} onClick={(e) => { e.stopPropagation(); if(!item.fileUrl) { e.preventDefault(); alert('Modul demo: File nyata belum diunggah.'); } }} className="p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-500 rounded-full transition-colors mr-1" title="Download">
                                   <Icon name="download-cloud" size={18} />
                                 </a>
                               )}
                               <button onClick={(e) => confirmDelete(e, item.id)} className="p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-500 rounded-full transition-colors" title="Delete">
                                  <Icon name="trash-2" size={18} />
                               </button>
                             </div>
                          </div>
                          
                          <div className={`flex items-center justify-center -mt-4`}>
                             <div className={`w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center rounded-2xl ${COLORS[item.colorScheme].bg} text-white shadow-lg transform group-hover:-translate-y-2 group-hover:scale-105 transition-all duration-300`}>
                               <Icon name={typeIconMap[item.type] as any} size={36} strokeWidth={2.5} />
                             </div>
                          </div>

                          <div className="flex items-end justify-between mt-4">
                             <div className="flex-1 truncate">
                                <h3 className="font-extrabold text-slate-800 text-[15px] mb-1 truncate group-hover:text-[#314BF5] transition-colors">{item.name}</h3>
                                <p className="text-[11px] font-bold text-slate-400 capitalize tracking-wide">{item.type} • {item.itemsCount} item{item.itemsCount !== 1 ? 's' : ''}</p>
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>
               ) : (
                 // LIST VIEW
                 <div className="flex flex-col gap-3 pb-20">
                   <div className="grid grid-cols-12 gap-4 px-6 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                     <div className="col-span-6">Name</div>
                     <div className="col-span-3">Date Modified</div>
                     <div className="col-span-2">Items</div>
                     <div className="col-span-1 text-center">Action</div>
                   </div>
                   {filteredItems.map(item => (
                     <div 
                        key={item.id} 
                        onClick={() => handleItemClick(item)}
                        className="grid grid-cols-12 gap-4 items-center bg-white border border-slate-100 hover:border-slate-300 hover:border-[#314BF5]/40 shadow-sm hover:shadow-md px-6 py-4 rounded-xl transition-all cursor-pointer group"
                     >
                       <div className="col-span-6 flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${COLORS[item.colorScheme].lightBg} ${COLORS[item.colorScheme].text}`}>
                            <Icon name={typeIconMap[item.type] as any} size={20} />
                          </div>
                          <div className="flex flex-col truncate pr-4">
                            <span className="font-extrabold text-slate-800 text-sm truncate group-hover:text-[#314BF5]">{item.name}</span>
                            <span className="text-xs font-semibold text-slate-400 capitalize">{item.type}</span>
                          </div>
                       </div>
                       <div className="col-span-3 text-sm font-medium text-slate-500">{item.createdAt}</div>
                       <div className="col-span-2 text-sm font-medium text-slate-500">{item.itemsCount}</div>
                       <div className="col-span-1 flex items-center justify-center gap-1 transition-opacity">
                         <button onClick={(e) => toggleStar(e, item.id)} className={`p-1.5 rounded-lg transition-colors ${item.isStarred ? 'text-amber-400 hover:bg-amber-50' : 'text-slate-400 hover:bg-slate-100'}`} title={item.isStarred ? "Unstar" : "Star"}>
                            <Icon name="star" size={16} className={item.isStarred ? "fill-current" : ""} />
                         </button>
                         {item.type === 'document' && (
                           <a href={item.fileUrl || '#'} download={item.name} onClick={(e) => { e.stopPropagation(); if(!item.fileUrl) { e.preventDefault(); alert('Modul demo: File nyata belum diunggah.'); } }} className="p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-500 rounded-lg transition-colors" title="Download">
                             <Icon name="download-cloud" size={16} />
                           </a>
                         )}
                         <button onClick={(e) => confirmDelete(e, item.id)} className="p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors" title="Delete">
                            <Icon name="trash-2" size={16} />
                         </button>
                       </div>
                     </div>
                   ))}
                 </div>
               )}

            </div>
         </div>

      </div>

      {/* Add New Folder Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center animate-fadeIn" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl animate-slideUp" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md bg-[#314BF5]">
                <Icon name="folder" size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-800">New Folder</h2>
            </div>
            
            <form onSubmit={handleAddItem}>
              <div className="mb-6">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Folder Name</label>
                <input 
                  type="text" 
                  autoFocus
                  required
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="e.g. Project Files"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#314BF5] focus:ring-1 focus:ring-[#314BF5]/20 font-medium text-slate-800 placeholder:text-slate-400 input-no-zoom"
                />
              </div>
              
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 px-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button type="submit" className="flex-1 py-3 px-4 text-white font-bold rounded-xl transition-colors shadow-md bg-[#314BF5] hover:bg-blue-700">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center animate-fadeIn" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl animate-slideUp" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mb-4">
                <Icon name="alert-triangle" size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Delete Item?</h2>
              <p className="text-sm text-slate-500 mb-8">
                Are you sure you want to delete this {items.find(i => i.id === deleteConfirmId)?.type}? This action cannot be undone.
              </p>
              
              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => setDeleteConfirmId(null)} 
                  className="flex-1 py-3 px-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={deleteItem} 
                  className="flex-1 py-3 px-4 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-colors shadow-md"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
