import path from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { JsonStorage } from '../../src/storage/JsonStorage';
import { LedgerEngine } from '../../src/ledger/ledger';
import { JobEngine } from '../../src/jobs/engine';
import type { ConsensusPolicyType, Job, Submission, Vote } from '../../src/types';
import { defaultConfig } from '../../src/config';
import OpenAI from 'openai';

export type Persona = {
  id: string;
  name: string;
  systemPrompt: string;
  role?: 'accurate' | 'creative' | 'contrarian';
};

export type GenerationTask = {
  title: string;
  desc: string;
  input: string;
};

export type GenerationScript = {
  name: string;
  task: GenerationTask;
  expectedAnswer: string;
  personas: Persona[];
  getPersonas?: (count: number) => Persona[];
  buildPrompt?: (persona: Persona, task: GenerationTask, expectedAnswer: string) => { system: string; user: string };
  mockResponse?: (persona: Persona, task: GenerationTask, expectedAnswer: string) => string;
};

export type RunnerOptions = {
  scriptPath: string;
  agentCount: number;
  apiKey?: string;
  model?: string;
  verbose?: boolean;
};

export type PolicyResult = {
  policy: ConsensusPolicyType;
  winnerAgentId?: string;
  winningSubmissionId?: string;
  finalAnswer?: string;
};

export type RunnerResult = {
  scriptName: string;
  expectedAnswer: string;
  results: PolicyResult[];
};

const POLICY_TYPES: ConsensusPolicyType[] = [
  'SINGLE_WINNER',
  'HIGHEST_CONFIDENCE_SINGLE',
  'OWNER_PICK',
  'TOP_K_SPLIT',
  'MAJORITY_VOTE',
  'WEIGHTED_VOTE_SIMPLE',
  'WEIGHTED_REPUTATION',
  'TRUSTED_ARBITER'
];

export async function runConsensusPolicyTests(options: RunnerOptions): Promise<RunnerResult> {
  const script = await loadScript(options.scriptPath);
  const personas = script.getPersonas ? script.getPersonas(options.agentCount) : script.personas.slice(0, options.agentCount);
  if (!personas.length) {
    throw new Error('No personas available for test run.');
  }

  const log = (message: string, data?: Record<string, unknown>) => {
    if (!options.verbose) return;
    if (data) {
      console.log(message, data);
      return;
    }
    console.log(message);
  };

  const client = options.apiKey ? createOpenAIClient(options.apiKey) : null;

  const results: PolicyResult[] = [];
  for (const policy of POLICY_TYPES) {
    log(`\n[policy] ${policy}`);
    const { engine, ledger } = await createEngine();
    const job = await engine.postJob('owner', {
      title: script.task.title,
      description: script.task.desc,
      inputs: { input: script.task.input },
      consensusPolicy: {
        type: policy,
        trustedArbiterAgentId: policy === 'TRUSTED_ARBITER' ? 'arbiter' : '',
        minConfidence: policy === 'HIGHEST_CONFIDENCE_SINGLE' ? 0.5 : undefined,
        topK: policy === 'TOP_K_SPLIT' ? 2 : undefined,
        ordering: policy === 'TOP_K_SPLIT' ? 'confidence' : undefined
      },
      slashingPolicy: { enabled: false, slashPercent: 0, slashFlat: 0 }
    });

    log('[job] created', { jobId: job.id, consensusPolicy: job.consensusPolicy });

    await ledger.faucet('owner', 100, 'test');
    log('[ledger] faucet', { agentId: 'owner', amount: 100 });

    const submissions: Submission[] = [];
    for (const persona of personas) {
      log('[persona] loaded', { id: persona.id, name: persona.name, role: persona.role });
      log('[persona] system prompt', { id: persona.id, systemPrompt: persona.systemPrompt });
      const answer = await generateResponse(script, persona, client, options.model);
      log('[persona] response', { id: persona.id, answer });
      const submission = await engine.submitJob(persona.id, job.id, {
        summary: `${persona.name} submission`,
        artifacts: { answer },
        confidence: persona.role === 'contrarian' ? 0.1 : 0.9
      });
      log('[submission] created', { submissionId: submission.id, agentId: submission.agentId, summary: submission.summary });
      submissions.push(submission);
    }

    const correctSubmission = submissions.find((sub) => sub.artifacts?.answer === script.expectedAnswer) || submissions[0];
    log('[submission] selected correct', { submissionId: correctSubmission.id, agentId: correctSubmission.agentId });

    if (policy === 'MAJORITY_VOTE' || policy === 'WEIGHTED_VOTE_SIMPLE' || policy === 'WEIGHTED_REPUTATION') {
      for (const persona of personas) {
        await engine.vote(persona.id, job.id, {
          submissionId: correctSubmission.id,
          score: 1
        } as Vote);
        log('[vote] cast', {
          voterId: persona.id,
          submissionId: correctSubmission.id,
          score: 1,
          personaRole: persona.role,
          personaSystemPrompt: persona.systemPrompt
        });
      }
    }

    const resolution = await engine.resolveJob(policy === 'TRUSTED_ARBITER' ? 'arbiter' : 'owner', job.id, {
      manualWinners:
        policy === 'TRUSTED_ARBITER' || policy === 'OWNER_PICK' ? [correctSubmission.agentId] : undefined,
      manualSubmissionId: policy === 'TRUSTED_ARBITER' || policy === 'OWNER_PICK' ? correctSubmission.id : undefined
    });

    log('[resolution] result', {
      winners: resolution.winners,
      winningSubmissionIds: resolution.winningSubmissionIds,
      consensusTrace: resolution.consensusTrace,
      finalArtifact: resolution.finalArtifact
    });

    results.push({
      policy,
      winnerAgentId: resolution.winners[0],
      winningSubmissionId: resolution.winningSubmissionIds?.[0],
      finalAnswer: (resolution.finalArtifact as any)?.answer
    });

    if (options.verbose) {
      const summary = {
        policy,
        winnerAgentId: resolution.winners[0],
        winningSubmissionId: resolution.winningSubmissionIds?.[0],
        consensusTrace: resolution.consensusTrace
      };
      console.log('[summary] decision', summary);
    }
  }

  return { scriptName: script.name, expectedAnswer: script.expectedAnswer, results };
}

async function createEngine() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-tools-policy-'));
  const file = path.join(dir, 'state.json');
  const storage = new JsonStorage(file);
  await storage.init();
  const ledger = new LedgerEngine(storage, defaultConfig);
  const engine = new JobEngine(storage, ledger, defaultConfig);
  return { engine, ledger };
}

async function loadScript(scriptPath: string): Promise<GenerationScript> {
  const absolutePath = path.isAbsolute(scriptPath) ? scriptPath : path.resolve(process.cwd(), scriptPath);
  const moduleUrl = pathToFileURL(absolutePath).toString();
  const mod = await import(moduleUrl);
  const script = (mod.default || mod.script || mod) as GenerationScript;
  if (!script?.task || !script?.expectedAnswer || !script?.personas) {
    throw new Error('Generation script must export { task, expectedAnswer, personas }.');
  }
  return script;
}

async function generateResponse(
  script: GenerationScript,
  persona: Persona,
  client: OpenAIClient | null,
  model?: string
): Promise<string> {
  if (!client) {
    return script.mockResponse ? script.mockResponse(persona, script.task, script.expectedAnswer) : script.expectedAnswer;
  }

  const prompt = script.buildPrompt
    ? script.buildPrompt(persona, script.task, script.expectedAnswer)
    : defaultPrompt(persona, script.task, script.expectedAnswer);

  const raw = await client.generate({
    model: model || 'gpt-5.2',
    system: prompt.system,
    user: prompt.user,
    temperature: 0
  });

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.answer === 'string') return parsed.answer;
  } catch {
    // fallthrough
  }
  return raw.trim();
}

function defaultPrompt(persona: Persona, task: GenerationTask, expectedAnswer: string) {
  return {
    system: `${persona.systemPrompt}\nYou must respond ONLY as JSON: {"answer":"..."}`,
    user: `Task: ${task.title}\nDescription: ${task.desc}\nInput: ${task.input}\nExpected Answer: ${expectedAnswer}`
  };
}

type OpenAIClient = {
  generate: (input: { model: string; system: string; user: string; temperature: number }) => Promise<string>;
};

function createOpenAIClient(apiKey: string): OpenAIClient {
  const client = new OpenAI({ apiKey });
  return {
    generate: async ({ model, system, user, temperature }) => {
      const response = await client.responses.create({
        model,
        input: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature
      });
      return extractText(response);
    }
  };
}

function extractText(response: any): string {
  if (!response) return '';
  if (typeof response.output_text === 'string') return response.output_text.trim();
  const message = response.output?.[0]?.content?.[0]?.text;
  if (typeof message === 'string') return message.trim();
  return '';
}
