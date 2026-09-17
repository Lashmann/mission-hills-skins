// Engine tests — run: node test/engine.test.js
const E = require('../engine.js');
const fs = require('fs');
const COURSES = (function(){ const src = fs.readFileSync(__dirname+'/../courses.js','utf8'); const w={}; new Function('window', src)(w); return w.COURSES; })();
let pass=0, fail=0;
function eq(actual, expected, label){ const ok = JSON.stringify(actual)===JSON.stringify(expected); if(ok) pass++; else { fail++; console.log('FAIL', label, '\n   got     ', JSON.stringify(actual), '\n   expected', JSON.stringify(expected)); } }

// ---- handicaps ----
eq(E.playingHandicap(15.0, 143, 74.0, 72), 21, 'WHS: 15.0 @ slope 143 rating 74.0 -> 21');   // 15*1.265=18.98 + 2 = 20.98 -> 21
eq(E.playingHandicap(15.0, 131, 74.9, 72), 20, 'WHS: 15.0 @ Ozaki black -> 20');            // 17.39+2.9=20.29 -> 20
eq(E.playingHandicap(15.0, null, null, 72), 15, 'no slope -> index rounded');
eq(E.playingHandicap(14.5, null, null, 72), 15, '14.5 rounds up');
eq([1,9,10,18].map(si=>E.strokesOnHole(9, si)), [1,1,0,0], '9 marker: strokes on SI 1-9 only');
eq([1,6,7,18].map(si=>E.strokesOnHole(24, si)), [2,2,1,1], '24 marker: 2 on SI 1-6, 1 elsewhere');
eq([1,17,18].map(si=>E.strokesOnHole(-2, si)), [0,-1,-1], '+2 marker gives back on SI 18,17');
eq(E.stableford(4,4,0), 2, 'par = 2 pts'); eq(E.stableford(3,4,0), 3, 'birdie = 3'); eq(E.stableford(7,4,1), 0, 'net double+ = 0'); eq(E.stableford('P',4,1), 0, 'pickup = 0'); eq(E.stableford(null,4,0), null, 'unentered = null');

// ---- LD / CP holes ----
const sh = (c,t)=>E.specialHoles(COURSES[c], t);
eq(sh('Annika','Blue'), {ld:[1,3,6,10,13,14], cp:[5,7,8,12,15,17]}, 'Annika 6 LD / 6 CP, no fill-in');
eq(sh('Norman','Blue'), {ld:[7,8,14,18], cp:[4,6,11,16]}, 'Norman exactly 4/4');
const twoP5 = { par:72, holes: COURSES.Ozaki.holes.map(h => (h.hole===14||h.hole===18) ? Object.assign({},h,{par:4}) : h) };
eq(sh.call(null,'Ozaki','Blue').ld.length, 4, 'sanity');
eq(E.specialHoles(twoP5,'Blue').ld.length, 4, 'fill-in: 2 par 5s -> two longest par 4s added');
eq(E.specialHoles(twoP5,'Blue').ld.filter(h=>[3,9].indexOf(h)>=0).length, 2, 'fill-in keeps the real par 5s');

// ---- group scenarios (Annika, everyone off scratch) ----
const P=['a','b','c','d'], TEAMS=[['a','b'],['c','d']];
const course=COURSES.Annika, par=h=>course.holes[h-1].par;
function hole(h, spec){ // spec: 'tie' | 0 | 1 (winning team) ; extra flags
  const g={}; P.forEach(p=>g[p]=par(h)+1); // everyone bogey
  if(spec==='tie'){ P.forEach(p=>g[p]=par(h)); } else { g[TEAMS[spec][0]]=par(h); }
  return {gross:g};
}
function build(fn){ const holes={}; for(let h=1;h<=18;h++){ holes[h]=fn(h); } return holes; }
const ctx0 = { course, tee:'Blue', rules:E.DEFAULT_RULES, hc:{a:0,b:0,c:0,d:0}, ldHoles:[1,3,6,10,13,14], cpHoles:[5,7,8,12,15,17] };

// hole carry: 1 tied -> hole 2 worth 2 -> won by team 0
let g = E.computeGroup({teams:TEAMS, holes:build(h=> h===1?hole(1,'tie'): h===2?hole(2,0): hole(h,'tie')), carried:{}}, ctx0);
eq([g.holes[0].holeValue, g.holes[0].holeWinner, g.holes[1].holeValue, g.holes[1].holeWinner], [1,null,2,0], 'tie carries: hole 2 worth 2');
eq(g.unwon.hole, 16, '16 tied holes after -> 16 unwon hole skins');
eq(g.unwon.snake, 9, 'no snake all day -> 9 (capped)');
eq(g.holes[12].snakeValue, 9, 'hole 13 snake = 9');  eq(g.holes[8].snakeValue, 9, 'hole 9 snake = 9'); eq(g.holes[7].snakeValue, 8, 'hole 8 snake = 8');

// snake won on hole 13 by c (team 1): worth 9, hole 14 back to 1
g = E.computeGroup({teams:TEAMS, holes:build(h=> h===13?Object.assign(hole(13,'tie'),{snake:'c'}):hole(h,'tie')), carried:{}}, ctx0);
eq([g.holes[12].snakeWinner, g.holes[12].snakeValue, g.holes[13].snakeValue, g.teamSkins], ['c',9,1,[0,9]], 'snake 9 to team 1, resets');
eq(g.unwon.snake, 5, 'holes 14-18 unwon snake = 5');

// eagle = snake value, pot does not reset; birdie = 1; ferret = 2 (all gross, all to team)
g = E.computeGroup({teams:TEAMS, holes:build(h=>{ const s=hole(h,'tie'); if(h===3){ s.gross.a=par(3)-2; } if(h===4){ s.gross.d=par(4)-1; } if(h===5){ s.ferret='b'; } return s; }), carried:{}}, ctx0);
eq(g.events.filter(e=>e.type==='eagle').map(e=>[e.hole,e.player,e.value]), [[3,'a',3]], 'eagle on hole 3 worth snake value 3');
eq(g.holes[3].snakeValue, 4, 'snake keeps growing after eagle');
eq(g.events.filter(e=>e.type==='birdie').map(e=>[e.hole,e.player,e.value]), [[4,'d',1]], 'birdie = 1');
eq(g.events.filter(e=>e.type==='ferret').map(e=>[e.hole,e.player,e.value]), [[5,'b',2]], 'ferret = 2');
// hole 3: a eagled (4 pts) -> team 0 wins hole 3 (value 3 after 2 ties) ; hole 4: d birdied -> team 1 wins hole 4 (1)
eq(g.teamSkins, [3+3+2, 1+1], 'team totals: t0 = hole3(3)+eagle(3)+ferret by b(2); t1 = hole4(1)+birdie(1)');
eq(g.playerShare, {a:4,b:4,c:1,d:1}, 'halved between the pair');

// LD / CP roll to the next hole of the same kind
g = E.computeGroup({teams:TEAMS, holes:build(h=>{ const s=hole(h,'tie'); if(h===3) s.ld='a'; if(h===7) s.cp='c'; return s; }), carried:{}}, ctx0);
eq(g.events.filter(e=>e.type==='ld').map(e=>[e.hole,e.value]), [[3,2]], 'LD unwon on 1 rolls: won on 3 worth 2');
eq(g.events.filter(e=>e.type==='cp').map(e=>[e.hole,e.value]), [[7,2]], 'CP unwon on 5 rolls: won on 7 worth 2');
eq([g.unwon.ld, g.unwon.cp], [4,4], 'remaining 4 LD + 4 CP holes unwon');

// pick-up cannot win the snake
g = E.computeGroup({teams:TEAMS, holes:build(h=>{ const s=hole(h,'tie'); if(h===2){ s.gross.a='P'; s.snake='a'; } return s; }), carried:{}}, ctx0);
eq([g.holes[1].snakeInvalid, g.holes[1].snakeWinner, g.holes[2].snakeValue], [true, null, 3], 'snake on a pick-up is invalid; pot keeps growing');

// live: stops at the first hole without all four scores
g = E.computeGroup({teams:TEAMS, holes:{1:hole(1,0),2:hole(2,1),3:{gross:{a:4,b:5}}}, carried:{}}, ctx0);
eq([g.lastPlayed, g.complete, g.teamSkins], [2,false,[1,1]], 'partial round: 2 holes counted');

// ---- ladder ----
eq(E.ladder({a:30,b:28,c:28,d:25,e:20,f:20,g:20,h:10}), {a:{skins:7,place:1,tied:false,pts:30}, b:{skins:5.5,place:2,tied:true,pts:28}, c:{skins:5.5,place:2,tied:true,pts:28}, d:{skins:4,place:4,tied:false,pts:25}, e:{skins:2,place:5,tied:true,pts:20}, f:{skins:2,place:5,tied:true,pts:20}, g:{skins:2,place:5,tied:true,pts:20}, h:{skins:0,place:8,tied:false,pts:10}}, 'ladder 7..0 with split ties');

// ---- the commissioner's worked example, end to end ----
// Day 1 (Annika): Group A ends with snake 3, LD 1, CP 2, hole 2 ; Group B: snake 9, LD 0, CP 0, hole 0.
const PL=['a','b','c','d','e','f','g','h'].map(id=>({id, name:id.toUpperCase()}));
const TA=[['a','b'],['c','d']], TB=[['e','f'],['g','h']];
function mk(teams, fn){ const all=[].concat(...teams); const holes={}; for(let h=1;h<=18;h++){ const spec=fn(h); const g={}; all.forEach(p=>g[p]=par(h)+1); if(spec.win==='tie') all.forEach(p=>g[p]=par(h)); else g[teams[spec.win][0]]=par(h); const e={gross:g}; if(spec.snake) e.snake=spec.snake; if(spec.ld) e.ld=spec.ld; if(spec.cp) e.cp=spec.cp; holes[h]=e; } return holes; }
const dayA = mk(TA, h=>({ win: (h===17||h===18)?'tie':0, snake: h===15?'a':null, ld: (h<=13)?'a':null, cp: (h<=12)?'c':null }));   // LD holes 1,3,6,10,13 won, 14 not; CP 5,7,8,12 won, 15,17 not; snake won on 15 -> 16,17,18 = 3
const dayB = mk(TB, h=>({ win:0, ld:'e', cp:'g' }));                                                                                   // everything won, no snake -> 9
const T = { players:PL, courses:COURSES, rounds:[
  { n:1, date:'2026-11-29', course:'Annika', tee:'Blue', index:{}, groups:[{id:'A', teams:TA, holes:dayA},{id:'B', teams:TB, holes:dayB}] },
  { n:2, date:'2026-11-30', course:'Ozaki',  tee:'Blue', index:{}, groups:[{id:'A', teams:TA, holes:mk(TA,h=>({win:'tie'}))},{id:'B', teams:TB, holes:{}}] } ] };
const R = E.computeTournament(T);
eq(R.rounds[0].groups.map(g=>g.unwon), [{hole:2,snake:3,ld:1,cp:2},{hole:0,snake:9,ld:0,cp:0}], 'day 1 unwon per group matches the example');
eq(R.rounds[0].unwon, {hole:2,snake:12,ld:1,cp:2}, 'day 1 pools');
eq(R.rounds[1].groups[0].carried, {hole:1,snake:6,ld:0.5,cp:1}, 'day 2 group A carried share');
eq(R.rounds[1].groups[1].carried, {hole:1,snake:6,ld:0.5,cp:1}, 'day 2 group B carried share');
const A2 = R.rounds[1].groups[0];
eq([A2.holes[0].holeValue, A2.holes[0].snakeValue], [2,7], 'day 2 hole 1 worth 2, snake worth 7');
eq(A2.holes[2].ldValue, 1.5, 'day 2 first LD hole (3) worth 1.5');
eq(A2.holes[5].cpValue, 2, 'day 2 first CP hole (6) worth 2');
eq(A2.holes[3].snakeValue, 9, 'snake caps at 9 even with a carried share');
eq(R.rounds[1].complete, false, 'day 2 incomplete (group B empty)');
eq(R.carryNext, null, 'nothing carries from an unfinished round');
// day-1 ladder: everyone in A tied on points? a & c scored par on most holes... just check it exists and sums to 28
const l1 = R.rounds[0].ladder; eq(Object.values(l1).reduce((s,x)=>s+x.skins,0), 28, 'ladder skins sum to 7+6+..+0 = 28');
eq(R.standings.length, 8, '8 in standings');


// ---- a round with no draw must not count as complete or carry anything ----
{
  const T2 = { players:PL, courses:COURSES, rounds:[
    { n:1, date:'2026-11-29', course:'Annika', tee:'Blue', index:{}, groups:[{id:'A', teams:TA, holes:dayA},{id:'B', teams:TB, holes:dayB}] },
    { n:2, date:'2026-11-30', course:'Ozaki',  tee:'Blue', index:{}, groups:[{id:'A', teams:[[],[]], holes:{}},{id:'B', teams:[[],[]], holes:{}}] },
    { n:3, date:'2026-12-01', course:'Olazabal', tee:'Blue', index:{}, groups:[{id:'A', teams:[[],[]], holes:{}},{id:'B', teams:[[],[]], holes:{}}] } ] };
  const R2 = E.computeTournament(T2);
  eq([R2.rounds[1].complete, R2.rounds[1].groups[0].lastPlayed, R2.rounds[1].groups[0].unwon], [false, 0, {hole:0,snake:0,ld:0,cp:0}], 'undrawn round: incomplete, nothing unwon');
  eq(R2.rounds[1].carriedIn, {hole:2,snake:12,ld:1,cp:2}, 'undrawn round 2 still receives round 1 pools');
  eq([R2.rounds[2].carriedIn, R2.carryNext], [null, null], 'nothing flows past an unfinished round');
}

// ---- frozen round: a locked round with no hole data but a saved summary must behave exactly like the full one ----
{
  const full = E.computeTournament(T);                     // T from the worked example: R1 complete, R2 partial
  const r1 = full.rounds[0];
  const frozen = { perPlayer:r1.perPlayer, ladder:r1.ladder, unwon:r1.unwon, ldHoles:r1.ldHoles, cpHoles:r1.cpHoles, slope:r1.slope, rating:r1.rating,
                   groups:r1.groups.map(g=>({teamSkins:g.teamSkins, playerShare:g.playerShare, playerPts:g.playerPts, unwon:g.unwon, carried:g.carried})) };
  const T3 = JSON.parse(JSON.stringify(T)); T3.courses = COURSES;
  T3.rounds[0].locked = true; T3.rounds[0].frozen = frozen; T3.rounds[0].groups.forEach(g=>{ g.holes = {}; });
  const F = E.computeTournament(T3);
  eq(F.rounds[0].frozen, true, 'round 1 recognised as frozen');
  eq(F.rounds[0].groups.map(g=>g.teamSkins), r1.groups.map(g=>g.teamSkins), 'frozen team skins identical');
  eq(F.totals, full.totals, 'trophy totals identical with a frozen round 1');
  eq(F.rounds[1].groups[0].carried, full.rounds[1].groups[0].carried, 'round 2 carried pots identical from the frozen summary');
  eq(F.rounds[1].groups[0].holes[0].holeValue, 2, 'round 2 hole 1 still worth 2 on a scorer phone');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
