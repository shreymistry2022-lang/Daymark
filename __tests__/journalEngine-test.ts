import { searchJournalEntries, validateJournalEntry } from '../src/domain/journalEngine';

const entries = [
  { id: '1', date: '2025-01-08', text: 'Felt focused after my run', habitId: 'run' },
  { id: '2', date: '2025-01-07', text: 'A quiet reflection', habitId: null },
];

describe('journal helpers', () => {
  it('validates dates, text and optional habit references', () => {
    expect(validateJournalEntry(entries[0], ['run'])).toBeNull();
    expect(validateJournalEntry({ ...entries[0], date: '2025-02-30' }, ['run'])).toMatch(/valid entry date/);
    expect(validateJournalEntry({ ...entries[0], habitId: 'missing' }, ['run'])).toMatch(/valid habit/);
    expect(validateJournalEntry({ ...entries[0], text: '   ' }, ['run'])).toMatch(/1 and 10,000/);
  });

  it('searches entry text, dates and linked habit names without changing the source list', () => {
    expect(searchJournalEntries(entries, 'RUN', { run: 'Running' }).map(entry => entry.id)).toEqual(['1']);
    expect(searchJournalEntries(entries, '2025-01-07', {}).map(entry => entry.id)).toEqual(['2']);
    expect(entries).toHaveLength(2);
  });
});
