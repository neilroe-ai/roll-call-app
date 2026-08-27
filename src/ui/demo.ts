/* Throwaway: runs the screens on the FakeSheet so the UI can be seen without
   Google sign-in. Not part of the app. */
import './styles.css';
import { FakeSheet } from '../infra/fakeSheet';
import { App } from './app';

const students = [
  { id: 's1', name: 'Amy Chen' },
  { id: 's2', name: 'Ben Wu' },
  { id: 's3', name: 'Chloe Lin' },
  { id: 's4', name: 'Dai-wei Ho' },
  { id: 's5', name: 'Emma Tsai' },
  { id: 's6', name: 'Feng Liu' },
];
const groups = [
  { id: 'G1', name: 'Class 01', studentIds: students.map((s) => s.id) },
  { id: 'G2', name: 'Reading circle', studentIds: ['s2', 's4', 's5'] },
];

/** One Student arrives with points already given on paper, so the demo shows
    what an Adjustment does to a Score. */
const adjustments = new Map([
  ['s1', { points: 12, counts: { present: 18, absent: 2, sick: 1, other: 0 } }],
]);

/** Two Sessions already taken, so the demo has Held Points waiting to settle. */
const sessions = [
  { id: 'mon', groupId: 'G1', takenAt: '2026-08-24T09:00:00+08:00' },
  { id: 'wed', groupId: 'G1', takenAt: '2026-08-26T09:00:00+08:00' },
];
const attendance = [
  { sessionId: 'mon', studentId: 's1', status: 'present', pointState: 'awarded' },
  {
    sessionId: 'mon',
    studentId: 's2',
    status: 'sick',
    pointState: 'held',
    note: 'flu, mum called',
  },
  { sessionId: 'mon', studentId: 's3', status: 'absent', pointState: 'denied' },
  { sessionId: 'wed', studentId: 's1', status: 'present', pointState: 'awarded' },
  {
    sessionId: 'wed',
    studentId: 's4',
    status: 'other',
    pointState: 'held',
    note: 'family funeral',
  },
  { sessionId: 'wed', studentId: 's5', status: 'sick', pointState: 'held' },
] as const;

const root = document.querySelector<HTMLElement>('#app');
if (root) {
  const sheet = new FakeSheet({
    students,
    groups,
    adjustments,
    sessions,
    attendance: [...attendance],
  });
  void new App(root, sheet).start();
}
