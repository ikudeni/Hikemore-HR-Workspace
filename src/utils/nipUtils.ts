export const generateNIP = (joinDate: string, dept: string = '', status: string = '', existingRand: string = '', employees: any[] = []) => {
  let year = '00';
  let month = '00';
  if (joinDate) {
    const d = new Date(joinDate);
    if (!isNaN(d.getTime())) {
      year = d.getFullYear().toString().slice(-2);
      month = (d.getMonth() + 1).toString().padStart(2, '0');
    }
  }
  
  let deptCode = 'OTH';
  const deptLower = (dept || '').toLowerCase();
  
  if (deptLower.includes('hr') || deptLower.includes('human') || deptLower.includes('sdm')) deptCode = 'HR';
  else if (deptLower.includes('marketing') || deptLower.includes('pemasaran')) deptCode = 'MKT';
  else if (deptLower.includes('toko') || deptLower.includes('store')) deptCode = 'STR';
  else if (deptLower.includes('sales') || deptLower.includes('operasional')) deptCode = 'SLS';
  else if (deptLower.includes('warehouse') || deptLower.includes('gudang') || deptLower.includes('inventory')) deptCode = 'WHS';
  else if (deptLower.includes('finance') || deptLower.includes('accounting') || deptLower.includes('keuangan')) deptCode = 'ACC';
  else if (deptLower.includes('business dev') || deptLower.includes('bd')) deptCode = 'BD';
  else if (deptLower.includes('design') || deptLower.includes('produksi')) deptCode = 'PRD';
  else if (deptLower.includes('it') || deptLower.includes('tech') || deptLower.includes('engineer')) deptCode = 'IT';
  else if (dept && dept.length >= 2) deptCode = dept.substring(0, 3).toUpperCase();

  let statusCode = '';
  const statusLower = (status || '').toLowerCase();
  
  if (statusLower.includes('karyawan') || statusLower.includes('tetap') || statusLower.includes('permanen')) statusCode = '01';
  else if (statusLower.includes('daily worker') || statusLower.includes('dw') || statusLower.includes('harian')) statusCode = '02';
  else if (statusLower.includes('magang') || statusLower.includes('intern')) statusCode = '03';
  else if (statusLower.includes('outsource') || statusLower.includes('os')) statusCode = '04';
  else if (statusLower.includes('freelance') || statusLower.includes('lepas')) statusCode = '05';
  else {
    let highestCustomCode = 5;
    let foundCode = '';
    
    for (const emp of employees) {
      const empStatusLower = (emp.status || '').toLowerCase();
      
      const isCustom = empStatusLower && 
        !empStatusLower.includes('karyawan') && !empStatusLower.includes('tetap') && !empStatusLower.includes('permanen') &&
        !empStatusLower.includes('daily worker') && !empStatusLower.includes('dw') && !empStatusLower.includes('harian') &&
        !empStatusLower.includes('magang') && !empStatusLower.includes('intern') &&
        !empStatusLower.includes('outsource') && !empStatusLower.includes('os') &&
        !empStatusLower.includes('freelance') && !empStatusLower.includes('lepas') &&
        !empStatusLower.includes('kontrak') && !empStatusLower.includes('probation');

      if (isCustom && emp.nip) {
        const parts = emp.nip.split('-');
        if (parts.length >= 4) {
          const codeStr = parts[2];
          const codeNum = parseInt(codeStr, 10);
          
          if (!isNaN(codeNum) && codeNum > highestCustomCode && codeNum !== 99) {
            highestCustomCode = codeNum;
          }
          
          if (empStatusLower === statusLower && codeStr !== '99') {
            foundCode = codeStr;
          }
        }
      }
    }
    
    if (foundCode) {
      statusCode = foundCode;
    } else {
      highestCustomCode++;
      statusCode = highestCustomCode.toString().padStart(2, '0');
    }
  }

  const rand = existingRand || Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${year}${month}-${deptCode}-${statusCode}-${rand}`;
};
