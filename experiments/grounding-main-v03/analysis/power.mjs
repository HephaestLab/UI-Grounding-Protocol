import { join } from 'node:path';

import {
  assert,
  experimentRoot,
  parseArgs,
  readJson,
  runsRoot,
  writeJson,
} from '../scripts/lib.mjs';

const args = parseArgs(process.argv.slice(2));
const calibrationPath = join(
  runsRoot,
  'calibration',
  String(args.calibration ?? 'report-v1.json'),
);
const simulations = Number(args.simulations ?? 10_000);
assert(
  Number.isInteger(simulations) && simulations >= 10_000,
  '--simulations must be an integer of at least 10000',
);
const [calibration, design] = await Promise.all([
  readJson(calibrationPath),
  readJson(join(experimentRoot, 'design.json')),
]);
assert(calibration.complete, 'Calibration report is incomplete');
let confirmatorySelection = null;
try {
  confirmatorySelection = await readJson(
    join(runsRoot, 'confirmatory', 'selection-v1.json'),
  );
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let output = value;
    output = Math.imul(output ^ (output >>> 15), output | 1);
    output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
    return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
  };
}

function exactOneSidedP(wins, losses) {
  const discordant = wins + losses;
  if (discordant === 0 || wins <= losses) return 1;
  let probability = 2 ** -discordant;
  let tail = wins === 0 ? probability : 0;
  for (let successes = 1; successes <= discordant; successes += 1) {
    probability *= (discordant - successes + 1) / successes;
    if (successes >= wins) tail += probability;
  }
  return Math.min(1, tail);
}

function pairedSignificant(wins, losses, alpha) {
  return exactOneSidedP(wins, losses) <= alpha;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function parameterize(stats, effect) {
  const rawControl = (stats.controlSuccesses + 0.5) / (stats.n + 1);
  const controlRate = clamp(rawControl, 0.01, 0.99 - effect);
  const maximumDiscordance = Math.max(
    effect,
    Math.min(2 * controlRate + effect, 2 * (1 - controlRate) - effect),
  );
  const discordanceRate = clamp(
    Math.max(stats.smoothedDiscordanceRate, effect),
    effect,
    maximumDiscordance,
  );
  return {
    benchmarkId: stats.benchmarkId,
    model: stats.model,
    calibrationN: stats.n,
    controlRate,
    discordanceRate,
    effect,
    joint: {
      controlOnly: (discordanceRate - effect) / 2,
      ugpOnly: (discordanceRate + effect) / 2,
      both: controlRate - (discordanceRate - effect) / 2,
    },
  };
}

function checkpoints(capacity) {
  return [
    10,
    20,
    30,
    40,
    50,
    60,
    75,
    90,
    100,
    120,
    150,
    200,
    300,
    400,
    500,
    650,
    800,
    capacity,
  ]
    .filter((value) => value <= capacity)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left - right);
}

function positivePowerCurve(parameter, capacity, random, alpha) {
  const points = checkpoints(capacity);
  const successes = new Map(points.map((point) => [point, 0]));
  for (let simulation = 0; simulation < simulations; simulation += 1) {
    let wins = 0;
    let losses = 0;
    let pointIndex = 0;
    for (let task = 1; task <= capacity; task += 1) {
      const draw = random();
      if (draw < parameter.joint.ugpOnly) wins += 1;
      else if (draw < parameter.joint.ugpOnly + parameter.joint.controlOnly) {
        losses += 1;
      }
      if (task === points[pointIndex]) {
        if (pairedSignificant(wins, losses, alpha)) {
          successes.set(task, successes.get(task) + 1);
        }
        pointIndex += 1;
        if (pointIndex === points.length) break;
      }
    }
  }
  return points.map((n) => ({
    n,
    power: successes.get(n) / simulations,
  }));
}

function equivalencePowerCurve(parameter, capacity, margin, random, zCritical) {
  const points = checkpoints(capacity);
  const successes = new Map(points.map((point) => [point, 0]));
  for (let simulation = 0; simulation < simulations; simulation += 1) {
    let wins = 0;
    let losses = 0;
    let pointIndex = 0;
    for (let task = 1; task <= capacity; task += 1) {
      const draw = random();
      if (draw < parameter.joint.ugpOnly) wins += 1;
      else if (draw < parameter.joint.ugpOnly + parameter.joint.controlOnly) {
        losses += 1;
      }
      if (task === points[pointIndex]) {
        const difference = (wins - losses) / task;
        const discordance = (wins + losses) / task;
        const standardError = Math.sqrt(
          Math.max(0, discordance - difference ** 2) / task,
        );
        if (
          difference - zCritical * standardError > -margin &&
          difference + zCritical * standardError < margin
        ) {
          successes.set(task, successes.get(task) + 1);
        }
        pointIndex += 1;
        if (pointIndex === points.length) break;
      }
    }
  }
  return points.map((n) => ({
    n,
    power: successes.get(n) / simulations,
  }));
}

const benchmarkById = new Map(
  design.benchmarks.map((benchmark) => [benchmark.id, benchmark]),
);
const confirmatoryNByBenchmark = new Map(
  (confirmatorySelection?.selections ?? []).map((selection) => [
    selection.benchmarkId,
    selection.taskIds.length,
  ]),
);
function plannedN(benchmarkId) {
  return (
    confirmatoryNByBenchmark.get(benchmarkId) ??
    benchmarkById.get(benchmarkId).plannedN
  );
}
const availableBenchmarkIds = new Set(
  calibration.paired.map((stats) => stats.benchmarkId),
);
const deferredBenchmarkIds = new Set(
  confirmatorySelection?.pendingBenchmarks ?? [],
);
const missingBenchmarks = design.benchmarks
  .map((benchmark) => benchmark.id)
  .filter((benchmarkId) => !availableBenchmarkIds.has(benchmarkId));
const missingActiveBenchmarks = missingBenchmarks.filter(
  (benchmarkId) => !deferredBenchmarkIds.has(benchmarkId),
);
const familyComparisons = design.groundingMethods.length - 1;
const familyAlpha = 0.05 / familyComparisons;
const equivalenceZCritical = 2.45;
const random = mulberry32(design.sampling.randomizationSeed + 1);
const parameters = calibration.paired.map((stats) => {
  const negativeControl = stats.benchmarkId === 'screenqa-visible';
  const effect = negativeControl
    ? 0
    : stats.benchmarkId === 'screenpr-referent'
      ? 0.07
      : 0.05;
  return {
    ...parameterize(stats, effect),
    negativeControl,
  };
});

const cells = parameters.map((parameter) => {
  const benchmark = benchmarkById.get(parameter.benchmarkId);
  const capacity = plannedN(parameter.benchmarkId);
  const curve = parameter.negativeControl
    ? equivalencePowerCurve(
        parameter,
        capacity,
        0.07,
        random,
        equivalenceZCritical,
      )
    : positivePowerCurve(parameter, capacity, random, familyAlpha);
  const threshold = 0.8;
  const required = curve.find((point) => point.power >= threshold)?.n ?? null;
  return {
    benchmarkId: parameter.benchmarkId,
    model: parameter.model,
    test: parameter.negativeControl
      ? 'paired equivalence, absolute margin 0.07'
      : 'one-sided exact paired test with conservative Holm first-step alpha',
    controlRate: parameter.controlRate,
    discordanceRate: parameter.discordanceRate,
    smallestEffectOfInterest: parameter.effect,
    designPlannedN: benchmark.plannedN,
    confirmatoryN: capacity,
    powerAtPlannedN: curve.at(-1).power,
    requiredNFor80Pct: required,
    passes: curve.at(-1).power >= threshold,
    curve,
  };
});

function pooledPower(poolParameters, randomSource) {
  let significant = 0;
  for (let simulation = 0; simulation < simulations; simulation += 1) {
    let wins = 0;
    let losses = 0;
    for (const parameter of poolParameters) {
      const capacity = plannedN(parameter.benchmarkId);
      for (let task = 0; task < capacity; task += 1) {
        const draw = randomSource();
        if (draw < parameter.joint.ugpOnly) wins += 1;
        else if (draw < parameter.joint.ugpOnly + parameter.joint.controlOnly) {
          losses += 1;
        }
      }
    }
    if (pairedSignificant(wins, losses, familyAlpha)) significant += 1;
  }
  return significant / simulations;
}

const referentParameters = parameters.filter(
  (parameter) => parameter.benchmarkId === 'screenpr-referent',
);
const actionParameters = parameters.filter((parameter) =>
  ['workarena-plus-plus', 'webmall-action', 'st-webagentbench-cup'].includes(
    parameter.benchmarkId,
  ),
);
const pooled = {
  referent: {
    benchmarks: [
      ...new Set(referentParameters.map((item) => item.benchmarkId)),
    ],
    power: referentParameters.length
      ? pooledPower(referentParameters, random)
      : null,
  },
  action: {
    benchmarks: [...new Set(actionParameters.map((item) => item.benchmarkId))],
    missingBenchmarks: [
      'workarena-plus-plus',
      'webmall-action',
      'st-webagentbench-cup',
    ].filter(
      (benchmarkId) =>
        missingActiveBenchmarks.includes(benchmarkId) &&
        !deferredBenchmarkIds.has(benchmarkId),
    ),
    deferredBenchmarks: ['workarena-plus-plus'].filter((benchmarkId) =>
      deferredBenchmarkIds.has(benchmarkId),
    ),
    power: actionParameters.length
      ? pooledPower(actionParameters, random)
      : null,
  },
};
pooled.referent.passes = pooled.referent.power >= 0.9;
pooled.action.passes =
  pooled.action.missingBenchmarks.length === 0 && pooled.action.power >= 0.9;

const report = {
  schemaVersion: '0.3.0',
  phase: deferredBenchmarkIds.has('workarena-plus-plus')
    ? 'four-benchmark-preauthorization'
    : 'five-benchmark',
  simulations,
  seed: design.sampling.randomizationSeed + 1,
  calibrationPath,
  familyComparisons,
  familyAlpha,
  positivePowerThreshold: 0.8,
  pooledPowerThreshold: 0.9,
  missingBenchmarks,
  missingActiveBenchmarks,
  deferredBenchmarks: [...deferredBenchmarkIds].sort(),
  parameters,
  cells,
  pooled,
  allAvailableCellsPass: cells.every((cell) => cell.passes),
};
await writeJson(join(runsRoot, 'power', 'power-v1.json'), report);
console.log(
  JSON.stringify({
    phase: report.phase,
    cells: cells.length,
    passingCells: cells.filter((cell) => cell.passes).length,
    missingBenchmarks,
    pooled,
  }),
);
