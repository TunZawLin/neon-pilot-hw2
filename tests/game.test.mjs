import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, GestureFilter, GestureHold, collides, difficulty } from '../static/game-core.js';
import { handPose } from './hand-fixtures.mjs';

function hand(scale = 1, pinch = .01) {
  const points = handPose();
  points[4] = {x:.45,y:.4}; points[8] = {x:.45+pinch,y:.4};
  return points.map(p => ({x:.5+(p.x-.5)*scale,y:.5+(p.y-.5)*scale}));
}
test('pinch normalization is invariant to hand size; smoothing and hysteresis reject noise', () => {
  const a = new GestureFilter(), b = new GestureFilter();
  assert.equal(a.update(hand()).pinched,false);
  assert.equal(a.update(hand()).pinched,true);
  b.update(hand(.5)); const small = b.update(hand(.5));
  assert.ok(Math.abs(small.ratio-a.ratio)<1e-10);
  for(let i=0;i<8;i++) a.update(hand(1,.075));
  assert.equal(a.pinched,true); // Ratio near .4 stays within hysteresis band.
  for(let i=0;i<8;i++) a.update(hand(1,.2));
  assert.equal(a.pinched,false);
  a.update(null); assert.equal(a.ratio,null); assert.equal(a.pinched,false);
});
test('mirrored steering follows the displayed hand and rejects tiny/invalid hands', () => {
  const f = new GestureFilter();
  const left = f.update(hand().map(p=>({...p,x:p.x+.2})));
  assert.ok(left.x < .5);
  assert.equal(f.update(hand(.01)),null);
  assert.equal(f.update([{x:NaN,y:0}]),null);
});

test('fist and open-palm rules distinguish shooting at different scales and rotations', () => {
  for (const scale of [.5, 1]) for (const rotation of [0, Math.PI / 2, Math.PI]) for (const mirror of [false, true]) {
    const f = new GestureFilter();
    const fist = f.update(handPose('fist', scale, rotation, mirror));
    assert.equal(fist.fist, true); assert.equal(fist.pinched, false); assert.equal(fist.openPalm, false);
    const open = f.update(handPose('open', scale, rotation, mirror));
    assert.equal(open.fist, false); assert.equal(open.openPalm, true);
    const pinch = f.update(handPose('pinch', scale, rotation, mirror));
    assert.equal(pinch.fist, false); assert.equal(pinch.openPalm, false);
  }
});

test('gesture hold requires a continuous second and fires once until released', () => {
  const hold = new GestureHold();
  for (let now = 0; now < 1000; now += 100) assert.equal(hold.update('pause', now).triggered, false);
  assert.deepEqual(hold.update('pause', 1000), { progress: 1, triggered: true });
  assert.equal(hold.update('pause', 1100).triggered, false);
  hold.update(null, 1200);
  assert.equal(hold.update('pause', 1300).progress, 0);
});

test('interrupted, stale, changed, and backwards-time gestures restart the hold', () => {
  const hold = new GestureHold();
  for (let now = 0; now <= 800; now += 100) hold.update('pause', now);
  assert.equal(hold.update('pause', 1300).progress, 0);
  assert.equal(hold.update('resume', 1400).progress, 0);
  assert.equal(hold.update('resume', 1300).progress, 0);
  hold.update('resume', NaN);
  assert.equal(hold.update('resume', 1500).progress, 0);
});
test('movement stays in bounds and firing obeys cooldown', () => {
  const g = new Game(()=>.5); g.start();
  for(let i=0;i<120;i++) g.update(1/60,{dx:1,dy:-1,fire:true});
  assert.equal(g.player.x,935); assert.equal(g.player.y,118);
  assert.ok(g.shots >= 10 && g.shots <= 12);
  g.state='paused'; const snapshot=JSON.stringify(g); g.update(.05,{fire:true}); assert.equal(JSON.stringify(g),snapshot);
});
test('swept lasers score kills; collisions consume three lives and restart clears state', () => {
  const g = new Game(()=>.5); g.start(); g.spawnIn=999;
  g.lasers=[{x:100,y:200,r:5,previousY:200}];
  g.enemies=[{x:100,baseX:100,y:180,r:18,speed:0,hp:1}];
  g.update(.05); assert.equal(g.score,100); assert.equal(g.kills,1); assert.equal(g.enemies.length,0);
  for(let i=0;i<3;i++) { g.invincible=0; g.enemies=[{...g.player,baseX:g.player.x,speed:0,hp:1}]; g.update(.01); }
  assert.equal(g.lives,0); assert.equal(g.state,'over');
  g.start(); assert.equal(g.lives,3); assert.equal(g.score,0); assert.equal(g.lasers.length,0);
});
test('invulnerability prevents stacked impact losses and difficulty grows with a cap', () => {
  const g=new Game(); g.start(); g.invincible=0; g.damage(); g.damage(); assert.equal(g.lives,2);
  assert.equal(difficulty(0),1); assert.ok(difficulty(60)>difficulty(10)); assert.equal(difficulty(9999),10);
  assert.equal(collides({x:0,y:0,r:2},{x:3,y:0,r:2}),true);
});
