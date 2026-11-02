// Common Teacher Resources — teacher-*built* sites we link to with a short blurb instead of guided tips.
// These are already made for teachers, so a "here's the site and what it's good for" card is the right
// treatment (vs. the step-by-step walkthroughs we build for general tools). Bundled, no database.
// Each: { name, url, blurb, category, grades:[gradeId] } ([] = all grades).

export const RESOURCES = [
  {
    name: 'Teachers Pay Teachers',
    url: 'https://www.teacherspayteachers.com/',
    blurb: 'A marketplace of ready-to-use lesson plans, worksheets and activities made by other teachers.',
    category: 'Lesson planning',
    grades: ['preschool', 'k3', 'g46', 'middle', 'high'],
  },
  {
    name: 'Kahoot!',
    url: 'https://kahoot.com/',
    blurb: 'Build fast, game-show-style review quizzes the class answers live on their own devices.',
    category: 'Engagement',
    grades: ['k3', 'g46', 'middle', 'high', 'college'],
  },
  {
    name: 'Nearpod',
    url: 'https://nearpod.com/',
    blurb: 'Turn a slide deck into an interactive lesson with embedded polls, quizzes and draw-it slides.',
    category: 'Interactive lessons',
    grades: ['k3', 'g46', 'middle', 'high'],
  },
  {
    name: 'Edpuzzle',
    url: 'https://edpuzzle.com/',
    blurb: 'Add questions inside a video so you know students actually watched and understood it.',
    category: 'Video',
    grades: ['g46', 'middle', 'high', 'college'],
  },
  {
    name: 'Gimkit',
    url: 'https://www.gimkit.com/',
    blurb: 'A game-based review tool where students earn in-game currency for correct answers.',
    category: 'Engagement',
    grades: ['g46', 'middle', 'high'],
  },
  {
    name: 'Newsela',
    url: 'https://newsela.com/',
    blurb: 'Current-event and nonfiction articles you can set to different reading levels for one class.',
    category: 'Reading',
    grades: ['g46', 'middle', 'high'],
  },
  {
    name: 'PBS LearningMedia',
    url: 'https://www.pbslearningmedia.org/',
    blurb: 'Free, standards-aligned videos and interactives across science, social studies and the arts.',
    category: 'Content library',
    grades: ['preschool', 'k3', 'g46', 'middle', 'high'],
  },
  {
    name: 'PhET Interactive Simulations',
    url: 'https://phet.colorado.edu/',
    blurb: 'Free virtual science and math labs that let students explore concepts like forces or fractions.',
    category: 'STEM',
    grades: ['g46', 'middle', 'high', 'college'],
  },
  {
    name: 'OpenStax',
    url: 'https://openstax.org/',
    blurb: 'Free, peer-reviewed digital textbooks so students aren’t stuck buying expensive books.',
    category: 'Content library',
    grades: ['high', 'college'],
  },
  {
    name: 'BrainPOP',
    url: 'https://www.brainpop.com/',
    blurb: 'Short animated explainer videos paired with quizzes to introduce new STEM and humanities topics.',
    category: 'Content library',
    grades: ['k3', 'g46', 'middle'],
  },
];
