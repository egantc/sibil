// Read-only contract adapter for an isolated Sibil application copy.
// rows must come from an authorized backend; never expose database secrets.
export const months = 'JANUARI FEBRUARI MARET APRIL MEI JUNI JULI AGUSTUS SEPTEMBER OKTOBER NOVEMBER DESEMBER'.split(' ');
export function dashboard(rows, month) {
  const selected = months.indexOf(month);
  if (selected < 0) throw new Error('Invalid month');
  const sorted = [...rows.customers].sort((a,b) => a.source_row-b.source_row);
  const cells = new Map();
  const customerRows = new Set(sorted.map(c=>c.source_row));
  if(customerRows.size !== sorted.length) throw new Error('Duplicate customer identity');
  for(const s of rows.statuses) {
    const key = `${s.source_row}:${s.month}`;
    if(!customerRows.has(s.source_row) || !Number.isInteger(s.month) || s.month<1 || s.month>12 || !['CASH','TRANSFER','DISCOUNT','UNPAID'].includes(s.status) || cells.has(key)) throw new Error('Invalid or duplicate status');
    cells.set(key,s.status);
  }
  if(cells.size !== sorted.length*12) throw new Error('Incomplete monthly history');
  const customers = sorted.map(c=>({row:c.source_row,name:c.name,status:cells.get(`${c.source_row}:${selected+1}`)==='UNPAID'?'FALSE':cells.get(`${c.source_row}:${selected+1}`)}));
  const names = status => customers.filter(c=>c.status===status).map(c=>c.name);
  const cashList=names('CASH'),transferList=names('TRANSFER'),discountList=names('DISCOUNT'),belumList=names('FALSE');
  const total=customers.length, sudahCount=cashList.length+transferList.length;
  const stats=months.map((m,i)=>{const paid=sorted.filter(c=>['CASH','TRANSFER'].includes(cells.get(`${c.source_row}:${i+1}`))).length;return {month:m,percentage:total?Math.round(paid/total*100):0,text:`${paid}/${total}`};});
  return {selectedMonth:month,months,total,sudahCount,cashCount:cashList.length,transferCount:transferList.length,discountCount:discountList.length,discountList,belumCount:belumList.length,persentase:total?Math.round(sudahCount/total*100):0,cashList,transferList,belumList,allCustomers:customers.map(c=>c.name),customers,stats};
}

