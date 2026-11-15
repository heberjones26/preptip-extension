// Common Teacher Resources — sites made for (or widely used by) teachers that we link to with a short
// blurb instead of guided tips. They're already built for teachers, so a "here's the site and what it's
// good for" card is the right treatment (vs. the step-by-step walkthroughs we build for general tools).
// Bundled, no database.
// Each: { name, url, blurb, category, grades:[gradeId], subjects:[subjectId] }
// grades [] = all grades; subjects [] = every subject. Ids live in src/data/segments.js.

export const RESOURCES = [
  // ---- Cross-subject tools ----
  {
    name: 'Teachers Pay Teachers',
    url: 'https://www.teacherspayteachers.com/',
    blurb: 'A marketplace of ready-to-use lesson plans, worksheets and activities made by other teachers.',
    category: 'Lesson planning',
    grades: ['preschool', 'k3', 'g46', 'middle', 'high'],
    subjects: [],
  },
  {
    name: 'Kahoot!',
    url: 'https://kahoot.com/',
    blurb: 'Build fast, game-show-style review quizzes the class answers live on their own devices.',
    category: 'Engagement',
    grades: ['k3', 'g46', 'middle', 'high', 'college'],
    subjects: [],
  },
  {
    name: 'Nearpod',
    url: 'https://nearpod.com/',
    blurb: 'Turn a slide deck into an interactive lesson with embedded polls, quizzes and draw-it slides.',
    category: 'Interactive lessons',
    grades: ['k3', 'g46', 'middle', 'high'],
    subjects: [],
  },
  {
    name: 'Edpuzzle',
    url: 'https://edpuzzle.com/',
    blurb: 'Add questions inside a video so you know students actually watched and understood it.',
    category: 'Video',
    grades: ['g46', 'middle', 'high', 'college'],
    subjects: [],
  },
  {
    name: 'Gimkit',
    url: 'https://www.gimkit.com/',
    blurb: 'A game-based review tool where students earn in-game currency for correct answers.',
    category: 'Engagement',
    grades: ['g46', 'middle', 'high'],
    subjects: [],
  },
  {
    name: 'BrainPOP',
    url: 'https://www.brainpop.com/',
    blurb: 'Short animated explainer videos paired with quizzes to introduce new STEM and humanities topics.',
    category: 'Content library',
    grades: ['k3', 'g46', 'middle'],
    subjects: [],
  },

  // ---- English / reading / social studies ----
  {
    name: 'Newsela',
    url: 'https://newsela.com/',
    blurb: 'Current-event and nonfiction articles you can set to different reading levels for one class.',
    category: 'Reading',
    grades: ['g46', 'middle', 'high'],
    subjects: ['ela', 'social', 'science', 'biology', 'chemistry', 'physics'],
  },
  {
    name: 'CommonLit',
    url: 'https://www.commonlit.org/',
    blurb: 'Free reading passages with built-in questions and assessments, sorted by grade and theme.',
    category: 'Reading',
    grades: ['g46', 'middle', 'high'],
    subjects: ['ela', 'social'],
  },
  {
    name: 'ReadWorks',
    url: 'https://www.readworks.org/',
    blurb: 'Free nonfiction and fiction passages with comprehension questions, searchable by grade, skill and topic.',
    category: 'Reading',
    grades: ['k3', 'g46', 'middle', 'high'],
    subjects: ['ela', 'science', 'social'],
  },
  {
    name: 'iCivics',
    url: 'https://www.icivics.org/',
    blurb: 'Free civics games, lessons and primary-source activities that make government and citizenship click.',
    category: 'Content library',
    grades: ['middle', 'high'],
    subjects: ['social'],
  },
  {
    name: 'Library of Congress for Teachers',
    url: 'https://www.loc.gov/programs/teachers/',
    blurb: 'Primary sources, lesson plans and student activities from the Library of Congress.',
    category: 'Content library',
    grades: ['g46', 'middle', 'high', 'college'],
    subjects: ['social', 'ela', 'art'],
  },
  {
    name: 'PBS LearningMedia',
    url: 'https://www.pbslearningmedia.org/',
    blurb: 'Free, standards-aligned videos and interactives across science, social studies and the arts.',
    category: 'Content library',
    grades: ['preschool', 'k3', 'g46', 'middle', 'high'],
    subjects: ['science', 'physics', 'chemistry', 'biology', 'social', 'art'],
  },

  // ---- Math and science ----
  {
    name: 'PhET Interactive Simulations',
    url: 'https://phet.colorado.edu/',
    blurb: 'Free virtual science and math labs that let students explore concepts like forces or fractions.',
    category: 'STEM',
    grades: ['g46', 'middle', 'high', 'college'],
    subjects: ['physics', 'chemistry', 'biology', 'science', 'math'],
  },
  {
    name: 'GeoGebra',
    url: 'https://www.geogebra.org/',
    blurb: 'Free graphing, geometry and 3D tools plus ready-made classroom activities students can explore.',
    category: 'STEM',
    grades: ['g46', 'middle', 'high', 'college'],
    subjects: ['math', 'physics'],
  },
  {
    name: 'The Physics Classroom',
    url: 'https://www.physicsclassroom.com/',
    blurb: 'Plain-language physics tutorials, practice problems and interactives made for the classroom.',
    category: 'STEM',
    grades: ['middle', 'high', 'college'],
    subjects: ['physics'],
  },
  {
    name: 'HHMI BioInteractive',
    url: 'https://www.biointeractive.org/',
    blurb: 'Free biology videos, interactives and lesson materials from the Howard Hughes Medical Institute.',
    category: 'STEM',
    grades: ['middle', 'high', 'college'],
    subjects: ['biology', 'science'],
  },
  {
    name: 'Royal Society of Chemistry Education',
    url: 'https://edu.rsc.org/',
    blurb: 'Classroom-ready chemistry experiments, worksheets and teaching resources.',
    category: 'STEM',
    grades: ['middle', 'high'],
    subjects: ['chemistry'],
  },
  {
    name: 'OpenStax',
    url: 'https://openstax.org/',
    blurb: 'Free, peer-reviewed digital textbooks so students aren’t stuck buying expensive books.',
    category: 'Content library',
    grades: ['high', 'college'],
    subjects: ['math', 'physics', 'chemistry', 'biology', 'science', 'social', 'ela', 'cs'],
  },

  // ---- Computer science ----
  {
    name: 'Code.org',
    url: 'https://code.org/',
    blurb: 'Free computer science courses and unplugged lessons for every grade, with a built-in teacher dashboard.',
    category: 'STEM',
    grades: ['k3', 'g46', 'middle', 'high'],
    subjects: ['cs'],
  },
  {
    name: 'Scratch',
    url: 'https://scratch.mit.edu/',
    blurb: 'Block-based coding where students build their own stories, games and animations; free class accounts for teachers.',
    category: 'STEM',
    grades: ['g46', 'middle'],
    subjects: ['cs', 'art'],
  },

  // ---- World languages ----
  {
    name: 'Conjuguemos',
    url: 'https://conjuguemos.com/',
    blurb: 'Verb and vocabulary practice in Spanish, French and other languages, with teacher-assigned activities and progress reports.',
    category: 'Languages',
    grades: ['middle', 'high', 'college'],
    subjects: ['languages'],
  },
  {
    name: 'Duolingo for Schools',
    url: 'https://schools.duolingo.com/',
    blurb: 'A teacher dashboard for assigning language lessons and tracking student progress on Duolingo.',
    category: 'Languages',
    grades: ['middle', 'high', 'college'],
    subjects: ['languages'],
  },

  // ---- Arts, music, PE ----
  {
    name: 'Google Arts & Culture',
    url: 'https://artsandculture.google.com/',
    blurb: 'Virtual museum tours and high-resolution artworks from institutions around the world.',
    category: 'Arts & music',
    grades: ['g46', 'middle', 'high', 'college'],
    subjects: ['art', 'social'],
  },
  {
    name: 'Chrome Music Lab',
    url: 'https://musiclab.chromeexperiments.com/',
    blurb: 'Playful, free music experiments that let students explore rhythm, melody and sound in the browser.',
    category: 'Arts & music',
    grades: ['preschool', 'k3', 'g46', 'middle'],
    subjects: ['music'],
  },
  {
    name: 'GoNoodle',
    url: 'https://www.gonoodle.com/',
    blurb: 'Short movement and mindfulness videos that give students an active break.',
    category: 'PE & health',
    grades: ['preschool', 'k3', 'g46'],
    subjects: ['pe'],
  },
  {
    name: 'PE Central',
    url: 'https://www.pecentral.org/',
    blurb: 'Lesson plans, assessment ideas and equipment-light activities for physical education teachers.',
    category: 'PE & health',
    grades: ['k3', 'g46', 'middle', 'high'],
    subjects: ['pe'],
  },
];
