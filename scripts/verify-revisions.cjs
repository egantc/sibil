// All requests are intercepted: no production customer data is read or written.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 fs.mkdirSync('output/playwright',{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{for(const width of [375,768,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  const customers=Array.from({length:56},(_,i)=>({name:'Pelanggan '+String(i+1).padStart(2,'0'),row:i+4,status:i<20?'CASH':i<30?'TRANSFER':i<34?'DISCOUNT':'FALSE'}));
  let failLoad=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',async route=>{
   if(!route.request().url().startsWith('https://script.google.com/'))return route.abort();
   const q=route.request().postDataJSON();let data={};
   if(q.action==='login')data={token:'mock-session'};
   else{
    assert.equal(q.token,'mock-session');
    if(q.action==='dashboard'){
     if(failLoad)return route.fulfill({json:{ok:false,status:503,error:'Mock unavailable'}});
     const count=s=>customers.filter(c=>c.status===s).length;
     const paid=count('CASH')+count('TRANSFER');
     data={selectedMonth:q.body.month||'NOVEMBER',months:['JANUARI','NOVEMBER'],total:customers.length,cashCount:count('CASH'),transferCount:count('TRANSFER'),discountCount:count('DISCOUNT'),belumCount:count('FALSE'),persentase:Math.round(paid/customers.length*100),customers,cashList:[],transferList:[],discountList:[],stats:[{month:'NOVEMBER',percentage:Math.round(paid/customers.length*100),text:paid+'/'+customers.length}]};
    }else if(q.action==='update'){
     const customer=customers.find(c=>c.row===q.body.row);assert.equal(customer.name,q.body.name);customer.status=q.body.status;data={message:'Pembayaran berhasil disimpan.'};
    }else if(q.action==='addCustomer'){
     if(customers.some(c=>c.name===q.body.name))return route.fulfill({json:{ok:false,status:409,error:'Nama pelanggan sudah ada.'}});
     customers.push({name:q.body.name,row:customers.length+4,status:'FALSE'});data={message:'Pelanggan berhasil ditambahkan.'};
    }
   }
   return route.fulfill({json:{ok:true,data}});
  });
  await page.goto('http://127.0.0.1:8765');await page.locator('#username').fill('mock');await page.locator('#password').fill('mock');await page.locator('#loginButton').click();
  await page.locator('#count').filter({hasText:'56 dari 56'}).waitFor();
  assert.equal(await page.locator('.table tbody tr').count(),10);
  assert.match(await page.locator('.table tbody tr').first().innerText(),/Pelanggan 35/);
  assert.equal(await page.locator('#donutValue').innerText(),'54%');assert.equal(await page.locator('#discountCount').innerText(),'4');
  const gradient=await page.locator('#donut').evaluate(el=>getComputedStyle(el).backgroundImage);
  assert.match(gradient,/189, 68, 63/);assert.match(gradient,/214, 155, 46/);
  for(const n of ['25','50']){await page.locator('#pageSize').selectOption(n);assert.equal(await page.locator('.table tbody tr').count(),Number(n));}
  await page.locator('#nextPage').click();assert.equal(await page.locator('.table tbody tr').count(),6);
  await page.locator('#filter').selectOption('DISCOUNT');assert.equal(await page.locator('.table tbody tr').count(),4);assert.equal(await page.locator('#pageInfo').innerText(),'Halaman 1 dari 1');
  await page.locator('#filter').selectOption('ALL');await page.locator('#search').fill('Pelanggan 35');await page.locator('.row-action').click();
  assert.equal(await page.locator('#status option[value="DISCOUNT"]').count(),1);
  await page.locator('#status').selectOption('DISCOUNT');await page.locator('#saveButton').click();await page.locator('#editor').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#customerList').getAttribute('aria-busy')==='false');
  assert.match(await page.locator('.table tbody tr').innerText(),/Diskon/);assert.equal(await page.locator('#discount').innerText(),'5');assert.equal(await page.locator('#percentage').innerText(),'54%');
  await page.locator('#addCustomer').click();await page.locator('#newName').fill('Pelanggan 01');await page.locator('#saveCustomer').click();await page.locator('#addError').filter({hasText:'sudah ada'}).waitFor();
  await page.locator('#newName').fill('Pelanggan Baru');await page.locator('#saveCustomer').click();await page.locator('#addEditor').waitFor({state:'hidden'});await page.locator('#count').filter({hasText:'57 dari 57'}).waitFor();
  assert.equal(await page.locator('#search').inputValue(),'');assert.equal(await page.locator('#filter').inputValue(),'ALL');
  await page.locator('#search').fill('Pelanggan Baru');assert.match(await page.locator('.table tbody tr').innerText(),/Belum bayar/);
  await page.locator('#search').fill('');await page.locator('#pageSize').selectOption('10');await page.screenshot({path:`output/playwright/revisions-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  failLoad=true;await page.locator('#refresh').click();await page.locator('#feedback').filter({hasText:'Mock unavailable'}).waitFor();assert.equal(await page.locator('#discount').innerText(),'—');assert.equal(await page.locator('#pagination').isVisible(),false);
  failLoad=false;await page.locator('#refresh').click();await page.locator('#count').filter({hasText:'57 dari 57'}).waitFor();
  console.log(`PASS ${width}px: unpaid first, 10/25/50 pagination, discount save, duplicate rejection, add customer, chart colors, failed-load reset, responsive layout`);await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
