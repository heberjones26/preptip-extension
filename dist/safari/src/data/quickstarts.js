// Bundled orientation guides are available offline and do not need an AI request.
// Keep these about the whole website; individual features belong in the tip catalog.
import { matchSite } from '../lib/sites.js';

const GUIDES = {
  'docs.google.com/spreadsheets': {
    name: 'Google Sheets',
    overview: 'Organize class information, calculate results, and explore data with a shared spreadsheet.',
    sections: [
      { title: 'Start with a spreadsheet', body: 'Sign in with your school Google account. Open Sheets from Google Drive or the Google apps menu and choose a blank spreadsheet or a template. Give the file a clear name; changes save automatically in Drive.' },
      { title: 'Find your way around', body: 'A spreadsheet contains sheets, shown as tabs at the bottom. Each sheet has lettered columns, numbered rows, and cells such as A1. Click a cell to enter text or a number; use the toolbar for formatting and the menus for additional tools.' },
      { title: 'Build a simple class table', body: 'Put headings in the first row and one record in each row below it. A formula starts with =, such as =AVERAGE(B2:B6). Keep related information together, and use a chart when a visual comparison will help students understand the data.' },
      { title: 'Choose how students participate', body: 'Use Share to give specific people Viewer, Commenter, or Editor access. For independent work, share a template through your learning platform or ask students to make their own copy. Check that school account restrictions allow the intended students to open it.' },
      { title: 'Try a first classroom task', body: 'Create a small table of fictional class survey results, add a heading row, and make a chart. Share it as view-only and ask students to describe one pattern. Use sample data while learning so student records stay private.' },
    ],
  },
  'docs.google.com/document': {
    name: 'Google Docs',
    overview: 'Create lesson documents, support student writing, and give feedback in one shared workspace.',
    sections: [
      { title: 'Create your first document', body: 'Sign in with your school Google account. Open Docs from Google Drive or the Google apps menu, then choose Blank or a template. Name the document at the top. Your changes save automatically in Drive.' },
      { title: 'Find the main controls', body: 'Write in the page area. The toolbar controls text formatting, while the Insert menu adds items such as images and tables. Use heading styles for sections so a longer lesson is easy to scan and navigate.' },
      { title: 'Plan writing and feedback', body: 'Use Editing to change your own document, Suggesting to propose revisions, and comments to ask questions about selected text. Students can respond to comments and resolve them after revising. Check the current mode before reviewing someone else\'s writing.' },
      { title: 'Share the right kind of access', body: 'Use Share to choose who can open the file and whether they can view, comment, or edit. For individual student responses, distribute a separate copy through your learning platform. Use a shared editable document when the class should collaborate on the same page.' },
      { title: 'Try a first classroom task', body: 'Make a one-page writing prompt with a heading, short instructions, and space for an answer. Test the link with a student account, then distribute copies. Add one comment to a sample response to practice the feedback workflow.' },
    ],
  },
  'docs.google.com/presentation': {
    name: 'Google Slides',
    overview: 'Build and present lessons, combine text with visuals, and let students collaborate on a slide deck.',
    sections: [
      { title: 'Start a lesson deck', body: 'Sign in with your school Google account and open Slides from Drive or the Google apps menu. Choose a blank presentation or template, then give it a name. Changes save automatically in Drive.' },
      { title: 'Explore the editor', body: 'The thumbnails on the left show the order of your slides. Select a thumbnail to edit its slide, drag thumbnails to rearrange them, and use the toolbar or Insert menu for text and images. Choose layouts to keep each slide readable.' },
      { title: 'Prepare to teach', body: 'Build a short sequence: a learning goal, an example, and a student task. Add reminders in speaker notes below the slide. Use Slideshow to present, or Presenter view when you want your notes and controls on a separate display.' },
      { title: 'Give students access', body: 'Use Share to set Viewer, Commenter, or Editor access. A view-only deck works for lesson reference; a shared editable deck supports group work. For individual responses, distribute separate copies through your learning platform and check access using a student account.' },
      { title: 'Try a first classroom task', body: 'Create three slides: the lesson question, a visual example, and an exit-ticket prompt. Rehearse in Slideshow, press Esc to return to the editor, then share the deck with students using the access level your activity needs.' },
    ],
  },
  'canva.com': {
    name: 'Canva',
    overview: 'Design classroom visuals, presentations, and learning materials with ready-made layouts and a visual editor.',
    sections: [
      { title: 'Set up your workspace', body: 'Sign in with your school account and check which team or workspace you are using. Eligible educators can apply for Canva for Education. Available templates, sharing options, and assets depend on your account, so check access before planning a student activity.' },
      { title: 'Choose a format and template', body: 'From the home page, search for a format such as presentation, worksheet, or classroom poster. Preview a template and customize it, or start with a blank design. Choose the intended format before editing so the page size fits your final use.' },
      { title: 'Make the design your own', body: 'Select text on the page to replace it. Use the side panel to add elements, uploads, and other content, then drag and resize items on the canvas. Keep instructions short, use readable text, and preview every page before sharing.' },
      { title: 'Plan sharing or distribution', body: 'Use Share to review who can open or edit the design. For a fixed handout, choose Download and an appropriate format such as PDF. For student design work, check your school\'s Canva classroom setup and account permissions before inviting students to edit.' },
      { title: 'Try a first classroom task', body: 'Customize a classroom poster with one learning goal, a relevant visual, and three short instructions. Preview it at classroom viewing size, then download a PDF or share a view-only link. Confirm that any selected assets are available with your account.' },
    ],
  },
  'instructure.com': {
    name: 'Canvas',
    overview: 'Organize a course, distribute learning activities, collect student work, and keep feedback in one place.',
    sections: [
      { title: 'Open the correct course', body: 'Sign in through your school\'s Canvas address. The Dashboard shows your courses; open the course you will teach. Your institution controls enrollment, available tools, and some settings, so start with an existing course if your school provides one.' },
      { title: 'Understand course navigation', body: 'Use the course navigation to find Modules, Assignments, Pages, People, and Grades where enabled. Modules organize the learning sequence, Pages explain content, and Assignments collect work. Student View helps you check what students can actually access.' },
      { title: 'Build a small learning sequence', body: 'Create a module for one lesson. Add a page with instructions and an assignment with a clear submission type, due date, and points if needed. Publish the items and the module; students also need the course to be published before they can enter.' },
      { title: 'Check student access and feedback', body: 'Enrollment usually comes from your school, so review People or ask your administrator if a student is missing. Check dates and prerequisites when work is unavailable. Review submitted work in SpeedGrader and use Grades to monitor progress and return feedback.' },
      { title: 'Try a first classroom task', body: 'Publish one module containing a welcome page and a short text-entry assignment. Use Student View to open the page and submit a sample response. Return to the teacher view and practice reviewing that test submission before students begin.' },
    ],
  },
  'office.com': {
    name: 'Microsoft 365',
    overview: 'Create classroom documents, spreadsheets, and presentations, then share them through your school Microsoft account.',
    sections: [
      { title: 'Sign in to your school workspace', body: 'Open Microsoft 365 with your school account. The home page and app launcher lead to apps such as Word, Excel, PowerPoint, and OneDrive. The apps and features you see depend on your school\'s license and settings.' },
      { title: 'Choose the app for the task', body: 'Use Word for written materials, Excel for tables and calculations, and PowerPoint for presentations. Start a blank file or choose a template, then rename it. Files stored in OneDrive save online and can be reopened from your recent files.' },
      { title: 'Work in the browser', body: 'Use each app\'s ribbon to find editing tools, and select Insert to add content such as images or tables. Online files support collaboration. If a feature needs the desktop app, confirm that it is installed and available on your school device.' },
      { title: 'Share with your class', body: 'Use Share to choose the audience and whether recipients may edit. School settings can restrict external links. For independent student work, distribute a copy through your learning platform or Teams assignment rather than asking everyone to edit the same file.' },
      { title: 'Try a first classroom task', body: 'Create a short Word lesson handout with a heading, instructions, and a response table. Save it in OneDrive, share a view-only link with a colleague, and verify the link from another account before sending it to students.' },
    ],
  },
  'quizlet.com': {
    name: 'Quizlet',
    overview: 'Turn important vocabulary and concepts into study sets students can review and practice.',
    sections: [
      { title: 'Start with a teacher account', body: 'Sign in and identify your account as a teacher where prompted. Your library holds your study sets, and classes can organize sets for groups of students. Some practice modes and teacher features require a paid plan; check availability before assigning them.' },
      { title: 'Find or create a study set', body: 'Search for a set or create one with a title and paired terms and definitions. Review every card for accuracy and age appropriateness before using a public set. Keep definitions focused and add examples that match what you teach.' },
      { title: 'Preview the student experience', body: 'Open the set and try Flashcards plus any practice modes available to your account. Check that each prompt has a clear expected answer. Edit unclear cards before class so students practice the concept instead of guessing your wording.' },
      { title: 'Share and check access', body: 'Review the set\'s visibility and editing settings, then share its link or add it to a class. Check whether the chosen mode needs students to sign in or has free-use limits. Follow your school\'s account requirements for student access.' },
      { title: 'Try a first classroom task', body: 'Create a set of six terms from the current lesson. Have students review the flashcards, then explain two terms in their own words without looking. Use their explanations to decide which cards or concepts need another example.' },
    ],
  },
  'khanacademy.org': {
    name: 'Khan Academy',
    overview: 'Find lessons and practice, assign work to a class, and use student results to plan support.',
    sections: [
      { title: 'Open your teacher dashboard', body: 'Sign in and choose the teacher role, then create a class or open one already connected to your school. Select a course that fits your students. Your teacher dashboard is the starting point for class rosters, assignments, and progress.' },
      { title: 'Explore course content', body: 'Browse the course\'s units to find videos, articles, exercises, and assessments. Open an item to preview it before assigning it. Check the prerequisites and difficulty so the activity supports the lesson rather than introducing too many unfamiliar ideas.' },
      { title: 'Connect students to the class', body: 'Use the available class invitation or roster options, such as a class code or a supported school integration. Follow the account setup guidance for younger students. Verify that students appear in the correct class before relying on their progress reports.' },
      { title: 'Assign and review a small activity', body: 'Select practice from the course and assign it to the class or chosen students with an appropriate due date. After students work, review assignment results and skills progress in the teacher dashboard. Use missed skills to choose a follow-up explanation or practice group.' },
      { title: 'Try a first classroom task', body: 'Assign one short exercise related to today\'s learning goal. Ask students to record one question they found challenging. Review results with those questions, then reteach one common misconception before assigning more practice.' },
    ],
  },
  'desmos.com': {
    name: 'Desmos',
    overview: 'Use an interactive graphing calculator to connect equations, tables, and visual patterns in mathematics.',
    sections: [
      { title: 'Open the graphing calculator', body: 'Choose Graphing Calculator from Desmos. You can explore without an account; sign in when you want to save graphs to your library. This guide covers the calculator. Classroom activities are a separate product and may use a different website.' },
      { title: 'Understand the workspace', body: 'The expression list is on the left and the graph is on the right. Type an equation into an expression row and its graph appears. Use the plus menu for items such as a table, and the graph settings to adjust the viewing window.' },
      { title: 'Connect representations', body: 'Enter an equation such as y = mx + b and add sliders for its parameters when prompted. Move a slider to see what changes. Add a table or point when students need to compare numerical values with the graph.' },
      { title: 'Save and share a graph', body: 'Give a useful graph a title and save it when signed in. Use the sharing controls to copy a graph link, then post it in your learning platform. A shared graph link does not collect student responses or provide a class progress dashboard.' },
      { title: 'Try a first classroom task', body: 'Graph y = mx + b and ask students to predict what will happen when m or b changes. Move one slider at a time, then have students describe the effect using evidence from the graph. Share the graph for further exploration.' },
    ],
  },
  'youtube.com': {
    name: 'YouTube',
    overview: 'Find and preview video explanations, prepare a focused viewing activity, and share the right clip with students.',
    sections: [
      { title: 'Find a video for one learning goal', body: 'Search using the topic and intended level. Check the source, length, and publication context, then watch the full video before class. School networks and student accounts may have different YouTube access, so test on the devices students will use.' },
      { title: 'Know the player controls', body: 'Use play and pause, the timeline, volume, and full-screen controls to present. Open Settings for playback speed and available caption options. Captions can support access, but automatic captions may contain errors; check important vocabulary before the lesson.' },
      { title: 'Prepare a viewing sequence', body: 'Decide which part students need and note useful stopping points. Prepare a question or observation task for each section. If signed in, you can organize useful videos in playlists; review playlist visibility before sharing one with a class.' },
      { title: 'Share and test the link', body: 'Use Share to copy the video link, with a start time when useful, and post it in your learning platform. Check it with a student account. Ads, recommendations, age restrictions, and school filtering can affect the viewing experience.' },
      { title: 'Try a first classroom task', body: 'Choose a short clip, give students one question to answer, and pause once for a prediction. Finish with a brief explanation or exit ticket so you can check what students understood from the video.' },
    ],
  },
  'padlet.com': {
    name: 'Padlet',
    overview: 'Create a shared space where students can post ideas, collect resources, and respond to a class prompt.',
    sections: [
      { title: 'Create a board', body: 'Sign in and create a padlet from your dashboard. Choose a layout that fits your activity, such as a wall for collecting ideas or columns for categories. Give the board a clear title and put the student task in its description.' },
      { title: 'Explore posting and organization', body: 'Use the add-post control to contribute text or supported media. Open a post to edit its content, and use the layout controls to organize responses. Add one example post so students can see the level of detail you expect.' },
      { title: 'Set participation expectations', body: 'Review settings for author names, comments, reactions, and moderation where available. Decide whether posts need approval and how you will identify student work. Keep the prompt focused and explain what a helpful response or comment looks like.' },
      { title: 'Check visitor permissions', body: 'Open Share to review the board\'s privacy and visitor permissions before copying the link or QR code. Students need permission to write if they will post. Test the board as a visitor because a link can behave differently outside your teacher account.' },
      { title: 'Try a first classroom task', body: 'Ask each student to post one observation and one question about the lesson topic. Model a sample post, share the board, and review contributions together. Group related ideas and use unanswered questions to plan the next lesson.' },
    ],
  },
  'classroom.google.com': {
    name: 'Google Classroom',
    overview: 'Set up a class, organize assignments and materials, and return student work with feedback.',
    sections: [
      { title: 'Open or create a class', body: 'Sign in with your school Google account and open a class your school provides, or create one if your account permits it. Check the class name and section so students join the correct group. Your school controls which accounts can use Classroom.' },
      { title: 'Learn the main tabs', body: 'Use Stream for announcements, Classwork for assignments and materials, People for students and co-teachers, and Grades to review scores. Organize Classwork with topics so students can find the current unit without scrolling through announcements.' },
      { title: 'Connect students and add a task', body: 'Invite students through People or share the class invitation options your school allows. In Classwork, create an assignment with clear instructions and a due date. When attaching a Google file, choose whether students view it, edit one shared file, or receive their own copy.' },
      { title: 'Follow the work cycle', body: 'Students open the assignment, complete the task, and turn it in. Open the assignment to check work status, review submissions, and add private feedback or a grade. Return work so students can review feedback and revise when needed.' },
      { title: 'Try a first classroom task', body: 'Create a Welcome topic with a short material and a question for students to answer. Have a student open it and submit a response. Review and return that response before distributing a larger assignment.' },
    ],
  },
  'kahoot.com': {
    name: 'Kahoot!',
    overview: 'Use a short interactive quiz to activate prior knowledge, check understanding, and discuss student answers.',
    sections: [
      { title: 'Open your teacher workspace', body: 'Sign in to Kahoot! as a teacher. Your library holds saved kahoots, while discovery tools help you find existing ones. Plans differ in question types, participant limits, and reporting, so check what your account includes before planning a class game.' },
      { title: 'Find or create a short quiz', body: 'Choose an existing kahoot and preview every question, or create your own with a title and a few questions. Set clear answers and enough time to read. Use the editor\'s preview to check wording and how media appears.' },
      { title: 'Choose live or independent play', body: 'Host a live game when the class will play together, or use an assignment option when students should work at their own pace. For live play, display the host screen and let students join through kahoot.it or the app using the game PIN.' },
      { title: 'Prepare access and review results', body: 'Check the participant limit, device access, and nickname expectations before students join. After play, review the reports available to your account and identify questions the class found difficult. Do not assume every student needs a teacher account to join a live game.' },
      { title: 'Try a first classroom task', body: 'Run a three-question check on a recently taught topic. Pause after each question to ask why an answer is correct. Use the response pattern to choose one concept to revisit before the next activity.' },
    ],
  },
  'classdojo.com': {
    name: 'ClassDojo',
    overview: 'Organize a classroom community, communicate with families, and support class routines.',
    sections: [
      { title: 'Set up your class', body: 'Sign in as a teacher and open an existing class or create one. Add or review the student roster using your school\'s approved setup. Check the class details before inviting families so everyone connects to the correct classroom.' },
      { title: 'Explore the classroom workspace', body: 'The class view provides access to students, feedback points, and classroom tools such as a timer or random picker. Other areas support family messages, Class Story, and student portfolios. Available controls can vary between the website and mobile app.' },
      { title: 'Choose clear classroom routines', body: 'Decide how you will use feedback and which classroom expectations it represents. Explain the routine to students before using points or reports. Start with one tool or routine so the class understands its purpose and can participate consistently.' },
      { title: 'Connect with families thoughtfully', body: 'Use the class invitation options to connect approved family contacts. Messages support communication with families, while Class Story shares class updates. Review the audience before posting and follow school rules for student names, photos, and family communication.' },
      { title: 'Try a first classroom task', body: 'Use the timer for a short independent task, then post a general welcome update for connected families. Confirm the audience and check how the update appears. Add student portfolio work later when you are comfortable with class access and permissions.' },
    ],
  },
};

const SITE_ROWS = Object.keys(GUIDES).map((url_pattern) => ({ url_pattern }));
const ALIASES = {
  'sheets.google.com': 'docs.google.com/spreadsheets',
  'slides.google.com': 'docs.google.com/presentation',
  'microsoft365.com': 'office.com',
  'm365.cloud.microsoft': 'office.com',
  'kahoot.it': 'kahoot.com',
};

function patternUrl(pattern) {
  if (typeof pattern !== 'string' || !pattern.trim()) return null;
  const value = pattern.trim().replace(/^\*\./, '');
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch { return null; }
}

function genericGuide(name) {
  return {
    name,
    overview: `Get oriented in ${name}, prepare one classroom activity, and check how students will access it.`,
    sections: [
      { title: 'Open your teaching workspace', body: `Sign in to ${name} with your school-approved account if needed. Look for your dashboard, library, or classes, and check which tools your account includes. Use the website's Help or Getting started area for its current setup instructions.` },
      { title: 'Explore and prepare one activity', body: 'Locate the main navigation and preview a sample or template. Choose one learning goal and prepare a small activity around it. Keep your first attempt simple enough to complete and review during a short classroom trial.' },
      { title: 'Check student access', body: 'Review sharing settings, account requirements, and any class invitation options before sending a link. Test with a student account or visitor view where available. Follow your school\'s rules when using student information or inviting a class.' },
      { title: 'Try it and review the result', body: 'Give students a short set of instructions and a clear way to show what they learned. Complete the activity once yourself, then try it with a small group. Review responses or feedback before expanding it to a full lesson.' },
    ],
  };
}

// A fresh object keeps one view's edits from changing guides opened later.
// Accept a catalog website row; a plain URL pattern is also useful to callers.
export function quickStartFor(site) {
  if (!site || (typeof site !== 'object' && typeof site !== 'string')) return null;
  const pattern = typeof site === 'string' ? site : site.url_pattern;
  const url = patternUrl(pattern);
  const host = url?.hostname.replace(/^www\./, '');
  const alias = ALIASES[host];
  const match = url && matchSite(alias ? `https://${alias}` : url.href, SITE_ROWS);
  const suppliedName = typeof site.name === 'string' ? site.name.trim() : '';
  const guide = GUIDES[match?.url_pattern] || genericGuide(suppliedName || host || 'this website');
  return {
    title: `${guide.name} QuickStart`,
    overview: guide.overview,
    minutes: guide.sections.length,
    sections: guide.sections.map((section) => ({ ...section })),
  };
}
