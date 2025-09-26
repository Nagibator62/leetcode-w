// script.js
// Minimal LeetCode contribution-like widget.
// Put username in data-username on the container OR pass ?u=USERNAME in URL.

// CONFIG
const CELL_SIZE = 12;    // size of a square cell in px
const CELL_GAP = 4;      // gap between cells in px
const REFRESH_MS = 1000 * 60 * 5; // auto refresh every 5 minutes (configurable)

const COLORS = {
  0: getComputedStyle(document.documentElement).getPropertyValue('--c0') || '#222426',
  1: getComputedStyle(document.documentElement).getPropertyValue('--c1') || '#2f6f43',
  2: getComputedStyle(document.documentElement).getPropertyValue('--c2') || '#2da55d',
  3: getComputedStyle(document.documentElement).getPropertyValue('--c3') || '#28a745',
  4: getComputedStyle(document.documentElement).getPropertyValue('--c4') || '#1f7f3a',
};

function $(sel, ctx=document) { return ctx.querySelector(sel); }
function formatDate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// recursive search: find object which looks like {"YYYY-MM-DD": number, ...}
function findCalendarByPattern(obj){
  if (!obj || typeof obj !== 'object') return null;
  // direct candidate: object that has many date-like keys
  let dateKeyCount = 0;
  for (const k in obj){
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && (typeof obj[k] === 'number' || typeof obj[k] === 'string')){
      dateKeyCount++;
      if (dateKeyCount >= 5) return obj;
    }
  }
  // if not found, search deeper in object keys that might contain "calendar" or "submission"
  for (const k in obj){
    if (/calendar|submission|contribution|submit/i.test(k)){
      const candidate = obj[k];
      if (candidate && typeof candidate === 'object'){
        // check candidate quickly
        let cCount = 0;
        for (const kk in candidate){
          if (/^\d{4}-\d{2}-\d{2}$/.test(kk)) cCount++;
          if (cCount >= 3) return candidate;
        }
      }
    }
  }
  // otherwise recursive descent
  for (const k in obj){
    try{
      const res = findCalendarByPattern(obj[k]);
      if (res) return res;
    }catch(e){}
  }
  return null;
}

async function fetchLeetCodeCalendar(username){
  // Fetch profile HTML and parse __NEXT_DATA__ JSON (works for standard LeetCode profile pages).
  const url = `https://leetcode.com/${encodeURIComponent(username)}/`;
  const resp = await fetch(url, { credentials: 'omit' });
  if (!resp.ok) throw new Error('Не удалось загрузить профиль: ' + resp.status);
  const text = await resp.text();

  const m = text.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
  if (!m) throw new Error('Не найден __NEXT_DATA__; страница LeetCode возможно изменилась.');
  let next;
  try {
    next = JSON.parse(m[1]);
  } catch(e){
    throw new Error('Не удалось распарсить __NEXT_DATA__ JSON.');
  }

  const calendar = findCalendarByPattern(next);
  if (!calendar) throw new Error('Не обнаружен календарь активности в данных профиля.');
  // calendar is object like { "YYYY-MM-DD": number, ... }
  return calendar;
}

function lastNDaysArray(calendarObj, n){
  const arr = [];
  const today = new Date();
  // build array from oldest -> newest
  for (let i = n - 1; i >= 0; i--){
    const d = new Date();
    d.setDate(today.getDate() - i);
    const iso = formatDate(d);
    arr.push({ date: iso, count: Number(calendarObj[iso] || 0) });
  }
  return arr;
}

// compute columns available for cells in container width
function computeColsAvailable(containerWidth, cellSize=CELL_SIZE, gap=CELL_GAP){
  return Math.floor((containerWidth + gap) / (cellSize + gap));
}

// choose whether to render 30 or 90 days based on colsAvailable.
// We require about 13 columns for ~90 days (13 weeks), ~6 columns for 30 days.
function decideDaysFromCols(colsAvailable){
  if (colsAvailable >= 13) return 90;
  return 30;
}

function countToLevel(count){
  if (!count || count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 7) return 3;
  return 4;
}

function createSVGGrid(daysArray, container){
  // daysArray: [{date, count}, ...] oldest->newest
  // Build week columns (each column 7 rows Sun..Sat). We'll align so top row == Sunday.
  const rows = 7;
  const firstDate = new Date(daysArray[0].date);
  const startPad = firstDate.getDay(); // 0..6, 0==Sunday
  const totalCells = startPad + daysArray.length;
  const cols = Math.ceil(totalCells / rows);

  const w = cols * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  const h = rows * (CELL_SIZE + CELL_GAP) - CELL_GAP + 20; // extra for month labels

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('role', 'img');

  // background group
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('transform', 'translate(0,0)');

  // draw cells
  for (let col = 0; col < cols; col++){
    for (let row = 0; row < rows; row++){
      const cellIndex = col * rows + row - startPad;
      const x = col * (CELL_SIZE + CELL_GAP);
      const y = row * (CELL_SIZE + CELL_GAP);
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', CELL_SIZE);
      rect.setAttribute('height', CELL_SIZE);
      rect.setAttribute('rx', 2);
      rect.setAttribute('ry', 2);
      rect.setAttribute('stroke', 'transparent');

      if (cellIndex >= 0 && cellIndex < daysArray.length){
        const day = daysArray[cellIndex];
        const level = countToLevel(day.count);
        const fill = COLORS[level] || COLORS[0];
        rect.setAttribute('fill', fill);
        // title for hover
        const title = document.createElementNS(ns, 'title');
        title.textContent = `${day.count} solved on ${day.date}`;
        rect.appendChild(title);
      } else {
        rect.setAttribute('fill', 'transparent');
      }
      g.appendChild(rect);
    }
  }

  svg.appendChild(g);

  // Month labels (place month names under the column where month changes)
  const monthsGroup = document.createElementNS(ns, 'g');
  monthsGroup.setAttribute('transform', `translate(0, ${rows*(CELL_SIZE+CELL_GAP) + 4})`);
  // compute month start columns
  const monthPositions = {};
  daysArray.forEach((d, idx) => {
    const dt = new Date(d.date);
    const mm = dt.toLocaleString('default', { month: 'short' });
    const cellIndex = idx + startPad;
    const col = Math.floor(cellIndex / rows);
    // set first column index for this month if not set
    if (!(mm in monthPositions)) monthPositions[mm] = col;
  });
  for (const [mm, col] of Object.entries(monthPositions)){
    const text = document.createElementNS(ns, 'text');
    const x = col * (CELL_SIZE + CELL_GAP);
    text.setAttribute('x', x);
    text.setAttribute('y', 12);
    text.setAttribute('class', 'lc-month');
    text.textContent = mm;
    monthsGroup.appendChild(text);
  }
  svg.appendChild(monthsGroup);

  // clear container and append svg
  container.innerHTML = '';
  container.appendChild(svg);
}

async function renderWidget(container, username){
  container.innerHTML = '<div style="color:#9aa6b2">Загрузка данных...</div>';
  try{
    const calendar = await fetchLeetCodeCalendar(username);
    // compute available columns to decide 30/90
    const containerWidth = container.clientWidth || Math.max(300, window.innerWidth);
    const colsAvail = computeColsAvailable(containerWidth);
    const daysToShow = decideDaysFromCols(colsAvail);

    const daysArr = lastNDaysArray(calendar, daysToShow);
    createSVGGrid(daysArr, container);

    // small footer
    const footer = document.createElement('div');
    footer.className = 'lc-footer';
    footer.textContent = `Показано последние ${daysToShow} дней · Обновлено ${new Date().toLocaleString()}`;
    container.appendChild(footer);
  } catch(e){
    console.error(e);
    container.innerHTML = `<div style="color:#e07c7c">Ошибка: ${e.message}. Возможно LeetCode изменил структуру страницы или включил CORS-блокировку.</div>`;
  }
}

// main boot
(function(){
  const container = document.getElementById('lc-widget');
  if (!container) return;

  const urlParams = new URLSearchParams(window.location.search);
  const username = container.dataset.username && container.dataset.username !== 'your_leetcode_username' ? container.dataset.username : (urlParams.get('u') || urlParams.get('username'));
  if (!username){
    container.innerHTML = '<div style="color:#f5d78c">Укажите LeetCode username: установите data-username в index.html или откройте страницу с ?u=USERNAME</div>';
    return;
  }

  // initial render + periodic refresh
  let currentDaysMode = null;
  let lastCalendar = null;

  async function doRender(){
    try {
      const calendar = await fetchLeetCodeCalendar(username);
      lastCalendar = calendar;
      // check columns and render
      const colsAvail = computeColsAvailable(container.clientWidth || window.innerWidth);
      const daysToShow = decideDaysFromCols(colsAvail);
      if (currentDaysMode !== daysToShow){
        currentDaysMode = daysToShow;
        const daysArr = lastNDaysArray(calendar, daysToShow);
        createSVGGrid(daysArr, container);
        const footer = document.createElement('div');
        footer.className = 'lc-footer';
        footer.textContent = `Показано последние ${daysToShow} дней · Обновлено ${new Date().toLocaleString()}`;
        container.appendChild(footer);
      } else {
        // re-render with same mode in case data changed
        const daysArr = lastNDaysArray(calendar, daysToShow);
        createSVGGrid(daysArr, container);
        const footer = document.createElement('div');
        footer.className = 'lc-footer';
        footer.textContent = `Показано последние ${daysToShow} дней · Обновлено ${new Date().toLocaleString()}`;
        container.appendChild(footer);
      }
    } catch (err){
      container.innerHTML = `<div style="color:#e07c7c">Ошибка: ${err.message}</div>`;
    }
  }

  doRender();
  setInterval(doRender, REFRESH_MS);

  // ResizeObserver to auto-switch between 30/90 days
  const ro = new ResizeObserver(entries => {
    for (const ent of entries){
      const width = ent.contentRect.width;
      const colsAvail = computeColsAvailable(width);
      const newDays = decideDaysFromCols(colsAvail);
      if (newDays !== currentDaysMode){
        // re-render immediately (use cached calendar if available)
        if (lastCalendar){
          currentDaysMode = newDays;
          const daysArr = lastNDaysArray(lastCalendar, newDays);
          createSVGGrid(daysArr, container);
          const footer = document.createElement('div');
          footer.className = 'lc-footer';
          footer.textContent = `Показано последние ${newDays} дней · Обновлено ${new Date().toLocaleString()}`;
          container.appendChild(footer);
        } else {
          // fetch then render
          doRender();
        }
      }
    }
  });
  ro.observe(container);
})();
