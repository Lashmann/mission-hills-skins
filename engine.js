/* Mission Hills Skins — scoring engine.
   Pure functions, no DOM: loaded by index.html and by test/engine.test.js in Node.
   Every rule here was agreed with the commissioner on 17-09-2026 (see RULES in index.html). */
(function (root) {
  'use strict';

  var DEFAULT_RULES = {
    holeSkin: 1,      // per hole, ties carry to the next hole
    snakeCap: 9,      // snake value never exceeds this
    birdie: 1,        // gross, regardless of handicap
    ferret: 2,        // holed from off the green, no putter
    ld: 1,            // per longest-drive hole (every par 5, min 4)
    cp: 1,            // per closest-to-pin hole (every par 3, min 4)
    minLD: 4,
    minCP: 4
  };

  // ---------- handicaps ----------
  // WHS / GA daily handicap: index x slope/113 + (rating - par), rounded (0.5 up).
  function playingHandicap(index, slope, rating, par) {
    if (index === null || index === undefined || isNaN(index)) return null;
    if (!slope || rating === null || rating === undefined) return Math.round(index);
    return Math.round(index * slope / 113 + (rating - par));
  }
  // Strokes received on a hole from a whole-number playing handicap, by stroke index.
  function strokesOnHole(hc, si) {
    if (hc === null || hc === undefined) return 0;
    if (hc >= 0) { var b = Math.floor(hc / 18), r = hc % 18; return b + (si <= r ? 1 : 0); }
    var a = -hc, b2 = Math.floor(a / 18), r2 = a % 18;          // plus handicaps give strokes back from SI 18 down
    return -(b2 + ((19 - si) <= r2 ? 1 : 0));
  }
  function stableford(gross, par, strokes) {
    if (gross === 'P') return 0;                                  // pick-up: zero, hole not completed
    if (!isEntered(gross)) return null;
    return Math.max(0, 2 + par + strokes - gross);
  }
  function isEntered(g) { return g === 'P' || (typeof g === 'number' && g > 0); }

  // ---------- LD / CP holes ----------
  function yardsOf(hole, tee) {
    var y = hole.yards || {};
    return y[tee] || y.Black || y.Gold || y.Blue || y.White || 0;
  }
  function specialHoles(course, tee, rules) {
    rules = rules || DEFAULT_RULES;
    var holes = course.holes;
    var ld = holes.filter(function (h) { return h.par === 5; }).map(function (h) { return h.hole; });
    var cp = holes.filter(function (h) { return h.par === 3; }).map(function (h) { return h.hole; });
    var p4 = holes.filter(function (h) { return h.par === 4; });
    if (ld.length < rules.minLD) {                                 // longest par 4s fill in
      p4.slice().sort(function (a, b) { return yardsOf(b, tee) - yardsOf(a, tee); })
        .forEach(function (h) { if (ld.length < rules.minLD && ld.indexOf(h.hole) < 0) ld.push(h.hole); });
    }
    if (cp.length < rules.minCP) {                                 // shortest par 4s fill in
      p4.slice().sort(function (a, b) { return yardsOf(a, tee) - yardsOf(b, tee); })
        .forEach(function (h) { if (cp.length < rules.minCP && cp.indexOf(h.hole) < 0) cp.push(h.hole); });
    }
    return { ld: ld.sort(function (a, b) { return a - b; }), cp: cp.sort(function (a, b) { return a - b; }) };
  }

  // ---------- one group, one round ----------
  // group: { teams:[[pid,..],[pid,..]], holes:{ "1": {gross:{pid:n|'P'}, snake:pid, ld:pid, cp:pid, ferret:pid} }, carried:{hole,snake,ld,cp} }
  // ctx:   { course, tee, rules, hc:{pid:number}, ldHoles:[..], cpHoles:[..] }
  function computeGroup(group, ctx) {
    var rules = ctx.rules || DEFAULT_RULES, course = ctx.course;
    var teams = group.teams, carried = group.carried || {};
    var teamOf = {}; teams.forEach(function (t, i) { t.forEach(function (p) { teamOf[p] = i; }); });
    var all = [].concat.apply([], teams);
    var res = {
      teamSkins: teams.map(function () { return 0; }),
      playerPts: {}, playerGross: {}, holes: [], events: [],
      complete: false, lastPlayed: 0, gaps: [],
      unwon: { hole: 0, snake: 0, ld: 0, cp: 0 },
      pots: { hole: +(carried.hole || 0), snake: +(carried.snake || 0), ld: +(carried.ld || 0), cp: +(carried.cp || 0) }
    };
    all.forEach(function (p) { res.playerPts[p] = 0; res.playerGross[p] = 0; });
    res.playerShare = {}; res.playerContrib = {};                 // contrib: skins this player personally won for the team
    all.forEach(function (p) { res.playerContrib[p] = 0; });
    if (!all.length) return res;                                  // no draw yet: nothing played, nothing complete
    var pot = res.pots, stopped = false;

    course.holes.forEach(function (H) {
      var h = H.hole, e = group.holes[String(h)] || {}, gross = e.gross || {};
      var entered = all.every(function (p) { return isEntered(gross[p]); });
      if (stopped) { if (all.some(function (p) { return isEntered(gross[p]); })) res.gaps.push(h); return; }
      if (!entered) { stopped = true; if (all.some(function (p) { return isEntered(gross[p]); })) res.gaps.push(h); return; }
      res.lastPlayed = h;
      var rec = { hole: h, par: H.par, si: H.si, pts: {}, strokes: {}, gross: {}, holeValue: 0, holeWinner: null,
                  snakeValue: 0, snakeWinner: null, snakeInvalid: false, ld: null, ldValue: 0, cp: null, cpValue: 0,
                  isLD: ctx.ldHoles.indexOf(h) >= 0, isCP: ctx.cpHoles.indexOf(h) >= 0, notes: [] };

      // points
      all.forEach(function (p) {
        var s = strokesOnHole(ctx.hc[p], H.si), g = gross[p];
        rec.strokes[p] = s; rec.gross[p] = g;
        var pts = stableford(g, H.par, s);
        rec.pts[p] = pts; res.playerPts[p] += pts;
        if (typeof g === 'number') res.playerGross[p] += g;
      });

      // hole skin: value = carry + 1; best Stableford per team; tie carries
      pot.hole += rules.holeSkin; rec.holeValue = pot.hole;
      var best = teams.map(function (t) { return Math.max.apply(null, t.map(function (p) { return rec.pts[p]; })); });
      var top = Math.max.apply(null, best), winners = [];
      best.forEach(function (b, i) { if (b === top) winners.push(i); });
      if (winners.length === 1) { rec.holeWinner = winners[0]; res.teamSkins[winners[0]] += pot.hole;
        var scorers = teams[winners[0]].filter(function (p) { return rec.pts[p] === top; });   // the player(s) whose score won it
        scorers.forEach(function (p) { res.playerContrib[p] += pot.hole / scorers.length; });
        res.events.push({ hole: h, type: 'hole', team: winners[0], value: pot.hole, player: scorers.length === 1 ? scorers[0] : null }); pot.hole = 0; }
      rec.holeBest = best;

      // snake value on this hole
      pot.snake = Math.min(pot.snake + 1, rules.snakeCap); rec.snakeValue = pot.snake;

      // birdies / eagles (gross, regardless of handicap) and ferrets — to the team
      all.forEach(function (p) {
        var g = gross[p]; if (typeof g !== 'number') return;
        if (g <= H.par - 2) { res.teamSkins[teamOf[p]] += rec.snakeValue; res.playerContrib[p] += rec.snakeValue;
          res.events.push({ hole: h, type: g === 1 ? 'ace' : 'eagle', player: p, team: teamOf[p], value: rec.snakeValue }); }
        else if (g === H.par - 1) { res.teamSkins[teamOf[p]] += rules.birdie; res.playerContrib[p] += rules.birdie;
          res.events.push({ hole: h, type: 'birdie', player: p, team: teamOf[p], value: rules.birdie }); }
      });
      if (e.ferret && teamOf[e.ferret] !== undefined) { res.teamSkins[teamOf[e.ferret]] += rules.ferret; res.playerContrib[e.ferret] += rules.ferret;
        res.events.push({ hole: h, type: 'ferret', player: e.ferret, team: teamOf[e.ferret], value: rules.ferret }); rec.ferret = e.ferret; }

      // snake: furthest first putt over 6ft holed, and the hole must be completed (no pick-up)
      if (e.snake && teamOf[e.snake] !== undefined) {
        if (gross[e.snake] === 'P') { rec.snakeInvalid = true; rec.notes.push('snake claimed on a pick-up — not valid'); }
        else { rec.snakeWinner = e.snake; res.teamSkins[teamOf[e.snake]] += rec.snakeValue; res.playerContrib[e.snake] += rec.snakeValue;
          res.events.push({ hole: h, type: 'snake', player: e.snake, team: teamOf[e.snake], value: rec.snakeValue }); pot.snake = 0; }
      }

      // longest drive / closest to pin: roll to the next hole of the same kind if not won
      if (rec.isLD) { pot.ld += rules.ld; rec.ldValue = pot.ld;
        if (e.ld && teamOf[e.ld] !== undefined) { rec.ld = e.ld; res.teamSkins[teamOf[e.ld]] += pot.ld; res.playerContrib[e.ld] += pot.ld;
          res.events.push({ hole: h, type: 'ld', player: e.ld, team: teamOf[e.ld], value: pot.ld }); pot.ld = 0; } }
      if (rec.isCP) { pot.cp += rules.cp; rec.cpValue = pot.cp;
        if (e.cp && teamOf[e.cp] !== undefined) { rec.cp = e.cp; res.teamSkins[teamOf[e.cp]] += pot.cp; res.playerContrib[e.cp] += pot.cp;
          res.events.push({ hole: h, type: 'cp', player: e.cp, team: teamOf[e.cp], value: pot.cp }); pot.cp = 0; } }

      rec.teamSkins = res.teamSkins.slice();
      res.holes.push(rec);
    });

    res.complete = res.lastPlayed === course.holes.length;
    if (res.complete) res.unwon = { hole: pot.hole, snake: pot.snake, ld: pot.ld, cp: pot.cp };
    // team skins halved between the pair (divided by team size)
    teams.forEach(function (t, i) { t.forEach(function (p) { res.playerShare[p] = res.teamSkins[i] / t.length; }); });
    return res;
  }

  // ---------- daily Stableford ladder ----------
  // N players -> N-1 ... 0 skins; tied players split the values of the places they occupy.
  function ladder(ptsByPlayer) {
    var ids = Object.keys(ptsByPlayer), n = ids.length, out = {};
    var sorted = ids.slice().sort(function (a, b) { return ptsByPlayer[b] - ptsByPlayer[a]; });
    var i = 0;
    while (i < n) {
      var j = i; while (j + 1 < n && ptsByPlayer[sorted[j + 1]] === ptsByPlayer[sorted[i]]) j++;
      var sum = 0; for (var k = i; k <= j; k++) sum += (n - 1 - k);
      var share = sum / (j - i + 1);
      for (var m = i; m <= j; m++) out[sorted[m]] = { skins: share, place: i + 1, tied: j > i, pts: ptsByPlayer[sorted[m]] };
      i = j + 1;
    }
    return out;
  }

  // ---------- whole tournament ----------
  function computeTournament(T) {
    var rules = Object.assign({}, DEFAULT_RULES, T.rules || {});
    var out = { rounds: [], totals: {}, rules: rules };
    T.players.forEach(function (p) { out.totals[p.id] = { team: 0, ladder: 0, total: 0, byRound: [] }; });
    var carryNext = null;                                        // per-category pool from the previous round

    T.rounds.forEach(function (R, ri) {
      var course = T.courses[R.course]; if (!course) { out.rounds.push({ error: 'no course ' + R.course }); return; }
      // A locked round shipped to a scorer's phone without its hole data carries a frozen summary instead.
      var noHoles = R.groups.every(function (G) { return !G.holes || !Object.keys(G.holes).length; });
      if (R.locked && R.frozen && noHoles) {
        var F = R.frozen, z = { hole: 0, snake: 0, ld: 0, cp: 0 };
        var fGroups = R.groups.map(function (G, gi) { var fg = (F.groups && F.groups[gi]) || {};
          return { id: G.id, teams: G.teams, teamSkins: fg.teamSkins || G.teams.map(function () { return 0; }), playerShare: fg.playerShare || {}, playerPts: fg.playerPts || {}, playerContrib: fg.playerContrib || {},
                   events: [], holes: [], complete: true, lastPlayed: course.holes.length, gaps: [], unwon: fg.unwon || z, carried: fg.carried || z, carriedShare: fg.carried || z,
                   pots: { hole: 0, snake: 0, ld: 0, cp: 0 }, frozen: true }; });
        var fpp = F.perPlayer || {};
        T.players.forEach(function (p) { var x = fpp[p.id]; if (!x || !x.played) { out.totals[p.id].byRound.push(null); return; }
          out.totals[p.id].team += x.team; out.totals[p.id].ladder += x.ladder; out.totals[p.id].total += x.total; out.totals[p.id].byRound.push(x.total); });
        out.rounds.push({ n: R.n, date: R.date, course: R.course, tee: R.tee, slope: F.slope, rating: F.rating, ldHoles: F.ldHoles || [], cpHoles: F.cpHoles || [],
                          groups: fGroups, ladder: F.ladder || null, perPlayer: fpp, complete: true, locked: true, unwon: F.unwon || z, hc: {}, carriedIn: carryNext, frozen: true });
        carryNext = F.unwon || z;
        return;
      }
      var tee = (course.tees.filter(function (t) { return t.name === R.tee; })[0]) || {};
      var slope = R.slopeOverride || tee.slope, rating = (R.ratingOverride !== undefined && R.ratingOverride !== null) ? R.ratingOverride : tee.rating;
      var sp = specialHoles(course, R.tee, rules);
      var ldHoles = (R.ldHoles && R.ldHoles.length) ? R.ldHoles : sp.ld, cpHoles = (R.cpHoles && R.cpHoles.length) ? R.cpHoles : sp.cp;
      var hc = {}, hcInfo = {};
      T.players.forEach(function (p) {
        var idx = R.index ? R.index[p.id] : null;
        var calc = playingHandicap(idx, slope, rating, course.par);
        var ov = R.hcOverride ? R.hcOverride[p.id] : null;
        hc[p.id] = (ov !== null && ov !== undefined) ? ov : calc;
        hcInfo[p.id] = { index: idx, calc: calc, override: ov, playing: hc[p.id] };
      });
      var nGroups = R.groups.length, groupsOut = [], unwonTotal = { hole: 0, snake: 0, ld: 0, cp: 0 }, allComplete = R.groups.length > 0, ptsAll = {};
      R.groups.forEach(function (G) {
        var carried = {};
        ['hole', 'snake', 'ld', 'cp'].forEach(function (k) {
          var share = carryNext ? carryNext[k] / nGroups : 0;
          carried[k] = (G.carriedOverride && G.carriedOverride[k] !== undefined && G.carriedOverride[k] !== null) ? G.carriedOverride[k] : share;
        });
        var g = computeGroup({ teams: G.teams, holes: G.holes || {}, carried: carried },
                             { course: course, tee: R.tee, rules: rules, hc: hc, ldHoles: ldHoles, cpHoles: cpHoles });
        g.id = G.id; g.teams = G.teams; g.carried = carried; g.carriedShare = {};
        ['hole', 'snake', 'ld', 'cp'].forEach(function (k) { g.carriedShare[k] = carryNext ? carryNext[k] / nGroups : 0; });
        if (!g.complete) allComplete = false;
        ['hole', 'snake', 'ld', 'cp'].forEach(function (k) { unwonTotal[k] += g.unwon[k]; });
        Object.keys(g.playerPts).forEach(function (p) { ptsAll[p] = g.playerPts[p]; });
        groupsOut.push(g);
      });
      var lad = allComplete ? ladder(ptsAll) : null;
      var perPlayer = {};
      T.players.forEach(function (p) {
        var team = 0, contrib = 0; groupsOut.forEach(function (g) { if (g.playerShare[p.id] !== undefined) team += g.playerShare[p.id]; if (g.playerContrib && g.playerContrib[p.id] !== undefined) contrib += g.playerContrib[p.id]; });
        var l = lad && lad[p.id] ? lad[p.id].skins : 0;
        var played = groupsOut.some(function (g) { return g.playerPts[p.id] !== undefined && g.lastPlayed > 0; });
        perPlayer[p.id] = { team: team, contrib: contrib, ladder: l, total: team + l, pts: ptsAll[p.id], played: played, hc: hcInfo[p.id] };
        if (played) { out.totals[p.id].team += team; out.totals[p.id].ladder += l; out.totals[p.id].total += team + l; }
        out.totals[p.id].byRound.push(played ? team + l : null);
      });
      out.rounds.push({ n: R.n, date: R.date, course: R.course, tee: R.tee, slope: slope, rating: rating, ldHoles: ldHoles, cpHoles: cpHoles,
                        groups: groupsOut, ladder: lad, perPlayer: perPlayer, complete: allComplete, locked: !!R.locked,
                        unwon: unwonTotal, hc: hcInfo, carriedIn: carryNext });
      carryNext = allComplete ? unwonTotal : null;            // an unfinished round carries nothing yet
    });
    out.standings = T.players.map(function (p) { return Object.assign({ id: p.id, name: p.name }, out.totals[p.id]); })
      .sort(function (a, b) { return b.total - a.total || b.ladder - a.ladder || a.name.localeCompare(b.name); });
    out.carryNext = carryNext;
    return out;
  }

  var API = { DEFAULT_RULES: DEFAULT_RULES, playingHandicap: playingHandicap, strokesOnHole: strokesOnHole, stableford: stableford,
              isEntered: isEntered, specialHoles: specialHoles, computeGroup: computeGroup, ladder: ladder, computeTournament: computeTournament };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.SKINS = API;
})(typeof window !== 'undefined' ? window : globalThis);
