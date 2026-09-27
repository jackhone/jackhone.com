/*
  Cal.com booking widget.

  Talks to the public Cal.com API v2 straight from the browser. Both endpoints used
  here — GET /v2/slots and POST /v2/bookings — allow unauthenticated requests and
  send `access-control-allow-origin: *`, so this needs no API key and no backend,
  which keeps the site a plain static deploy.
*/
(function () {
  'use strict';

  var API_BASE = 'https://api.cal.com/v2';
  var SLOTS_API_VERSION = '2024-09-04';
  var BOOKINGS_API_VERSION = '2024-08-13';

  // How far ahead to look for availability, in one request.
  var WINDOW_DAYS = 60;
  // Collapsed counts, so a busy calendar doesn't push the page height around.
  var VISIBLE_DAYS = 5;
  var DAY_PAGE = 14;
  var VISIBLE_TIMES = 12;
  // Availability goes stale while the page sits open.
  var SLOTS_MAX_AGE_MS = 5 * 60 * 1000;

  var root = document.getElementById('book-widget');
  if (!root) return;

  var username = root.dataset.calUsername;
  var eventTypes = parseEventTypes(root.dataset.calEventTypes);
  if (!username || !eventTypes.length) return;

  var timeZone = detectTimeZone();
  var profileUrl = 'https://cal.com/' + username;

  var state = {
    eventType: eventTypes[0],
    // slug -> { days: [{ date, slots: [iso] }], fetchedAt }
    cache: {},
    status: 'loading', // loading | ready | error
    selectedDate: null,
    selectedSlot: null,
    dayLimit: VISIBLE_DAYS,
    showAllTimes: false,
    stage: 'picking', // picking | details | submitting | done
    booking: null,
    formError: null
  };

  var els = buildSkeleton();
  loadSlots(state.eventType.slug);

  /* ---------------------------------------------------------------- config */

  function parseEventTypes(raw) {
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (item) {
        return item && item.slug && item.minutes;
      });
    } catch (err) {
      return [];
    }
  }

  function detectTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (err) {
      return 'UTC';
    }
  }

  /* ------------------------------------------------------------------- dom */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function row(label, contentClass) {
    var wrapper = el('div', 'book-row');
    wrapper.appendChild(el('span', 'book-label', label));
    var content = el('div', contentClass);
    wrapper.appendChild(content);
    return { wrapper: wrapper, content: content };
  }

  function buildSkeleton() {
    root.textContent = '';

    var grid = el('div', 'book-grid');
    var lengthRow = row('Length', 'book-choices');
    var dayRow = row('Day', 'book-choices book-choices--days');
    var timeRow = row('Time', 'book-times');
    var detailsRow = row('Details', 'book-details');

    grid.appendChild(lengthRow.wrapper);
    grid.appendChild(dayRow.wrapper);
    grid.appendChild(timeRow.wrapper);
    grid.appendChild(detailsRow.wrapper);

    // One notice for both field validation and booking failures. It sits in the
    // content column under the form, so it reads as part of the form while that is
    // open and stays visible if a taken slot sends the visitor back to the picker.
    var notice = el('p', 'book-error');
    notice.setAttribute('role', 'alert');
    notice.hidden = true;
    grid.appendChild(notice);

    root.appendChild(grid);

    var status = el('div', 'book-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.appendChild(status);

    return {
      grid: grid,
      notice: notice,
      length: lengthRow.content,
      dayRow: dayRow.wrapper,
      days: dayRow.content,
      timeRow: timeRow.wrapper,
      times: timeRow.content,
      detailsRow: detailsRow.wrapper,
      details: detailsRow.content,
      status: status
    };
  }

  function choice(label, isSelected, onSelect) {
    var button = el('button', 'book-choice', label);
    button.type = 'button';
    button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    if (isSelected) button.classList.add('is-selected');
    button.addEventListener('click', onSelect);
    return button;
  }

  function moreButton(label, onClick) {
    var button = el('button', 'book-more', label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }

  function calLink(text) {
    var link = el('a', 'contact-link contact-link--external', text);
    link.href = profileUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    return link;
  }

  /* ---------------------------------------------------------------- format */

  function todayKey() {
    return dateKeyFor(new Date());
  }

  function dateKeyFor(date) {
    // Date keys are calendar days in the viewer's timezone, matching how the
    // slots endpoint groups its response when given a timeZone.
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
    return parts;
  }

  function shiftDays(days) {
    var date = new Date();
    date.setDate(date.getDate() + days);
    return dateKeyFor(date);
  }

  // Build a local Date for a calendar day so labels never shift in far-eastern
  // timezones, where a fixed UTC hour can land on the neighbouring date.
  function parseDateKey(dateKey) {
    var parts = dateKey.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function formatDayLabel(dateKey) {
    if (dateKey === todayKey()) return 'Today';
    if (dateKey === shiftDays(1)) return 'Tomorrow';
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    }).format(parseDateKey(dateKey));
  }

  function formatLongDayLabel(dateKey) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(parseDateKey(dateKey));
  }

  function formatTime(value) {
    // Numeric hours so 24-hour locales stay padded ("08:00") without 12-hour
    // locales gaining an odd leading zero ("08:00 AM").
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timeZone
    }).format(new Date(value));
  }

  function formatTimeRange(startValue, minutes) {
    var start = new Date(startValue);
    var end = new Date(start.getTime() + minutes * 60000);
    return formatTime(start) + '–' + formatTime(end);
  }

  function describeSlot(slot, eventType) {
    var dateKey = dateKeyFor(new Date(slot));
    return (
      formatLongDayLabel(dateKey) +
      ', ' +
      formatTimeRange(slot, eventType.minutes) +
      ' · ' +
      eventType.minutes +
      ' min'
    );
  }

  function track(event, properties) {
    if (window.posthog && typeof window.posthog.capture === 'function') {
      window.posthog.capture(event, properties);
    }
  }

  /* ------------------------------------------------------------------- api */

  function readError(response) {
    return response
      .json()
      .catch(function () {
        return null;
      })
      .then(function (body) {
        var message = body && body.error && body.error.message;
        var error = new Error(message || 'Request failed (' + response.status + ')');
        error.status = response.status;
        throw error;
      });
  }

  function loadSlots(slug, options) {
    var force = options && options.force;
    var cached = state.cache[slug];
    if (cached && !force && Date.now() - cached.fetchedAt < SLOTS_MAX_AGE_MS) {
      state.status = 'ready';
      render();
      return Promise.resolve(cached);
    }

    state.status = 'loading';
    render();

    var params = new URLSearchParams({
      username: username,
      eventTypeSlug: slug,
      start: todayKey(),
      end: shiftDays(WINDOW_DAYS),
      timeZone: timeZone
    });

    return fetch(API_BASE + '/slots?' + params.toString(), {
      headers: { 'cal-api-version': SLOTS_API_VERSION }
    })
      .then(function (response) {
        if (!response.ok) return readError(response);
        return response.json();
      })
      .then(function (body) {
        var entry = { days: normaliseDays(body && body.data), fetchedAt: Date.now() };
        state.cache[slug] = entry;
        if (state.eventType.slug === slug) {
          state.status = 'ready';
          reconcileSelection(entry);
          render();
        }
        return entry;
      })
      .catch(function (err) {
        if (state.eventType.slug !== slug) return null;
        state.status = 'error';
        render();
        // Surfaced generically in the UI; keep the detail for debugging.
        if (window.console) console.warn('Cal.com availability failed:', err.message);
        return null;
      });
  }

  function normaliseDays(data) {
    if (!data || typeof data !== 'object') return [];
    return Object.keys(data)
      .sort()
      .map(function (date) {
        var slots = (data[date] || [])
          .map(function (slot) {
            return typeof slot === 'string' ? slot : slot && slot.start;
          })
          .filter(Boolean);
        return { date: date, slots: slots };
      })
      .filter(function (day) {
        return day.slots.length > 0;
      });
  }

  // Keep the current pick if the new availability still contains it.
  function reconcileSelection(entry) {
    if (!state.selectedDate) return;
    var match = null;
    for (var i = 0; i < entry.days.length; i++) {
      if (entry.days[i].date === state.selectedDate) {
        match = entry.days[i];
        break;
      }
    }
    if (!match) {
      resetSelection();
      return;
    }
    if (state.selectedSlot && match.slots.indexOf(state.selectedSlot) === -1) {
      state.selectedSlot = null;
      state.stage = 'picking';
    }
  }

  // Deliberately leaves formError alone: when a slot is taken mid-flow this runs
  // while the explanation still needs to be on screen.
  function resetSelection() {
    state.selectedDate = null;
    state.selectedSlot = null;
    state.showAllTimes = false;
    state.stage = 'picking';
  }

  function currentDays() {
    var entry = state.cache[state.eventType.slug];
    return entry ? entry.days : [];
  }

  function slotsForSelectedDate() {
    var days = currentDays();
    for (var i = 0; i < days.length; i++) {
      if (days[i].date === state.selectedDate) return days[i].slots;
    }
    return [];
  }

  /* ---------------------------------------------------------------- render */

  function render() {
    if (state.stage === 'done') {
      renderConfirmation();
      return;
    }

    els.grid.hidden = false;
    els.status.hidden = true;
    els.status.textContent = '';
    renderLengths();
    renderDays();
    renderTimes();
    renderDetails();
    renderNotice();
  }

  function renderNotice() {
    els.notice.textContent = state.formError || '';
    els.notice.hidden = !state.formError;
  }

  function renderLengths() {
    els.length.textContent = '';
    els.length.setAttribute('role', 'group');
    els.length.setAttribute('aria-label', 'Meeting length');

    eventTypes.forEach(function (eventType) {
      var isSelected = eventType.slug === state.eventType.slug;
      var label = eventType.minutes + ' min';
      var button = choice(label, isSelected, function () {
        if (isSelected) return;
        state.eventType = eventType;
        state.dayLimit = VISIBLE_DAYS;
        state.formError = null;
        resetSelection();
        loadSlots(eventType.slug);
        render();
      });
      if (eventType.label) button.title = eventType.label;
      els.length.appendChild(button);
    });

    if (state.eventType.label) {
      els.length.appendChild(el('span', 'book-hint', state.eventType.label));
    }
  }

  function renderDays() {
    els.days.textContent = '';
    els.days.setAttribute('role', 'group');
    els.days.setAttribute('aria-label', 'Available days');

    if (state.status === 'loading') {
      els.days.appendChild(el('span', 'book-hint', 'Checking my calendar…'));
      return;
    }

    if (state.status === 'error') {
      var failed = el('span', 'book-hint', 'Could not load availability. ');
      failed.appendChild(calLink('Book on Cal.com instead'));
      els.days.appendChild(failed);
      return;
    }

    var days = currentDays();
    if (!days.length) {
      var empty = el('span', 'book-hint', 'Nothing free in the next ' + WINDOW_DAYS + ' days. ');
      empty.appendChild(calLink('Check Cal.com'));
      els.days.appendChild(empty);
      return;
    }

    var visible = days.slice(0, state.dayLimit);
    visible.forEach(function (day) {
      var isSelected = day.date === state.selectedDate;
      els.days.appendChild(
        choice(formatDayLabel(day.date), isSelected, function () {
          state.selectedDate = day.date;
          state.selectedSlot = null;
          state.showAllTimes = false;
          state.stage = 'picking';
          state.formError = null;
          render();
        })
      );
    });

    // Reveal further days a page at a time rather than dumping two months of
    // chips on screen at once.
    var remaining = days.length - visible.length;
    if (remaining > 0) {
      els.days.appendChild(
        moreButton(remaining + ' more', function () {
          state.dayLimit = Math.min(days.length, state.dayLimit + DAY_PAGE);
          render();
        })
      );
    } else if (days.length > VISIBLE_DAYS) {
      els.days.appendChild(
        moreButton('Fewer days', function () {
          state.dayLimit = VISIBLE_DAYS;
          render();
        })
      );
    }
  }

  function renderTimes() {
    els.times.textContent = '';
    var hasDays = state.status === 'ready' && currentDays().length > 0;
    els.timeRow.hidden = !hasDays;
    if (!hasDays) return;

    if (!state.selectedDate) {
      els.times.appendChild(el('span', 'book-hint', 'Pick a day first.'));
      return;
    }

    var slots = slotsForSelectedDate();
    var list = el('div', 'book-slots');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', 'Available times on ' + formatLongDayLabel(state.selectedDate));

    var visible = state.showAllTimes ? slots : slots.slice(0, VISIBLE_TIMES);
    visible.forEach(function (slot) {
      var isSelected = slot === state.selectedSlot;
      list.appendChild(
        choice(formatTime(slot), isSelected, function () {
          state.selectedSlot = slot;
          state.stage = 'details';
          state.formError = null;
          render();
          focusFirstField();
          track('booking_slot_selected', {
            event_type: state.eventType.slug,
            start: slot
          });
        })
      );
    });
    els.times.appendChild(list);

    if (slots.length > VISIBLE_TIMES) {
      els.times.appendChild(
        moreButton(
          state.showAllTimes ? 'Fewer times' : slots.length - VISIBLE_TIMES + ' more',
          function () {
            state.showAllTimes = !state.showAllTimes;
            render();
          }
        )
      );
    }

    els.times.appendChild(el('p', 'book-hint book-hint--block', 'Times shown in ' + timeZone + '.'));
  }

  function renderDetails() {
    var active = state.stage === 'details' || state.stage === 'submitting';
    els.detailsRow.hidden = !active;
    if (!active) {
      els.details.textContent = '';
      els.details.dataset.slot = '';
      return;
    }

    // Rebuild only when the slot changes, so typing survives re-renders.
    if (els.details.dataset.slot !== state.selectedSlot) {
      els.details.textContent = '';
      els.details.dataset.slot = state.selectedSlot;
      els.details.appendChild(buildForm());
    }

    var submit = els.details.querySelector('.book-submit');
    if (!submit) return;
    var submitting = state.stage === 'submitting';
    submit.disabled = submitting;
    submit.textContent = submitting ? 'Booking…' : 'Confirm booking';
  }

  function buildForm() {
    var form = el('form', 'book-form');
    form.noValidate = true;

    form.appendChild(
      el('p', 'book-summary', describeSlot(state.selectedSlot, state.eventType))
    );

    form.appendChild(field(form, 'text', 'book-name', 'Name', true));
    form.appendChild(field(form, 'email', 'book-email', 'Email', true));
    form.appendChild(field(form, 'textarea', 'book-notes', 'What would you like to talk about?', false));

    var actions = el('div', 'book-actions');
    var submit = el('button', 'book-submit', 'Confirm booking');
    submit.type = 'submit';
    actions.appendChild(submit);

    var cancel = el('button', 'book-more', 'Pick another time');
    cancel.type = 'button';
    cancel.addEventListener('click', function () {
      state.selectedSlot = null;
      state.stage = 'picking';
      state.formError = null;
      render();
    });
    actions.appendChild(cancel);
    form.appendChild(actions);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submitBooking(form);
    });

    return form;
  }

  function field(form, type, id, labelText, required) {
    var wrapper = el('div', 'book-field');
    var label = el('label', 'book-field-label', labelText);
    label.htmlFor = id;
    wrapper.appendChild(label);

    var input = type === 'textarea' ? el('textarea') : el('input');
    input.className = 'book-input';
    input.id = id;
    input.name = id;
    if (type === 'textarea') {
      input.rows = 3;
    } else {
      input.type = type;
      input.autocomplete = type === 'email' ? 'email' : 'name';
    }
    if (required) input.required = true;
    wrapper.appendChild(input);
    return wrapper;
  }

  function focusFirstField() {
    var input = document.getElementById('book-name');
    if (input && !input.value) input.focus({ preventScroll: true });
  }

  /* ----------------------------------------------------------------- submit */

  function submitBooking(form) {
    var name = form.querySelector('#book-name').value.trim();
    var email = form.querySelector('#book-email').value.trim();
    var notes = form.querySelector('#book-notes').value.trim();

    if (!name) {
      state.formError = 'Please add your name.';
      render();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      state.formError = 'Please add a valid email address.';
      render();
      return;
    }

    var payload = {
      start: state.selectedSlot,
      username: username,
      eventTypeSlug: state.eventType.slug,
      attendee: {
        name: name,
        email: email,
        timeZone: timeZone,
        language: 'en'
      }
    };
    if (notes) payload.bookingFieldsResponses = { notes: notes };

    state.stage = 'submitting';
    state.formError = null;
    render();

    fetch(API_BASE + '/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cal-api-version': BOOKINGS_API_VERSION
      },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        if (!response.ok) return readError(response);
        return response.json();
      })
      .then(function (body) {
        state.booking = (body && body.data) || {};
        state.stage = 'done';
        render();
        track('booking_confirmed', {
          event_type: state.eventType.slug,
          start: state.selectedSlot
        });
      })
      .catch(function (err) {
        state.stage = 'details';
        if (err.status === 409) {
          state.formError = 'That time was just taken. Pick another and try again.';
          loadSlots(state.eventType.slug, { force: true });
        } else {
          state.formError = err.message || 'Something went wrong. Please try again.';
        }
        render();
        track('booking_failed', {
          event_type: state.eventType.slug,
          status: err.status || 0
        });
      });
  }

  /* ----------------------------------------------------------- confirmation */

  function renderConfirmation() {
    els.grid.hidden = true;
    els.notice.hidden = true;
    els.status.hidden = false;
    els.status.textContent = '';

    var booking = state.booking || {};
    var start = booking.start || state.selectedSlot;
    var minutes = booking.duration || state.eventType.minutes;
    var dateKey = dateKeyFor(new Date(start));

    var card = el('div', 'book-confirmation');
    card.appendChild(el('p', 'book-confirmation-title', 'You are booked in.'));
    card.appendChild(
      el(
        'p',
        'book-confirmation-detail',
        formatLongDayLabel(dateKey) +
          ', ' +
          formatTimeRange(start, minutes) +
          ' (' +
          timeZone +
          ')'
      )
    );
    card.appendChild(
      el('p', 'book-hint book-hint--block', 'A calendar invite is on its way to your inbox.')
    );

    if (booking.uid) {
      var manage = el('p', 'book-hint book-hint--block');
      var link = el('a', 'contact-link contact-link--external', 'Reschedule or cancel');
      link.href = 'https://cal.com/booking/' + booking.uid;
      link.target = '_blank';
      link.rel = 'noopener';
      manage.appendChild(link);
      card.appendChild(manage);
    }

    var again = moreButton('Book another time', function () {
      state.booking = null;
      state.dayLimit = VISIBLE_DAYS;
      state.formError = null;
      resetSelection();
      loadSlots(state.eventType.slug, { force: true });
      render();
    });
    card.appendChild(again);

    els.status.appendChild(card);
  }
})();
