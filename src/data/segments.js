// Grade-level segments and the pure helpers that drive "recommended for your grade".
// No DOM, no chrome.* — easy to unit-test. The teacher's pick is stored locally in pt.teacher.gradeLevel.

// Ordered youngest → oldest. ids are stable storage keys; labels are what teachers see.
// `special` (Special education) is an extra bucket the team may keep or drop.
export const GRADES = [
  { id: 'preschool', label: 'Pre-school' },
  { id: 'k3', label: 'Kindergarten–3rd' },
  { id: 'g46', label: '4th–6th grade' },
  { id: 'middle', label: 'Middle school' },
  { id: 'high', label: 'High school' },
  { id: 'college', label: 'College' },
  { id: 'special', label: 'Special education' },
];

const GRADE_IDS = new Set(GRADES.map((g) => g.id));

// Which grades each supported (tip) site is most useful for. A site with no entry is treated as
// universal (fits every grade). Keys are the catalog's url_patterns.
export const SITE_GRADES = {
  // sites PrepTip builds guided tips for
  'docs.google.com/spreadsheets': ['g46', 'middle', 'high', 'college'],
  'docs.google.com/document': ['g46', 'middle', 'high', 'college'],
  'docs.google.com/presentation': ['g46', 'middle', 'high', 'college'],
  'canva.com': ['g46', 'middle', 'high', 'college'],
  'instructure.com': ['middle', 'high', 'college'], // Canvas LMS
  'office.com': ['g46', 'middle', 'high', 'college'],
  'quizlet.com': ['g46', 'middle', 'high', 'college'],
  'khanacademy.org': ['k3', 'g46', 'middle', 'high', 'college'],
  'desmos.com': ['middle', 'high', 'college'],
  'youtube.com': [], // universal
  'padlet.com': [], // universal
};

// The human label for a stored grade id (or '' for none/unknown).
export function gradeLabel(id) {
  return GRADES.find((g) => g.id === id)?.label || '';
}

export function isGrade(id) {
  return GRADE_IDS.has(id);
}

// Does an item (with a list of grade ids) fit the teacher's grade?
// - no teacher grade set  → everything fits (no filtering until they choose)
// - item has no grades    → universal, fits everyone
// - otherwise             → the item's grades must include the teacher's grade
export function fitsGrade(itemGrades, teacherGrade) {
  if (!teacherGrade) return true;
  if (!itemGrades || itemGrades.length === 0) return true;
  return itemGrades.includes(teacherGrade);
}

// Split a list into { recommended, other } for the teacher's grade, preserving order.
// With no teacher grade, everything is "other" (caller just shows the normal list, no split).
// getGrades maps an item to its grade-id list (default: item.grades).
export function splitByGrade(items, teacherGrade, getGrades = (i) => i.grades) {
  if (!teacherGrade) return { recommended: [], other: [...items] };
  const recommended = [];
  const other = [];
  for (const item of items) {
    (fitsGrade(getGrades(item), teacherGrade) ? recommended : other).push(item);
  }
  return { recommended, other };
}

// Convenience for a site row from the catalog ({ url_pattern, name }).
export function siteGrades(urlPattern) {
  return SITE_GRADES[urlPattern] || [];
}
