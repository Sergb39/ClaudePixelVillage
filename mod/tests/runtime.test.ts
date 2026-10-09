import { expect, test } from 'claude-code/testing';

test('/village reports receiver status without reading session content', async ($, on) => {
  on('session.start', () => ({ cwd: '/work' }));
  on('session.id', () => ({ value: 'session-test' }));
  on('clock.every', () => ({ value: { cancel() {} } }));
  on('command.register', () => ({ value: undefined }));
  on('http.fetch', () => ({ value: { ok: true, status: 200, headers: {}, text: '{"ok":true}' } }));
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
  const response = await $.command.run({ command: 'village', args: '' });
  expect(response.text).toContain('Local receiver is running.');
  expect(response.text).toContain('0 delivered');
});

test('classic SessionStart is observed without changing Claude’s event result', async ($, on) => {
  on('classic.SessionStart', () => ({}));
  on('http.fetch', () => ({ value: { ok: true, status: 200, headers: {}, text: '{"ok":true}' } }));
  await $.classic.SessionStart({ source: 'startup', session_id: 'session-test' });
  const response = await $.command.run({ command: 'village', args: '' });
  expect(response.text).toContain('1 queued');
});
