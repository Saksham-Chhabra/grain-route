const MIN_PROBABILITY = 0.01;
const DEFAULT_PROBABILITIES = { farm: 0.65, request: 0.35 };

function normalizeProbabilities(input) {
  const source = { ...DEFAULT_PROBABILITIES, ...(input || {}) };

  let farm = Math.max(0, Number(source.farm) || 0);
  const requestAlias =
    source.request ?? source.ngo ?? source.requests ?? source.aid ?? 0;
  let request = Math.max(0, Number(requestAlias) || 0);

  if (farm <= 0 && request <= 0) {
    return { ...DEFAULT_PROBABILITIES };
  }

  if (farm > 0 && request <= 0) {
    request = MIN_PROBABILITY;
  } else if (request > 0 && farm <= 0) {
    farm = MIN_PROBABILITY;
  }

  const total = farm + request;
  return {
    farm: farm / total,
    request: request / total,
  };
}

console.log('Testing probability normalization...\n');

const tests = [
  { input: { farm: 0.7, request: 0.3 }, desc: 'Normal values (0.7, 0.3)' },
  { input: { farm: 0.9, request: 0.3 }, desc: 'Values sum > 1 (0.9, 0.3)' },
  { input: { farm: 0, request: 0 }, desc: 'Both zero (0, 0)' },
  { input: { farm: -0.5, request: -0.2 }, desc: 'Both negative (-0.5, -0.2)' },
  { input: { farm: 1.0, request: 0 }, desc: 'Only farm (1.0, 0)' },
  { input: { farm: 0, request: 1.0 }, desc: 'Only request (0, 1.0)' },
  { input: { farm: 0.01, request: 0.99 }, desc: 'Minimum farm (0.01, 0.99)' },
  { input: null, desc: 'Null input' },
  { input: {}, desc: 'Empty object' },
  { input: { farm: 'invalid', request: 'values' }, desc: 'Invalid strings' },
];

tests.forEach(({ input, desc }) => {
  try {
    const result = normalizeProbabilities(input);
    const sum = result.farm + result.request;
    const minMet =
      result.farm >= MIN_PROBABILITY && result.request >= MIN_PROBABILITY;
    const sumCorrect = Math.abs(sum - 1.0) < 0.0001;
    const valid = minMet && sumCorrect;

    console.log(`${valid ? '✓' : '✗'} ${desc}`);
    console.log(`   Input: ${JSON.stringify(input)}`);
    console.log(
      `   Output: farm=${result.farm.toFixed(
        3
      )}, request=${result.request.toFixed(3)}, sum=${sum.toFixed(3)}`
    );
    if (!minMet) console.log(`   ⚠️  Minimum threshold not met`);
    if (!sumCorrect) console.log(`   ⚠️  Sum does not equal 1.0`);
    console.log('');
  } catch (err) {
    console.log(`✗ ${desc}`);
    console.log(`   Error: ${err.message}`);
    console.log('');
  }
});

console.log('Test complete!');
