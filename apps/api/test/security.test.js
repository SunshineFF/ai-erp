const assert = require("node:assert/strict");
const test = require("node:test");
const { ApiAuthGuard } = require("../dist/src/security.js");

test("每次鉴权成功都签发新的 7 天令牌", async () => {
  let signPayload;
  let signOptions;
  let responseToken;
  const jwt = {
    verifyAsync: async () => ({ sub: "user-1", companyId: "company-1", permissions: ["material.view"], iat: 1, exp: 2 }),
    signAsync: async (payload, options) => { signPayload = payload; signOptions = options; return "renewed-token"; }
  };
  const reflector = { getAllAndOverride: (key) => key === "public-route" ? false : [] };
  const request = { headers: { authorization: "Bearer current-token" } };
  const response = { setHeader: (name, value) => { if (name === "X-Access-Token") responseToken = value; } };
  const context = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response })
  };

  assert.equal(await new ApiAuthGuard(jwt, reflector).canActivate(context), true);
  assert.equal(responseToken, "renewed-token");
  assert.deepEqual(signOptions, { expiresIn: "7d" });
  assert.deepEqual(signPayload, { sub: "user-1", companyId: "company-1", permissions: ["material.view"] });
});

test("过期令牌拒绝访问且不续期", async () => {
  let signed = false;
  const jwt = { verifyAsync: async () => { throw new Error("expired"); }, signAsync: async () => { signed = true; } };
  const reflector = { getAllAndOverride: (key) => key === "public-route" ? false : [] };
  const context = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: "Bearer expired-token" } }), getResponse: () => ({ setHeader() {} }) })
  };

  await assert.rejects(() => new ApiAuthGuard(jwt, reflector).canActivate(context), /登录已失效/);
  assert.equal(signed, false);
});
