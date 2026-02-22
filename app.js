import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, onSnapshot, getDocs, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// === CONFIG ===
const appId = 'lessonmaster-live-test';
let firebaseConfig;
try { firebaseConfig = JSON.parse(__firebase_config); }
catch (e) {
  // ⬇️ СЛОЖИ ТУК ТВОЯ firebaseConfig (Project settings → Web app)
  firebaseConfig = {
    apiKey: "AIzaSyDPhxwYb2LmW-tYj3xtl5drDbrNjzZFeGw",
    authDomain: "lesson-master-b0ef4.firebaseapp.com",
    projectId: "lesson-master-b0ef4"
  };
}
const TEACHER_PASSWORD = 'vilidaf76'; // тестово

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Firestore paths
const sessionDocRef = (pin) => doc(db, 'artifacts', appId, 'public', 'data', 'sessions', pin);
const lessonsDocRef = (lessonId) => doc(db, 'artifacts', appId, 'public', 'data', 'lessons', lessonId);
const participantsColRef = (pin) => collection(db, 'artifacts', appId, 'public', 'data', 'sessions', pin, 'participants');
const participantDocRef = (pin, uid) => doc(db, 'artifacts', appId, 'public', 'data', 'sessions', pin, 'participants', uid);
const answersColRef = (pin, slideIdx) => collection(db, 'artifacts', appId, 'public', 'data', 'sessions', pin, 'responses', String(slideIdx), 'answers');
const answerDocRef = (pin, slideIdx, uid) => doc(db, 'artifacts', appId, 'public', 'data', 'sessions', pin, 'responses', String(slideIdx), 'answers', uid);

const FONT_PRESETS = { standard: 1.00, large: 1.18, xlarge: 1.32 };

// === DEMO LESSONS / TEMPLATES ===
const lessonTemplates = {
  classbuddy: {
    title: 'Как работи интерактивният урок',
    theme: {
      backgroundType: 'image',
      backgroundValue: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1600&q=60',
      overlayOpacity: 0.42,
      fontPreset: 'large'
    },
    slides: [
      { visibility: 'host', layout: 'title', content: { title: '1) Въведение', subtitle: 'Какво ще правим днес', image: '' } },
      { visibility: 'host', layout: 'content', content: { title: '2) Кратко обяснение', text: 'Показваш пример и задаваш фокус въпрос към класа.', image: '' } },
      { visibility: 'students', layout: 'question', content: { title: '3) Бърз въпрос', text: 'Кое твърдение е вярно?', image: '' }, interaction: { kind: 'mcq', options: ['Опция A', 'Опция B', 'Опция C', 'Опция D'], correct: 1, points: 2 } },
      { visibility: 'students', layout: 'question', content: { title: '4) Приложение', text: 'Маркирай всички верни отговори.', image: '' }, interaction: { kind: 'multi', options: ['A', 'B', 'C', 'D'], correct: [0, 2], points: 2 } },
      { visibility: 'students', layout: 'question', content: { title: '5) Рефлексия', text: 'Напиши с 1 дума какво запомни.', image: '' }, interaction: { kind: 'short', correctText: 'пример', caseSensitive: false, points: 2 } },
      { visibility: 'host', layout: 'content', content: { title: '6) Обобщение', text: 'Финални изводи и домашна работа.', image: '' } }
    ]
  },
  'quick-quiz': {
    title: 'Quick Quiz (5 въпроса)',
    theme: {
      backgroundType: 'image',
      backgroundValue: 'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=1600&q=60',
      overlayOpacity: 0.36,
      fontPreset: 'large'
    },
    slides: [
      { visibility: 'host', layout: 'title', content: { title: 'Quick Quiz', subtitle: '5 въпроса • 10 точки', image: '' } },
      { visibility: 'students', layout: 'question', content: { title: 'Въпрос 1', text: 'Избери верния отговор.', image: '' }, interaction: { kind: 'mcq', options: ['А', 'Б', 'В', 'Г'], correct: 2, points: 2 } },
      { visibility: 'students', layout: 'question', content: { title: 'Въпрос 2', text: 'Маркирай всички верни.', image: '' }, interaction: { kind: 'multi', options: ['A', 'B', 'C', 'D'], correct: [1, 3], points: 2 } },
      { visibility: 'students', layout: 'question', content: { title: 'Въпрос 3', text: 'Една ключова дума.', image: '' }, interaction: { kind: 'short', correctText: 'пример', caseSensitive: false, points: 2 } },
      { visibility: 'students', layout: 'question', content: { title: 'Въпрос 4', text: 'Свържи етикетите.', image: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1400&q=60' }, interaction: { kind: 'labeling', targets: [{ x: 35, y: 35, text: 'Етикет 1' }, { x: 70, y: 55, text: 'Етикет 2' }, { x: 50, y: 75, text: 'Етикет 3' }], points: 2 } },
      { visibility: 'host', layout: 'content', content: { title: 'Въпрос 5 (дискусия)', text: 'Обсъдете най-трудния въпрос.', image: '' } }
    ]
  },
  science: {
    title: 'Природни науки: Вода и климат',
    theme: {
      backgroundType: 'image',
      backgroundValue: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=1600&q=60',
      overlayOpacity: 0.4,
      fontPreset: 'large'
    },
    slides: [
      { visibility: 'host', layout: 'title', content: { title: 'Цикъл на водата', subtitle: 'Наблюдение → Извод', image: '' } },
      { visibility: 'host', layout: 'split', content: { title: 'Изпарение', text: 'Загряването превръща водата в пара.', image: 'https://images.unsplash.com/photo-1546549032-9571cd6b27df?auto=format&fit=crop&w=1200&q=60' } },
      { visibility: 'students', layout: 'question', content: { title: 'Проверка', text: 'Кой етап е след кондензация?', image: '' }, interaction: { kind: 'mcq', options: ['Валеж', 'Изпарение', 'Събиране', 'Инфилтрация'], correct: 0, points: 2 } },
      { visibility: 'students', layout: 'question', content: { title: 'Приложи', text: 'Маркирай факторите за по-бързо изпарение.', image: '' }, interaction: { kind: 'multi', options: ['Висока температура', 'Сянка', 'Вятър', 'Ниска влажност'], correct: [0, 2, 3], points: 3 } },
      { visibility: 'host', layout: 'content', content: { title: 'Извод', text: 'Температура + вятър + влажност влияят на скоростта на изпарение.', image: '' } }
    ]
  }
};

const demoLesson = lessonTemplates.classbuddy;
// === STATE ===
let currentUser = null;
let mode = 'welcome';

let hostPin = null, hostLessonId = null, hostLesson = null, hostActiveSlideIdx = -1, hostPhase = 'waiting', hostAttention = false;
let hostGradedSlides = new Set();

// Roster UI state
let hostParticipants = []; // [{uid,name}]
let answeredUids = new Set();
let rosterLocked = false;
let rosterCollapsed = false;

let studentPin = null, studentLessonId = null, studentLesson = null, studentActiveSlideIdx = -1, studentPhase = 'waiting', studentAttention = false;
let hostParticipantsCount = 0, hostAnsweredCount = 0;

let isPresent = false;

const lessonCacheKey = (lessonId) => `lm_lesson_cache_${lessonId}`;
function cacheLesson(lessonId, lessonObj) { try { localStorage.setItem(lessonCacheKey(lessonId), JSON.stringify(lessonObj)); } catch (e) { } }
function getCachedLesson(lessonId) { try { const raw = localStorage.getItem(lessonCacheKey(lessonId)); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }

let unsub = {
  session: null,
  participants: null,
  answers: null,
  answerMine: null,
  rosterParticipants: null,
  rosterAnswers: null
};

// === UI HELPERS ===
const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove('hidden');
const hide = (id) => $(id).classList.add('hidden');
const setPill = (id, text) => $(id).textContent = text;

// --- Participants listener (FIXED: always listen to the correct pin, no recursion) ---
function setParticipantsListener(pin) {
  const p = String(pin || "");
  if (!p) return; // no pin yet → don't start

  // stop previous listener (if any)
  if (unsub.participants) {
    try { unsub.participants(); } catch (e) {}
    unsub.participants = null;
  }

  unsub.participants = onSnapshot(participantsColRef(p), (psnap) => {
    hostParticipantsCount = psnap.size;

    const el = $('stat-participants');
    if (el) el.textContent = String(psnap.size);

    try { syncPresentBadges(); } catch (e) {}
  });
}
function setMode(nextMode) {
  mode = nextMode;
  hide('screen-welcome'); hide('screen-host'); hide('screen-student');
  if (nextMode === 'welcome') show('screen-welcome');
  if (nextMode === 'host') show('screen-host');
  if (nextMode === 'student') show('screen-student');
  setPill('mode-pill', `MODE: ${nextMode.toUpperCase()}`);
}

// --- ROSTER (who answered) ---
function setRosterCollapsed(next) {
  rosterCollapsed = next;
  const body = document.getElementById('roster-body');
  if (body) body.style.display = rosterCollapsed ? 'none' : 'block';
}

function safeText(s) {
  return String(s || '').replace(/[<>&"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
}

function renderRoster() {
  const grid = document.getElementById('roster-grid');
  const totalEl = document.getElementById('roster-total-count');
  const ansEl = document.getElementById('roster-answered-count');
  if (!grid || !totalEl || !ansEl) return;

  const sorted = [...hostParticipants].sort((a, b) => {
    const aAnswered = answeredUids.has(a.uid);
    const bAnswered = answeredUids.has(b.uid);
    if (aAnswered === bAnswered) return (a.name || '').localeCompare(b.name || '', 'bg');
    return aAnswered ? 1 : -1; // non-answered first
  });

  let answered = 0;
  const items = sorted.map(p => {
    const isAnswered = answeredUids.has(p.uid);
    const status = rosterLocked ? (isAnswered ? 'answered' : 'missed') : (isAnswered ? 'answered' : 'pending');
    if (isAnswered) answered++;

    const badge = status === 'answered' ? '🟢' : status === 'pending' ? '🔴' : '⚪';
    const cls =
      status === 'answered' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
        status === 'pending' ? 'bg-rose-50 border-rose-200 text-rose-800' :
          'bg-slate-50 border-slate-200 text-slate-600';

    return `<div class="px-3 py-2 rounded-xl border ${cls} text-xs font-black flex items-center gap-2">
      <span>${badge}</span><span class="truncate">${safeText(p.name || 'Ученик')}</span>
    </div>`;
  }).join('');

  grid.innerHTML = items || `<div class="col-span-full text-center text-slate-400 font-bold py-6">Няма участници още.</div>`;
  totalEl.textContent = String(hostParticipants.length);
  ansEl.textContent = String(answered);
}

function resetRosterForSlide() {
  answeredUids = new Set();
  rosterLocked = false;
  renderRoster();
}

function bindRosterUI() {
  const btn = document.getElementById('roster-toggle');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => setRosterCollapsed(!rosterCollapsed));
  }
  setRosterCollapsed(false);
}

function attachRosterListeners() {
  if (!hostPin) return;

  if (unsub.rosterParticipants) { unsub.rosterParticipants(); unsub.rosterParticipants = null; }
  unsub.rosterParticipants = onSnapshot(participantsColRef(hostPin), (snap) => {
    hostParticipants = snap.docs.map(d => ({ uid: d.id, name: (d.data() || {}).name || '' }));
    renderRoster();
  });

  attachRosterAnswersListener(hostActiveSlideIdx);
}

function attachRosterAnswersListener(slideIdx) {
  if (!hostPin) return;
  if (unsub.rosterAnswers) { unsub.rosterAnswers(); unsub.rosterAnswers = null; }

  if (slideIdx == null || slideIdx < 0) {
    answeredUids = new Set();
    renderRoster();
    return;
  }

  unsub.rosterAnswers = onSnapshot(answersColRef(hostPin, slideIdx), (snap) => {
    const set = new Set();
    snap.docs.forEach(d => set.add(d.id));
    answeredUids = set;
    renderRoster();
  });
}

function setStatus(text) { setPill('status-pill', `STATUS: ${text}`); }

function computeLessonTotals(lesson) {
  const slides = lesson?.slides || [];
  let totalQuestions = 0;
  let maxScore = 0;
  for (const s of slides) {
    if (isInteractiveSlide(s)) {
      totalQuestions++;
      const pts = Number(s.interaction?.points ?? 1);
      maxScore += (Number.isFinite(pts) ? pts : 1);
    }
  }
  return { totalQuestions, maxScore };
}

function isInteractiveSlide(slide) {
  return !!(slide && slide.visibility !== 'host' && slide.interaction && ['mcq', 'multi', 'short', 'labeling'].includes(slide.interaction.kind));
}

function getFontScale(theme) {
  const preset = theme?.fontPreset || 'large';
  return FONT_PRESETS[preset] || 1.0;
}

// === AUTH ===
onAuthStateChanged(auth, (u) => {
  currentUser = u;
  setStatus(u ? `signed-in (${u.isAnonymous ? 'anon' : 'user'})` : 'signed-out');
});
async function ensureAnonAuth() { if (!auth.currentUser) await signInAnonymously(auth); }

// === HOST FLOW ===
function genPin() { return String(Math.floor(1000 + Math.random() * 9000)); }
function genLessonId() { return 'lesson-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

async function hostLogin() {
  const pw = $('teacher-pass').value;
  if (pw !== TEACHER_PASSWORD) { alert('Грешна парола (тест).'); return; }
  await ensureAnonAuth();

  const localDemo = JSON.parse(localStorage.getItem('lm_demo_lesson') || 'null');
  hostLesson = localDemo || demoLesson;

  // Sync preset UI from lesson
  const preset = hostLesson?.theme?.fontPreset || 'large';
  $('host-font-preset').value = preset;
  $('present-font-preset').value = preset;

  hostLessonId = genLessonId();
  await setDoc(lessonsDocRef(hostLessonId), {
    lessonId: hostLessonId,
    hostUid: auth.currentUser.uid,
    title: hostLesson.title,
    theme: hostLesson.theme || { backgroundType: 'color', backgroundValue: '#111827', overlayOpacity: 0.45, fontPreset: 'large' },
    slides: hostLesson.slides,
    createdAt: serverTimestamp(),
    scoredSlides: {}
  });

  hostGradedSlides = new Set();
  hostPin = genPin();
  await setDoc(sessionDocRef(hostPin), {
    pin: hostPin,
    hostUid: auth.currentUser.uid,
    title: hostLesson.title,
    lessonId: hostLessonId,

        // 🔥 snapshot of the lesson for students (avoids extra reads/race conditions)
        lesson: {
          title: hostLesson.title,
          theme: hostLesson.theme || {},
          slides: hostLesson.slides || []
        },
    activeSlideIdx: -1,
    phase: 'waiting',          // waiting | active | answering | locked | reveal | done
    attention: false,
    createdAt: serverTimestamp()
  });

  $('host-pin').textContent = hostPin;
  $('host-lesson-id').textContent = hostLessonId;
  const joinLink = `${window.location.origin}${window.location.pathname}?pin=${hostPin}`;
  $('host-join-link').textContent = joinLink;

  setMode('host');
  attachHostListeners(hostPin);
  renderHostSurface(null);
  syncPresentBadges();
}

async function hostStart() {
  if (!hostPin) return;
  hostActiveSlideIdx = 0;
  const slide = hostLesson?.slides?.[hostActiveSlideIdx] ?? null;
  hostPhase = isInteractiveSlide(slide) ? 'answering' : 'active';
  await updateDoc(sessionDocRef(hostPin), { activeSlideIdx: hostActiveSlideIdx, phase: hostPhase });
}

async function hostNext() {
  if (!hostPin) return;
  const nextIdx = hostActiveSlideIdx + 1;
  if (!hostLesson || nextIdx >= hostLesson.slides.length) {
    await updateDoc(sessionDocRef(hostPin), { phase: 'done' });
    alert('Край на урока.');
    return;
  }
  hostActiveSlideIdx = nextIdx;
  const slide = hostLesson?.slides?.[hostActiveSlideIdx] ?? null;
  hostPhase = isInteractiveSlide(slide) ? 'answering' : 'active';
  await updateDoc(sessionDocRef(hostPin), { activeSlideIdx: hostActiveSlideIdx, phase: hostPhase });
}

async function hostLock() {
  if (hostPin) await updateDoc(sessionDocRef(hostPin), { phase: 'locked' });
  rosterLocked = true;
  renderRoster();
}

async function hostReveal() {
  if (hostPin) await updateDoc(sessionDocRef(hostPin), { phase: 'reveal' });
  rosterLocked = true;
  renderRoster();
}

async function hostToggleAttention() {
  if (!hostPin) return;
  hostAttention = !hostAttention;
  await updateDoc(sessionDocRef(hostPin), { attention: hostAttention });
}

async function hostEnd() {
  if (!hostPin) return;
  await updateDoc(sessionDocRef(hostPin), { phase: 'done' });
  cleanupSubs();
  hostPin = null; hostLessonId = null; hostLesson = null;
  if (isPresent) await exitPresentMode();
  setMode('welcome');
}

function cleanupSubs() {
  Object.values(unsub).forEach(fn => { try { fn && fn(); } catch (e) { } });
  unsub = {
    session: null,
    participants: null,
    answers: null,
    answerMine: null,
    rosterParticipants: null,
    rosterAnswers: null
  };
}

async function ensureHostLessonLoaded(lessonId) {
  if (hostLesson && hostLessonId === lessonId) return;
  const cached = getCachedLesson(lessonId);
  if (cached) { hostLesson = cached; hostLessonId = lessonId; return; }
  const lSnap = await getDoc(lessonsDocRef(lessonId));
  const data = lSnap.data();
  if (data) {
    hostLesson = { title: data.title, theme: data.theme, slides: data.slides };
    hostLessonId = lessonId;
    cacheLesson(lessonId, hostLesson);
  }
}

function applyTheme(theme, bgEl, overlayEl) {
  const t = theme || { backgroundType: 'color', backgroundValue: '#111827', overlayOpacity: 0.45, fontPreset: 'large' };
  const type = t.backgroundType || 'color';
  const value = t.backgroundValue || '#111827';
  const op = Number(t.overlayOpacity ?? 0.45);

  if (type === 'image') {
    bgEl.style.backgroundImage = value ? `url('${value}')` : 'none';
    bgEl.style.backgroundColor = 'transparent';
  } else {
    bgEl.style.backgroundImage = 'none';
    bgEl.style.backgroundColor = value;
  }
  overlayEl.style.background = `rgba(0,0,0,${Math.max(0, Math.min(0.9, op))})`;
}

function attachHostListeners(pin) {
  cleanupSubs();

  unsub.session = onSnapshot(sessionDocRef(pin), async (snap) => {
    const d = snap.data();
    if (!d) return;

    // ✅ Source of truth: pin from the session doc
    if (d.pin) setParticipantsListener(d.pin);

    hostLessonId = d.lessonId || hostLessonId;
    hostActiveSlideIdx = d.activeSlideIdx ?? -1;
    hostPhase = d.phase || 'waiting';
    hostAttention = !!d.attention;

    $('btn-host-attn').textContent = hostAttention ? 'Attention: ON' : 'Attention';

    if (hostLessonId) await ensureHostLessonLoaded(hostLessonId);

    // apply theme and preset to UI
    const scalePreset = hostLesson?.theme?.fontPreset || 'large';
    $('host-font-preset').value = scalePreset;
    $('present-font-preset').value = scalePreset;

    applyTheme(hostLesson?.theme, $('host-bg'), $('host-overlay'));
    applyTheme(hostLesson?.theme, $('present-bg'), $('present-overlay'));

    const slide = (hostLesson?.slides && hostActiveSlideIdx >= 0) ? hostLesson.slides[hostActiveSlideIdx] : null;

    $('host-slide-counter').textContent = hostLesson ? `${Math.max(hostActiveSlideIdx, 0) + 1} / ${hostLesson.slides.length}` : '—';
    $('host-slide-title').textContent = slide?.content?.title || '—';
    $('host-slide-meta').textContent = slide
      ? `layout: ${slide.layout || '—'} • phase: ${hostPhase} • attention: ${hostAttention ? 'ON' : 'OFF'}`
      : '—';

    renderHostSurface(slide);
    renderPresentSurface(slide);
    syncPresentBadges();

    // answers listener for current slide
    if (unsub.answers) { unsub.answers(); unsub.answers = null; }
    hostAnsweredCount = 0;

    if (slide && hostActiveSlideIdx >= 0 && isInteractiveSlide(slide)) {
      unsub.answers = onSnapshot(answersColRef(pin, hostActiveSlideIdx), (qsnap) => {
        const answers = qsnap.docs.map(x => ({ id: x.id, ...x.data() }));
        hostAnsweredCount = answers.length;
        $('stat-answered').textContent = String(answers.length);
        syncPresentBadges();
        renderStatsForSlide(slide, answers);
      });
    } else {
      $('stat-answered').textContent = '0';
      syncPresentBadges();
      $('stat-mcq').innerHTML = `<div class="muted font-bold">—</div>`;
      $('stat-short').innerHTML = `<div class="muted font-bold">—</div>`;
      $('stat-labeling').textContent = '—';
    }
  });

  // ⚠️ IMPORTANT: do NOT start a second participants listener here.
  // It is started from the session snapshot using d.pin (source of truth).
}

function renderHostSurface(slide) {
  $('host-slide-surface').innerHTML = renderSlideHTML(slide, false);
}
function renderPresentSurface(slide) {
  $('present-surface').innerHTML = renderSlideHTML(slide, true);
}

function renderSlideHTML(slide, big) {
  const theme = hostLesson?.theme || demoLesson.theme;
  const scale = getFontScale(theme);

  if (!slide) {
    return `
      <div class="slide-card">
        <div class="${big ? 'text-4xl' : 'text-xl'} font-black">Стартирай сесия и натисни Start.</div>
        <div class="muted font-bold mt-3 ${big ? 'text-xl' : ''}">Учениците ще виждат само интерактивните дейности.</div>
      </div>
    `;
  }

  // Student-only slide: presenter hint
  if (slide.visibility === 'students') {
    const bodyPx = Math.round((big ? 34 : 18) * scale);
    return `
      <div class="slide-card">
        <div class="slide-title ${big ? '' : 'text-3xl'}" style="${big ? `font-size:${Math.round(72 * scale)}px;` : ''}">${escapeHtml(slide.content?.title || 'Дейност')}</div>
        <div class="slide-text mt-5" style="font-size:${bodyPx}px;">${escapeHtml(slide.content?.text || '')}</div>
        <div class="muted font-black mt-6" style="font-size:${Math.round(26 * scale)}px;">👩‍🎓 Учениците отговарят на телефони.</div>
      </div>
    `;
  }

  // Host templates
  const layout = slide.layout || 'content';
  const c = slide.content || {};

  const titlePx = Math.round((big ? 72 : 44) * scale);
  const subPx = Math.round((big ? 44 : 22) * scale);
  const textPx = Math.round((big ? 40 : 18) * scale);

  if (layout === 'title') {
    return `
      <div class="slide-card" style="text-align:center;">
        <div class="slide-title" style="font-size:${titlePx}px;">${escapeHtml(c.title || 'Заглавие')}</div>
        ${c.subtitle ? `<div class="font-black mt-6" style="color: rgb(51 65 85); font-size:${subPx}px;">${escapeHtml(c.subtitle)}</div>` : ''}
      </div>
    `;
  }

  if (layout === 'content') {
    return `
      <div class="slide-card">
        <div class="slide-title" style="font-size:${Math.round((big ? 60 : 38) * scale)}px;">${escapeHtml(c.title || 'Заглавие')}</div>
        ${c.text ? `<div class="slide-text mt-6" style="font-size:${textPx}px;">${escapeHtml(c.text)}</div>` : ''}
        ${c.image ? `
          <div class="img-frame mt-8" style="height:${big ? '420px' : '280px'};">
            <img src="${escapeAttr(c.image)}" alt="">
          </div>` : ''}
      </div>
    `;
  }

  if (layout === 'split') {
    const side = c.splitSide || 'imageRight';
    const imgBlock = c.image ? `
      <div class="img-frame" style="height:${big ? '520px' : '340px'};">
        <img src="${escapeAttr(c.image)}" alt="">
      </div>` : `
      <div class="img-frame flex items-center justify-center" style="height:${big ? '520px' : '340px'};">
        <div class="muted font-black">Няма снимка</div>
      </div>`;

    const textBlock = `
      <div class="slide-card" style="box-shadow:none; margin:0; max-width:none;">
        <div class="slide-title" style="font-size:${Math.round((big ? 60 : 38) * scale)}px;">${escapeHtml(c.title || 'Заглавие')}</div>
        ${c.text ? `<div class="slide-text mt-6" style="font-size:${textPx}px;">${escapeHtml(c.text)}</div>` : ''}
      </div>`;

    const left = side === 'imageLeft' ? imgBlock : textBlock;
    const right = side === 'imageLeft' ? textBlock : imgBlock;

    return `
      <div style="display:grid; grid-template-columns: ${big ? '1.05fr 0.95fr' : '1.1fr 0.9fr'}; gap:${big ? '24px' : '18px'}; align-items:center;">
        <div>${left}</div>
        <div>${right}</div>
      </div>
    `;
  }

  return `
    <div class="slide-card">
      <div class="slide-title" style="font-size:${Math.round((big ? 56 : 34) * scale)}px;">${escapeHtml(c.title || 'Слайд')}</div>
      <div class="slide-text mt-5" style="font-size:${textPx}px;">${escapeHtml(c.text || '')}</div>
    </div>
  `;
}

function renderStatsForSlide(slide, answers) {
  const kind = slide.interaction.kind;

  if (kind === 'mcq' || kind === 'multi') {
    const opts = slide.interaction.options || [];
    const counts = Array(opts.length).fill(0);

    for (const a of answers) {
      if (kind === 'mcq') {
        const idx = Number(a.answerIndex);
        if (!Number.isNaN(idx) && idx >= 0 && idx < counts.length) counts[idx]++;
      } else {
        const arr = Array.isArray(a.answerIndexes) ? a.answerIndexes : [];
        for (const x of arr) {
          const idx = Number(x);
          if (!Number.isNaN(idx) && idx >= 0 && idx < counts.length) counts[idx]++;
        }
      }
    }

    $('stat-mcq').innerHTML = opts.map((t, i) => {
      const correct = Array.isArray(slide.interaction.correct)
        ? slide.interaction.correct.includes(i)
        : (i === slide.interaction.correct);
      return `
        <div class="flex items-center justify-between">
          <div class="font-black ${correct ? 'text-emerald-700' : 'text-slate-700'}">${i + 1}. ${escapeHtml(t)}${correct ? ' ✅' : ''}</div>
          <div class="font-black">${counts[i] || 0}</div>
        </div>
      `;
    }).join('');

    $('stat-short').innerHTML = `<div class="muted font-bold">—</div>`;
    $('stat-labeling').textContent = '—';
    return;
  }

  if (kind === 'short') {
    $('stat-mcq').innerHTML = `<div class="muted font-bold">—</div>`;
    const preview = answers.slice(0, 10).map(a => {
      const txt = (a.answerText ?? '').toString();
      return `<div class="p-2 rounded-xl bg-slate-50 border border-slate-200">
        <div class="text-xs font-black uppercase tracking-widest muted">${escapeHtml(a.name || a.id)}</div>
        <div class="font-black">${escapeHtml(txt) || '—'}</div>
      </div>`;
    }).join('');
    $('stat-short').innerHTML = preview || `<div class="muted font-bold">Няма отговори още.</div>`;
    $('stat-labeling').textContent = '—';
    return;
  }

  if (kind === 'labeling') {
    $('stat-mcq').innerHTML = `<div class="muted font-bold">—</div>`;
    $('stat-short').innerHTML = `<div class="muted font-bold">—</div>`;
    $('stat-labeling').textContent = `${answers.length} отговора (преглед по-късно)`;
    return;
  }
}

// === PRESENTATION MODE ===
async function enterPresentMode() {
  if (isPresent) return;
  isPresent = true;
  document.body.classList.add('present');
  $('present-shell').classList.remove('hidden');

  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  } catch (e) { }
  syncPresentBadges();
  renderPresentSurface((hostLesson?.slides && hostActiveSlideIdx >= 0) ? hostLesson.slides[hostActiveSlideIdx] : null);
}

async function exitPresentMode() {
  if (!isPresent) return;
  isPresent = false;
  document.body.classList.remove('present');
  $('present-shell').classList.add('hidden');
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) { }
}

function syncPresentBadges() {
  $('present-pin').textContent = hostPin || '—';
  $('present-counter').textContent = hostLesson ? `${Math.max(hostActiveSlideIdx, 0) + 1} / ${hostLesson.slides.length}` : '—';
  $('present-answered').textContent = `${hostAnsweredCount}/${hostParticipantsCount}`;
}

// === STUDENT FLOW ===
async function ensureStudentLessonLoaded(lessonId) {
  if (studentLesson && studentLessonId === lessonId) return;
  const cached = getCachedLesson(lessonId);
  if (cached) { studentLesson = cached; studentLessonId = lessonId; return; }
  const lSnap = await getDoc(lessonsDocRef(lessonId));
  const data = lSnap.data();
  if (data) {
    studentLesson = { title: data.title, theme: data.theme, slides: data.slides };
    studentLessonId = lessonId;
    cacheLesson(lessonId, studentLesson);
  }
}

async function studentJoin(pin) {
  await ensureAnonAuth();
  const name = $('student-name').value.trim() || 'Ученик';
  studentPin = pin;
  $('student-pin-active').textContent = pin;

  // Load lessonId from session first so we can compute totals
  const sSnap0 = await getDoc(sessionDocRef(pin));
  const sData0 = sSnap0.data();
  studentLessonId = sData0?.lessonId || studentLessonId;
  if (studentLessonId) await ensureStudentLessonLoaded(studentLessonId);

  const totals = computeLessonTotals(studentLesson);
  await setDoc(participantDocRef(pin, auth.currentUser.uid), {
    name,
    joinedAt: serverTimestamp(),
    score: 0,
    correctCount: 0,
    totalQuestions: totals.totalQuestions,
    maxScore: totals.maxScore
  }, { merge: true });
  setMode('student');
  attachStudentListeners(pin);
  showStudentWaiting('Гледай екрана отпред…');
}

function attachStudentListeners(pin) {
  cleanupSubs();

  unsub.session = onSnapshot(sessionDocRef(pin), async (snap) => {
    const d = snap.data();
    if (!d) { showStudentWaiting('Сесията не е намерена.'); return; }

    studentLessonId = d.lessonId || studentLessonId;
    studentActiveSlideIdx = d.activeSlideIdx ?? -1;
    studentPhase = d.phase || 'waiting';
    studentAttention = !!d.attention;

    if (studentPhase === 'done') { await showStudentFinal(pin); return; }
    if (studentAttention) {
      showStudentWaiting('👀 Внимание към екрана отпред…');
      return;
    }
    if (!studentLessonId && !(d.lesson?.slides?.length)) { showStudentWaiting('Зареждам урок…'); return; }

    // ✅ Prefer lesson snapshot from session (no extra reads / no race)
        if (d.lesson?.slides?.length) {
          studentLesson = d.lesson;
          studentLessonId = studentLessonId || d.lessonId || 'inline';
        } else {
          await ensureStudentLessonLoaded(studentLessonId);
        }
    const slide = (studentLesson?.slides && studentActiveSlideIdx >= 0) ? studentLesson.slides[studentActiveSlideIdx] : null;

    if (!slide || !isInteractiveSlide(slide)) {
      const msg = studentPhase === 'waiting' ? 'Очакваме старт…' : 'Гледай екрана отпред…';
      showStudentWaiting(msg);
      return;
    }

    showStudentInteraction(slide, studentPhase, studentActiveSlideIdx);

    // subscribe to my answer for this slide
    if (unsub.answerMine) { unsub.answerMine(); unsub.answerMine = null; }

    unsub.answerMine = onSnapshot(answerDocRef(pin, studentActiveSlideIdx, auth.currentUser.uid), (aSnap) => {
      const myAnswerCache = aSnap.exists() ? aSnap.data() : null;
      const exists = !!myAnswerCache;
      updateStudentSubmitState({ hasAnswer: exists, phase: studentPhase });
      $('student-sent').classList.toggle('hidden', !exists);
      updateStudentFeedback(slide, studentPhase, myAnswerCache);
    });
  });

  function updateStudentFeedback(slide, phase, myAnswer) {
    const fb = $('student-feedback');
    fb.classList.add('hidden');
    fb.classList.remove('bg-emerald-50', 'text-emerald-700', 'bg-rose-50', 'text-rose-700', 'bg-slate-100', 'text-slate-700');

    if (!myAnswer) return;
    if (phase !== 'locked' && phase !== 'reveal') return;

    const kind = slide?.interaction?.kind;

    if (kind === 'labeling') {
      const { hit, total } = labelingStats(slide, myAnswer);
      const pts = Number(slide?.interaction?.points ?? 1);
      const maxPts = Number.isFinite(pts) ? pts : 1;
      const earned = earnedPoints(slide, myAnswer);

      if (total > 0) {
        const ok = hit === total;
        fb.textContent = ok
          ? `Перфектно! ✅ (${hit}/${total})`
          : `Верни етикети: ${hit}/${total} • Точки: ${earned.toFixed(2)} / ${maxPts}`;
        fb.classList.add(ok ? 'bg-emerald-50' : 'bg-slate-100', ok ? 'text-emerald-700' : 'text-slate-700');
        fb.classList.remove('hidden');
      }
      return;
    }

    const ok = isAnswerCorrect(slide, myAnswer);
    fb.textContent = ok ? 'Вярно ✅' : 'Грешно ❌';
    fb.classList.add(ok ? 'bg-emerald-50' : 'bg-rose-50', ok ? 'text-emerald-700' : 'text-rose-700');
    fb.classList.remove('hidden');
  }
}

// --- final screen and scoring helpers omitted in this shortened file ---
// NOTE: The rest of your original file continues below unchanged,
// but we add missing normalizeText to prevent runtime errors.

function normalizeText(s, caseSensitive) {
  const t = (s ?? '').toString().trim();
  return caseSensitive ? t : t.toLowerCase();
}

function labelingStats(slide, ans) {
  const targets = Array.isArray(slide?.interaction?.targets) ? slide.interaction.targets : [];
  const map = (ans && (ans.labelingMap ?? ans.placements)) ?? {};
  let hit = 0;
  for (let i = 0; i < targets.length; i++) {
    const need = normalizeText(targets[i]?.text, false);
    const got = normalizeText(map[i], false);
    if (need && got && need === got) hit++;
  }
  return { hit, total: targets.length };
}

function isAnswerCorrect(slide, ans) {
  const kind = slide?.interaction?.kind;
  if (!kind) return false;

  if (kind === 'mcq') {
    const correct = Number(slide.interaction.correct);
    const given = Number(ans.answerIndex);
    return Number.isFinite(correct) && Number.isFinite(given) && correct === given;
  }

  if (kind === 'multi') {
    const correct = Array.isArray(slide.interaction.correct)
      ? slide.interaction.correct.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
      : [];
    const given = Array.isArray(ans.answerIndexes)
      ? ans.answerIndexes.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
      : [];
    if (correct.length !== given.length) return false;
    for (let i = 0; i < correct.length; i++) if (correct[i] !== given[i]) return false;
    return true;
  }

  if (kind === 'short') {
    const correctText = normalizeText(slide.interaction.correctText, slide.interaction.caseSensitive);
    const givenRaw = (ans && (ans.answerText ?? ans.text)) ?? '';
    const givenText = normalizeText(givenRaw, slide.interaction.caseSensitive);
    return correctText && givenText && correctText === givenText;
  }

  if (kind === 'labeling') {
    const targets = Array.isArray(slide?.interaction?.targets) ? slide.interaction.targets : [];
    const map = (ans && (ans.labelingMap ?? ans.placements)) ?? {};
    for (let i = 0; i < targets.length; i++) {
      const need = normalizeText(targets[i]?.text, false);
      const got = normalizeText(map[i], false);
      if (!need || !got || need !== got) return false;
    }
    return targets.length > 0;
  }

  return false;
}

function earnedPoints(slide, ans) {
  const pts = Number(slide?.interaction?.points ?? 1);
  const maxPts = Number.isFinite(pts) ? pts : 1;
  const kind = slide?.interaction?.kind;
  if (!kind) return 0;

  if (kind === 'labeling') {
    const { hit, total } = labelingStats(slide, ans);
    if (!total) return 0;
    return maxPts * (hit / total);
  }

  return isAnswerCorrect(slide, ans) ? maxPts : 0;
}

// === UTIL ===
function escapeHtml(s) {
  return (s ?? '').toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function escapeAttr(s) { return escapeHtml(s); }
function cssEscape(s) { return (s ?? '').toString().replaceAll('\\', '\\\\').replaceAll('"', '\\"'); }

// === WIRE UI ===
$('btn-load-demo').addEventListener('click', () => {
  const templateEl = $('lesson-template');
  const key = templateEl?.value || 'classbuddy';
  const selectedTemplate = lessonTemplates[key] || lessonTemplates.classbuddy;
  localStorage.setItem('lm_demo_lesson', JSON.stringify(selectedTemplate));
  alert(`Зареден шаблон: ${selectedTemplate.title}. Натисни Вход.`);
});

$('btn-host-login').addEventListener('click', hostLogin);
$('btn-host-start').addEventListener('click', hostStart);
$('btn-host-next').addEventListener('click', hostNext);
$('btn-host-lock').addEventListener('click', hostLock);
$('btn-host-reveal').addEventListener('click', hostReveal);
$('btn-host-attn').addEventListener('click', hostToggleAttention);
$('btn-host-end').addEventListener('click', hostEnd);

$('btn-host-full').addEventListener('click', async () => {
  if (!isPresent) await enterPresentMode();
  else await exitPresentMode();
});

$('present-next').addEventListener('click', hostNext);
$('present-lock').addEventListener('click', hostLock);
$('present-reveal').addEventListener('click', hostReveal);
$('present-attn').addEventListener('click', hostToggleAttention);
$('present-exit').addEventListener('click', exitPresentMode);

$('btn-student-join').addEventListener('click', async () => {
  const pin = $('student-pin').value.trim();
  if (!pin) return alert('Въведи PIN.');
  await ensureAnonAuth();
  await studentJoin(pin);
});

$('btn-student-leave').addEventListener('click', async () => {
  cleanupSubs();
  try { await signOut(auth); } catch (e) { }
  studentPin = null;
  studentLessonId = null;
  studentLesson = null;
  setMode('welcome');
});

window.addEventListener('DOMContentLoaded', () => {
  bindRosterUI();
  setMode('welcome');
  setStatus('ready');
  const p = new URLSearchParams(window.location.search).get('pin');
  if (p) $('student-pin').value = p;
});
