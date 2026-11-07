// Sign-in flow load test: POST /api/member/signin -> GET /api/characters ->
// GET /api/marketplace/listings, at a fixed arrival rate.
//
// Env:
//   EMAIL, PASSWORD   an existing account (required)
//   BASE_URL          default https://api.barrowspire.app
//   RATE              iterations started per second (default 5)
//   DURATION          e.g. 3m (default 3m)
//   BAD_PW_EVERY      every Nth iteration signs in with a wrong password and
//                     stops there; 0 turns it off (default 0)
//
// See ../README.md for the scenarios.
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

const BASE_URL = __ENV.BASE_URL || 'https://api.barrowspire.app';
const EMAIL = __ENV.EMAIL;
const PASSWORD = __ENV.PASSWORD;
const RATE = Number(__ENV.RATE || 5);
const DURATION = __ENV.DURATION || '3m';
const BAD_PW_EVERY = Number(__ENV.BAD_PW_EVERY || 0);

if (!EMAIL || !PASSWORD) {
  throw new Error('set EMAIL and PASSWORD (an existing account)');
}

export const options = {
  scenarios: {
    signin_flow: {
      // constant-arrival-rate starts RATE iterations a second however slow the
      // server gets, so latency shows up as latency instead of as fewer
      // requests (closed-loop VUs would hide it)
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.max(10, RATE * 2),
      maxVUs: Math.max(50, RATE * 10),
    },
  },
  // Not enforced: watch Grafana instead. Uncomment to make k6 exit non-zero.
  // thresholds: {
  //   'http_req_failed{name:signin}': ['rate<0.01'],
  //   'http_req_duration{name:signin}': ['p(95)<500'],
  //   'http_req_duration{name:listings}': ['p(95)<300'],
  // },
};

const jsonHeaders = { 'Content-Type': 'application/json' };

export default function () {
  const n = exec.scenario.iterationInTest + 1;
  const wrongPassword = BAD_PW_EVERY > 0 && n % BAD_PW_EVERY === 0;

  const signin = http.post(
    `${BASE_URL}/api/member/signin`,
    JSON.stringify({ email: EMAIL, password: wrongPassword ? `${PASSWORD}-wrong` : PASSWORD }),
    { headers: jsonHeaders, tags: { name: 'signin', wrong_password: String(wrongPassword) } },
  );

  if (wrongPassword) {
    check(signin, { 'wrong password is refused (401)': (r) => r.status === 401 });
    return;
  }

  const ok = check(signin, { 'signin 200': (r) => r.status === 200 });
  if (!ok) return;

  const token = signin.json('result.access_token');
  const authed = { headers: { Authorization: `Bearer ${token}` } };

  const characters = http.get(`${BASE_URL}/api/characters`, { ...authed, tags: { name: 'characters' } });
  check(characters, { 'characters 200': (r) => r.status === 200 });

  const listings = http.get(`${BASE_URL}/api/marketplace/listings`, { ...authed, tags: { name: 'listings' } });
  check(listings, { 'listings 200': (r) => r.status === 200 });
}
