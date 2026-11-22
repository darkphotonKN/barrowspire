// Signed-in browsing at a fixed arrival rate, the shape real players make:
// each VU signs in once, then every iteration is one page view,
// GET /api/characters then GET /api/marketplace/listings, on the same token.
// A token the gateway refuses (401, past its 60 minute TTL) signs that VU in
// again, so a long run stays at about one sign-in per VU.
//
// A second, separate scenario drills sign-ins on their own, with every Nth
// one on a wrong password. It is off unless BAD_PW_EVERY is set.
//
// Env:
//   EMAIL, PASSWORD   an existing account (required)
//   BASE_URL          default https://api.barrowspire.app
//   RATE              page views started per second (default 5)
//   DURATION          e.g. 3m (default 3m), both scenarios
//   BAD_PW_EVERY      turns the sign-in scenario on: every Nth sign-in uses a
//                     wrong password; 0 leaves the scenario out (default 0)
//   LOGIN_RATE        sign-ins per second in that scenario (default 1); each
//                     one is a full bcrypt compare in auth, so keep it low
//
// See ../README.md for the scenarios.
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'https://api.barrowspire.app';
const EMAIL = __ENV.EMAIL;
const PASSWORD = __ENV.PASSWORD;
const RATE = Number(__ENV.RATE || 5);
const DURATION = __ENV.DURATION || '3m';
const BAD_PW_EVERY = Number(__ENV.BAD_PW_EVERY || 0);
const LOGIN_RATE = Number(__ENV.LOGIN_RATE || 1);

if (!EMAIL || !PASSWORD) {
  throw new Error('set EMAIL and PASSWORD (an existing account)');
}

// One per sign-in the browse scenario makes. At the end of a run it should be
// close to vus_max, not to iterations; if it tracks iterations, tokens are not
// being reused.
const browseSignins = new Counter('browse_signins');

const scenarios = {
  browse: {
    // constant-arrival-rate starts RATE iterations a second however slow the
    // server gets, so latency shows up as latency instead of as fewer
    // requests (closed-loop VUs would hide it)
    executor: 'constant-arrival-rate',
    exec: 'browse',
    rate: RATE,
    timeUnit: '1s',
    duration: DURATION,
    preAllocatedVUs: Math.max(10, RATE * 2),
    maxVUs: Math.max(50, RATE * 10),
  },
};

if (BAD_PW_EVERY > 0) {
  scenarios.bad_login = {
    executor: 'constant-arrival-rate',
    exec: 'badLogin',
    rate: LOGIN_RATE,
    timeUnit: '1s',
    duration: DURATION,
    preAllocatedVUs: Math.max(2, LOGIN_RATE * 2),
    maxVUs: Math.max(10, LOGIN_RATE * 10),
  };
}

export const options = {
  scenarios,
  // Not enforced: watch Grafana instead. Uncomment to make k6 exit non-zero.
  // thresholds: {
  //   'http_req_failed{name:characters}': ['rate<0.01'],
  //   'http_req_duration{name:characters}': ['p(95)<300'],
  //   'http_req_duration{name:listings}': ['p(95)<300'],
  // },
};

const jsonHeaders = { 'Content-Type': 'application/json' };

function signin(password, tags) {
  return http.post(
    `${BASE_URL}/api/member/signin`,
    JSON.stringify({ email: EMAIL, password }),
    { headers: jsonHeaders, tags: { name: 'signin', ...tags } },
  );
}

// Module scope is per VU in k6: each VU holds its own token across iterations.
let token = null;

function signedIn() {
  if (token) return true;
  const res = signin(PASSWORD, {});
  browseSignins.add(1);
  if (!check(res, { 'signin 200': (r) => r.status === 200 })) return false;
  token = res.json('result.access_token');
  return true;
}

function authedGet(path, name) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name },
  });
  // expired or revoked: sign in again on this VU's next iteration
  if (res.status === 401) token = null;
  return res;
}

export function browse() {
  if (!signedIn()) return;

  const characters = authedGet('/api/characters', 'characters');
  check(characters, { 'characters 200': (r) => r.status === 200 });
  if (!token) return;

  const listings = authedGet('/api/marketplace/listings', 'listings');
  check(listings, { 'listings 200': (r) => r.status === 200 });
}

export function badLogin() {
  const n = exec.scenario.iterationInTest + 1;
  const wrongPassword = n % BAD_PW_EVERY === 0;

  const res = signin(wrongPassword ? `${PASSWORD}-wrong` : PASSWORD, { wrong_password: String(wrongPassword) });

  if (wrongPassword) {
    check(res, { 'wrong password is refused (401)': (r) => r.status === 401 });
    return;
  }
  check(res, { 'signin 200': (r) => r.status === 200 });
}
