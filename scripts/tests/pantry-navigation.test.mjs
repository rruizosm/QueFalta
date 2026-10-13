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
const routeNames = ['Home', 'Catalog', 'Pantry', 'List', 'Groups'];
const routerOptions = { routeNames, routeParamList: {}, routeGetIdList: {} };
const router = TabRouter(APP_PAGER_ROUTE_OPTIONS);
const initial = () => router.getInitialState(routerOptions);
const navigate = (state, name) => router.getStateForAction(state, { type: 'NAVIGATE', payload: { name } }, routerOptions);
const back = (state) => router.getStateForAction(state, { type: 'GO_BACK' }, routerOptions);

test('launch still opens Home as the pager root', () => {
  const state = initial();
  assert.equal(state.routes[state.index].name, 'Home');
  assert.equal(state.index, 0);
  assert.equal(back(state), null);
});

test('Pantry is a regular page between Catalog and List', () => {
  const state = initial();
  const release = (progress, origin, velocity) => releaseTarget(progress, origin, velocity,
    state.routes.length, TAB_MOTION.distanceThreshold, TAB_MOTION.releaseVelocity);
  const catalogIndex = release(state.index + 0.35, state.index, 0);
  assert.equal(state.routes[catalogIndex].name, 'Catalog');
  const pantryIndex = release(catalogIndex + 0.35, catalogIndex, 0);
  assert.equal(state.routes[pantryIndex].name, 'Pantry');
  assert.equal(state.routes[release(pantryIndex + 0.35, pantryIndex, 0)].name, 'List');
  assert.equal(state.routes[release(pantryIndex - 0.35, pantryIndex, 0)].name, 'Catalog');
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

test('all five pages, including Pantry, have their own bottom icon', () => {
  const state = initial();
  const pageIndices = getAppTabBarPageIndices(state.routes);
  assert.deepEqual(pageIndices.map((index) => state.routes[index].name), routeNames);
  assert.equal(state.routes[pageIndices[2]].name, 'Pantry');
});

test('bottom selection follows every page continuously', () => {
  const indices = getAppTabBarPageIndices(initial().routes);
  assert.equal(pagerToTabBarProgress(-0.1, indices), 0);
  assert.equal(pagerToTabBarProgress(0.25, indices), 0.25);
  assert.equal(pagerToTabBarProgress(0.75, indices), 0.75);
  assert.equal(pagerToTabBarProgress(1.5, indices), 1.5);
  for (let index = 0; index < indices.length; index++) {
    assert.equal(pagerToTabBarProgress(indices[index], indices), index);
  }
  assert.equal(pagerToTabBarProgress(100, indices), 4);
});

test('enabling the optional recipe tab preserves Pantry as a visible destination', () => {
  const routes = ['Home', 'Catalog', 'Pantry', 'QueCocino', 'List', 'Groups'].map((name) => ({ name }));
  const indices = getAppTabBarPageIndices(routes);
  assert.deepEqual(indices.map((index) => routes[index].name), routes.map((route) => route.name));
  assert.equal(pagerToTabBarProgress(3, indices), 3);
  assert.equal(pagerToTabBarProgress(4, indices), 4);
});

test('Home and Pantry omit their old redundant entry buttons', () => {
  const home = readFileSync(new URL('../../src/screens/HomeScreen.tsx', import.meta.url), 'utf8');
  const pantry = readFileSync(new URL('../../src/screens/PantryScreen.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /home-open-pantry|pantryEntry/);
  assert.doesNotMatch(pantry, /pantry-back-home|homeButton/);
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
