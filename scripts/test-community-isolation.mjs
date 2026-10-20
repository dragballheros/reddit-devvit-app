import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isAdminPanelPostData,
  normalizeManagedSubredditName,
  resolveRuntimeAdminPostId,
} from '../src/shared/subreddit.ts';

assert.equal(isAdminPanelPostData({ portalAdmin: true, portalConfig: 'compressed' }), true);
assert.equal(isAdminPanelPostData({ portalAdmin: false, portalConfig: 'compressed' }), false);
assert.equal(isAdminPanelPostData({ portalConfig: 'compressed' }), false);
assert.equal(isAdminPanelPostData(null), false);
assert.equal(isAdminPanelPostData('portalAdmin'), false);

assert.equal(
  resolveRuntimeAdminPostId({
    currentPostId: 't3_sourceadmin',
    postData: { portalAdmin: true, portalAdminPostId: 't3_otheradmin' },
    localAdminPostId: 't3_localadmin',
  }),
  't3_sourceadmin',
);
assert.equal(
  resolveRuntimeAdminPostId({
    currentPostId: 't3_targetpost',
    postData: { portalAdminPostId: 't3_sourceadmin' },
    localAdminPostId: 't3_targetadmin',
  }),
  't3_sourceadmin',
);
assert.equal(
  resolveRuntimeAdminPostId({ currentPostId: 't3_localpost', postData: {}, localAdminPostId: 't3_localadmin' }),
  't3_localadmin',
);
assert.equal(
  resolveRuntimeAdminPostId({ currentPostId: 't3_localpost', postData: { portalAdminPostId: 'invalid' }, localAdminPostId: 't3_localadmin' }),
  't3_localadmin',
);
assert.equal(
  resolveRuntimeAdminPostId({ currentPostId: undefined, postData: { portalAdmin: true }, localAdminPostId: 't3_localadmin' }),
  undefined,
);

assert.equal(normalizeManagedSubredditName(' r/Example_Sub '), 'example_sub');
assert.equal(normalizeManagedSubredditName('TwoLetters'), 'twoletters');
for (const invalid of ['', 'r/', 'name/with/slash', 'https://reddit.com/r/foo/', 'a', 'x'.repeat(22), null, 42]) {
  assert.equal(normalizeManagedSubredditName(invalid), undefined, String(invalid));
}

const server = await readFile(new URL('../src/server/index.ts', import.meta.url), 'utf8');
const route = (path, method = 'post') => {
  const marker = `app.${method}('${path}'`;
  const start = server.indexOf(marker);
  assert.notEqual(start, -1, `missing route ${method.toUpperCase()} ${path}`);
  const nextRoute = server.indexOf('\napp.', start + 1);
  return server.slice(start, nextRoute < 0 ? server.length : nextRoute);
};
for (const path of [
  '/api/admin/config',
  '/api/admin/save',
  '/api/admin/upload-asset/chunk',
  '/api/admin/upload-asset/finalize',
  '/api/admin/upload-asset',
]) {
  const method = path === '/api/admin/config' ? 'get' : 'post';
  assert.match(route(path, method), /requireAdminPanelAccess\(\)/, `${path} must require the canonical admin panel and top-moderator/delegate authorization`);
}
assert.match(route('/internal/menu/create-post'), /isCurrentUserModerator\(subredditName\)/, 'custom-post menu endpoint must authorize the caller server-side');
assert.match(route('/api/admin/access', 'get'), /requireAdminPanelOwner\(\)/, 'only the top moderator may scan the moderator roster');
assert.match(route('/api/admin/access'), /requireAdminPanelOwner\(\)/, 'only the top moderator may grant or revoke access');
assert.match(server, /getModerators\(\)\.get\(1000\)/, 'delegation must be based on a live moderator-team scan');
assert.match(server, /getDelegatedAdminUsernames\(subredditName\)/, 'admin access must consult the subreddit-scoped delegation list');
assert.match(server, /await isCurrentUserModerator\(subredditName\)/, 'delegated access must revalidate live moderator status on every admin request');
assert.match(route('/internal/menu/create-admin'), /isCurrentUserSubredditOwner\(subredditName\)/, 'only the top moderator may create or replace the admin panel');

assert.match(route('/api/runtime-config', 'get'), /resolveRuntimeAdminPostId\(/, 'public posts must resolve their explicit source admin pointer');
assert.match(server, /normalizeSubredditName\(post\.subredditName\)/, 'managed-post updates must verify the target subreddit');
console.log('COMMUNITY_ISOLATION_TESTS_PASS');
