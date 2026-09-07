/**
 * Date normalization utility
 * Converts various date formats into standardized ISO 'YYYY-MM-DD'
 */

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
};

function normalizeDate(rawStr) {
  if (!rawStr) return '';
  const str = String(rawStr).trim();

  // Pattern 1: MM-DD-YYYY or MM/DD/YYYY (e.g. Payoneer: "12-28-2025", "05-08-2026")
  const m1 = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m1) {
    const month = m1[1].padStart(2, '0');
    const day = m1[2].padStart(2, '0');
    const year = m1[3];
    return `${year}-${month}-${day}`;
  }

  // Pattern 2: YYYY-MM-DD (already ISO)
  const m2 = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m2) {
    const year = m2[1];
    const month = m2[2].padStart(2, '0');
    const day = m2[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Pattern 3: "DD Mon YYYY" or "D Mon, YYYY" or "DD Mon, YYYY" (e.g. "16 Jul 2025", "2 Jul, 2025")
  const m3 = str.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (m3) {
    const day = m3[1].padStart(2, '0');
    const monName = m3[2].toLowerCase();
    const month = MONTH_MAP[monName] || '01';
    const year = m3[3];
    return `${year}-${month}-${day}`;
  }

  // Pattern 4: "Mon DD, YYYY" or "Mon DD YYYY" (e.g. "Jul 02, 2025")
  const m4 = str.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m4) {
    const monName = m4[1].toLowerCase();
    const month = MONTH_MAP[monName] || '01';
    const day = m4[2].padStart(2, '0');
    const year = m4[3];
    return `${year}-${month}-${day}`;
  }

  // Fallback: try Date.parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return str;
}

/**
 * Normalizes time string into standard format e.g. "01:48 AM" or "14:04:50"
 */
function normalizeTime(rawTime) {
  if (!rawTime) return '';
  return String(rawTime).trim();
}

module.exports = {
  normalizeDate,
  normalizeTime
};
