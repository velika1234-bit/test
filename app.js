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

    // === DEMO LESSON ===
    const demoLesson = {
      title: 'Demo: Lock → Reveal',
      theme: {
        backgroundType: 'image',
        backgroundValue: 'https://images.unsplash.com/photo-1529070538774-1843cb3265df?auto=format&fit=crop&w=1600&q=60',
        overlayOpacity: 0.45,
        fontPreset: 'large'
      },
      slides: [
        { visibility: 'host', layout: 'title', content: { title: 'Classroom Mode', subtitle: 'Lock → Reveal • Учениците виждат вярно/грешно', image: '' } },
        { visibility: 'host', layout: 'content', content: { title: 'Как да водиш', text: '1) Показваш въпрос • 2) Чакаш • 3) Lock • 4) Reveal • 5) Next', image: '' } },
        { visibility: 'students', layout: 'question', content: { title: 'MCQ', text: 'Избери верния отговор.', image: '' }, interaction: { kind: 'mcq', options: ['А', 'Б', 'В', 'Г'], correct: 2, points: 2 } },
        { visibility: 'students', layout: 'question', content: { title: 'Multi', text: 'Маркирай всички верни.', image: '' }, interaction: { kind: 'multi', options: ['A', 'B', 'C', 'D'], correct: [1,3], points: 2 } },
        { visibility: 'students', layout: 'question', content: { title: 'Short', text: 'Напиши една дума: "пример"', image: '' }, interaction: { kind: 'short', correctText: 'пример', caseSensitive: false, points: 2 } },
        { visibility: 'students', layout: 'question', content: { title: 'Labeling', text: 'Избери етикет и натисни цел.', image: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1400&q=60' },
          interaction: { kind: 'labeling', targets: [ {x:35,y:35,text:'Етикет 1'}, {x:70,y:55,text:'Етикет 2'}, {x:50,y:75,text:'Етикет 3'} ], points: 2 } },
        { visibility: 'host', layout: 'content', content: { title: 'Финал', text: 'Следва: крайно класиране/резултат (по желание).', image: '' } },
      ]
    };

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
    function cacheLesson(lessonId, lessonObj) { try { localStorage.setItem(lessonCacheKey(lessonId), JSON.stringify(lessonObj)); } catch(e) {} }
    function getCachedLesson(lessonId) { try { const raw = localStorage.getItem(lessonCacheKey(lessonId)); return raw ? JSON.parse(raw) : null; } catch(e) { return null; } }

    let unsub = { session: null, participants: null, answers: null, answerMine: null, rosterParticipants: null, rosterAnswers: null };
    // --- Participants listener (fix: always listen to the correct pin) ---
 function setParticipantsListener(pin) {
      const p = String(pin || "");
      if (!p) return; // no pin yet → don't start

      // stop previous listener (if any)
      if (unsub.participants) {
        try { unsub.participants(); } catch (e) {}
        unsub.participants = null;
      }
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
      return !!(slide && slide.visibility !== 'host' && slide.interaction && ['mcq','multi','short','labeling'].includes(slide.interaction.kind));
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

    async function hostLock() { if (hostPin) await updateDoc(sessionDocRef(hostPin), { phase: 'locked' });
      rosterLocked = true;
      renderRoster(); }
    async function hostReveal() { if (hostPin) await updateDoc(sessionDocRef(hostPin), { phase: 'reveal' });
      const slide = hostLesson?.slides?.[hostActiveSlideIdx];
rosterLocked = true;
      renderRoster(); }

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
      Object.values(unsub).forEach(fn => { try { fn && fn(); } catch(e) {} });
      unsub = { session: null, participants: null, answers: null, answerMine: null, rosterParticipants: null, rosterAnswers: null };
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

        // Fix: pin must come from the session doc (source of truth)
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

        $('host-slide-counter').textContent = hostLesson ? `${Math.max(hostActiveSlideIdx,0)+1} / ${hostLesson.slides.length}` : '—';
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

      unsub.participants = onSnapshot(participantsColRef(String(studentPin ?? pin)), (snap) => {
        hostParticipantsCount = snap.size;
        $('stat-participants').textContent = String(snap.size);
        syncPresentBadges();
      });
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
        const titleSize = big ? `text-[${Math.round(64*scale)}px]` : 'text-3xl';
        const bodyPx = Math.round((big ? 34 : 18) * scale);
        return `
          <div class="slide-card">
            <div class="slide-title ${big ? '' : 'text-3xl'}" style="${big ? `font-size:${Math.round(72*scale)}px;` : ''}">${escapeHtml(slide.content?.title || 'Дейност')}</div>
            <div class="slide-text mt-5" style="font-size:${bodyPx}px;">${escapeHtml(slide.content?.text || '')}</div>
            <div class="muted font-black mt-6" style="font-size:${Math.round(26*scale)}px;">👩‍🎓 Учениците отговарят на телефони.</div>
          </div>
        `;
      }

      // Host templates
      const layout = slide.layout || 'content';
      const c = slide.content || {};

      const titlePx = Math.round((big ? 72 : 44) * scale);
      const subPx   = Math.round((big ? 44 : 22) * scale);
      const textPx  = Math.round((big ? 40 : 18) * scale);

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
            <div class="slide-title" style="font-size:${Math.round((big ? 60 : 38)*scale)}px;">${escapeHtml(c.title || 'Заглавие')}</div>
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
            <div class="slide-title" style="font-size:${Math.round((big ? 60 : 38)*scale)}px;">${escapeHtml(c.title || 'Заглавие')}</div>
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
          <div class="slide-title" style="font-size:${Math.round((big ? 56 : 34)*scale)}px;">${escapeHtml(c.title || 'Слайд')}</div>
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
              <div class="font-black ${correct ? 'text-emerald-700' : 'text-slate-700'}">${i+1}. ${escapeHtml(t)}${correct ? ' ✅' : ''}</div>
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
      } catch (e) {}
      syncPresentBadges();
      renderPresentSurface((hostLesson?.slides && hostActiveSlideIdx >= 0) ? hostLesson.slides[hostActiveSlideIdx] : null);
    }

    async function exitPresentMode() {
      if (!isPresent) return;
      isPresent = false;
      document.body.classList.remove('present');
      $('present-shell').classList.add('hidden');
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) {}
    }

    function syncPresentBadges() {
      $('present-pin').textContent = hostPin || '—';
      $('present-counter').textContent = hostLesson ? `${Math.max(hostActiveSlideIdx,0)+1} / ${hostLesson.slides.length}` : '—';
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
      let lastSlideIdx = null;
      let lastSlideObj = null;
      let myAnswerCache = null;

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
        if (!studentLessonId) { showStudentWaiting('Зареждам урок…'); return; }

        await ensureStudentLessonLoaded(studentLessonId);
        const slide = (studentLesson?.slides && studentActiveSlideIdx >= 0) ? studentLesson.slides[studentActiveSlideIdx] : null;

        lastSlideIdx = studentActiveSlideIdx;
        lastSlideObj = slide;

        if (!slide || !isInteractiveSlide(slide)) {
          const msg = studentPhase === 'waiting' ? 'Очакваме старт…' : 'Гледай екрана отпред…';
          showStudentWaiting(msg);
          return;
        }

        showStudentInteraction(slide, studentPhase, studentActiveSlideIdx);

        // subscribe to my answer for this slide
        if (unsub.answerMine) { unsub.answerMine(); unsub.answerMine = null; }
        myAnswerCache = null;

        unsub.answerMine = onSnapshot(answerDocRef(pin, studentActiveSlideIdx, auth.currentUser.uid), (aSnap) => {
          myAnswerCache = aSnap.exists() ? aSnap.data() : null;
          const exists = !!myAnswerCache;
          updateStudentSubmitState({ hasAnswer: exists, phase: studentPhase });
          $('student-sent').classList.toggle('hidden', !exists);
          updateStudentFeedback(slide, studentPhase, myAnswerCache);
        });
      });

      function updateStudentFeedback(slide, phase, myAnswer) {
        const fb = $('student-feedback');
        fb.classList.add('hidden');
        fb.classList.remove('bg-emerald-50','text-emerald-700','bg-rose-50','text-rose-700','bg-slate-100','text-slate-700');

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

    
    async function showStudentFinal(pin) {
      hide('student-waiting');
      show('student-interaction'); // keep section visible for layout
      hide('student-q-body');
      hide('btn-student-submit');
      hide('student-sent');
      hide('student-feedback');

      // show final card
      show('student-final');

      // ensure exit button exists
      $('btn-final-exit').onclick = async () => {
        cleanupSubs();
        try { await signOut(auth); } catch(e) {}
        studentPin = null;
        studentLessonId = null;
        studentLesson = null;
        setMode('welcome');
      };

      // Compute locally from my answers (no write permissions needed)
      await ensureStudentLessonLoaded(studentLessonId);
      const slides = studentLesson?.slides || [];
      const interactive = slides
        .map((s, idx) => ({ s, idx }))
        .filter(x => isInteractiveSlide(x.s));

      let maxScore = 0;
      let score = 0;
      let correctSlides = 0;
      let totalQ = interactive.length;

      // fetch my answer docs for each slide
      const uid = auth.currentUser.uid;
      const snaps = await Promise.all(interactive.map(x => getDoc(answerDocRef(pin, x.idx, uid))));

      for (let k = 0; k < interactive.length; k++) {
        const slide = interactive[k].s;
        const pts = Number(slide?.interaction?.points ?? 1);
        const maxPts = Number.isFinite(pts) ? pts : 1;
        maxScore += maxPts;

        const aSnap = snaps[k];
        if (!aSnap.exists()) continue;

        const ans = aSnap.data() || {};
        const earned = earnedPoints(slide, ans);
        score += earned;

        // correctCount counts fully-correct slides (for labeling: all targets correct)
        if (isAnswerCorrect(slide, ans)) correctSlides++;
      }

      // Round score to 2 decimals, but show integer nicely if whole number
      const scoreRounded = Math.round(score * 100) / 100;

      $('final-score').textContent = String(scoreRounded);
      $('final-max').textContent = String(maxScore);
      $('final-correct').textContent = String(correctSlides);
      $('final-total').textContent = String(totalQ);

      const pct = (maxScore > 0) ? (scoreRounded / maxScore) : 0;
      $('final-bar').style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`;

      const { badgeText, badgeClass, msg } = pickMotivation(pct);
      const b = $('final-badge');
      b.textContent = badgeText;
      b.className = `final-badge ${badgeClass}`;

      $('final-msg').textContent = msg;

      
      // Submit final result to Firebase (host report)
      const statusEl = document.getElementById('final-submit-status');
      const resendBtn = document.getElementById('btn-final-resend');

      async function doSubmit() {
        try {
          if (statusEl) statusEl.textContent = 'Изпращане на резултата...';
          if (resendBtn) resendBtn.disabled = true;

          const payload = {
            score: scoreRounded,
            maxScore,
            correctSlides,
            totalQ,
            percent: Math.round(pct * 100),
            lessonId: studentLessonId,
          };

          const r = await submitFinalResult(pin, payload);
          if (statusEl) statusEl.textContent = (r && r.skipped) ? 'Резултатът вече е изпратен ✅' : 'Резултатът е изпратен ✅';
        } catch (e) {
          console.warn('final submit failed', e);
          if (statusEl) statusEl.textContent = 'Не успях да изпратя резултата. Провери интернет/правила и пробвай пак.';
          if (resendBtn) resendBtn.disabled = false;
        }
      }

      if (resendBtn) resendBtn.onclick = doSubmit;

      // Auto-submit once on final screen
      await doSubmit();

      if (pct >= 0.75) popConfetti();
    }

    function pickMotivation(pct) {
      if (pct >= 0.90) return { badgeText: 'МАЙСТОР 👑', badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200', msg: 'Уау! Почти без грешка — браво!' };
      if (pct >= 0.75) return { badgeText: 'ОТЛИЧНО 🏅', badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200', msg: 'Супер резултат! Продължавай все така!' };
      if (pct >= 0.50) return { badgeText: 'СТРАХОТНО 🚀', badgeClass: 'bg-sky-100 text-sky-800 border border-sky-200', msg: 'Страхотно! Вижда се напредък!' };
      if (pct >= 0.25) return { badgeText: 'ДОБЪР СТАРТ 🌟', badgeClass: 'bg-violet-100 text-violet-800 border border-violet-200', msg: 'Браво! Следващия път ще е още по-добре!' };
      return { badgeText: 'ТРЕНИРОВКА 💪', badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200', msg: 'Днес тренирахме — най-важното е да продължаваш!' };
    }

    function popConfetti() {
      const box = $('confetti');
      if (!box) return;
      box.innerHTML = '';
      box.classList.remove('hidden');
      const pieces = 36;
      const colors = ['#38bdf8','#22c55e','#f59e0b','#a78bfa','#fb7185','#60a5fa'];
      for (let i=0;i<pieces;i++) {
        const el = document.createElement('i');
        el.style.left = Math.random()*100 + 'vw';
        el.style.background = colors[i % colors.length];
        el.style.transform = `translateY(0) rotate(${Math.random()*360}deg)`;
        el.style.animationDelay = (Math.random()*0.25) + 's';
        el.style.opacity = String(0.8 + Math.random()*0.2);
        el.style.width = (8 + Math.random()*8) + 'px';
        el.style.height = (12 + Math.random()*16) + 'px';
        box.appendChild(el);
      }
      setTimeout(() => { box.classList.add('hidden'); box.innerHTML=''; }, 2200);
    }

    function showStudentWaiting(msg) {
      show('student-waiting');
      hide('student-interaction');
      $('student-waiting-msg').textContent = msg;
    }

    function updateStudentSubmitState({ hasAnswer, phase }) {
      const locked = (phase === 'locked' || phase === 'reveal');
      const btn = $('btn-student-submit');

      if (hasAnswer) {
        btn.textContent = 'ИЗПРАТЕНО ✅';
        btn.classList.add('disabled');
        return;
      }

      btn.textContent = locked ? 'ЗАКЛЮЧЕНО 🔒' : 'Потвърди';
      btn.classList.toggle('disabled', locked);
    }

    function showStudentInteraction(slide, phase, slideIdx) {
      hide('student-waiting');
      show('student-interaction');

      $('student-q-title').textContent = slide.content?.title || 'Въпрос';
      $('student-q-sub').textContent = slide.content?.text || '';
      $('student-phase').textContent = phase.toUpperCase();

      $('student-sent').classList.add('hidden');
      $('student-feedback').classList.add('hidden');
      const body = $('student-q-body');
      hide('student-final');
      show('student-q-body');
      show('btn-student-submit');
      body.innerHTML = '';

      const locked = (phase === 'locked' || phase === 'reveal');
      updateStudentSubmitState({ hasAnswer: false, phase });

      const kind = slide.interaction.kind;

      if (kind === 'mcq') {
        const opts = slide.interaction.options || [];
        body.innerHTML = `<div class="space-y-3" id="mcq-list">
          ${opts.map((t, i) => `<button class="opt w-full text-left" data-idx="${i}">${i+1}. ${escapeHtml(t)}</button>`).join('')}
        </div>`;
        let selected = null;
        body.querySelectorAll('.opt').forEach(btn => {
          btn.addEventListener('click', () => {
            if (locked) return;
            body.querySelectorAll('.opt').forEach(x => x.classList.remove('selected'));
            btn.classList.add('selected');
            selected = Number(btn.dataset.idx);
          });
        });
        $('btn-student-submit').onclick = () => submitStudentAnswer(slide, slideIdx, { answerIndex: selected });
        return;
      }

      if (kind === 'multi') {
        const opts = slide.interaction.options || [];
        body.innerHTML = `<div class="space-y-3" id="multi-list">
          ${opts.map((t, i) => `
            <button class="opt w-full text-left flex items-center justify-between" data-idx="${i}">
              <span>${i+1}. ${escapeHtml(t)}</span>
              <span class="muted font-black text-sm">□</span>
            </button>
          `).join('')}
        </div>`;
        const selectedSet = new Set();
        body.querySelectorAll('.opt').forEach(btn => {
          btn.addEventListener('click', () => {
            if (locked) return;
            const idx = Number(btn.dataset.idx);
            if (selectedSet.has(idx)) {
              selectedSet.delete(idx);
              btn.classList.remove('selected');
              btn.querySelector('span:last-child').textContent = '□';
            } else {
              selectedSet.add(idx);
              btn.classList.add('selected');
              btn.querySelector('span:last-child').textContent = '✓';
            }
          });
        });
        $('btn-student-submit').onclick = () => submitStudentAnswer(slide, slideIdx, { answerIndexes: Array.from(selectedSet).sort((a,b)=>a-b) });
        return;
      }

      if (kind === 'short') {
        body.innerHTML = `<div class="space-y-2">
          <label class="text-xs font-black uppercase tracking-widest muted">Твоят отговор</label>
          <input id="short-input" class="w-full p-4 rounded-2xl border-2 border-slate-200 font-black outline-none focus:border-sky-600" placeholder="Напиши..." />
        </div>`;
        $('btn-student-submit').onclick = () => submitStudentAnswer(slide, slideIdx, { answerText: ($('short-input').value ?? '') });
        return;
      }

      if (kind === 'labeling') {
        const img = slide.content?.image || '';
        const targets = slide.interaction.targets || [];
        const labels = targets.map(t => t.text);

        body.innerHTML = `
          <div class="space-y-4">
            <div class="relative w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-50" style="min-height: 260px;">
              ${img ? `<img src="${escapeAttr(img)}" class="w-full max-h-[360px] object-contain block" alt="">` : `<div class="p-6 muted font-black">Няма изображение</div>`}
              <div id="label-layer" class="absolute inset-0"></div>
            </div>
            <div class="muted font-bold text-sm">Избери етикет и натисни цел (кръгче).</div>
            <div id="labels-pool" class="flex gap-2 overflow-x-auto pb-2"></div>
          </div>
        `;

        const layer = $('label-layer');
        const pool = $('labels-pool');

        let selectedLabel = null;
        const placements = {};

        layer.innerHTML = targets.map((t, i) => `<div class="label-target" id="target-${i}" style="left:${t.x}%; top:${t.y}%;">${i+1}</div>`).join('');
        pool.innerHTML = labels.map((txt) => `<div class="label-chip" data-label="${escapeAttr(txt)}">${escapeHtml(txt)}</div>`).join('');

        pool.querySelectorAll('.label-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            if (locked) return;
            pool.querySelectorAll('.label-chip').forEach(x => x.classList.remove('selected'));
            chip.classList.add('selected');
            selectedLabel = chip.getAttribute('data-label');
          });
        });

        targets.forEach((t, i) => {
          const el = $('target-' + i);
          el.addEventListener('click', () => {
            if (locked) return;
            if (!selectedLabel) return;

            placements[i] = selectedLabel;
            el.textContent = selectedLabel;
            el.classList.add('filled');

            const chip = pool.querySelector(`.label-chip[data-label="${cssEscape(selectedLabel)}"]`);
            if (chip) chip.classList.add('placed');

            selectedLabel = null;
            pool.querySelectorAll('.label-chip').forEach(x => x.classList.remove('selected'));
          });
        });

        $('btn-student-submit').onclick = () => submitStudentAnswer(slide, slideIdx, { labelingMap: placements });
        return;
      }
    }

    function normalizeShort(s, caseSensitive) {
      const t = (s ?? '').toString().trim();
      return caseSensitive ? t : t.toLowerCase();
    }


    function normalizeText(s, caseSensitive) {
      const t = (s ?? '').toString().trim();
      return caseSensitive ? t : t.toLowerCase();
    }

        function isAnswerCorrect(slide, ans) {
          const kind = slide?.interaction?.kind;
          if (!kind) return false;
    
          // MCQ (single)
          if (kind === 'mcq') {
            const correct = Number(slide.interaction.correct);
            const given = Number(ans.answerIndex);
            return Number.isFinite(correct) && Number.isFinite(given) && correct === given;
          }
    
          // Multi-select
          if (kind === 'multi') {
            const correct = Array.isArray(slide.interaction.correct)
              ? slide.interaction.correct.map(Number).filter(Number.isFinite).sort((a,b)=>a-b)
              : [];
            const given = Array.isArray(ans.answerIndexes)
              ? ans.answerIndexes.map(Number).filter(Number.isFinite).sort((a,b)=>a-b)
              : [];
            if (correct.length !== given.length) return false;
            for (let i = 0; i < correct.length; i++) if (correct[i] !== given[i]) return false;
            return true;
          }
    
          // Short text
          if (kind === 'short') {
            const correctText = normalizeText(slide.interaction.correctText, slide.interaction.caseSensitive);
            const givenRaw = (ans && (ans.answerText ?? ans.text)) ?? '';
            const givenText = normalizeText(givenRaw, slide.interaction.caseSensitive);
            return correctText && givenText && correctText === givenText;
          }

// Labeling (ordered targets)
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


    async function submitFinalResult(pin, payload) {
      // Each student writes only their own participant doc (uid as doc id).
      // Using setDoc(..., {merge:true}) makes it idempotent.
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('No auth user');

      const pRef = participantDocRef(pin, uid);

      // Prevent duplicate resubmits in the same session (still safe due to merge)
      const key = `lm_submitted_${pin}_${uid}`;
      if (localStorage.getItem(key) === '1') return { skipped: true };

      await setDoc(pRef, {
        final: payload,
        // handy flat fields for quick reports / queries
        score: payload?.scoreRounded ?? payload?.score ?? 0,
        maxScore: payload?.maxScore ?? 0,
        correct: payload?.correctSlides ?? payload?.correctAnswers ?? 0,
        total: payload?.totalSlides ?? payload?.totalQuestions ?? 0,
        finalizedAt: serverTimestamp(),
      }, { merge: true });

      localStorage.setItem(key, '1');
      return { ok: true };
    }


    

    async function gradeSlideIfNeeded(slideIdx, slide) {
      if (!hostPin) return;
      if (!slide || !isInteractiveSlide(slide)) return;
      if (hostGradedSlides.has(slideIdx)) return;

      hostGradedSlides.add(slideIdx);

      try {
        const qsnap = await getDocs(answersColRef(hostPin, slideIdx));
        const pts = Number(slide?.interaction?.points ?? 1) || 1;

        const updates = [];
        qsnap.forEach((d) => {
          const ans = d.data() || {};
          const uid = d.id;
          const ok = isAnswerCorrect(slide, ans);
          const add = ok ? pts : 0;
          updates.push({ uid, ok, add });
        });

        for (const u of updates) {
          await updateDoc(participantDocRef(hostPin, u.uid), {
            score: increment(u.add),
            correctCount: increment(u.ok ? 1 : 0),
          });
        }
      } catch (e) {
        console.warn('gradeSlideIfNeeded failed', e);
      }
    }


    async function submitStudentAnswer(slide, slideIdx, payload) {
      const pin = studentPin;
      if (!pin || !auth.currentUser) return;

      const kind = slide.interaction.kind;
      if (kind === 'mcq') {
        if (payload.answerIndex === null || payload.answerIndex === undefined || Number.isNaN(Number(payload.answerIndex))) { alert('Избери отговор.'); return; }
      }
      if (kind === 'multi') {
        if (!Array.isArray(payload.answerIndexes) || payload.answerIndexes.length === 0) { alert('Избери поне 1 отговор.'); return; }
      }
      if (kind === 'short') {
        const t = (payload.answerText ?? '').toString().trim();
        if (!t) { alert('Напиши отговор.'); return; }
      }
      if (kind === 'labeling') {
        const map = payload.labelingMap || {};
        if (Object.keys(map).length === 0) { alert('Постави поне 1 етикет.'); return; }
      }

      const sSnap = await getDoc(sessionDocRef(pin));
      const sData = sSnap.data();
      const phase = sData?.phase || 'waiting';
      const activeIdx = sData?.activeSlideIdx;
      const attn = !!sData?.attention;

      if (attn) { alert('Внимание към екрана отпред.'); return; }
      if (phase === 'locked' || phase === 'reveal') { alert('Заключено.'); return; }
      if (activeIdx !== slideIdx) { alert('Слайдът вече е сменен.'); return; }

      const name = ($('student-name').value.trim() || 'Ученик');

      await setDoc(answerDocRef(pin, slideIdx, auth.currentUser.uid), {
        uid: auth.currentUser.uid,
        name,
        kind,
        ...payload,
        answeredAt: serverTimestamp()
      }, { merge: true });

      $('student-sent').classList.remove('hidden');
      updateStudentSubmitState({ hasAnswer: true, phase });
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
      localStorage.setItem('lm_demo_lesson', JSON.stringify(demoLesson));
      alert('Demo урокът е зареден локално. Натисни Вход.');
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

    function onPresetChange(preset) {
      // Update lesson theme preset in Firestore (lesson doc) so both host/present re-render consistently
      if (!hostLessonId) return;
      if (!hostLesson) hostLesson = demoLesson;
      hostLesson.theme = hostLesson.theme || {};
      hostLesson.theme.fontPreset = preset;
      cacheLesson(hostLessonId, hostLesson);
      // also persist to lesson doc for future joins (optional)
      setDoc(lessonsDocRef(hostLessonId), { theme: hostLesson.theme }, { merge: true }).catch(()=>{});
      // re-render immediately
      const slide = (hostLesson?.slides && hostActiveSlideIdx >= 0) ? hostLesson.slides[hostActiveSlideIdx] : null;
      renderHostSurface(slide);
      renderPresentSurface(slide);
    }

    $('host-font-preset').addEventListener('change', (e) => {
      $('present-font-preset').value = e.target.value;
      onPresetChange(e.target.value);
    });
    $('present-font-preset').addEventListener('change', (e) => {
      $('host-font-preset').value = e.target.value;
      onPresetChange(e.target.value);
    });

    $('btn-student-join').addEventListener('click', async () => {
      const pin = $('student-pin').value.trim();
      if (!pin) return alert('Въведи PIN.');
      await ensureAnonAuth();
      await studentJoin(pin);
    });

    $('btn-student-leave').addEventListener('click', async () => {
      cleanupSubs();
      try { await signOut(auth); } catch(e) {}
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
