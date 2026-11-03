// War Room landing page: the poll-closing clock and timeline, worked out in the visitor's browser.
// Times match CODE/src/features/war-room/night/pollClosings.ts (Eastern time, Nov 3, 2026, EST = UTC-5).
(function () {
  "use strict";

  // nginx swaps the __WAR_ROOM_URL__ and __SITE_URL__ placeholders at serve time (see nginx.conf). When the page is
  // opened some other way (a file, a plain static server), fall back to the live site so the links still work.
  var FALLBACK_SITE = "https://2026midterms-testing.up.railway.app";
  var FALLBACK_WAR_ROOM = FALLBACK_SITE + "/war-room";
  var links = document.querySelectorAll("a[href*='__WAR_ROOM_URL__'], a[href*='__SITE_URL__']");
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute("href");
    links[i].setAttribute("href", href.replace("__WAR_ROOM_URL__", FALLBACK_WAR_ROOM).replace("__SITE_URL__", FALLBACK_SITE));
  }

  /** Nov 3, 2026 at hour:minute Eastern (hour 24 is midnight into Nov 4), as epoch ms. */
  function et(hour, minute) { return Date.UTC(2026, 10, 3, hour + 5, minute || 0); }

  var SLOTS = [
    { at: et(18), label: "6:00 PM ET", states: ["IN", "KY"] },
    { at: et(19), label: "7:00 PM ET", states: ["FL", "GA", "NH", "SC", "VA", "VT"] },
    { at: et(19, 30), label: "7:30 PM ET", states: ["NC", "OH", "WV"] },
    { at: et(20), label: "8:00 PM ET", states: ["AL", "CT", "DC", "DE", "IL", "KS", "MA", "MD", "ME", "MI", "MO", "MS", "NJ", "OK", "PA", "RI", "SD", "TN", "TX"] },
    { at: et(20, 30), label: "8:30 PM ET", states: ["AR"] },
    { at: et(21), label: "9:00 PM ET", states: ["AZ", "CO", "IA", "LA", "MN", "ND", "NE", "NM", "NY", "WI", "WY"] },
    { at: et(22), label: "10:00 PM ET", states: ["ID", "MT", "NV", "UT"] },
    { at: et(23), label: "11:00 PM ET", states: ["CA", "OR", "WA"] },
    { at: et(24), label: "12:00 AM ET", states: ["AK", "HI"] }
  ];

  var key = document.querySelector("[data-clock-key]");
  var val = document.querySelector("[data-clock-val]");
  var closedEl = document.querySelector("[data-closed]");
  var nextEl = document.querySelector("[data-next-states]");
  var phase = document.querySelector("[data-phase-label]");
  var rows = document.querySelectorAll("[data-timeline] li");

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function countdown(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (d > 0) return d + "d " + pad(h) + "h " + pad(m) + "m";
    return (h > 0 ? h + "h " : "") + pad(m) + "m " + pad(sec) + "s";
  }

  function render() {
    var now = Date.now();
    var nextIndex = -1;
    var closed = 0;
    for (var i = 0; i < SLOTS.length; i++) {
      if (SLOTS[i].at <= now) closed += SLOTS[i].states.length;
      else if (nextIndex === -1) nextIndex = i;
    }

    if (closedEl) closedEl.textContent = String(closed);

    if (nextIndex === -1) {
      if (key) key.textContent = "All polls closed";
      if (val) val.textContent = "Results coming in";
      if (nextEl) nextEl.textContent = "Follow the count";
      if (phase) phase.textContent = "Live now · results coming in";
    } else {
      var next = SLOTS[nextIndex];
      if (key) key.textContent = (nextIndex === 0 ? "First polls close in" : "Next polls close in");
      if (val) val.textContent = countdown(next.at - now);
      if (nextEl) nextEl.textContent = next.label + " · " + next.states.join(" ");
      if (phase) phase.textContent = nextIndex === 0 ? "2026 midterms · election night Nov 3" : "Live now · polls closing";
    }

    for (var r = 0; r < rows.length; r++) {
      rows[r].classList.toggle("closed", r < SLOTS.length && SLOTS[r].at <= now);
      rows[r].classList.toggle("next", r === nextIndex);
    }
  }

  render();
  setInterval(render, 1000);
})();
