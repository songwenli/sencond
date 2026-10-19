// 运行：deno test messages.test.ts
import { deepStrictEqual as eq, ok } from 'node:assert';
import { buildMessages, chunk, type PendingNotification } from './messages.ts';

const base: PendingNotification = {
  id: 1, kind: 'new_match', user_id: 'u', locale: 'zh-Hans', tokens: ['T1', 'T2'],
  match_id: 'm1', match_reason: { 'zh-Hans': '一个出租一个求租，都在姑苏区', en: 'Landlord and tenant in Gusu' },
  other_intent: '出租姑苏区一套房', conversation_id: null, sender_name: null, message_body: null,
};

Deno.test('new match: localized title, reason as body, one message per device, deep link', () => {
  const zh = buildMessages(base)!;
  eq(zh.length, 2);
  eq(zh[0].title, '有人和你同频');
  eq(zh[0].body, '一个出租一个求租，都在姑苏区');
  eq(zh[0].data.url, '/match/m1');
  eq(zh[0].channelId, 'matches');
  const en = buildMessages({ ...base, locale: 'en' })!;
  eq(en[0].title, 'New match');
  eq(en[0].body, 'Landlord and tenant in Gusu');
});

Deno.test('new match without reason falls back to their intent', () => {
  const m = buildMessages({ ...base, match_reason: {} })!;
  eq(m[0].body, '出租姑苏区一套房');
});

Deno.test('new message: sender name as title, clipped body, chat deep link', () => {
  const m = buildMessages({
    ...base, kind: 'new_message', match_id: null, match_reason: null, other_intent: null,
    conversation_id: 'c1', sender_name: 'Alice', message_body: 'x'.repeat(300),
  })!;
  eq(m[0].title, 'Alice');
  eq(m[0].body.length, 120);
  ok(m[0].body.endsWith('…'));
  eq(m[0].data.url, '/chat/c1');
  eq(m[0].channelId, 'messages');
});

Deno.test('deleted content or no devices yields nothing to send', () => {
  eq(buildMessages({ ...base, match_id: null }), null);
  eq(buildMessages({ ...base, kind: 'new_message', conversation_id: 'c1', message_body: null }), null);
  eq(buildMessages({ ...base, tokens: [] }), []);
});

Deno.test('chunks of 100', () => {
  eq(chunk(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length), [100, 100, 50]);
});
