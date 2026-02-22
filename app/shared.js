// app/shared.js
export function isInteractiveSlide(slide) {
  return !!(slide && slide.visibility !== 'host' && slide.interaction && ['mcq','multi','short','match','group','draw','hotspot','labeling'].includes(slide.interaction.kind));
}

export function normalizeText(s, caseSensitive) {
  const t = (s ?? '').toString().trim();
  return caseSensitive ? t : t.toLowerCase();
}

export function scoreAnswer(slide, ans) {
  const pts = Number(slide?.interaction?.points ?? 1);
  const maxPts = Number.isFinite(pts) ? pts : 1;
  const kind = slide?.interaction?.kind;
  if (!kind) return { ok: false, points: 0, maxPts };

  if (kind === 'mcq') {
    const correct = Number(slide.interaction.correct);
    const given = Number(ans?.answerIndex);
    const ok = Number.isFinite(correct) && Number.isFinite(given) && correct === given;
    return { ok, points: ok ? maxPts : 0, maxPts };
  }

  if (kind === 'multi') {
    const correct = Array.isArray(slide.interaction.correct) ? slide.interaction.correct.map(Number).filter(Number.isFinite).sort((a,b)=>a-b) : [];
    const given = Array.isArray(ans?.answerIndexes) ? ans.answerIndexes.map(Number).filter(Number.isFinite).sort((a,b)=>a-b) : [];
    const ok = correct.length === given.length && correct.every((v,i)=>v===given[i]);
    return { ok, points: ok ? maxPts : 0, maxPts };
  }

  if (kind === 'short') {
    const want = normalizeText(slide.interaction.correctText, !!slide.interaction.caseSensitive);
    const got = normalizeText(ans?.answerText ?? ans?.text ?? '', !!slide.interaction.caseSensitive);
    const ok = !!slide.interaction.correctText && want && got && want === got;
    return { ok, points: ok ? maxPts : 0, maxPts };
  }

  return { ok: null, points: 0, maxPts };
}

export function escapeHtml(s) {
  return (s ?? '').toString()
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

export function uidShort(uid) {
  if (!uid) return '';
  const s = String(uid);
  return s.length > 8 ? s.slice(0,4) + '…' + s.slice(-4) : s;
}
