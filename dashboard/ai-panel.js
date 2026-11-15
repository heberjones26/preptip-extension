// What the "AI tip builder" panel shows, from one row of rpc/ai_tip_summary. No DOM, so it can be
// unit-tested. Since the copy-and-paste path was removed, only Gemini builds are counted going
// forward; the copy/paste counts that older versions logged are kept as a history note so nothing
// that was recorded disappears.
export function aiPanelModel(row) {
  const n = (v) => Math.max(0, Number(v) || 0);
  const gemini = n(row?.built_with_gemini);
  const copied = n(row?.prompts_copied);
  const pasted = n(row?.built_from_paste);
  const parts = [];
  if (copied) parts.push(`${copied} prompt${copied === 1 ? '' : 's'} copied`);
  if (pasted) parts.push(`${pasted} tip${pasted === 1 ? '' : 's'} built from a pasted answer`);
  return {
    tiles: [
      { label: 'Tips built with Gemini', value: gemini, sub: 'with the teacher’s own key' },
      { label: 'Teachers using it', value: n(row?.teachers), sub: 'at least once' },
    ],
    none: !gemini && !copied && !pasted,
    legacy: parts.length ? `Earlier versions also offered copy and paste: ${parts.join(' and ')} in this period.` : '',
  };
}
