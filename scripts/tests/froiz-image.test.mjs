import assert from 'node:assert/strict';
import test from 'node:test';
import { froizImageUrl } from '../lib/froiz-image.mjs';

const account = 'laxGYDNZyT04iZVpzPzryw';
const imageId = 'f2074b84-9433-4fe6-6b89-bc3680006d00';
const stableUrl = `https://imagedelivery.net/${account}/${imageId}/desktop`;

test('Froiz usa la URL estable de image_id y no duplica la cuenta', () => {
  assert.equal(froizImageUrl({
    image_id: imageId,
    image: `/${account}/${imageId}/desktop?exp=1&sig=temporal`,
  }), stableUrl);
});

test('Froiz recupera el image id de la ruta cuando falta image_id', () => {
  assert.equal(froizImageUrl({
    image: `/${account}/${imageId}/desktop?exp=1&sig=temporal`,
  }), stableUrl);
  assert.equal(froizImageUrl({
    image: `/${account}//desktop?exp=1&sig=temporal`,
  }), null);
  assert.equal(froizImageUrl({}), null);
});
