export const RAM_PATTERN = /(\d+)\s*(?:gb|גיגה|ג['׳]?יגה)\s*(?:ram|ראם|זיכרון)/gi;

// Negative lookahead excludes RAM context so "16GB RAM" doesn't appear as storage
export const STORAGE_PATTERN = /(\d+)\s*(gb|tb|גיגה|טרה)(?!\s*(?:ram|ראם|זיכרון))[\s-]*(?:ssd|hdd|nvme|storage|אחסון|דיסק)?/gi;

// \w* after digits handles full Intel suffixes like G7, H, U in i7-1165G7
export const CHIP_PATTERN = /\b(m[1-4](?:\s*(?:pro|max|ultra))?|i[3579][-\s]?\d{4,5}\w*|ryzen\s*[3579]|snapdragon\s*\d+)\b/gi;

export const YEAR_PATTERN = /\b(20[12]\d)\b/g;

// Hebrew + English missing accessory signals
export const MISSING_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /ללא\s*(?:מטען|charger|קופסה|אריזה|box)/i, label: 'No charger/box' },
  { pattern: /(?:no|without)\s*(?:charger|box|original\s*box)/i, label: 'No charger/box' },
  { pattern: /שלט\s*אחד|one\s*controller/i, label: 'Only one controller' },
  { pattern: /ללא\s*(?:שלט|controller)/i, label: 'No controller included' },
  { pattern: /מוכר\s*כפי\s*שהוא|as[\s-]is/i, label: 'Sold as-is' },
  { pattern: /(?:חסר|missing)\s*\S+/i, label: 'Missing accessories' },
];

// Red flag language signals
export const RED_FLAG_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /חייב\s*(?:למכור|למכירה)|must\s*sell|urgent\s*sale/i, label: 'Urgent sale language' },
  { pattern: /(?:מכירה\s*)?דחופה|urgent/i, label: 'Urgency pressure' },
  { pattern: /לא\s*(?:בדקתי|בדוק|נבדק)|untested|not\s*tested/i, label: 'Untested / not verified' },
  { pattern: /(?:לא\s*)?(?:עובד|עולה|מדליק)\s*(?:לא|לא\s*תמיד)/i, label: 'Functional issues mentioned' },
  // \b only applied to ASCII — Hebrew chars are non-\w in JS, \b never fires before them
  { pattern: /סדק|שבור|\b(?:broken|crack|shatter)\b/i, label: 'Physical damage mentioned' },
  { pattern: /(?:ללא|לא\s*כולל|לא\s*עם)\s*אחריות|no\s*warranty/i, label: 'No warranty' },
  { pattern: /(?:איפוס|reset)\s*(?:מ?ר?חוק|remote|factory)/i, label: 'Factory reset mentioned' },
  { pattern: /כנסו\s*לתיאור|see\s*description/i, label: 'Vague title — details hidden in description' },
];
