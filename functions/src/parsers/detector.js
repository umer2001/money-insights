const { PDFParse } = require('pdf-parse');
const xlsx = require('xlsx');

/**
 * Detect bank format from filename and file buffer
 * @param {string} filename 
 * @param {Buffer} buffer 
 * @param {string} [password]
 * @returns {Promise<{ bank: string, confidence: number, requiresPassword?: boolean }>}
 */
async function detectBankFormat(filename = '', buffer, password = '') {
  const name = filename.toLowerCase();
  
  // 1. Check CSV files
  if (name.endsWith('.csv') || (buffer && buffer.slice(0, 400).toString('utf-8').includes(','))) {
    try {
      const sample = buffer.slice(0, 2000).toString('utf-8');
      if (sample.includes('Amount (USD)') || sample.includes('Payoneer') || sample.includes('Transaction date')) {
        return { bank: 'payoneer', confidence: 0.99 };
      }
      if (sample.includes('PK06NAYA') || sample.includes('@nayapay') || sample.includes('NayaPay') || sample.includes('TIMESTAMP,TYPE,DESCRIPTION')) {
        return { bank: 'nayaPay', confidence: 0.99 };
      }
    } catch (_) {}
  }

  // 2. Check Excel files (.xlsx, .xls, or binary OLE)
  const isOle = buffer && buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0;
  const isZip = buffer && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || isOle || isZip || name.includes('fbl') || name.includes('statement-fbl')) {
    try {
      const wb = xlsx.read(buffer, { type: 'buffer' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const text = JSON.stringify(firstSheet);
      if (/faysal/i.test(text) || /fbl/i.test(text) || /PK75/i.test(text) || /barkat/i.test(text)) {
        return { bank: 'fbl', confidence: 0.99 };
      }
    } catch (_) {}
  }

  // 3. Check PDF files
  if (name.endsWith('.pdf') || (buffer && buffer.slice(0, 4).toString() === '%PDF')) {
    try {
      const parser = new PDFParse({ data: buffer, password: password || '' });
      let text = '';
      try {
        await parser.load();
        const res = await parser.getText();
        text = res ? res.text : '';
      } finally {
        await parser.destroy();
      }

      // Check header portion (first 500 characters) for official bank issuing branding
      const header = text.slice(0, 500);

      // 1. SadaPay
      if (
        /IBAN:\s*PK67\s*SADA/i.test(header) ||
        (/Account Currency:\s*Pakistani rupee/i.test(header) && header.includes('Total debit')) ||
        header.includes('sadapay.pk')
      ) {
        return { bank: 'sadaPay', confidence: 0.99 };
      }

      // 2. NayaPay
      if (
        header.includes('@nayapay') ||
        header.includes('NayaPay ID') ||
        /PK06NAYA/i.test(header) ||
        header.includes('www.nayapay.com')
      ) {
        return { bank: 'nayaPay', confidence: 0.99 };
      }

      // 3. Faysal Bank (FBL)
      if (
        header.includes('faysalbank.com') ||
        /IBAN:\s*PK75-/i.test(header) ||
        /customercare@faysalbank/i.test(header) ||
        /BARKAT CURRENT ACCOUNT/i.test(header)
      ) {
        return { bank: 'fbl', confidence: 0.99 };
      }

      // 4. easypaisa
      if (
        header.includes('easypaisa Bank Limited') ||
        header.includes('easypaisa.com.pk') ||
        (header.includes('IBAN') && header.includes('PK61TMFB'))
      ) {
        return { bank: 'easyPaisa', confidence: 0.99, requiresPassword: false };
      }

      // 5. Allied Bank (ABL)
      if (
        header.includes('Posted Transactions until the last working day') ||
        (header.includes('Account Number:') && header.includes('Opening Balance:')) ||
        header.includes('myABL')
      ) {
        return { bank: 'abl', confidence: 0.99 };
      }
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      const errName = (err.name || '').toLowerCase();
      if (
        errName.includes('password') ||
        msg.includes('password') ||
        msg.includes('encrypt') ||
        msg.includes('bad decrypt')
      ) {
        if (name.includes('fbl') || name.includes('faysal')) return { bank: 'fbl', confidence: 0.85, requiresPassword: true };
        if (name.includes('abl') || name.includes('allied')) return { bank: 'abl', confidence: 0.85, requiresPassword: true };
        if (name.includes('sada')) return { bank: 'sadaPay', confidence: 0.85, requiresPassword: true };
        if (name.includes('naya')) return { bank: 'nayaPay', confidence: 0.85, requiresPassword: true };
        if (name.includes('easypaisa') || name.includes('ep') || name.includes('telenor')) return { bank: 'easyPaisa', confidence: 0.85, requiresPassword: true };

        // If filename gives no specific cue, default to easyPaisa (most common encrypted statement in Pakistan) with flag
        return { bank: 'easyPaisa', confidence: 0.6, requiresPassword: true };
      }
    }
  }

  // Fallback heuristic by filename
  if (name.includes('fbl') || name.includes('faysal')) return { bank: 'fbl', confidence: 0.7 };
  if (name.includes('nayapay') || name.includes('naya')) return { bank: 'nayaPay', confidence: 0.7 };
  if (name.includes('sadapay') || name.includes('sada')) return { bank: 'sadaPay', confidence: 0.7 };
  if (name.includes('easypaisa') || name.includes('ep')) return { bank: 'easyPaisa', confidence: 0.7 };
  if (name.includes('abl')) return { bank: 'abl', confidence: 0.7 };
  if (name.includes('payoneer')) return { bank: 'payoneer', confidence: 0.7 };

  return { bank: 'unknown', confidence: 0 };
}

module.exports = { detectBankFormat };
