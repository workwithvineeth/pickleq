export type TaskId = 'weekly' | 'weaknesses' | 'compare' | 'plan' | 'notes' | 'tournament' | 'questions' | 'chat' | 'report';

export type ComparePreset = '30v30' | 'month' | '90v90';
export interface TaskParams { compare?: ComparePreset; tournamentId?: string; question?: string }

export interface TaskInfo { id: TaskId; title: string; blurb: string; instruction: string }

export const TASKS: TaskInfo[] = [
  { id: 'weekly', title: 'Weekly summary', blurb: 'Your last 7 days against the 4 weeks before',
    instruction: 'Write my weekly summary: how the last 7 days of matches and training went, compared with the 28 days before. Point out anything that changed.' },
  { id: 'weaknesses', title: 'Recurring weaknesses', blurb: 'Patterns that keep showing up in 90 days',
    instruction: 'Find my recurring weaknesses over the last 90 days from tags, momentum, close games, opponent strength, shot estimates and measured drills. Rank them by how strongly the data supports them.' },
  { id: 'compare', title: 'Compare periods', blurb: 'Two time ranges side by side',
    instruction: 'Compare the two periods. Say what improved, what got worse and what stayed the same, using the computed stats for each period.' },
  { id: 'plan', title: 'Practice plan', blurb: 'A 7-day plan from your data and goals',
    instruction: 'Make me a 7-day practice plan based on my weaknesses, goals, recent training load and any upcoming tournament. In Suggestions, give the plan day by day with drills, reps or minutes, and one focus cue each day. Include a rest or light day.' },
  { id: 'notes', title: 'Note analysis', blurb: 'Themes in your match and training notes',
    instruction: 'Read my match and training notes and find recurring themes. Quote short phrases from the notes and link each theme to the match results where it appears.' },
  { id: 'tournament', title: 'Tournament review', blurb: 'How a tournament went, event by event',
    instruction: 'Review this tournament event by event: results, pool position, knockout rounds, close games and momentum, and my reflections. Say what to keep and what to change for the next tournament.' },
  { id: 'questions', title: 'Questions for your coach', blurb: 'What to ask at your next session',
    instruction: 'Write 5–8 specific questions I should ask my human coach, each tied to a pattern in my data. Put the questions under Suggestions, numbered, with the data point after each one.' },
  { id: 'chat', title: 'Ask anything', blurb: 'Your own question, answered from your records',
    instruction: 'Answer my question using my records.' },
];

export const REPORT_TASK: TaskInfo = { id: 'report', title: 'Performance report', blurb: 'A PDF of your last 90 days',
  instruction: 'Write my 90-day performance report: overall level and trend, strengths, weaknesses, training, and the next priorities. It will be printed, so keep it well organised.' };

export const taskInfo = (id: TaskId) => (id === 'report' ? REPORT_TASK : TASKS.find((t) => t.id === id)!);

export const COMPARE_PRESETS: { value: ComparePreset; label: string }[] = [
  { value: '30v30', label: 'Last 30 days vs the 30 before' }, { value: 'month', label: 'This month vs last month' }, { value: '90v90', label: 'Last 90 days vs the 90 before' },
];
