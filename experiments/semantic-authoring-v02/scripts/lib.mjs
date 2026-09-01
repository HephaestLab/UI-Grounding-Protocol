import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const experimentRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
);
export const workspaceRoot = resolve(experimentRoot, '..', '..');

export function stableStringify(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortValue(item)]),
  );
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function parseArgs(values) {
  const output = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (token === '--') continue;
    if (!token?.startsWith('--')) continue;
    const key = token.slice(2);
    const value = values[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing --${key}`);
    output[key] = value;
    index += 1;
  }
  return output;
}

export function required(args, key) {
  const value = args[key];
  if (!value) throw new Error(`Missing --${key}`);
  return value;
}

export function taskById(bank, taskId) {
  const task = bank.tasks.find((item) => item.taskId === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  return task;
}

export function newRunId(study, replicate) {
  return `${study.toLowerCase()}-r${replicate}-${randomBytes(6).toString('hex')}`;
}

function titleCase(value) {
  return value.replace(
    /(^|[-.])([a-z])/gu,
    (_match, prefix, letter) =>
      `${prefix === '-' ? ' ' : prefix}${letter.toUpperCase()}`,
  );
}

function summaryRoleLabel(role) {
  return role
    .replace(/[._-]+/gu, ' ')
    .replace(/^\p{Ll}/u, (initial) => initial.toLocaleUpperCase('en-US'));
}

function formatSummaryValue(value) {
  if (Array.isArray(value)) return value.map(formatSummaryValue).join(', ');
  if (value === null || typeof value !== 'object') return String(value);
  if (value.kind === 'entity') return value.label ?? value.ref;
  if (value.kind === 'quantity') return `${value.value} ${value.unit}`;
  if (value.kind === 'instant') return value.value;
  if (value.kind === 'interval')
    return value.label ?? `${value.start}..${value.endExclusive ?? ''}`;
  if (value.kind === 'collection')
    return value.items.map(formatSummaryValue).join(', ');
  if (value.kind === 'frame')
    return value.value.subject.label ?? value.value.subject.ref;
  throw new Error(`Unknown summary value: ${JSON.stringify(value)}`);
}

function appFiles(task) {
  const facts = Object.fromEntries(
    task.controlledFacts.map((fact) => [fact.id, fact.value]),
  );
  const data = {
    taskId: task.taskId,
    domain: task.domain,
    title: task.title,
    target: task.target,
    revision: String(facts.basis ?? 'revision-1'),
    facts,
    neighbors: [
      {
        id: `${task.domain}:neighbor-a`,
        label: `${titleCase(task.domain)} item A`,
      },
      {
        id: `${task.domain}:neighbor-b`,
        label: `${titleCase(task.domain)} item B`,
      },
    ],
  };
  const packageJson = {
    name: `ugp-experiment-${task.taskId}`,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: {
      build: 'vite build',
      dev: 'vite',
      typecheck: 'tsc --noEmit',
    },
    dependencies: { react: '19.2.8', 'react-dom': '19.2.8' },
    devDependencies: {
      '@types/react': '19.2.18',
      '@types/react-dom': '19.2.5',
      typescript: '6.0.3',
      vite: '8.2.2',
    },
  };
  const app =
    task.workflow === 'retrofit' ? retrofitApp(task) : greenfieldApp(task);
  return {
    'package.json': stableStringify(packageJson),
    'index.html':
      '<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Experiment app</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
    'tsconfig.json': stableStringify({
      compilerOptions: {
        target: 'ES2023',
        useDefineForClassFields: true,
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
      },
      include: ['src'],
    }),
    'src/data.ts': `export const taskData = ${JSON.stringify(data, null, 2)} as const;\n`,
    'src/main.tsx':
      "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { App } from './App';\nimport './styles.css';\n\ncreateRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);\n",
    'src/vite-env.d.ts': '/// <reference types="vite/client" />\n',
    'src/App.tsx': app,
    'src/styles.css': appStyles(task.workflow),
  };
}

function ugpProjectFiles() {
  const packageSources = Object.fromEntries(
    [
      'protocol',
      'core',
      'dom',
      'overlay',
      'authoring',
      'react',
      'inspector',
    ].map((name) => [
      `@ui-grounding/${name}`,
      resolve(workspaceRoot, 'packages', name, 'src', 'index.ts').replaceAll(
        '\\',
        '/',
      ),
    ]),
  );
  return {
    'tsconfig.json': stableStringify({
      compilerOptions: {
        target: 'ES2023',
        useDefineForClassFields: true,
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
        paths: Object.fromEntries(
          Object.entries(packageSources).map(([name, path]) => [name, [path]]),
        ),
      },
      include: ['src'],
    }),
    'vite.config.ts': `import { defineConfig } from 'vite';\n\nexport default defineConfig({ resolve: { alias: ${JSON.stringify(packageSources, null, 2)} } });\n`,
  };
}

function greenfieldApp(task) {
  return `import { taskData } from './data';

export function App() {
  return (
    <main className="starter-shell">
      <p className="eyebrow">${titleCase(task.domain)} workspace</p>
      <h1>{taskData.title}</h1>
      <p>{${JSON.stringify(task.productBrief)}}</p>
      <section className="starter-canvas" aria-label="Implementation canvas">
        <strong>Starter is ready.</strong>
        <span>Build the requested product here. Keep data in src/data.ts authoritative.</span>
      </section>
    </main>
  );
}
`;
}

function retrofitApp(task) {
  return `import { useMemo, useState } from 'react';
import { taskData } from './data';

export function App() {
  const [query, setQuery] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const items = useMemo(() => [taskData.target, ...taskData.neighbors].filter((item) => item.label.toLowerCase().includes(query.toLowerCase())), [query]);
  return (
    <main className="app-shell">
      <header><div><p className="eyebrow">${titleCase(task.domain)} operations</p><h1>{taskData.title}</h1></div><span className="revision">{taskData.revision}</span></header>
      <label className="search">Search<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <section className="workspace">
        <nav aria-label="Items"><h2>Queue</h2>{items.map((item) => <button key={item.id}>{item.label}</button>)}</nav>
        <article>
          <p className="eyebrow">Selected record</p>
          <button className="target" data-testid={taskData.target.testId} onClick={() => setDetailsOpen((value) => !value)} aria-expanded={detailsOpen}>{taskData.target.label}</button>
          <dl>{Object.entries(taskData.facts).slice(0, 5).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(', ') : String(value)}</dd></div>)}</dl>
          {detailsOpen ? <aside role="status">Full application detail is open.</aside> : null}
        </article>
      </section>
    </main>
  );
}
`;
}

function appStyles(workflow) {
  return `:root{font-family:Inter,ui-sans-serif,system-ui;color:#172033;background:#f4f6fb}*{box-sizing:border-box}body{margin:0}.app-shell,.starter-shell{max-width:1080px;margin:0 auto;padding:42px 28px}.eyebrow{margin:0 0 6px;color:#5b68d8;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{margin:0;font-size:32px}header{display:flex;align-items:flex-start;justify-content:space-between}.revision{padding:8px 12px;border-radius:999px;background:#e8ebff;color:#3946ad}.search{display:grid;gap:8px;margin:28px 0;font-weight:700}.search input{max-width:420px;border:1px solid #ccd2e3;border-radius:12px;padding:12px 14px;background:white}.workspace{display:grid;grid-template-columns:240px 1fr;gap:18px}nav,article,.starter-canvas{border:1px solid #dfe3ee;border-radius:18px;background:white;box-shadow:0 14px 34px rgba(36,45,76,.07)}nav,article{padding:20px}nav{display:grid;align-content:start;gap:8px}nav h2{margin:0 0 8px}nav button,.target{border:0;border-radius:12px;padding:12px;text-align:left;background:#f0f2f8;color:inherit}.target{width:100%;background:#202b5f;color:white;font-size:18px;font-weight:750}dl{display:grid;gap:0;margin:18px 0}dl div{display:grid;grid-template-columns:150px 1fr;padding:10px 2px;border-bottom:1px solid #edf0f6}dt{font-weight:750}dd{margin:0}.starter-canvas{display:grid;gap:8px;min-height:360px;margin-top:28px;padding:28px;border-style:dashed}aside{padding:12px;border-radius:12px;background:#ecf8f1;color:#17643a}@media(max-width:700px){.workspace{grid-template-columns:1fr}.app-shell,.starter-shell{padding:26px 18px}}/* ${workflow} baseline */\n`;
}

function conditionGuide(task, condition) {
  if (condition === 'conventional') {
    return `# Assigned implementation condition\n\nImplement the product brief and satisfy its functional, accessibility, and visual requirements. Do not add an experimental semantic layer unless it is necessary for the ordinary product implementation.\n`;
  }
  if (condition === 'generic') {
    return `# Assigned implementation condition\n\nIn addition to the product brief, create an application-specific semantic sidecar under \`src/meaning/\`. Define a typed record for target \`${task.target.id}\`, bind it to the live target component with a lifecycle-safe link, and provide a small floating meaning inspector with point selection and an application callback. Mark its root with \`data-experiment-inspector\` and its raw live result with \`data-experiment-meaning-output\` so hidden acceptance can observe it without prescribing the local JSON shape. The sidecar must cover exactly the fact IDs listed in \`CONTROLLED-FACTS.json\`. Export the live-data materializer as \`targetMeaning\` from \`src/meaning/manifest.ts\` for hidden acceptance. Design a credible compact contract for this application; do not use UGP packages, names, schemas, or copied UGP code. Keep API execution and authorization outside the inspector.\n`;
  }
  return `# Assigned implementation condition\n\nUse the included \`ugp-${task.workflow === 'greenfield' ? 'build' : 'retrofit'}\` Skill exactly as the authoring guide. Add a domain Profile and typed Binding for target \`${task.target.id}\`, link the live target component, and integrate the optional floating UGP Inspector for point/region/text inspection and application callback. Export \`profiles\` and \`targetBinding\` from \`src/ugp/manifest.ts\` for hidden acceptance. The frame must cover exactly the fact IDs listed in \`CONTROLLED-FACTS.json\`. Do not add domain-specific Core fields or put model/API execution in the Inspector.\n`;
}

function taskPrompt(task) {
  return `# Task: ${task.title}\n\n${task.productBrief}\n\n## Product acceptance\n\n${task.functionalChecks.map((item) => `- ${item}`).join('\n')}\n\nUse the authoritative data already provided in \`app/src/data.ts\`. Preserve existing behavior and appearance when this is a retrofit task. Work only inside the participant directory. Do not search parent directories. Record completion, changed files, commands, and any unresolved semantic fact in \`AUDIT.json\`, conforming to \`AUDIT.schema.json\`. Do not claim checks you did not run.\n`;
}

export async function writePacket({
  directory,
  task,
  condition,
  publicRun,
  skillRoot,
}) {
  const participant = join(directory, 'participant');
  await mkdir(join(participant, 'app', 'src'), { recursive: true });
  const files = appFiles(task);
  if (condition === 'ugp') Object.assign(files, ugpProjectFiles());
  for (const [relativePath, content] of Object.entries(files)) {
    const destination = join(participant, 'app', relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  await writeFile(join(participant, 'TASK.md'), taskPrompt(task));
  await writeFile(
    join(participant, 'CONDITION.md'),
    conditionGuide(task, condition),
  );
  await writeFile(
    join(participant, 'CONTROLLED-FACTS.json'),
    stableStringify({ factIds: task.controlledFacts.map((fact) => fact.id) }),
  );
  await writeFile(
    join(participant, 'AUDIT.schema.json'),
    await readFile(
      join(experimentRoot, 'schemas', 'audit.schema.json'),
      'utf8',
    ),
  );
  await writeFile(join(participant, 'run.json'), stableStringify(publicRun));
  if (condition === 'ugp') {
    const source = join(
      skillRoot,
      `ugp-${task.workflow === 'greenfield' ? 'build' : 'retrofit'}`,
    );
    await copyTree(source, join(participant, 'skill'));
  }
}

export async function copyTree(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else await writeFile(to, await readFile(from));
  }
}

export async function directoryDigest(directory, ignored = new Set()) {
  const records = [];
  async function visit(current, prefix = '') {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (ignored.has(relative)) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path, relative);
      else records.push([relative, sha256(await readFile(path))]);
    }
  }
  await visit(directory);
  return sha256(stableStringify(records));
}

export function readerArtifact(task, condition) {
  const facts = Object.fromEntries(
    task.controlledFacts.map((fact) => [fact.id, fact.value]),
  );
  if (condition === 'dom') {
    return {
      surface: { role: 'main', heading: task.title },
      selection: { visibleText: task.target.label, testId: task.target.testId },
      nearbyText: task.functionalChecks,
    };
  }
  if (condition === 'adhoc') {
    const domainKeys = {
      bi: {
        kind: 'analyticsCell',
        primaryKey: 'identity',
        stateKeys: ['metric', 'value', 'unit'],
        contextKeys: ['scope.region', 'scope.period', 'basis'],
      },
      document: {
        kind: 'documentSpan',
        primaryKey: 'identity',
        stateKeys: [
          'effect',
          'noticePeriod',
          'noticeUnit',
          'retention',
          'retentionUnit',
        ],
        contextKeys: ['parties', 'appliesTo', 'basis'],
      },
      workflow: {
        kind: 'flowNode',
        primaryKey: 'identity',
        stateKeys: ['state', 'assignee', 'blocker'],
        contextKeys: ['prerequisite', 'prerequisiteState', 'basis'],
      },
      commerce: {
        kind: 'opsRecord',
        primaryKey: 'identity',
        stateKeys: ['state', 'amount', 'refundAmount', 'currency'],
        contextKeys: [
          'customer',
          'originalOrder',
          'riskTier',
          'reason',
          'basis',
        ],
      },
    }[task.domain];
    return {
      schema: `${task.taskId}.selection-context.v1`,
      kind: domainKeys.kind,
      record: facts[domainKeys.primaryKey],
      state: Object.fromEntries(
        domainKeys.stateKeys
          .filter((key) => key in facts)
          .map((key) => [key, facts[key]]),
      ),
      context: Object.fromEntries(
        domainKeys.contextKeys
          .filter((key) => key in facts)
          .map((key) => [key, facts[key]]),
      ),
      operations: [facts.capability],
    };
  }
  const roleEntries = task.controlledFacts
    .filter((fact) => !['identity', 'capability'].includes(fact.id))
    .map((fact) => [
      fact.id,
      Array.isArray(fact.value)
        ? { kind: 'collection', items: fact.value }
        : fact.value,
    ]);
  const summaryRoles = {
    bi: ['value', 'unit', 'scope.region', 'scope.period'],
    document: ['effect', 'basis'],
    workflow: ['state', 'assignee'],
    commerce: ['state', 'basis'],
  }[task.domain];
  const summary = `${task.target.label} — ${summaryRoles
    .map(
      (role) => `${summaryRoleLabel(role)}: ${formatSummaryValue(facts[role])}`,
    )
    .join('; ')}`;
  return {
    v: '0.2-draft',
    id: `capsule:${task.target.id}`,
    at: { surface: `surface:${task.taskId}`, revision: String(facts.basis) },
    referent: {
      nodeId: task.target.id,
      revision: String(facts.basis),
    },
    description: {
      profile: `profile:${task.domain}`,
      summary,
      frame: {
        type: `${task.domain}.${task.domain === 'bi' ? 'observation' : task.domain === 'document' ? 'normative-text' : task.domain === 'workflow' ? 'stateful-step' : 'record'}`,
        subject: {
          kind: 'entity',
          ref: String(facts.identity),
          label: task.target.label,
        },
        roles: Object.fromEntries(roleEntries),
      },
    },
    can: [facts.capability],
  };
}

export function scoreReaderAnswer(task, answer, privateRun) {
  const expected = Object.fromEntries(
    task.controlledFacts.map((fact) => [fact.id, fact.value]),
  );
  const factResults = Object.fromEntries(
    task.controlledFacts.map((fact) => [
      fact.id,
      stableStringify(answer.facts[fact.id]) === stableStringify(fact.value),
    ]),
  );
  const correctFacts = Object.values(factResults).filter(Boolean).length;
  return {
    runId: privateRun.runId,
    study: 'RQ2',
    inferential: privateRun.inferential,
    referentCorrect: answer.referent === expected.identity,
    factResults,
    factAccuracy: correctFacts / task.controlledFacts.length,
    capabilityCorrect: answer.capability === expected.capability,
    safeNoInvoke: answer.shouldInvoke === false,
    uncertaintyCount: answer.uncertainties.length,
  };
}
