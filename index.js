const { create } = require('@open-wa/wa-automate');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

function cariLokasiChrome() {
  const daftarPath = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of daftarPath) {
    if (fs.existsSync(p)) return p;
  }
  return daftarPath[0];
}

function ekstrakKontak(teks) {
  const regexEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const regexHP = /(?:\+62|62|08|02[0-9]|03[0-9]|06[0-9])[\s.\-]?[0-9]{2,4}[\s.\-]?[0-9]{3,4}[\s.\-]?[0-9]{2,5}/g;

  const emailRaw = teks.match(regexEmail) || [];
  const daftarEmail = [...new Set(
    emailRaw
      .map(e => e.toLowerCase())
      .filter(e => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.webp') && !e.endsWith('.svg') && !e.endsWith('.gif') && !e.includes('sentry') && !e.includes('wixpress') && !e.includes('example.com'))
  )];

  const hpRaw = teks.match(regexHP) || [];
  const daftarHP = [...new Set(
    hpRaw
      .map(no => no.replace(/[\s.\-]/g, ''))
      .filter(no => no.length >= 9 && no.length <= 15)
  )];

  return { daftarEmail, daftarHP };
}

async function jalankanBrowserAgent(keyword) {
  const hasilAkhir = [];
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: cariLokasiChrome(),
      headless: false,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1200,800'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

    const query = `${keyword} kontak telepon whatsapp email "@gmail.com" OR "08"`;
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id&num=12`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });

    await new Promise(r => setTimeout(r, 2000));

    let kandidat = await page.evaluate(() => {
      const data = [];
      const blokHasil = document.querySelectorAll('div.g, div.MjjYud');
      blokHasil.forEach(el => {
        const h3 = el.querySelector('h3');
        const a = el.querySelector('a');
        if (h3 && a && a.href && a.href.startsWith('http') && !a.href.includes('google.com')) {
          data.push({
            nama: h3.innerText.trim(),
            link: a.href,
            cuplikan: el.innerText.trim()
          });
        }
      });
      return data;
    });

    if (kandidat.length === 0) {
      await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });
      await new Promise(r => setTimeout(r, 2000));

      kandidat = await page.evaluate(() => {
        const data = [];
        const blokBing = document.querySelectorAll('li.b_algo');
        blokBing.forEach(el => {
          const h2 = el.querySelector('h2');
          const a = el.querySelector('h2 a');
          if (h2 && a && a.href && a.href.startsWith('http')) {
            data.push({
              nama: h2.innerText.trim(),
              link: a.href,
              cuplikan: el.innerText.trim()
            });
          }
        });
        return data;
      });
    }

    const linkUnik = new Set();
    const daftarTarget = [];
    for (const item of kandidat) {
      if (!linkUnik.has(item.link) && daftarTarget.length < 8) {
        linkUnik.add(item.link);
        daftarTarget.push(item);
      }
    }

    for (const item of daftarTarget) {
      let teksHalaman = `${item.nama} ${item.cuplikan}`;

      try {
        await page.goto(item.link, { waitUntil: 'domcontentloaded', timeout: 8000 });
        await new Promise(r => setTimeout(r, 1000));

        const isiWeb = await page.evaluate(() => {
          let ekstra = '';
          document.querySelectorAll('a[href^="mailto:"], a[href^="tel:"], a[href*="wa.me"], a[href*="whatsapp.com"]').forEach(a => {
            ekstra += ' ' + a.href;
          });
          return document.body.innerText + ' ' + ekstra;
        });

        teksHalaman += ' ' + isiWeb;
      } catch (e) {}

      const { daftarEmail, daftarHP } = ekstrakKontak(teksHalaman);

      hasilAkhir.push({
        nama: item.nama.replace(/[\r\n]+/g, ' '),
        hp: daftarHP.length > 0 ? daftarHP.slice(0, 4).join(' / ') : 'Tidak tercantum',
        email: daftarEmail.length > 0 ? daftarEmail.slice(0, 4).join(' / ') : 'Tidak tercantum',
        deskripsi: item.cuplikan.replace(/[\r\n]+/g, ' ').slice(0, 180),
        url: item.link
      });
    }

    await browser.close();
  } catch (err) {
    console.error('Error Browser Agent:', err.message);
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }

  return hasilAkhir;
}

function buatFileCSV(keyword, data) {
  const namaFile = `Data_Agent_${keyword.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
  const lokasiFile = path.join(__dirname, namaFile);

  let isiCSV = 'No,Nama Perusahaan / Web,Nomor HP / Telepon,Email / Gmail,Ringkasan Info,Link Website\n';
  data.forEach((item, idx) => {
    const namaBersih = `"${item.nama.replace(/"/g, '""')}"`;
    const hpBersih = `"${item.hp}"`;
    const emailBersih = `"${item.email}"`;
    const deskripsiBersih = `"${item.deskripsi.replace(/"/g, '""')}"`;
    const urlBersih = `"${item.url}"`;
    isiCSV += `${idx + 1},${namaBersih},${hpBersih},${emailBersih},${deskripsiBersih},${urlBersih}\n`;
  });

  fs.writeFileSync(lokasiFile, isiCSV, 'utf8');
  return { lokasiFile, namaFile };
}

function start(client) {
  console.log('====================================================');
  console.log('BOT WHATSAPP + BROWSER AGENT SIAP DIGUNAKAN!');
  console.log('====================================================');

  client.onAnyMessage(async (message) => {
    const pesanAsli = message.body ? message.body.trim() : '';
    const pesan = pesanAsli.toLowerCase();
    const targetChat = message.fromMe ? message.to : message.from;

    if (pesanAsli.startsWith('🤖') || pesanAsli.startsWith('*📊 HASIL BROWSER AGENT')) return;

    if (pesan === 'p' || pesan === 'ping' || pesan === 'tes') {
      await client.sendText(
        targetChat,
        '🤖 *Bot Browser Agent Aktif!*\n\nKetik:\n*!cari [kata kunci]*\n\nContoh:\n👉 *!cari perusahaan makanan beku*'
      );
      return;
    }

    if (pesan.startsWith('!cari ')) {
      const keyword = pesanAsli.slice(6).trim();

      if (!keyword) {
        await client.reply(targetChat, '🤖 Masukkan kata kunci! Contoh: *!cari perusahaan makanan beku*', message.id);
        return;
      }

      console.log(`[AGENT MULAI] Membuka Browser Agent untuk mencari: "${keyword}"...`);
      await client.reply(
        targetChat,
        `🤖 🌐 Menjalankan *Browser Agent* untuk mencari: *"${keyword}"*...\nBrowser sedang membuka Google & memindai website perusahaan satu per satu. Tunggu sekitar 15-25 detik.`,
        message.id
      );

      const hasil = await jalankanBrowserAgent(keyword);

      if (hasil.length === 0) {
        await client.sendText(targetChat, '🤖 ❌ Browser Agent tidak menemukan hasil. Coba kata kunci lain.');
        return;
      }

      let teksLaporan = `*📊 HASIL BROWSER AGENT: ${keyword.toUpperCase()}*\nTotal ditemukan: ${hasil.length} perusahaan\n\n`;

      hasil.forEach((item, index) => {
        teksLaporan += `*${index + 1}. ${item.nama}*\n`;
        teksLaporan += `📞 Telp/WA: ${item.hp}\n`;
        teksLaporan += `📧 Email: ${item.email}\n`;
        teksLaporan += `🌐 Web: ${item.url}\n\n`;
      });

      await client.sendText(targetChat, teksLaporan);

      try {
        const { lokasiFile, namaFile } = buatFileCSV(keyword, hasil);
        await client.sendFile(
          targetChat,
          lokasiFile,
          namaFile,
          `🤖 📁 File CSV hasil Browser Agent untuk *${keyword}*`
        );
      } catch (errFile) {
        console.error('Gagal mengirim file CSV:', errFile.message);
      }

      console.log(`[AGENT SELESAI] Berhasil mengirim ${hasil.length} data.`);
    }
  });
}

create({
  sessionId: 'SESI_BOT_UTAMA',
  multiDevice: true,
  useChrome: true,
  headless: false,
  qrTimeout: 0,
  authTimeout: 0,
  blockCrashLogs: true,
  disableSpins: true,
  logConsole: false,
  chromiumArgs: [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--no-sandbox'
  ]
})
  .then((client) => start(client))
  .catch((err) => console.error('Terjadi error:', err));