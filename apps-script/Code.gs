// Login and spreadsheet settings belong in Script Properties, never in source.
function config_(){var p=PropertiesService.getScriptProperties().getProperties();['SPREADSHEET_ID','ADMIN_USERNAME','ADMIN_PASSWORD'].forEach(function(k){if(!p[k]||!p[k].trim())bad('Isi '+k+' di Project Settings → Script Properties.',503);});if(p.ADMIN_PASSWORD.length<6)bad('Password minimal 6 karakter.',503);if(!/^[A-Za-z0-9_-]+$/.test(p.SPREADSHEET_ID))bad('SPREADSHEET_ID harus ID saja, bukan URL.',503);return p;}
function sheet_(){var p=config_();var sh=SpreadsheetApp.openById(p.SPREADSHEET_ID).getSheetByName(p.SHEET_NAME||'Pembayaran 2026');if(!sh)bad('Tab '+(p.SHEET_NAME||'Pembayaran 2026')+' tidak ditemukan.',503);return sh;}
// Optional editor check. This function reads only; it never creates tabs.
function setupSibil(){var sh=sheet_();console.log('Tab pembayaran ditemukan; baris: '+sh.getLastRow());}
function json_(v){return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON);}
function digest_(v){return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,v,Utilities.Charset.UTF_8));}
function equal_(a,b){var x=digest_(a),y=digest_(b),d=0;for(var i=0;i<x.length;i++)d|=x.charCodeAt(i)^y.charCodeAt(i);return d===0;}
function doGet(){return json_({ok:true,service:'Sibil legacy-sheet API',version:2});}
function doPost(e){var lock=LockService.getScriptLock(),locked=false;try{
 if(!e||!e.postData||e.postData.contents.length>100000)bad('Request tidak valid');
 var r=JSON.parse(e.postData.contents),b=r.body||{},cache=CacheService.getScriptCache();
 lock.waitLock(30000);locked=true;
 if(r.action==='login'){
  var p=config_(),rate=JSON.parse(cache.get('login-rate')||'{"count":0,"until":0}');if(rate.until<Date.now())rate={count:0,until:Date.now()+900000};if(rate.count>=20)bad('Terlalu banyak percobaan. Tunggu 15 menit.',429);
  if(typeof b.username!=='string'||typeof b.password!=='string'||b.password.length>512)bad('Input login tidak valid');
  if(!equal_(b.password,p.ADMIN_PASSWORD)||b.username!==p.ADMIN_USERNAME){rate.count++;cache.put('login-rate',JSON.stringify(rate),900);bad('Username atau password salah.',401);}
  var token=Utilities.getUuid()+Utilities.getUuid();cache.put('session:'+digest_(token),'active',21600);return json_({ok:true,data:{token:token}});
 }
 if(typeof r.token!=='string'||r.token.length>200||!cache.get('session:'+digest_(r.token)))bad('Silakan login',401);
 if(r.action==='logout'){cache.remove('session:'+digest_(r.token));return json_({ok:true,data:{}});}
 if(r.action==='dashboard'){var data=dashboard_(b.month||'');if(data.error)bad(data.error,503);return json_({ok:true,data:data});}
 if(r.action==='update')return json_({ok:true,data:update_(b)});
 bad('Action tidak dikenal',404);
 }catch(err){if(!err.status)console.error(err.name+': '+err.message);return json_({ok:false,status:err.status||500,error:err.status?err.message:'Gagal mengakses spreadsheet. Jalankan setupSibil di editor dan periksa izin akun deployment. Jika sedang menyimpan, periksa sel sebelum mencoba lagi.'});}finally{if(locked)lock.releaseLock();}}
function update_(b){
 if(!Number.isInteger(b.row)||b.row<4||typeof b.name!=='string'||typeof b.month!=='string'||!['CASH','TRANSFER','FALSE'].includes(b.status))bad('Input pembayaran tidak valid');
 var sh=sheet_();if(b.row>sh.getLastRow())bad('Data berubah. Muat ulang dashboard.',409);
 var name=String(sh.getRange(b.row,2).getValue()).trim();if(name!==b.name)bad('Urutan pelanggan berubah. Muat ulang sebelum menyimpan.',409);
 var allowed=['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];var month=b.month.trim().toUpperCase();if(allowed.indexOf(month)===-1)bad('Bulan tidak valid');
 var headers=sh.getRange(3,3,1,Math.max(1,sh.getLastColumn()-2)).getValues()[0];var matches=[];headers.forEach(function(v,i){if(String(v).trim().toUpperCase()===month)matches.push(i+3);});if(matches.length!==1)bad('Kolom bulan hilang atau duplikat. Periksa baris 3.',409);
 sh.getRange(b.row,matches[0]).setValue(b.status==='FALSE'?false:b.status);SpreadsheetApp.flush();return {message:'Status pembayaran '+name+' berhasil disimpan.'};
}
function bad(message,status=400){throw Object.assign(Error(message),{status});}
function dashboard_(selectedMonthName) {
  try {
    var sheet = sheet_();
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    
    if (lastRow < 4) {
      return { error: "Belum ada data pelanggan di baris ke-4 ke bawah." };
    }
    
    // 1. AMBIL SELURUH DATA SPREADSHEET SEKALIGUS KE MEMORI (Kunci Kecepatan)
    var allDataMatrix = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    
    // Header Bulan ada di Baris 3 (Index 2 di JavaScript), mulai Kolom C (Index 2)
    var headersRaw = allDataMatrix[2].slice(2);
    var monthsList = [];
    
    // VALIDASI: Hanya ambil kolom JANUARI sampai DESEMBER. Abaikan kolom rumus di kanannya.
    var allowedMonths = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "OKTOBER ", "NOVEMBER", "DESEMBER"];
    
    for (var h = 0; h < headersRaw.length; h++) {
      var val = headersRaw[h].toString().trim().toUpperCase();
      if (allowedMonths.indexOf(val) !== -1) {
        monthsList.push(headersRaw[h].toString().trim());
      }
    }

    if (monthsList.length === 0) {
      return { error: "Tidak ditemukan kolom nama bulan (JANUARI-DESEMBER) pada baris ke-3!" };
    }
    
    // LOGIKA AUTO-PILIH BULAN BERJALAN SAAT INI
    if (!selectedMonthName || selectedMonthName === "Memuat data bulan..." || selectedMonthName === "") {
      var dateNow = new Date();
      var monthIndex = Number(Utilities.formatDate(dateNow,"Asia/Jakarta","M"))-1; // 0 = Jan, 4 = Mei, dst.
      var indonesianMonths = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
      var currentMonthString = indonesianMonths[monthIndex];
      
      var foundMatch = monthsList.find(function(m) {
        return m.toUpperCase() === currentMonthString;
      });
      
      selectedMonthName = foundMatch ? foundMatch : monthsList[0];
    }
    
    // Cari indeks kolom internal matrix untuk bulan yang dipilih
    var targetColMatrixIndex = -1;
    for (var i = 0; i < headersRaw.length; i++) {
      if (headersRaw[i].toString().trim().toUpperCase() === selectedMonthName.toUpperCase()) {
        targetColMatrixIndex = i + 2; // karena kolom C adalah index ke-2 di slice/matrix
        break;
      }
    }
    
    if (targetColMatrixIndex === -1) {
      selectedMonthName = monthsList[0];
      for (var i = 0; i < headersRaw.length; i++) {
        if (headersRaw[i].toString().trim().toUpperCase() === selectedMonthName.toUpperCase()) {
          targetColMatrixIndex = i + 2;
          break;
        }
      }
    }
    
    var listCash = [];
    var listTransfer = [];
    var listBelum = [];
    var allCustomers = [];
    var customers = [];
    var totalPelanggan = 0;
    
    // Looping data mulai Baris ke-4 (Index 3 di JavaScript)
    for (var j = 3; j < allDataMatrix.length; j++) {
      var name = allDataMatrix[j][1].toString().trim(); // Kolom B (Index 1)
      if (name === "") continue;
      
      totalPelanggan++;
      allCustomers.push(name);
      customers.push({row:j+1,name:name});
      
      var status = (allDataMatrix[j][targetColMatrixIndex] !== undefined) ? allDataMatrix[j][targetColMatrixIndex].toString().toUpperCase().trim() : "FALSE";
      
      if (status === "CASH" || status === "TRUE") {
        listCash.push(name);
      } else if (status === "TRANSFER") {
        listTransfer.push(name);
      } else {
        listBelum.push(name);
      }
    }
    
    // HITUNG STATISTIK TREN TAHUNAN DARI MEMORI (Bukan dari Spreadsheet lagi, jauh lebih cepat)
    var monthlyStats = [];
    for (var k = 0; k < headersRaw.length; k++) {
      var mName = headersRaw[k].toString().trim();
      if (allowedMonths.indexOf(mName.toUpperCase()) === -1) continue; // Abaikan rumus di kanan desember
      
      var currentLoopColIndex = k + 2;
      var paidCount = 0;
      var totalCount = 0;
      
      for (var n = 3; n < allDataMatrix.length; n++) {
        if (allDataMatrix[n][1].toString().trim() !== "") {
          totalCount++;
          var valStr = (allDataMatrix[n][currentLoopColIndex] !== undefined) ? allDataMatrix[n][currentLoopColIndex].toString().toUpperCase().trim() : "FALSE";
          if (valStr === "CASH" || valStr === "TRANSFER" || valStr === "TRUE") {
            paidCount++;
          }
        }
      }
      var pct = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;
      monthlyStats.push({ month: mName, percentage: pct, text: paidCount + "/" + totalCount });
    }
    
    var totalSudah = listCash.length + listTransfer.length;
    
    return {
      selectedMonth: selectedMonthName,
      months: monthsList,
      total: totalPelanggan,
      sudahCount: totalSudah,
      cashCount: listCash.length,
      transferCount: listTransfer.length,
      belumCount: listBelum.length,
      persentase: totalPelanggan > 0 ? Math.round((totalSudah / totalPelanggan) * 100) : 0,
      cashList: listCash,
      transferList: listTransfer,
      belumList: listBelum,
      allCustomers: allCustomers,
      customers: customers,
      stats: monthlyStats
    };
    
  } catch(err) {
    return { error: err.message };
  }
}

