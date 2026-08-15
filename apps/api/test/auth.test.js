const assert = require("node:assert/strict");
const test = require("node:test");
const { AuthService } = require("../dist/src/modules/auth.js");

function configuredService() {
  process.env.WECOM_CORP_ID = "corp-id";
  process.env.WECOM_AGENT_ID = "1000002";
  process.env.WECOM_SECRET = "secret";
  process.env.WECOM_REDIRECT_URI = "https://erp.example.com/api/auth/wecom/callback";
  const activeUser = { id: "erp-user", companyId: "company", username: "zhangsan", displayName: "张三", isActive: true, userRoles: [] };
  const prisma = { user: { findUnique: async ({ where }) => where.wecomUserId ? activeUser : activeUser } };
  const jwt = {
    signAsync: async (payload) => payload.purpose === "wecom-login" ? `state:${payload.mode}` : `token:${payload.sub}`,
    verifyAsync: async (token) => ({ purpose: "wecom-login", mode: token.slice("state:".length), returnOrigin: "https://mobile.example.com" })
  };
  return new AuthService(prisma, jwt);
}

test("普通浏览器生成企业微信扫码登录地址", async () => {
  const result = await configuredService().wecomStart("Mozilla/5.0 Chrome/126");
  assert.equal(result.mode, "qr-scan");
  assert.match(result.authorizeUrl, /^https:\/\/open\.work\.weixin\.qq\.com\/wwopen\/sso\/qrConnect\?/);
  assert.match(result.authorizeUrl, /agentid=1000002/);
});

test("企业微信浏览器生成静默网页授权地址", async () => {
  const result = await configuredService().wecomStart("Mozilla/5.0 wxwork/4.1.30");
  assert.equal(result.mode, "wecom-browser");
  assert.match(result.authorizeUrl, /^https:\/\/open\.weixin\.qq\.com\/connect\/oauth2\/authorize\?/);
  assert.match(result.authorizeUrl, /scope=snsapi_base/);
});

test("扫码回调使用扫码身份接口并签发系统令牌", async (t) => {
  const service = configuredService();
  const start = await service.wecomStart("Mozilla/5.0 Chrome/126");
  const requested = [];
  t.mock.method(global, "fetch", async (url) => {
    requested.push(String(url));
    return { ok: true, json: async () => requested.length === 1 ? { access_token: "access" } : { userid: "wecom-zhangsan" } };
  });
  const result = await service.wecomCallback("callback-code", start.state);
  assert.equal(result.accessToken, "token:erp-user");
  assert.equal(result.returnOrigin, "https://mobile.example.com");
  assert.match(requested[1], /\/cgi-bin\/auth\/getuserinfo\?/);
});

test("企业微信浏览器回调使用网页授权身份接口", async (t) => {
  const service = configuredService();
  const start = await service.wecomStart("wxwork");
  const requested = [];
  t.mock.method(global, "fetch", async (url) => {
    requested.push(String(url));
    return { ok: true, json: async () => requested.length === 1 ? { access_token: "access" } : { UserId: "wecom-zhangsan" } };
  });
  await service.wecomCallback("callback-code", start.state);
  assert.match(requested[1], /\/cgi-bin\/user\/getuserinfo\?/);
});
