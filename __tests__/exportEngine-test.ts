import { buildDaymarkCsv, buildDaymarkJson, DaymarkExport } from '../src/domain/exportEngine';

const data: DaymarkExport = {
  exportedAt: '2025-01-08T12:00:00Z', timezone: 'Asia/Kolkata', statistics: { totalCompletions: 2 },
  habits: [{ id: 'h1', name: 'Read, "reflect"', category: 'Mind, Body', color: '#fff', icon: 'book', description: 'A "good" habit', startDate: '2025-01-01', completedDates: ['2025-01-01'], logs: [{ date: '2025-01-02', outcome: 'completed', value: 3, note: 'Page 1, 2, 3' }], unit: 'pages' }],
  routines: [], goals: [], journal: [{ id: 'j1', habitId: 'h1', date: '2025-01-02', text: 'Stayed focused, then rested', createdAt: '2025-01-02T12:00:00Z', updatedAt: '2025-01-02T12:00:00Z' }], achievements: [],
};

describe('data export', () => {
  it('exports JSON with format version and complete metadata', () => {
    expect(JSON.parse(buildDaymarkJson(data))).toMatchObject({ format: 'daymark-export-v1', timezone: 'Asia/Kolkata', habits: [{ logs: [{ value: 3 }] }] });
  });
  it('exports history and escapes commas and quotes in CSV cells', () => {
    const csv = buildDaymarkCsv(data);
    expect(csv).toContain('"Read, ""reflect"""');
    expect(csv).toContain('"Page 1, 2, 3"');
    expect(csv).toContain('completion,h1,"Read, ""reflect""",2025-01-02,completed,3,pages');
    expect(csv).toContain('journal,j1,"Read, ""reflect""",2025-01-02,entry');
  });
});
