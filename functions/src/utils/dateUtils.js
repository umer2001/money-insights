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

function normalizeDate(rawStr, formatHint = null) {
  if (!rawStr) return '';
  const str = String(rawStr).trim();

  // If explicit format hint provided e.g. 'DD-MM-YYYY'
  if (formatHint === 'DD-MM-YYYY') {
    const m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) {
      const day = m[1].padStart(2, '0');
      const month = m[2].padStart(2, '0');
      const year = m[3];
      return `${year}-${month}-${day}`;
    }
  }

  // Pattern 0: DD-MM-YY or DD/MM/YY (2-digit year e.g. "18-08-25")
  const m0 = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (m0) {
    const day = m0[1].padStart(2, '0');
    const month = m0[2].padStart(2, '0');
    const year = parseInt(m0[3], 10) > 50 ? `19${m0[3]}` : `20${m0[3]}`;
    return `${year}-${month}-${day}`;
  }

  // Pattern 1: MM-DD-YYYY or DD-MM-YYYY (e.g. Payoneer: "12-28-2025", or day > 12)
  const m1 = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m1) {
    const first = parseInt(m1[1], 10);
    const second = parseInt(m1[2], 10);
    if (first > 12 && second <= 12) {
      const day = m1[1].padStart(2, '0');
      const month = m1[2].padStart(2, '0');
      const year = m1[3];
      return `${year}-${month}-${day}`;
    }
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

  // Pattern 3: "DD Mon YYYY" or "DD-Mon-YYYY" or "DD Mon, YYYY" (e.g. "16 Jul 2025", "06-Sep-2025")
  const m3 = str.match(/^(\d{1,2})[\s\-]+([A-Za-z]+),?[\s\-]+(\d{4})$/);
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
