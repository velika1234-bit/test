// app/builder.js
import { auth, lessonsColRef, lessonsDocRef } from './firebase.js';
import { watchAuth, login, register, logout } from './auth.js';
import { setDoc, getDocs, getDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { escapeHtml } from './shared.js';

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentLesson = null;

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 2400);
}

function requireAuthView() {
  $('auth-box').classList.toggle('hidden', !!currentUser);
  $('app-box').classList.toggle('hidden', !currentUser);
  $('who').textContent = currentUser?.email || '—';
}

async function loadLessonsList() {
  const list = $('lessons-list');
  list.innerHTML = '<div class="muted">Зареждане…</div>';
  const snap = await getDocs(lessonsColRef());
  const items = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(x => x.ownerUid === currentUser?.uid)
    .sort((a,b)=>(b.updatedAt?.toMillis?.()||0)-(a.updatedAt?.toMillis?.()||0));

  if (!items.length) {
    list.innerHTML = '<div class="muted">Нямаш уроци още. Натисни “Нов урок”.</div>';
    return;
  }

  list.innerHTML = items.map(x => `
    <button class="lesson-row" data-id="${x.id}">
      <div class="title">${escapeHtml(x.title || 'Урок')}</div>
      <div class="meta">${x.slides?.length || 0} слайда</div>
    </button>
  `).join('');

  list.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => openLesson(btn.dataset.id));
  });
}

function emptyLesson() {
  return {
    title: 'Нов урок',
    theme: { backgroundType: 'color', backgroundValue: '#111827', overlayOpacity: 0.45, fontPreset: 'large' },
    slides: [
      { visibility:'students', layout:'question', content:{ title:'MCQ', text:'Избери верния отговор.', image:'' }, interaction:{ kind:'mcq', options:['А','Б','В','Г'], correct:0, points:1 } }
    ]
  };
}

function renderSlideList() {
  const box = $('slides-list');
  if (!currentLesson) { box.innerHTML=''; return; }
  const active = Number($('slide-index').value || '0');
  box.innerHTML = currentLesson.slides.map((s, idx) => `
    <div class="slide-card ${idx===active ? 'active' : ''}" data-idx="${idx}">
      <div class="k">${escapeHtml(s.interaction?.kind || s.layout || 'content')}</div>
      <div class="t">${escapeHtml(s.content?.title || 'Слайд')}</div>
      <div class="m">${escapeHtml(s.visibility || 'students')}</div>
      <div class="actions">
        <button class="mini" data-act="up">↑</button>
        <button class="mini" data-act="down">↓</button>
        <button class="mini" data-act="dup">⎘</button>
        <button class="mini danger" data-act="del">✕</button>
      </div>
    </div>
  `).join('');

  box.querySelectorAll('.slide-card').forEach(card => {
    const idx = Number(card.dataset.idx);
    card.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (act) return;
      $('slide-index').value = String(idx);
      renderSlideList();
      renderEditor();
    });

    card.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        handleSlideAction(idx, b.dataset.act);
      });
    });
  });
}

function handleSlideAction(idx, act) {
  const slides = currentLesson.slides;
  if (act === 'up' && idx>0) [slides[idx-1], slides[idx]] = [slides[idx], slides[idx-1]];
  if (act === 'down' && idx<slides.length-1) [slides[idx+1], slides[idx]] = [slides[idx], slides[idx+1]];
  if (act === 'dup') slides.splice(idx+1, 0, JSON.parse(JSON.stringify(slides[idx])));
  if (act === 'del') slides.splice(idx, 1);
  if (Number($('slide-index').value) >= slides.length) $('slide-index').value = String(Math.max(0, slides.length-1));
  renderSlideList();
  renderEditor();
}

function addSlide(kind) {
  const base = { visibility:'students', layout: kind==='content'?'content':'question', content:{ title:'', text:'', image:'' } };
  let slide = null;
  if (kind === 'content') slide = { visibility:'students', layout:'content', content:{ title:'Ново съдържание', text:'', image:'' } };
  if (kind === 'mcq') slide = { ...base, content:{ title:'Тестов въпрос', text:'', image:'' }, interaction:{ kind:'mcq', options:['A','B','C','D'], correct:0, points:1 } };
  if (kind === 'short') slide = { ...base, content:{ title:'Отворен въпрос', text:'', image:'' }, interaction:{ kind:'short', correctText:'', caseSensitive:false, points:1 } };
  if (kind === 'match') slide = { ...base, content:{ title:'Свързване', text:'', image:'' }, interaction:{ kind:'match', pairs:[{left:'Ляво', right:'Дясно'}], points:1 } };
  if (kind === 'group') slide = { ...base, content:{ title:'Групиране', text:'', image:'' }, interaction:{ kind:'group', categories:['Кат1','Кат2'], labels:['Елемент1','Елемент2'], mapping:{0:0,1:1}, points:1 } };
  if (kind === 'draw') slide = { ...base, content:{ title:'Рисуване', text:'', image:'' }, interaction:{ kind:'draw', targetArea:{x:50,y:50,r:15}, points:1 } };
  if (kind === 'hotspot') slide = { ...base, content:{ title:'Посочване', text:'', image:'' }, interaction:{ kind:'hotspot', targetArea:{x:50,y:50,r:15}, points:1 } };

  currentLesson.slides.push(slide);
  $('slide-index').value = String(currentLesson.slides.length-1);
  renderSlideList();
  renderEditor();
}

function renderEditor() {
  const idx = Number($('slide-index').value || '0');
  const s = currentLesson?.slides?.[idx];
  const ed = $('editor');
  if (!s) { ed.innerHTML = '<div class="muted">Няма слайд.</div>'; return; }

  const kind = s.interaction?.kind || s.layout || 'content';

  const common = `
    <div class="row">
      <label>Visibility</label>
      <select id="ed-visibility">
        <option value="students" ${s.visibility==='students'?'selected':''}>students</option>
        <option value="host" ${s.visibility==='host'?'selected':''}>host</option>
      </select>
    </div>
    <div class="row">
      <label>Заглавие</label>
      <input id="ed-title" value="${escapeHtml(s.content?.title||'')}" />
    </div>
    <div class="row">
      <label>Текст</label>
      <textarea id="ed-text" rows="3">${escapeHtml(s.content?.text||'')}</textarea>
    </div>
    <div class="row">
      <label>Image URL</label>
      <input id="ed-image" value="${escapeHtml(s.content?.image||'')}" placeholder="https://..." />
    </div>
  `;

  function pointsRow() {
    const pts = Number(s.interaction?.points ?? 1);
    return `
      <div class="row">
        <label>Точки</label>
        <input id="ed-points" type="number" min="0" step="1" value="${pts}" />
      </div>
    `;
  }

  let specific = '';
  if (kind === 'mcq') {
    const opts = s.interaction.options || [];
    specific = `
      ${pointsRow()}
      <div class="row">
        <label>Опции (по ред)</label>
        <textarea id="ed-options" rows="4">${escapeHtml(opts.join('\n'))}</textarea>
      </div>
      <div class="row">
        <label>Правилен индекс (0..)</label>
        <input id="ed-correct" type="number" min="0" step="1" value="${Number(s.interaction.correct??0)}" />
      </div>
    `;
  } else if (kind === 'short') {
    specific = `
      ${pointsRow()}
      <div class="row">
        <label>Правилен текст (по избор)</label>
        <input id="ed-correctText" value="${escapeHtml(s.interaction.correctText||'')}" />
      </div>
      <div class="row inline">
        <label><input id="ed-case" type="checkbox" ${s.interaction.caseSensitive?'checked':''}/> Case sensitive</label>
      </div>
    `;
  } else if (kind === 'match') {
    const pairs = s.interaction.pairs || [];
    specific = `
      ${pointsRow()}
      <div class="row">
        <label>Двойки (ляво -> дясно), по ред</label>
        <textarea id="ed-pairs" rows="5">${escapeHtml(pairs.map(p=>`${p.left}->${p.right}`).join('\n'))}</textarea>
      </div>
    `;
  } else if (kind === 'group') {
    const cats = s.interaction.categories || [];
    const labels = s.interaction.labels || [];
    specific = `
      ${pointsRow()}
      <div class="row">
        <label>Категории (по ред)</label>
        <textarea id="ed-cats" rows="3">${escapeHtml(cats.join('\n'))}</textarea>
      </div>
      <div class="row">
        <label>Елементи (по ред)</label>
        <textarea id="ed-labels" rows="4">${escapeHtml(labels.join('\n'))}</textarea>
      </div>
      <div class="row">
        <label>Mapping (индекс елемент -> индекс категория) напр: 0:1,1:0</label>
        <input id="ed-map" value="${escapeHtml(Object.entries(s.interaction.mapping||{}).map(([k,v])=>`${k}:${v}`).join(','))}" />
      </div>
    `;
  } else if (kind === 'draw' || kind === 'hotspot') {
    const a = s.interaction.targetArea || {x:50,y:50,r:15};
    specific = `
      ${pointsRow()}
      <div class="row">
        <label>Target area x,y,r</label>
        <input id="ed-area" value="${a.x||50},${a.y||50},${a.r||15}" />
      </div>
    `;
  } else {
    specific = '';
  }

  ed.innerHTML = `
    <div class="pill">Тип: <b>${escapeHtml(kind)}</b></div>
    ${common}
    ${specific}
    <div class="row">
      <button id="btn-apply" class="btn primary">Приложи промените</button>
    </div>
  `;

  $('btn-apply').onclick = () => {
    s.visibility = $('ed-visibility').value;
    s.content = s.content || {};
    s.content.title = $('ed-title').value;
    s.content.text = $('ed-text').value;
    s.content.image = $('ed-image').value;

    if (s.interaction) {
      const pv = document.getElementById('ed-points');
      if (pv) s.interaction.points = Number(pv.value ?? s.interaction.points ?? 1);
    }

    if (kind === 'mcq') {
      const lines = $('ed-options').value.split('\n').map(x=>x.trim()).filter(Boolean);
      s.interaction.options = lines.length ? lines : ['A','B'];
      s.interaction.correct = Number($('ed-correct').value || 0);
    }
    if (kind === 'short') {
      s.interaction.correctText = $('ed-correctText').value;
      s.interaction.caseSensitive = $('ed-case').checked;
    }
    if (kind === 'match') {
      const pairs = $('ed-pairs').value.split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{
        const parts = line.split('->');
        const l = (parts[0]||'').trim();
        const r = (parts[1]||'').trim();
        return { left: l, right: r };
      });
      s.interaction.pairs = pairs.length ? pairs : [{left:'A', right:'B'}];
    }
    if (kind === 'group') {
      s.interaction.categories = $('ed-cats').value.split('\n').map(x=>x.trim()).filter(Boolean);
      s.interaction.labels = $('ed-labels').value.split('\n').map(x=>x.trim()).filter(Boolean);
      const mapping = {};
      $('ed-map').value.split(',').map(x=>x.trim()).filter(Boolean).forEach(pair=>{
        const [k,v]=pair.split(':').map(x=>x.trim());
        if (k!=='' && v!=='') mapping[Number(k)] = Number(v);
      });
      s.interaction.mapping = mapping;
    }
    if (kind === 'draw' || kind === 'hotspot') {
      const parts = $('ed-area').value.split(',').map(v=>Number(v.trim()));
      const x = parts[0], y = parts[1], r = parts[2];
      s.interaction.targetArea = { x: Number.isFinite(x)?x:50, y:Number.isFinite(y)?y:50, r:Number.isFinite(r)?r:15 };
    }

    renderSlideList();
    toast('Запазено локално (натисни "Запази урок")');
  };
}

async function newLesson() {
  currentLesson = emptyLesson();
  $('lesson-id').textContent = '— (не е записан)';
  $('lesson-title').value = currentLesson.title;
  $('slide-index').value = '0';
  renderSlideList();
  renderEditor();
  toast('Нов урок (локално)');
}

async function openLesson(id) {
  const snap = await getDoc(lessonsDocRef(id));
  if (!snap.exists()) return alert('Урокът не е намерен.');
  const d = snap.data();
  currentLesson = { title: d.title, theme: d.theme || {}, slides: d.slides || [] };
  $('lesson-id').textContent = id;
  $('lesson-title').value = currentLesson.title || 'Урок';
  $('slide-index').value = '0';
  renderSlideList();
  renderEditor();
}

async function saveLesson() {
  if (!currentLesson) return;
  const id = $('lesson-id').textContent;
  const title = $('lesson-title').value.trim() || 'Урок';
  currentLesson.title = title;

  const payload = {
    ownerUid: currentUser.uid,
    title,
    theme: currentLesson.theme || {},
    slides: currentLesson.slides || [],
    updatedAt: serverTimestamp(),
  };

  if (id && id !== '— (не е записан)') {
    await setDoc(lessonsDocRef(id), payload, { merge: true });
    toast('Урокът е обновен ✅');
  } else {
    const newId = 'lesson_' + Date.now().toString(36);
    await setDoc(lessonsDocRef(newId), { ...payload, createdAt: serverTimestamp() }, { merge: true });
    $('lesson-id').textContent = newId;
    toast('Урокът е записан ✅');
  }
  await loadLessonsList();
}

async function deleteLesson() {
  const id = $('lesson-id').textContent;
  if (!id || id === '— (не е записан)') return;
  if (!confirm('Да изтрия ли урока?')) return;
  await deleteDoc(lessonsDocRef(id));
  currentLesson = null;
  $('lesson-id').textContent = '—';
  $('lesson-title').value = '';
  $('slides-list').innerHTML = '';
  $('editor').innerHTML = '<div class="muted">Избери урок.</div>';
  toast('Изтрито');
  await loadLessonsList();
}

function bindUI() {
  $('btn-login').onclick = async () => {
    try { await login($('email').value.trim(), $('pass').value); } catch (e) { alert(e.message); }
  };
  $('btn-register').onclick = async () => {
    try { await register($('email').value.trim(), $('pass').value); } catch (e) { alert(e.message); }
  };
  $('btn-logout').onclick = async () => logout();

  $('btn-new').onclick = newLesson;
  $('btn-save').onclick = saveLesson;
  $('btn-delete').onclick = deleteLesson;

  document.querySelectorAll('[data-add]').forEach(b => {
    b.addEventListener('click', ()=> addSlide(b.dataset.add));
  });
}

watchAuth(async (u) => {
  currentUser = u;
  requireAuthView();
  if (currentUser) {
    await loadLessonsList();
    if (!currentLesson) await newLesson();
  }
});

bindUI();
