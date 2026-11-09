// Grade-level + subject segments and the pure helpers that drive "recommended for your class".
// No DOM, no chrome.* — easy to unit-test. The teacher's picks are stored locally in
// pt.teacher.gradeLevel (one grade band) and pt.teacher.subjects (any number of subject ids).

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
  'classroom.google.com': [], // universal
  'kahoot.com': [], // universal
  'classdojo.com': ['preschool', 'k3', 'g46', 'middle'], // a K–8 tool
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
  return splitByFit(items, { grade: teacherGrade }, getGrades, () => []);
}

// Convenience for a site row from the catalog ({ url_pattern, name }).
export function siteGrades(urlPattern) {
  return SITE_GRADES[urlPattern] || [];
}

// ---------------------------------------------------------------------------
// Subjects: what the teacher teaches. Optional and multi-select; works alongside grade.
// ---------------------------------------------------------------------------

export const SUBJECTS = [
  { id: 'math', label: 'Math' },
  { id: 'physics', label: 'Physics' },
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'biology', label: 'Biology' },
  { id: 'science', label: 'Other science' },
  { id: 'ela', label: 'English / ELA' },
  { id: 'languages', label: 'Spanish & world languages' },
  { id: 'social', label: 'Social studies' },
  { id: 'art', label: 'Art' },
  { id: 'music', label: 'Music' },
  { id: 'pe', label: 'PE & health' },
  { id: 'cs', label: 'Computer science' },
  { id: 'other', label: 'Something else' }, // answers the question, but narrows nothing
];

const SUBJECT_IDS = new Set(SUBJECTS.map((s) => s.id));

// Which subjects each supported (tip) site is most useful for. No entry / [] = universal: a gradebook
// in Sheets or a video on YouTube helps every teacher.
export const SITE_SUBJECTS = {
  'desmos.com': ['math', 'physics'],
  'quizlet.com': ['languages', 'biology', 'chemistry', 'social', 'ela'],
  'khanacademy.org': ['math', 'physics', 'chemistry', 'biology', 'science', 'social', 'cs', 'ela'],
};

export function subjectLabel(id) {
  return SUBJECTS.find((s) => s.id === id)?.label || '';
}

export function isSubject(id) {
  return SUBJECT_IDS.has(id);
}

export function siteSubjects(urlPattern) {
  return SITE_SUBJECTS[urlPattern] || [];
}

// Whatever came out of storage -> a clean list: known ids only, no duplicates, in menu order.
export function cleanSubjects(list) {
  const want = new Set(Array.isArray(list) ? list : []);
  return SUBJECTS.map((s) => s.id).filter((id) => want.has(id));
}

// The subjects that actually narrow anything ("Something else" doesn't).
function realSubjects(list) {
  return cleanSubjects(list).filter((id) => id !== 'other');
}

// Does an item fit the teacher's subjects? No subjects picked, or an item with none listed
// (universal), fits everyone; otherwise at least one subject has to overlap.
export function fitsSubjects(itemSubjects, teacherSubjects) {
  const mine = realSubjects(teacherSubjects);
  if (mine.length === 0) return true;
  if (!itemSubjects || itemSubjects.length === 0) return true;
  return itemSubjects.some((s) => mine.includes(s));
}

// Split items into { recommended, other } for a teacher profile { grade, subjects }.
// An item is recommended when it fits BOTH the grade and the subjects. Within "recommended" the items
// that name one of the teacher's subjects come first (most focused first), ahead of the universal ones,
// so a physics teacher sees physics tools before generic ones. With no grade and no subjects nothing is recommended.
export function splitByFit(items, profile, getGrades = (i) => i.grades, getSubjects = (i) => i.subjects) {
  const grade = profile?.grade || '';
  const subjects = realSubjects(profile?.subjects);
  if (!grade && subjects.length === 0) return { recommended: [], other: [...items] };

  const named = [];
  const universal = [];
  const other = [];
  for (const item of items) {
    const itemSubjects = getSubjects(item) || [];
    if (!fitsGrade(getGrades(item), grade) || !fitsSubjects(itemSubjects, subjects)) {
      other.push(item);
    } else if (itemSubjects.some((s) => subjects.includes(s))) {
      named.push(item);
    } else {
      universal.push(item);
    }
  }
  // Among the named ones, the most focused come first: "The Physics Classroom" (1 of its 1 subjects is
  // physics) ahead of Newsela (1 of 6). Array.sort is stable, so ties keep their list order.
  const focus = (item) => {
    const itemSubjects = getSubjects(item) || [];
    return itemSubjects.filter((s) => subjects.includes(s)).length / itemSubjects.length;
  };
  named.sort((a, b) => focus(b) - focus(a));
  return { recommended: [...named, ...universal], other };
}

// "High school · Physics, Chemistry +1" — a short label for the footer and section headings.
export function profileLabel(profile, maxSubjects = 2) {
  const parts = [];
  const grade = gradeLabel(profile?.grade);
  if (grade) parts.push(grade);
  const names = realSubjects(profile?.subjects).map(subjectLabel);
  if (names.length) {
    parts.push(names.length > maxSubjects
      ? `${names.slice(0, maxSubjects).join(', ')} +${names.length - maxSubjects}`
      : names.join(', '));
  }
  return parts.join(' · ');
}

// The small "For Physics" / "For High school" badge: only when an item NAMES the teacher's subject or
// grade (being universal isn't worth a badge). A named subject is the more specific signal, so it wins.
export function matchBadge(itemGrades, itemSubjects, profile) {
  const mine = realSubjects(profile?.subjects);
  const hit = (itemSubjects || []).filter((s) => mine.includes(s));
  if (hit.length) return `For ${hit.slice(0, 2).map(subjectLabel).join(' & ')}`;
  if (profile?.grade && (itemGrades || []).includes(profile.grade)) return `For ${gradeLabel(profile.grade)}`;
  return '';
}
