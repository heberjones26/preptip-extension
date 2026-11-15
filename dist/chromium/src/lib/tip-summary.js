// A local, deterministic recap of a tip. Views escape this plain text when rendering it.
const OVERVIEW_LIMIT = 320;
const ACTION_LIMIT = 240;

function text(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function concise(value, limit) {
  if (value.length <= limit) return value;
  const beginning = value.slice(0, limit - 1);
  const space = beginning.lastIndexOf(' ');
  return `${beginning.slice(0, space > limit / 2 ? space : beginning.length).trimEnd()}…`;
}

// Keep abbreviations such as U.S. and e.g. intact when shortening an instruction.
function firstSentence(value) {
  for (const match of value.matchAll(/[.!?]["'”’)\]]*\s+/g)) {
    const end = match.index + match[0].trimEnd().length;
    const token = value.slice(0, match.index + 1).split(' ').at(-1).replace(/^["'“‘(\[]+/, '');
    if (/^(?:[A-Za-z]\.){2,}$/.test(token)
      || /^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e)\.$/i.test(token)) continue;
    return value.slice(0, end);
  }
  return value;
}

function stepOrder(step, index) {
  const value = step?.step_order;
  const order = typeof value === 'number' || (typeof value === 'string' && value.trim())
    ? Number(value) : NaN;
  return Number.isFinite(order) && order > 0 ? order : index + 1;
}

export function summarizeTip(tip) {
  const source = Array.isArray(tip?.tip_steps) ? tip.tip_steps
    : Array.isArray(tip?.steps) ? tip.steps : [];
  const ordered = source.map((step, index) => ({ step, index, order: stepOrder(step, index) }))
    .sort((a, b) => a.order - b.order || a.index - b.index);
  const seen = new Set();
  const actions = [];
  for (const { step } of ordered) {
    const instruction = text(typeof step === 'string' ? step : step?.step_description);
    if (!instruction) continue;
    const action = concise(firstSentence(instruction), ACTION_LIMIT);
    const key = action.toLocaleLowerCase('en-US').replace(/[.!?]+$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(action);
  }

  const overview = text(tip?.summary) || text(tip?.description) || text(tip?.title)
    || actions[0] || 'This tip has no summary yet.';
  return { overview: concise(overview, OVERVIEW_LIMIT), actions };
}
