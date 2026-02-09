import type { GenerationScript, Persona } from './consensusTestRunner';

const personas: Persona[] = [
  { id: 'agent-accurate', name: 'Accurate Analyst', systemPrompt: 'You are precise and follow instructions.', role: 'accurate' },
  { id: 'agent-creative', name: 'Creative Thinker', systemPrompt: 'You are creative but still follow output format.', role: 'creative' },
  { id: 'agent-contrarian', name: 'Contrarian', systemPrompt: 'You challenge assumptions but still answer.', role: 'contrarian' }
];

const script: GenerationScript = {
  name: 'default-consensus-test',
  task: {
    title: 'Deterministic arithmetic',
    desc: 'Return only the exact sum as a string.',
    input: '2 + 2'
  },
  expectedAnswer: '4',
  personas,
  getPersonas: (count) => {
    if (count <= personas.length) return personas.slice(0, count);
    const extras = Array.from({ length: count - personas.length }, (_, idx) => ({
      id: `agent-extra-${idx + 1}`,
      name: `Extra Agent ${idx + 1}`,
      systemPrompt: 'You are a consistent agent that follows the format.',
      role: 'accurate' as const
    }));
    return [...personas, ...extras];
  },
  mockResponse: (persona, _task, expectedAnswer) => {
    if (persona.role === 'contrarian') return '5';
    return expectedAnswer;
  }
};

export default script;
