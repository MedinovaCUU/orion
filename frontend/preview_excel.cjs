const xlsx = require('xlsx');

function peek(file) {
  try {
    console.log('--- File:', file, '---');
    const wb = xlsx.readFile('../' + file);
    wb.SheetNames.forEach(sheetName => {
      console.log('Sheet:', sheetName);
      const ws = wb.Sheets[sheetName];
      const json = xlsx.utils.sheet_to_json(ws, { header: 1 });
      console.log('Headers:', json[0]);
      console.log('Row 1:', json[1]);
      console.log('\n');
    });
  } catch (e) {
    console.error('Error reading', file, e.message);
  }
}

peek('Copia de Tablas tipo avería nueva Env_ITv3_MX (002).xlsx');
peek('Servicios_analizado.xlsx');
