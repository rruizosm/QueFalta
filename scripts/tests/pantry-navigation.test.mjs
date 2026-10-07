import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { TabRouter } from '@react-navigation/routers';
import ts from 'typescript';

async function load(relativePath) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../../src/${relativePath}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { APP_PAGER_ROUTE_OPTIONS, getAppTabBarPageIndices, pagerToTabBarProgress } = await load('navigation/appPagerRoutes');
const { releaseTarget } = await load('components/bottom-tabs-pager/physics');
const { TAB_MOTION } = await load('components/bottom-tabs-pager/constants');
const routeNames = ['Pantry', 'Home', 'Catalog', 'QueCocino', 'List', 'Groups'];
const routerOptions = { routeNames, routeParamList: {}, routeGetIdList: {} };
const router = TabRouter(APP_PAGER_ROUTE_OPTIONS);
const initial = () => router.getInitialState(routerOptions);
const navigate = (state, name) => router.getStateForAction(state, { type: 'NAVIGATE', payload: { name } }, routerOptions);
const back = (state) => router.getStateForAction(state, { type: 'GO_BACK' }, routerOptions);

test('launch still opens Home, with Pantry immediately to its left', () => {
  const state = initial();
  assert.equal(state.routes[state.index].name, 'Home');
  assert.equal(state.routes[state.index - 1].name, 'Pantry');
  assert.equal(back(state), null);
});

test('a right swipe from Home opens Pantry and a left swipe returns Home', () => {
  const state = initial();
  const release = (progress, origin, velocity) => releaseTarget(progress, origin, velocity,
    state.routes.length, TAB_MOTION.distanceThreshold, TAB_MOTION.releaseVelocity);
  const pantryIndex = release(state.index - 0.35, state.index, 0);
  assert.equal(state.routes[pantryIndex].name, 'Pantry');
  assert.equal(state.routes[release(pantryIndex + 0.35, pantryIndex, 0)].name, 'Home');
  assert.equal(state.routes[release(state.index + 0.35, state.index, 0)].name, 'Catalog');
  assert.equal(release(0, 0, -5000), 0);
});

test('Android Back returns Pantry and every existing destination to Home', () => {
  for (const name of routeNames.filter((route) => route !== 'Home')) {
    const destination = navigate(initial(), name);
    assert.equal(destination.routes[destination.index].name, name);
    const returned = back(destination);
    assert.equal(returned.routes[returned.index].name, 'Home');
    assert.equal(back(returned), null);
  }
});

test('the five existing bottom icons retain their own page targets', () => {
  const state = initial();
  const pageIndices = getAppTabBarPageIndices(state.routes);
  assert.deepEqual(pageIndices.map((index) => state.routes[index].name), routeNames.slice(1));
  const fromPantry = navigate(state, 'Pantry');
  const home = navigate(fromPantry, state.routes[pageIndices[0]].name);
  assert.equal(home.routes[home.index].name, 'Home');
});

test('Home stays selected throughout Pantry motion, then selection follows existing tabs', () => {
  const indices = getAppTabBarPageIndices(initial().routes);
  for (const progress of [-0.1, 0, 0.25, 0.75, 1]) {
    assert.equal(pagerToTabBarProgress(progress, indices), 0);
  }
  assert.equal(pagerToTabBarProgress(1.5, indices), 0.5);
  for (let index = 0; index < indices.length; index++) {
    assert.equal(pagerToTabBarProgress(indices[index], indices), index);
  }
  assert.equal(pagerToTabBarProgress(100, indices), 4);
});

test('hiding the optional recipe tab preserves icon mappings and the final slot', () => {
  const routes = initial().routes.filter((route) => route.name !== 'QueCocino');
  const indices = getAppTabBarPageIndices(routes);
  assert.deepEqual(indices.map((index) => routes[index].name), ['Home', 'Catalog', 'List', 'Groups']);
  assert.equal(pagerToTabBarProgress(3, indices), 2);
  assert.equal(pagerToTabBarProgress(4, indices), 3);
});

test('visiting Pantry preserves mounted stack route keys and nested state', () => {
  const state = initial();
  const catalogIndex = state.routes.findIndex((route) => route.name === 'Catalog');
  const nestedCatalog = { index: 1, routes: [{ key: 'root', name: 'CatalogHome' }, { key: 'product', name: 'Products' }] };
  state.routes[catalogIndex] = { ...state.routes[catalogIndex], state: nestedCatalog };
  const returned = navigate(navigate(navigate(state, 'Catalog'), 'Pantry'), 'Catalog');
  assert.deepEqual(returned.routes.map((route) => route.key), state.routes.map((route) => route.key));
  assert.equal(returned.routes[returned.index].state, nestedCatalog);
});
