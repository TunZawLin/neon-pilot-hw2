// Synthetic landmarks for rule/controller tests, not evidence of webcam accuracy.
export function handPose(pose = 'open', scale = 1, rotation = 0, mirror = false) {
  const points = [
    [.5,.7], [.43,.62], [.34,.56], [.27,.52], [.23,.49],
    [.4,.48], [.38,.35], [.375,.26], [.37,.18],
    [.5,.45], [.49,.3], [.49,.2], [.49,.12],
    [.55,.48], [.57,.34], [.575,.25], [.58,.17],
    [.6,.5], [.64,.39], [.665,.32], [.69,.27],
  ].map(([x,y]) => ({x,y}));
  if (pose === 'pinch') { points[4] = {x:.37,y:.35}; points[8] = {x:.39,y:.35}; }
  if (pose === 'fist') {
    for (const [i,x,y] of [
      [4,.44,.52], [6,.39,.42], [7,.4,.5], [8,.43,.55],
      [10,.5,.39], [11,.51,.49], [12,.51,.56],
      [14,.57,.42], [15,.56,.51], [16,.55,.57],
      [18,.62,.45], [19,.61,.53], [20,.59,.57],
    ]) points[i] = {x,y};
  }
  return points.map(p => {
    const x = (p.x - .5) * scale * (mirror ? -1 : 1), y = (p.y - .5) * scale;
    return {x:.5 + x * Math.cos(rotation) - y * Math.sin(rotation) / (4 / 3),
      y:.5 + x * Math.sin(rotation) * (4 / 3) + y * Math.cos(rotation)};
  });
}
