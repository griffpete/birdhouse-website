/* Birdhouse Dog Co. — booking wizard.
   Collects exactly the fields on the Zoho CRM "Birdhouse Dog Co - Lead Layout", one screen at a time,
   then posts to /api/lead, which forwards the lead to Zoho. No payment is taken online.
   Runs full-page on /book, and embedded in the home page contact card (data-wizard-embed). */
(function () {
  'use strict';

  var mount = document.getElementById('wizard');
  if (!mount) return;
  // Embedded copies leave the URL alone, use h3 headings and scroll only within their section.
  var embedded = mount.hasAttribute('data-wizard-embed');
  var heading = embedded ? 'h3' : 'h1';
  function setUrl(url) { if (!embedded) history.replaceState(null, '', url); }

  var PHONE = '(435) 599-3158';

  // Picklist values below match Zoho exactly; change them in Zoho first, then here.
  var SERVICES = {
    grooming: { name: 'Grooming', color: '#005F8F', zoho: ['Grooming'],
      desc: 'Full groom, bath & trim or bath & brush. One dog at a time.',
      doneTitle: 'Groom request sent!',
      doneBody: 'We will text you to lock in a time that gives your dog the room they need. We will send the drop-off address in Ivins when we confirm.' },
    training: { name: 'Training', color: '#ABA53F', zoho: ['Dog Training'],
      desc: 'Private coaching or boot camp. Starts with a consult.',
      doneTitle: 'Consult requested!',
      doneBody: 'We will reach out to set up your consult. No commitment and no sales pitch, just a conversation about your dog.' },
    both: { name: 'Grooming & training', color: '#FFCF70', zoho: ['Grooming', 'Dog Training'],
      desc: 'Book a groom and start a training consult in one go.',
      doneTitle: 'Request sent!',
      doneBody: 'We will text you to set up the groom and the training consult. We will follow up to confirm the details.' }
  };

  var STEPS = [
    { id: 'service', title: 'What would you like to book?', sub: 'Pick one to start. You can always book the other later.' },
    { id: 'source', title: 'How did you hear about Birdhouse?', sub: 'Optional, but it helps us know where to say thank you.', key: 'leadSource', auto: true, options: [
      { v: 'Google' }, { v: 'Instagram' }, { v: 'TikTok' }, { v: 'Friend/Family Referral' }, { v: 'Facebook' }, { v: 'Other' }
    ] },
    { id: 'dog', title: 'Tell us about your dog', sub: 'This helps us plan the appointment around them.', fields: [
      { key: 'dogName', label: "Dog's name", type: 'text', req: true },
      { key: 'breed', label: 'Breed or mix', type: 'text', req: true },
      { key: 'age', label: 'Age', type: 'text', placeholder: 'e.g. 7 months or 4 years' },
      { key: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'] },
      { key: 'spayed', label: 'Spayed or neutered?', type: 'select', options: ['Yes', 'No'] }
    ] },
    { id: 'health', title: 'Health and vet details', sub: 'Vaccines are required for every appointment. Everything else helps us plan safe, thoughtful care.', fields: [
      { key: 'vaccination', label: 'Vaccination status', type: 'select', req: true, options: ['Up to Date', 'Partially Vaccinated', 'Unknown'] },
      { key: 'allergies', label: 'Allergies', type: 'text', placeholder: 'Food, shampoo, medication… or none' },
      { key: 'vetName', label: 'Vet clinic name', type: 'text' },
      { key: 'vetPhone', label: 'Vet clinic phone', type: 'tel', placeholder: '(435) 555-0123' },
      { key: 'cpr', label: 'In an emergency, may Dani perform pet CPR on your dog?', type: 'chips', req: true, full: true, options: ['Yes', 'No'], single: true, hint: 'Dani is pet CPR certified. This is only ever used if something serious happens.' }
    ] },
    { id: 'contact', title: 'How should we reach you?', sub: 'We will use these details to follow up and confirm your appointment.', fields: [
      { key: 'firstName', label: 'First name', type: 'text', req: true, autocomplete: 'given-name' },
      { key: 'lastName', label: 'Last name', type: 'text', req: true, autocomplete: 'family-name' },
      { key: 'phone', label: 'Phone', type: 'tel', req: true, placeholder: '(435) 555-0123', autocomplete: 'tel' },
      { key: 'email', label: 'Email', type: 'email', autocomplete: 'email' }
    ] },
    { id: 'review', title: 'Look it over', sub: 'Nothing is charged online. We will reach out to confirm the details.' }
  ];

  /* ---------- state ---------- */
  var state = { service: null, step: 0, answers: {}, done: false, error: '', sending: false };
  var busy = false;

  if (!embedded) {
    var params = new URLSearchParams(location.search);
    var preset = params.get('service');
    if (!preset && /^#\/book\/([a-z]+)/.test(location.hash)) preset = RegExp.$1; // old hash-style links
    if (preset && SERVICES[preset]) { state.service = preset; state.step = 1; }
  }

  function validate(st) {
    var a = state.answers;
    if (st.id === 'service') return state.service ? '' : 'Pick a service to continue.';
    if (st.key && !st.multi && st.options && st.req && !a[st.key]) return 'Pick one to continue.';
    var fields = st.fields || [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f.req) continue;
      if (f.type === 'chips') { if (!(a[f.key] || []).length) return 'Please answer “' + f.label.replace(/\?$/, '') + '”.'; }
      else if (!String(a[f.key] || '').trim()) return 'Please fill in ' + f.label.toLowerCase() + '.';
    }
    if (st.id === 'contact' && a.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) return 'That email doesn’t look right.';
    if (st.id === 'contact' && String(a.phone || '').replace(/\D/g, '').length < 10) return 'Please enter a full phone number.';
    return '';
  }
  function reviewRows() {
    var a = state.answers, svc = SERVICES[state.service];
    var rows = [{ label: 'Service', value: svc.name }];
    STEPS.forEach(function (st) {
      if (st.key && a[st.key]) rows.push({ label: st.title.replace(/\?$/, ''), value: a[st.key] });
      (st.fields || []).forEach(function (f) {
        var v = f.type === 'chips' ? (a[f.key] || []).join(', ') : a[f.key];
        if (v) rows.push({ label: f.label.replace(/\?$/, ''), value: v });
      });
    });
    return rows;
  }

  /* ---------- rendering ---------- */
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  var shell = null, body = null, bar = null, pill = null, count = null, title = null, sub = null, content = null, errBox = null, backBtn = null, nextBtn = null, card = null;

  function buildShell() {
    mount.innerHTML = '';
    pill = el('div', { class: 'wizard__pill' });
    count = el('div', { class: 'wizard__count' });
    bar = el('div');
    title = el(heading, { class: 'wizard__title' });
    sub = el('p', { class: 'wizard__sub' });
    content = el('div');
    errBox = el('div', { class: 'form-error', role: 'alert', 'aria-live': 'polite' });
    body = el('div', { class: 'wizard__body' }, [title, sub, content, errBox]);
    backBtn = el('button', { type: 'button', class: 'btn', text: '← Back', onclick: function () { go(state.step - 1); } });
    nextBtn = el('button', { type: 'button', class: 'btn wizard__next', onclick: next });
    card = el('div', { class: 'wizard__card' }, [body, el('div', { class: 'wizard__nav' }, [el('div', {}, [backBtn]), nextBtn])]);
    shell = el('div', {}, [
      el('div', { class: 'wizard__top' }, [pill, count]),
      el('div', { class: 'wizard__bar' }, [bar]),
      card,
      embedded ? null : el('p', { class: 'wizard__foot', html: 'Rather talk it through? Text or call us at <a href="tel:+14355993158">' + PHONE + '</a>.' })
    ]);
    mount.appendChild(shell);
  }

  function renderDone() {
    var svc = SERVICES[state.service];
    mount.innerHTML = '';
    var box = el('div', { class: 'wizard__done' }, [
      el('div', { class: 'wizard__done-mark', text: '✓', 'aria-hidden': 'true' }),
      el(heading, { text: svc.doneTitle }),
      el('p', { text: svc.doneBody }),
      el('div', { class: 'btn-row btn-row--center' }, [
        embedded ? null : el('a', { href: '/', class: 'btn btn--ink', text: 'Back to home' }),
        el('button', { type: 'button', class: 'btn', text: 'Book something else', onclick: function () {
          state = { service: null, step: 0, answers: {}, done: false, error: '', sending: false };
          setUrl('/book');
          buildShell(); render();
        } })
      ])
    ]);
    box.style.setProperty('--accent', svc.color);
    box.style.setProperty('--accent-ink', svc.color === '#005F8F' ? 'var(--cream)' : 'var(--ink)');
    mount.appendChild(box);
    if (embedded) mount.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    if (state.done) return renderDone();
    if (!shell) buildShell();
    var svc = SERVICES[state.service];
    var st = STEPS[Math.min(state.step, STEPS.length - 1)];
    var total = STEPS.length;
    var color = svc ? svc.color : '#005F8F';
    mount.style.setProperty('--accent', color);
    mount.style.setProperty('--accent-ink', color === '#005F8F' ? 'var(--cream)' : 'var(--ink)');

    pill.textContent = svc ? 'Booking · ' + svc.name : 'Book with Birdhouse';
    pill.style.background = color;
    count.textContent = 'Step ' + (state.step + 1) + ' of ' + total;
    bar.style.width = Math.round(((state.step + 1) / total) * 100) + '%';
    bar.style.background = color;

    title.textContent = st.title;
    sub.textContent = st.sub || '';
    sub.style.display = st.sub ? '' : 'none';
    content.innerHTML = '';
    errBox.textContent = state.error;
    errBox.style.display = state.error ? '' : 'none';

    if (st.id === 'service') {
      var grid = el('div', { class: 'options' });
      Object.keys(SERVICES).forEach(function (k) {
        var s = SERVICES[k];
        var b = optionButton(s.name, s.desc, state.service === k, false, function () {
          state.service = k; state.error = '';
          setUrl('/book?service=' + k);
          render();
          setTimeout(function () { go(1); }, 260);
        });
        b.style.setProperty('--accent', s.color);
        b.style.setProperty('--accent-ink', s.color === '#005F8F' ? 'var(--cream)' : 'var(--ink)');
        grid.appendChild(b);
      });
      content.appendChild(grid);
    } else if (st.options) {
      var cur = state.answers[st.key];
      var grid2 = el('div', { class: 'options' });
      st.options.forEach(function (o) {
        var selected = cur === o.v;
        grid2.appendChild(optionButton(o.v, o.desc || '', selected, false, function () {
          setAnswer(st.key, selected ? '' : o.v);
          render();
          if (st.auto && !selected) setTimeout(function () { go(state.step + 1); }, 260);
        }));
      });
      content.appendChild(grid2);
    }

    if (st.fields) {
      var fg = el('div', { class: 'form-grid wizard__fields' });
      st.fields.forEach(function (f) {
        var id = 'f-' + f.key;
        var wrap = el('div', { class: 'field' + (f.full ? ' field--full' : '') });
        var lab = el('label', { for: id }, [f.label + ' ', f.req ? null : el('span', { class: 'field__hint', text: '(optional)' })]);
        wrap.appendChild(lab);
        var val = state.answers[f.key] || '';
        if (f.type === 'select') {
          var sel = el('select', { id: id, name: f.key, onchange: function (e) { setAnswer(f.key, e.target.value, true); } });
          sel.appendChild(el('option', { value: '', text: 'Choose one' }));
          f.options.forEach(function (o) { sel.appendChild(el('option', { value: o, text: o, selected: val === o })); });
          wrap.appendChild(sel);
        } else if (f.type === 'textarea') {
          var ta = el('textarea', { id: id, name: f.key, rows: 4, placeholder: f.placeholder || '', oninput: function (e) { setAnswer(f.key, e.target.value, true); } });
          ta.value = val;
          wrap.appendChild(ta);
        } else if (f.type === 'chips') {
          lab.removeAttribute('for');
          if (f.hint) wrap.appendChild(el('span', { class: 'field__hint', text: f.hint }));
          var chips = el('div', { class: 'chips', role: 'group', 'aria-label': f.label });
          f.options.forEach(function (o) {
            var v = typeof o === 'string' ? o : o.v;
            var arr = state.answers[f.key] || [];
            var on = arr.indexOf(v) >= 0;
            var c = el('button', { type: 'button', class: 'chip' + (on ? ' is-selected' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: function () {
              var next = f.single ? (on ? [] : [v]) : (on ? arr.filter(function (x) { return x !== v; }) : arr.concat([v]));
              setAnswer(f.key, next);
              render();
            } }, [el('span', { text: v }), typeof o === 'string' ? null : el('small', { text: o.sub })]);
            chips.appendChild(c);
          });
          wrap.appendChild(chips);
        } else {
          var inp = el('input', { id: id, name: f.key, type: f.type, placeholder: f.placeholder || '', autocomplete: f.autocomplete || null, oninput: function (e) { setAnswer(f.key, e.target.value, true); } });
          inp.value = val;
          wrap.appendChild(inp);
        }
        fg.appendChild(wrap);
      });
      content.appendChild(fg);
    }

    if (st.id === 'review') {
      var rv = el('div', { class: 'review' });
      reviewRows().forEach(function (r) {
        rv.appendChild(el('div', { class: 'review__row' }, [el('span', { text: r.label }), el('span', { text: r.value })]));
      });
      content.appendChild(rv);
    }

    backBtn.style.visibility = state.step > 0 ? '' : 'hidden';
    nextBtn.textContent = st.id === 'review' ? (state.sending ? 'Sending…' : 'Send request') : (st.id === 'source' && !state.answers.leadSource ? 'Skip →' : 'Continue →');
    nextBtn.disabled = !!state.sending;
    nextBtn.classList.toggle('is-dim', !!validate(st));
  }

  function optionButton(label, desc, selected, multi, onclick) {
    return el('button', { type: 'button', class: 'option' + (multi ? ' option--multi' : '') + (selected ? ' is-selected' : ''), 'aria-pressed': selected ? 'true' : 'false', onclick: onclick }, [
      el('span', { class: 'option__row' }, [el('span', { class: 'option__label', text: label }), el('span', { class: 'option__mark', 'aria-hidden': 'true' })]),
      desc ? el('span', { class: 'option__desc', text: desc }) : null
    ]);
  }

  function setAnswer(key, v, quiet) {
    state.answers[key] = v;
    state.error = '';
    if (quiet) {
      errBox.style.display = 'none';
      var st = STEPS[Math.min(state.step, STEPS.length - 1)];
      nextBtn.classList.toggle('is-dim', !!validate(st));
    }
  }

  function keepCardInView() {
    var top = card.getBoundingClientRect().top;
    if (top < 90) window.scrollTo({ top: window.scrollY + top - 110, behavior: 'smooth' });
  }

  function go(step) {
    if (busy) return;
    busy = true;
    var back = step < state.step;
    state.error = '';
    body.classList.add('is-out'); body.classList.toggle('is-back', back);
    setTimeout(function () {
      state.step = step;
      body.classList.remove('is-out'); body.classList.add('is-enter');
      render();
      keepCardInView();
      // A timer rather than requestAnimationFrame: rAF pauses in background tabs and would leave the wizard stuck.
      setTimeout(function () {
        body.classList.remove('is-enter'); body.classList.remove('is-back');
        busy = false;
        var h = body.querySelector('.wizard__title'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      }, 30);
    }, 150);
  }

  function next() {
    var st = STEPS[Math.min(state.step, STEPS.length - 1)];
    var invalid = validate(st);
    if (invalid) { state.error = invalid; render(); return; }
    if (st.id === 'review') return submit();
    go(state.step + 1);
  }

  function submit() {
    if (state.sending) return;
    var svc = SERVICES[state.service];
    var a = state.answers;
    var payload = {
      service: svc.name,
      desiredServices: svc.zoho,
      leadSource: a.leadSource || '',
      firstName: a.firstName, lastName: a.lastName, phone: a.phone, email: a.email || '',
      dogName: a.dogName, breed: a.breed, age: a.age || '', sex: a.sex || '', spayed: a.spayed || '',
      vaccination: a.vaccination || '', allergies: a.allergies || '', vetName: a.vetName || '', vetPhone: a.vetPhone || '',
      cpr: (a.cpr || [])[0] || '',
      website: (document.getElementById('hp-website') || {}).value || ''
    };
    state.sending = true; render();
    window.BH.sendLead(payload).then(function () {
      state.sending = false; state.done = true; render();
      // Picked up by Google Tag Manager as the booking conversion.
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'generate_lead', lead_service: svc.name, lead_source: payload.leadSource });
    }).catch(function () {
      state.sending = false;
      state.error = 'That didn’t go through. Text or call us at ' + PHONE + ' and we will help you book.';
      render();
    });
  }

  render();
})();
