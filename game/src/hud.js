// The DOM HUD: everything the player reads, and nothing the simulation needs.
// main.js pushes a snapshot in every frame; this module writes only what
// changed, so the DOM never thrashes. Panels (start, pause, match end) and
// the buy menu are driven through the same object.
import { BUY_MENU, WEAPONS, weaponPrice } from './weapons.js';

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createHud() {
  const el = (id) => document.getElementById(id);
  const hud = el('hud');
  const overlay = el('overlay');
  const overlayTitle = el('overlay-title');
  const overlaySub = el('overlay-sub');
  const overlayCopy = el('overlay-copy');
  const endstatsWrap = el('endstats-wrap');
  const endstats = el('endstats');
  const playBtn = el('play');
  const timer = el('timer');
  const scoreAtk = el('score-atk');
  const scoreDef = el('score-def');
  const roundLabel = el('round-label');
  const objective = el('objective');
  const killfeed = el('killfeed');
  const hpNum = el('hp-num');
  const hpBar = el('hpbar');
  const armorNum = el('armor-num');
  const armorFill = el('armorfill');
  const teamdots = el('teamdots');
  const money = el('money');
  const weaponName = el('weaponname');
  const ammoBox = el('ammo');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const grenadeCount = el('grenade-count');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const dmgdir = el('dmgdir');
  const hurtfx = el('hurtfx');
  const progress = el('progress');
  const progressLabel = el('progress-label');
  const progressFill = el('progress-fill');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const buymenu = el('buymenu');
  const buytimer = el('buytimer');
  const buymoney = el('buymoney');
  const buyrows = el('buyrows');

  const cache = new Map();
  function set(key, apply) {
    // apply returns the string form of what it set; skip when unchanged.
    const value = apply();
    if (cache.get(key) !== value) {
      cache.set(key, value);
      return value;
    }
    return null;
  }
  function text(elm, key, value) {
    if (cache.get(key) !== value) {
      cache.set(key, value);
      elm.textContent = value;
    }
  }
  function width(elm, key, pct) {
    const v = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
    if (cache.get(key) !== v) {
      cache.set(key, v);
      elm.style.width = v;
    }
  }
  void set;

  let hitTimer = 0;
  let dmgTimer = 0;
  let hurtTimer = 0;
  let bannerTimer = 0;
  const buyHandlers = [];

  // Build the buy rows once; update their states per frame.
  const rowEls = BUY_MENU.map((row, i) => {
    const btn = document.createElement('button');
    btn.className = 'buyrow';
    btn.type = 'button';
    const price = weaponPrice(row);
    btn.innerHTML = `<kbd>${row.key}</kbd><span>${row.label}</span><span class="price">$${price}</span>`;
    btn.addEventListener('click', () => {
      for (const h of buyHandlers) h(i);
    });
    buyrows.appendChild(btn);
    return btn;
  });

  return {
    showHud() {
      hud.hidden = false;
    },
    onPlay(handler) {
      playBtn.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyHandlers.push(handler);
    },
    showPanel(mode, data = {}) {
      endstatsWrap.hidden = mode !== 'end';
      if (mode === 'start') {
        overlayTitle.innerHTML = 'DUSTLINE<span>.</span>';
        overlaySub.textContent = 'KESTREL DEPOT · FIRST TO 7';
        overlayCopy.innerHTML = 'Five Wardens, five Vultures, one breach charge. You attack: fight to a site, plant the charge, and hold it — or wipe the defence. Earn money every round and spend it in the buy phase. Accuracy beats speed: stop, crouch, then shoot.';
        playBtn.textContent = 'Play';
      } else if (mode === 'pause') {
        overlayTitle.textContent = 'Paused';
        overlaySub.textContent = `ROUND ${data.round ?? 1} · WARDENS ${data.atk ?? 0} — ${data.def ?? 0} VULTURES`;
        overlayCopy.textContent = 'The match is waiting. Click to jump back in.';
        playBtn.textContent = 'Resume';
      } else if (mode === 'end') {
        const won = data.matchWinner === 'atk';
        overlayTitle.textContent = won ? 'DEPOT TAKEN' : 'DEPOT LOST';
        overlaySub.textContent = `FINAL · WARDENS ${data.atk} — ${data.def} VULTURES`;
        overlayCopy.textContent = won
          ? 'The charge went off and the depot is yours. Final tally:'
          : 'The Vultures hold Kestrel Depot this time. Final tally:';
        endstats.innerHTML = data.statsHtml ?? '';
        playBtn.textContent = 'Play again';
      }
      overlay.hidden = false;
      playBtn.focus();
    },
    hidePanel() {
      overlay.hidden = true;
    },
    panelVisible() {
      return !overlay.hidden;
    },

    // The per-frame snapshot.
    update(s) {
      text(timer, 'timer', fmtTime(s.timer));
      timer.classList.toggle('low', s.timer <= 10 && (s.phase === 'live' || s.phase === 'planted'));
      text(scoreAtk, 'sa', String(s.score.atk));
      text(scoreDef, 'sd', String(s.score.def));
      text(roundLabel, 'round', `ROUND ${s.round}`);
      text(objective, 'obj', s.objective);
      text(hpNum, 'hp', String(Math.max(0, Math.ceil(s.hp))));
      hpNum.classList.toggle('low', s.hp <= 30);
      width(hpBar, 'hpw', s.hp);
      text(armorNum, 'armor', s.armor > 0 ? `▣ ${Math.ceil(s.armor)}${s.helmet ? ' + helmet' : ''}` : '');
      width(armorFill, 'armw', s.armor);
      text(money, 'money', `$${s.money}`);
      text(weaponName, 'wname', s.weaponName);
      text(ammoMag, 'mag', String(s.mag));
      text(ammoReserve, 'res', `/ ${s.reserve}`);
      ammoBox.classList.toggle('low', s.mag <= Math.max(2, s.magSize * 0.2));
      text(grenadeCount, 'nade', String(s.grenades));
      crosshair.style.setProperty('--gap', `${(5 + s.spreadPx).toFixed(1)}px`);
      // Team dots: rebuilt only when the alive pattern changes.
      const dotsKey = s.dots.map((d) => `${d.team}${d.alive ? 1 : 0}`).join(',');
      if (cache.get('dots') !== dotsKey) {
        cache.set('dots', dotsKey);
        teamdots.innerHTML = s.dots
          .map((d) => `<span class="dot${d.team === 'def' ? ' foe' : ''}${d.alive ? '' : ' dead'}"></span>`)
          .join('') + '<span style="margin-left:4px">alive</span>';
      }
      // Buy menu.
      if (s.buyOpen) {
        buymenu.hidden = false;
        text(buytimer, 'buyt', fmtTime(s.timer));
        text(buymoney, 'buym', `$${s.money}`);
        BUY_MENU.forEach((row, i) => {
          const st = s.buyStates[i];
          const cls = `buyrow${st === 'owned' ? ' owned' : st === 'cant' ? ' cant' : ''}`;
          if (rowEls[i].className !== cls) rowEls[i].className = cls;
          const priceEl = rowEls[i].querySelector('.price');
          const label = st === 'owned' ? 'OWNED' : `$${weaponPrice(row)}`;
          if (priceEl.textContent !== label) priceEl.textContent = label;
        });
      } else if (!buymenu.hidden) {
        buymenu.hidden = true;
      }
      void WEAPONS;
    },

    killfeed(killer, victim, part) {
      const div = document.createElement('div');
      div.className = 'feed';
      div.innerHTML = `<span class="${killer.team}">${killer.name}</span> ▸ <span class="${victim.team}">${victim.name}</span>${part === 'head' ? ' <span class="part">HEADSHOT</span>' : ''}`;
      killfeed.appendChild(div);
      while (killfeed.children.length > 5) killfeed.firstChild.remove();
      setTimeout(() => div.remove(), 4200);
    },
    hitMarker(kill) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', kill);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on'), kill ? 220 : 110);
    },
    damageFrom(angleDeg) {
      dmgdir.style.transform = `translate(-50%, -50%) rotate(${angleDeg.toFixed(0)}deg)`;
      dmgdir.classList.add('on');
      clearTimeout(dmgTimer);
      dmgTimer = setTimeout(() => dmgdir.classList.remove('on'), 650);
    },
    hurtFlash(strength = 0.75) {
      hurtfx.style.opacity = String(strength);
      clearTimeout(hurtTimer);
      hurtTimer = setTimeout(() => { hurtfx.style.opacity = '0'; }, 130);
    },
    setProgress(frac, label) {
      if (frac === null) {
        progress.hidden = true;
        return;
      }
      progress.hidden = false;
      text(progressLabel, 'prog-label', label);
      width(progressFill, 'prog', frac * 100);
    },
    showBanner(title, sub, tone, holdMs = 2600) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      banner.className = tone;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    hideBanner() {
      banner.hidden = true;
    },
  };
}
