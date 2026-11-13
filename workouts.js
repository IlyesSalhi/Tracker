// Workout plan used by the Day view. Edit exercises here; the app picks them up on next load.
// Exercise ids must stay the same once you've logged them, or "last time" history won't match.
//   sets:  target number of sets
//   min/max: target rep range (leave out for "near failure")
//   bw:    bodyweight exercise (the kg field means added weight)
(function (root) {
  root.WORKOUT_PLAN = {
    // Week A: Legs, Push A, Pull A, Push B
    // Week B: Pull B, Legs, Push (A or B, alternating), Pull A
    rotation: ['legs', 'pushA', 'pullA', 'pushB', 'pullB', 'legs', 'push', 'pullA'],
    order: ['legs', 'pushA', 'pushB', 'pullA', 'pullB'],
    sessions: {
      legs: { name: 'Legs', short: 'Leg', exercises: [
        { id: 'legs.press', name: 'Leg press', sets: 4, min: 8, max: 10, rest: '2–3 min' },
        { id: 'legs.curl', name: 'Leg curl', sets: 3, min: 8, max: 10, rest: '2 min' },
        { id: 'legs.calf', name: 'Calf raises', sets: 4, min: 15, max: 15, rest: '60 s' },
        { id: 'legs.raise', name: "Captain's chair leg raises", sets: 3, min: 12, max: 12, rest: '60 s', bw: true }
      ] },
      pushA: { name: 'Push A', short: 'Ps A', sub: 'Overhead press first', exercises: [
        { id: 'pushA.ohp', name: 'Overhead press', sets: 4, min: 6, max: 8, rest: '2–3 min' },
        { id: 'pushA.incline', name: 'Incline DB press', sets: 3, min: 8, max: 10, rest: '2 min', note: 'Only go heavier if your shoulder has no pain.' },
        { id: 'pushA.dips', name: 'Dips', sets: 3, rest: '2 min', bw: true, note: 'Near failure.' },
        { id: 'pushA.lateral', name: 'Lateral raises', sets: 4, min: 12, max: 15, rest: '60–90 s' }
      ] },
      pushB: { name: 'Push B', short: 'Ps B', sub: 'Incline first', exercises: [
        { id: 'pushB.incline', name: 'Incline DB press', sets: 4, min: 6, max: 8, rest: '2–3 min', note: 'Only go heavier if your shoulder has no pain.' },
        { id: 'pushB.dips', name: 'Dips', sets: 3, rest: '2 min', bw: true, note: 'Near failure.' },
        { id: 'pushB.lateral', name: 'Lateral raise machine', sets: 5, min: 12, max: 15, rest: '60–90 s' },
        { id: 'pushB.curl', name: 'Curl machine', sets: 3, min: 10, max: 12, rest: '60 s', note: 'Superset with triceps press.' },
        { id: 'pushB.triceps', name: 'Triceps press machine', sets: 3, min: 10, max: 12, rest: '60 s', note: 'Superset with curls. Add reps before weight if your triceps hurt.' }
      ] },
      pullA: { name: 'Pull A', short: 'Pl A', sub: 'Vertical', exercises: [
        { id: 'pullA.pullup', name: 'Weighted pull-ups', sets: 4, min: 6, max: 8, rest: '2–3 min', bw: true },
        { id: 'pullA.rows', name: 'Rows', sets: 4, min: 8, max: 10, rest: '2 min' },
        { id: 'pullA.rear', name: 'Rear delts', sets: 3, min: 15, max: 15, rest: '60 s' },
        { id: 'pullA.curl', name: 'Curls', sets: 3, min: 10, max: 12, rest: '60 s' }
      ] },
      pullB: { name: 'Pull B', short: 'Pl B', sub: 'Horizontal', exercises: [
        { id: 'pullB.rows', name: 'Rows (heavy)', sets: 4, min: 6, max: 8, rest: '2–3 min' },
        { id: 'pullB.pulldown', name: 'Lat pulldown', sets: 3, min: 8, max: 10, rest: '2 min' },
        { id: 'pullB.rear', name: 'Rear delts', sets: 3, min: 15, max: 15, rest: '60 s' },
        { id: 'pullB.hammer', name: 'Hammer curls', sets: 3, min: 10, max: 12, rest: '60 s' }
      ] }
    }
  };
})(this);
