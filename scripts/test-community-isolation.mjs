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
  assert.match(route(path, method), /requireAdminPanelAccess\(\)/, `${path} must require the canonical admin panel and owner-or-delegated access`);
}
for (const path of [
  '/api/admin/access/scan',
  '/api/admin/access/grant',
  '/api/admin/access/revoke',
]) {
  assert.match(route(path), /requireAdminPanelOwner\(\)/, `${path} must remain top-moderator-only`);
}
assert.match(server, /const getCurrentModeratorUsernames = async/, 'delegation must use a live subreddit moderator scan');
assert.match(server, /syncDelegatedAdmins\(panel\.subredditName\)/, 'delegated access must be reconciled against current moderators');
assert.match(route('/api/admin/access/grant'), /access\.moderators\.includes\(username\)/, 'grant must reject users who are not current moderators');
assert.match(route('/api/admin/access/revoke'), /getDelegatedAdminUsernames\(\)/, 'top moderator must be able to revoke a delegation');
assert.match(route('/internal/menu/create-post'), /isCurrentUserModerator\(subredditName\)/, 'creating a public navigation post must still require moderator access');
assert.match(route('/internal/menu/create-admin'), /isCurrentUserSubredditOwner\(subredditName\)/, 'only the subreddit top moderator may create or replace the admin panel');
assert.match(server, /const isCurrentUserSubredditOwner = async/, 'owner authorization must be checked server-side');
assert.match(server, /getModerators\(\)\.get\(1\)/, 'owner authorization must check the live top moderator');
assert.match(server, /postId !== canonicalAdminPostId/, 'stale or alternate admin posts must not authorize writes');
assert.match(server, /normalizeSubredditName\(post\.subredditName\)/, 'admin and managed-post updates must verify subreddit ownership');
const adminClient = await readFile(new URL('../src/client/admin.tsx', import.meta.url), 'utf8');
assert.match(adminClient, /if \(accessDenied\)/, 'unauthorized users must see an access-denied screen');
assert.match(adminClient, /Dashboard access required/, 'access-denied screen must explain the access restriction');
assert.match(adminClient, /Grant Dashboard Access/, 'top moderator must have a UI to grant access to scanned moderators');
assert.match(adminClient, /Scan Moderator Team/, 'top moderator must be able to scan the live moderator team');
assert.match(adminClient, /Revoke/, 'top moderator must be able to revoke delegated access');
assert.match(route('/api/runtime-config', 'get'), /resolveRuntimeAdminPostId\(/, 'public posts must resolve their explicit source admin pointer');
console.log('COMMUNITY_ISOLATION_TESTS_PASS');
