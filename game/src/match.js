// The match: rounds, money and the breach charge. Wardens attack, Vultures
// defend. A round is won by elimination, by detonating the charge on a site,
// by defusing it, or (for the defence) by running out the clock. First to
// seven rounds takes the match. This module owns every rule and timer; the
// HUD only reads its state, and the bots take their orders from it.
import { HOLD_POINTS, PLANT_COVER, SITES, SPAWNS } from './map.js';
import { WEAPONS } from './weapons.js';

export const ROUND = {
  buyFirst: 12,
  buy: 10,
  live: 100,
  fuse: 35,
  end: 4.6,
  plantTime: 3.2,
  defuseTime: 5,
  winTarget: 7,
  maxRounds: 13,
  startMoney: 800,
  killReward: 300,
  plantReward: 300,
  winIncome: 2700,
  lossIncome: 2000,
};

export function createMatch(rng, events) {
  const state = {
    phase: 'menu', // menu | buy | live | planted | end | matchEnd
    phaseT: 0,
    round: 0,
    score: { atk: 0, def: 0 },
    timer: 0,
    targetSite: SITES[0],
    winner: null, // 'atk' | 'def' for the round
    winReason: '',
    matchWinner: null,
    lastPlantBy: null,
  };
  const charge = {
    state: 'carried', // carried | dropped | planted
    carrier: null,
    x: 0,
    z: 0,
    site: null,
    fuseT: 0,
    beepT: 0,
  };
  const defHolds = new Map();
  const plantCovers = new Map();
  let playerRef = null;
  let botsRef = [];

  function teamAlive(team, player, bots) {
    let n = 0;
    if (team === 'atk' && player.alive) n += 1;
    for (const b of bots) if (b.team === team && b.alive) n += 1;
    return n;
  }

  function setupRound(player, bots) {
    state.round += 1;
    state.winner = null;
    state.winReason = '';
    state.targetSite = rng.chance(0.5) ? SITES[0] : SITES[1];
    // People back to spawn, alive and whole.
    const atkSpawns = SPAWNS.atk;
    const defSpawns = SPAWNS.def;
    player.hp = 100;
    player.alive = true;
    let ai = 0;
    let di = 0;
    for (const bot of bots) {
      // The player owns the middle attack spawn (atkSpawns[1], see main's
      // respawnAll), so Warden bots take the two flank spawns instead of
      // stacking inside the player's camera.
      const spawn = bot.team === 'atk' ? atkSpawns[ai++ === 0 ? 0 : 2] : defSpawns[di++ % defSpawns.length];
      bot.spawnYaw = spawn.yaw;
      bot.resetTo = spawn;
    }
    // The charge starts on a Warden bot's back, never the player's: the
    // player chooses whether to escort, flank, or pick it up when it drops.
    const atkBots = bots.filter((b) => b.team === 'atk');
    charge.state = 'carried';
    charge.carrier = atkBots[0] ?? null;
    charge.site = null;
    charge.fuseT = 0;
    if (charge.carrier) {
      charge.x = charge.carrier.pos.x;
      charge.z = charge.carrier.pos.z;
    }
    // Defender setup: two hold one site, the third watches mid or the other.
    defHolds.clear();
    const defs = bots.filter((b) => b.team === 'def');
    const strongSite = rng.chance(0.5) ? 'A' : 'B';
    defs.forEach((bot, i) => {
      if (i === 0) defHolds.set(bot, HOLD_POINTS[strongSite][0]);
      else if (i === 1) defHolds.set(bot, HOLD_POINTS[strongSite][1]);
      else defHolds.set(bot, HOLD_POINTS[strongSite === 'A' ? 'B' : 'A'][0]);
    });
    plantCovers.clear();
    state.phase = 'buy';
    state.phaseT = state.round === 1 ? ROUND.buyFirst : ROUND.buy;
    state.timer = state.phaseT;
    events.roundStart(state.round, state.targetSite.id);
  }

  function startMatch(player, bots) {
    playerRef = player;
    botsRef = bots;
    state.round = 0;
    state.score.atk = 0;
    state.score.def = 0;
    state.matchWinner = null;
    player.money = ROUND.startMoney;
    for (const bot of bots) bot.money = ROUND.startMoney;
    setupRound(player, bots);
  }

  function endRound(winner, reason) {
    state.winner = winner;
    state.winReason = reason;
    state.score[winner] += 1;
    // Income: winners paid more; a planted charge softens a Warden loss.
    const loser = winner === 'atk' ? 'def' : 'atk';
    payTeam(winner, ROUND.winIncome);
    payTeam(loser, ROUND.lossIncome + (loser === 'atk' && charge.state === 'planted' ? 500 : 0));
    state.phase = 'end';
    state.phaseT = ROUND.end;
    events.roundEnd(winner, reason, state.score);
    if (state.score.atk >= ROUND.winTarget || state.score.def >= ROUND.winTarget || state.round >= ROUND.maxRounds) {
      state.matchWinner = state.score.atk === state.score.def ? winner : state.score.atk > state.score.def ? 'atk' : 'def';
    }
  }

  function payTeam(team, amount) {
    if (team === 'atk' && playerRef) playerRef.money += amount;
    for (const bot of botsRef) if (bot.team === team) bot.money += amount;
  }

  function onKill(killer, victim) {
    victim.deaths = (victim.deaths ?? 0) + 1;
    if (killer && killer !== victim) {
      killer.kills = (killer.kills ?? 0) + 1;
      if (killer.isPlayer) playerRef.money += ROUND.killReward;
      else killer.money = (killer.money ?? 0) + ROUND.killReward;
    }
    if (charge.state === 'carried' && charge.carrier === victim) {
      charge.state = 'dropped';
      charge.carrier = null;
      charge.x = victim.pos.x;
      charge.z = victim.pos.z;
      events.chargeDropped(charge.x, charge.z);
    }
  }

  function completePlant(planter) {
    charge.state = 'planted';
    charge.site = state.targetSiteAtPlant;
    charge.x = planter.pos.x;
    charge.z = planter.pos.z;
    charge.fuseT = ROUND.fuse;
    charge.beepT = 0;
    state.phase = 'planted';
    state.lastPlantBy = planter;
    if (planter.isPlayer) playerRef.money += ROUND.plantReward;
    else planter.money = (planter.money ?? 0) + ROUND.plantReward;
    // Attackers fan out to cover points around the site.
    plantCovers.clear();
    const covers = PLANT_COVER[charge.site.id];
    let i = 0;
    for (const bot of botsRef) {
      if (bot.team === 'atk' && bot.alive && bot !== planter) {
        plantCovers.set(bot, covers[i % covers.length]);
        i += 1;
      }
    }
    events.planted(charge.site.id, charge.x, charge.z);
  }

  // The orders object the bot brains read. Rebuilt cheaply: closures over
  // live state, no per-step allocation beyond the object itself.
  const orders = {
    get phase() { return state.phase; },
    get targetSite() { return state.targetSite; },
    get chargeCarrier() { return charge.state === 'carried' ? charge.carrier : null; },
    get chargePos() { return { x: charge.x, z: charge.z }; },
    get plantedSitePos() { return { x: charge.x, z: charge.z }; },
    atSite(actor) {
      const s = siteAt(actor.pos.x, actor.pos.z);
      return !!s;
    },
    chargeDefusableBy(bot) {
      return charge.state === 'planted' && Math.hypot(bot.pos.x - charge.x, bot.pos.z - charge.z) < 1.8;
    },
    holdPointFor(bot) {
      if (state.phase === 'planted') return plantCovers.get(bot) ?? HOLD_POINTS[state.targetSite.id][0];
      return defHolds.get(bot) ?? HOLD_POINTS.mid[0];
    },
    plantCoverFor(bot) {
      return plantCovers.get(bot) ?? PLANT_COVER[charge.site?.id ?? 'A'][0];
    },
    escortPoint(bot) {
      // Non-carriers walk a few metres off the carrier, toward the site.
      const c = charge.carrier;
      if (c) return { x: c.pos.x + (bot.pos.x - c.pos.x) * 0.4, z: c.pos.z + (bot.pos.z - c.pos.z) * 0.4 };
      return state.targetSite;
    },
  };

  function siteAt(x, z) {
    for (const s of SITES) if (Math.hypot(x - s.x, z - s.z) <= s.r) return s;
    return null;
  }

  // Bot shopping, one policy for every bot: rifle when rich, SMG when not,
  // armour before a second grenade, keep a small reserve.
  function botBuy(bot) {
    const hasPrimary = bot.weaponId !== 'p9';
    if (!hasPrimary && bot.money >= WEAPONS.kestrel.price && rng.chance(0.75)) buyBotWeapon(bot, 'kestrel');
    else if (!hasPrimary && bot.money >= WEAPONS.wasp.price) buyBotWeapon(bot, 'wasp');
    else if (!hasPrimary && bot.money >= WEAPONS.longshot.price && rng.chance(0.2)) buyBotWeapon(bot, 'longshot');
    if (bot.money >= 1000 && !bot.helmet) {
      bot.money -= 1000;
      bot.armor = 100;
      bot.helmet = true;
    } else if (bot.money >= 650 && bot.armor < 60) {
      bot.money -= 650;
      bot.armor = 100;
    }
  }
  function buyBotWeapon(bot, id) {
    bot.money -= WEAPONS[id].price;
    bot.weaponId = id;
    bot.mag = WEAPONS[id].mag;
    bot.reserve = WEAPONS[id].reserve;
  }

  function step(dt, player, bots) {
    state.phaseT -= dt;
    if (charge.state === 'carried' && charge.carrier) {
      charge.x = charge.carrier.pos.x;
      charge.z = charge.carrier.pos.z;
    }
    switch (state.phase) {
      case 'buy': {
        state.timer = Math.max(0, state.phaseT);
        if (state.phaseT <= 0) {
          state.phase = 'live';
          state.phaseT = ROUND.live;
          events.liveStart();
        }
        break;
      }
      case 'live': {
        state.timer = Math.max(0, state.phaseT);
        // Plant channels: a bot's brain counts its own channel; the player's
        // is counted by main.js and reported through player.plantProgress.
        const atkAlive = teamAlive('atk', player, bots);
        const defAlive = teamAlive('def', player, bots);
        if (defAlive === 0) return endRound('atk', 'ELIMINATION');
        if (atkAlive === 0) return endRound('def', 'ELIMINATION');
        if (state.phaseT <= 0) return endRound('def', 'TIME EXPIRED');
        for (const bot of bots) {
          if (bot.alive && bot.brain.channelKind === 'plant' && bot.brain.channelT >= ROUND.plantTime) {
            const site = siteAt(bot.pos.x, bot.pos.z);
            if (site) {
              state.targetSiteAtPlant = site;
              return completePlant(bot);
            }
          }
        }
        if (player.alive && player.plantProgress >= 1) {
          const site = siteAt(player.pos.x, player.pos.z);
          if (site) {
            state.targetSiteAtPlant = site;
            return completePlant(player);
          }
        }
        // Picking up a dropped charge: any living Warden walking over it.
        if (charge.state === 'dropped') {
          const takers = [player, ...bots.filter((b) => b.team === 'atk')];
          for (const t of takers) {
            if (t.alive && Math.hypot(t.pos.x - charge.x, t.pos.z - charge.z) < 1.1) {
              charge.state = 'carried';
              charge.carrier = t;
              events.chargePickedUp(t);
              break;
            }
          }
        }
        break;
      }
      case 'planted': {
        state.timer = Math.max(0, charge.fuseT);
        charge.fuseT -= dt;
        charge.beepT -= dt;
        if (charge.beepT <= 0) {
          charge.beepT = charge.fuseT < 8 ? 0.42 : 1.0;
          events.chargeBeep(charge.fuseT < 8);
        }
        const defAlive = teamAlive('def', player, bots);
        if (defAlive === 0) return endRound('atk', 'ELIMINATION');
        for (const bot of bots) {
          if (bot.alive && bot.team === 'def' && bot.brain.channelKind === 'defuse' && bot.brain.channelT >= ROUND.defuseTime) {
            events.defused();
            return endRound('def', 'CHARGE DEFUSED');
          }
        }
        if (charge.fuseT <= 0) {
          events.detonated(charge.x, charge.z);
          return endRound('atk', 'CHARGE DETONATED');
        }
        break;
      }
      case 'end': {
        if (state.phaseT <= 0) {
          if (state.matchWinner) {
            state.phase = 'matchEnd';
            events.matchEnd(state.matchWinner, state.score);
          } else {
            setupRound(player, bots);
            events.needsRespawn();
          }
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    state,
    charge,
    orders,
    startMatch,
    setupRound,
    step,
    onKill,
    botBuy,
    siteAt,
    teamAlive: (team, player, bots) => teamAlive(team, player, bots),
  };
}
