// app/reports.js
import { sessionDocRef, participantsColRef, answersColRef } from './firebase.js';
import { watchAuth, login, register, logout } from './auth.js';
import { getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { escapeHtml, isInteractiveSlide, scoreAnswer, uidShort } from './shared.js';

const $ = (id) => document.getElementById(id);
let currentUser = null;

function requireAuthView() {
  $('auth-box').classList.toggle('hidden', !!currentUser);
  $('app-box').classList.toggle('hidden', !currentUser);
  $('who').textContent = currentUser?.email || '—';
}

function setStatus(msg) {
  $('status').textContent = msg;
}

async function loadReport() {
  const pin = $('pin').value.trim();
  if (!pin) return alert('Въведи PIN.');
  setStatus('Зареждане на сесия…');

  const sSnap = await getDoc(sessionDocRef(pin));
  if (!sSnap.exists()) { setStatus('Сесията не е намерена.'); return; }
  const session = sSnap.data();

  // ✅ 1) Вземаме slides от session.lesson (ако е embed-нат),
  // иначе зареждаме от lessons/{lessonId}
  let slides = [];
  if (session?.lesson?.slides && Array.isArray(session.lesson.slides)) {
    slides = session.lesson.slides;
  } else {
    const lessonId = session.lessonId;
    if (!lessonId) { setStatus('Сесията няма lessonId.'); return; }

    setStatus('Зареждане на урок…');
    const lSnap = await getDoc(lessonsDocRef(lessonId));
    if (!lSnap.exists()) { setStatus('Урокът не е намерен.'); return; }
    slides = (lSnap.data()?.slides) || [];
  }

  const interactive = slides
    .map((s, idx) => ({ s, idx }))
    .filter(x => isInteractiveSlide(x.s));

  setStatus('Зареждане на участници…');
  const pSnap = await getDocs(participantsColRef(pin));
  const participants = pSnap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'bg'));

  setStatus('Зареждане на отговори…');
  const answersBySlide = {};
  for (const q of interactive) {
  const slideNo = q.idx + 1; // 1-базирано, както е в Firestore (responses/1, responses/3, ...)
  const aSnap = await getDocs(answersColRef(pin, slideNo));
  answersBySlide[q.idx] = Object.fromEntries(aSnap.docs.map(d => [d.id, d.data()]));

  const rows = participants.map(p => {
    let score = 0, max = 0, answered = 0, correct = 0;
    const detail = [];

    for (const q of interactive) {
      const ans = answersBySlide[q.idx]?.[p.uid] || null;
      const s = q.s;

      const { ok, points, maxPts } = scoreAnswer(s, ans);

      max += maxPts;
      if (ans) answered++;
      if (ok === true) correct++;
      score += points;

      detail.push({
        idx: q.idx,
        title: s.content?.title || ('Въпрос ' + (q.idx + 1)),
        kind: s.interaction.kind,
        ans, ok, points, maxPts,
        correctRef: s.interaction
      });
    }

    return { ...p, score, max, answered, total: interactive.length, correct, detail };
  });

  renderSummary(pin, session, rows, interactive);


function renderSummary(pin, session, rows, interactive) {
  $('report-title').textContent = `Рапорт за PIN ${pin}`;
  $('meta').textContent = `phase: ${session.phase || '—'} • activeSlideIdx: ${session.activeSlideIdx ?? '—'} • ученици: ${rows.length} • въпроси: ${interactive.length}`;

  const table = $('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Ученик</th>
        <th>Отговорени</th>
        <th>Верни</th>
        <th>Точки</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((r,i)=>`
        <tr data-i="${i}">
          <td><b>${escapeHtml(r.name || 'Ученик')}</b><div class="muted">${uidShort(r.uid)}</div></td>
          <td>${r.answered}/${r.total}</td>
          <td>${r.correct}/${r.total}</td>
          <td>${(Math.round(r.score*100)/100)} / ${r.max}</td>
          <td><button class="mini" data-open="${i}">Детайли</button></td>
        </tr>
      `).join('')}
    </tbody>
  `;

  table.querySelectorAll('button[data-open]').forEach(btn=>{
    btn.addEventListener('click', ()=> openDetails(rows[Number(btn.dataset.open)]));
  });

  setStatus('Готово ✅');
}

function renderAnswerPretty(kind, ans) {
  if (!ans) return '<span class="muted">—</span>';
  if (kind === 'mcq') return `<b>Избор:</b> ${ans.answerIndex ?? '—'}`;
  if (kind === 'multi') return `<b>Избор:</b> ${(ans.answerIndexes||[]).join(', ') || '—'}`;
  if (kind === 'short') return `<b>Текст:</b> ${escapeHtml(ans.answerText || ans.text || '')}`;
  return `<b>Пратено</b>`;
}

function openDetails(row) {
  const modal = $('modal');
  const body = $('modal-body');
  $('modal-title').textContent = `Детайли: ${row.name || 'Ученик'}`;

  body.innerHTML = row.detail.map(d=>{
    const status = d.ok === true ? 'ok' : d.ok === false ? 'bad' : 'na';
    const badge = d.ok === true ? '✅' : d.ok === false ? '❌' : '—';
    const correctInfo = (() => {
      if (d.kind === 'mcq') return `<div class="muted"><b>Правилен:</b> ${d.correctRef.correct}</div>`;
      if (d.kind === 'multi') return `<div class="muted"><b>Правилни:</b> ${(d.correctRef.correct||[]).join(', ')}</div>`;
      if (d.kind === 'short' && d.correctRef.correctText) return `<div class="muted"><b>Очакван:</b> ${escapeHtml(d.correctRef.correctText)}</div>`;
      return '';
    })();

    return `
      <div class="q ${status}">
        <div class="top">
          <div><b>#${d.idx+1}</b> • ${escapeHtml(d.title)} <span class="muted">(${escapeHtml(d.kind)})</span></div>
          <div class="score">${badge} ${d.points}/${d.maxPts}</div>
        </div>
        <div class="ans">${renderAnswerPretty(d.kind, d.ans)}</div>
        ${correctInfo}
      </div>
    `;
  }).join('') || '<div class="muted">Няма детайли.</div>';

  modal.classList.add('show');
}

function bindUI() {
  $('btn-login').onclick = async () => {
    try { await login($('email').value.trim(), $('pass').value); } catch(e){ alert(e.message); }
  };
  $('btn-register').onclick = async () => {
    try { await register($('email').value.trim(), $('pass').value); } catch(e){ alert(e.message); }
  };
  $('btn-logout').onclick = async () => logout();

  $('btn-load').onclick = loadReport;
  $('modal-close').onclick = ()=> $('modal').classList.remove('show');
  $('modal').addEventListener('click', (e)=> { if (e.target.id==='modal') $('modal').classList.remove('show'); });
}

watchAuth((u)=>{ currentUser=u; requireAuthView(); });
bindUI();
}
