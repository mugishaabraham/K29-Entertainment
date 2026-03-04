(function () {
  const clockEl = document.getElementById('kigaliClock');
  const labelEl = document.getElementById('clockLabel');
  const selectEl = document.getElementById('timezoneSelect');
  if (!clockEl || !labelEl || !selectEl) return;

  const STORAGE_KEY = 'k29_timezone';
  const NIGHT_START_HOUR = 18;
  const NIGHT_END_HOUR = 6;
  const fallbackTimezones = [
    'Africa/Kigali',
    'Europe/London',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Tokyo',
    'Australia/Sydney'
  ];

  function isValidTimezone(tz) {
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: tz }).format(new Date());
      return true;
    } catch {
      return false;
    }
  }

  function formatZoneLabel(tz) {
    const parts = tz.split('/');
    const city = parts[parts.length - 1] || tz;
    return city.replace(/_/g, ' ');
  }

  function formatZoneOffset(tz) {
    try {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset'
      });
      const zonePart = dtf.formatToParts(new Date()).find((part) => part.type === 'timeZoneName');
      return zonePart ? zonePart.value.replace('GMT', 'UTC') : 'UTC';
    } catch {
      return 'UTC';
    }
  }

  function getAllTimezones() {
    const dynamicList =
      typeof Intl.supportedValuesOf === 'function'
        ? Intl.supportedValuesOf('timeZone')
        : fallbackTimezones;

    return dynamicList.filter(isValidTimezone).sort((a, b) => a.localeCompare(b));
  }

  function getHourInTimezone(timeZone) {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      hour: '2-digit'
    }).format(new Date());
    return Number(formatted);
  }

  function setNightMode(timeZone) {
    const hour = getHourInTimezone(timeZone);
    const isNight = hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
    document.body.classList.toggle('night-mode', isNight);
  }

  function setClock(timeZone) {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString(undefined, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    labelEl.textContent = `${formatZoneLabel(timeZone)} Time`;
    setNightMode(timeZone);
  }

  function loadTimezone() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isValidTimezone(saved)) return saved;

    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTz && isValidTimezone(browserTz)) return browserTz;

    return 'Africa/Kigali';
  }

  function addOptions(currentTz, allTimezones) {
    const unique = new Set(allTimezones);
    unique.add(currentTz);

    Array.from(unique)
      .sort((a, b) => a.localeCompare(b))
      .forEach((tz) => {
        const option = document.createElement('option');
        option.value = tz;
        option.textContent = `${formatZoneLabel(tz)} (${formatZoneOffset(tz)})`;
        selectEl.appendChild(option);
      });
  }

  let activeTimezone = loadTimezone();
  addOptions(activeTimezone, getAllTimezones());
  selectEl.value = activeTimezone;

  setClock(activeTimezone);
  setInterval(() => setClock(activeTimezone), 1000);

  selectEl.addEventListener('change', () => {
    activeTimezone = selectEl.value;
    localStorage.setItem(STORAGE_KEY, activeTimezone);
    setClock(activeTimezone);
  });
})();
