import { Body, Controller, Get, Injectable, Post, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import type { Response } from "express";

import { PrismaService } from "../prisma.service";
import { Public } from "../security";

type WecomMode = "qr-scan" | "wecom-browser";
type WecomApiResponse = { errcode?: number; errmsg?: string; access_token?: string; UserId?: string; userid?: string };

const localOrigins = ["http://localhost:5173", "http://localhost:5177", "http://127.0.0.1:5173", "http://127.0.0.1:5177"];

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}
  private wecomConfig() { return { corpId: process.env.WECOM_CORP_ID, agentId: process.env.WECOM_AGENT_ID, secret: process.env.WECOM_SECRET, redirectUri: process.env.WECOM_REDIRECT_URI ?? "http://localhost:3000/api/auth/wecom/callback", scope: process.env.WECOM_SCOPE ?? "snsapi_base" }; }
  wecomEnabled() { const config = this.wecomConfig(); return Boolean(config.corpId && config.agentId && config.secret); }
  private async issue(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } } });
    if (!user || !user.isActive) throw new UnauthorizedException("企业微信成员未绑定或账号已停用");
    const permissions = [...new Set(user.userRoles.filter((item) => item.role.isActive).flatMap((item) => item.role.rolePermissions.map((rp) => rp.permission.code)))];
    const token = await this.jwt.signAsync({ sub: user.id, companyId: user.companyId, permissions });
    return { accessToken: token, user: { id: user.id, displayName: user.displayName, username: user.username, permissions } };
  }
  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username }, include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } } });
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException("用户名或密码错误");
    return this.issue(user.id);
  }
  async wecomStart(userAgent: string | undefined, requestOrigin?: string) {
    if (!this.wecomEnabled()) throw new UnauthorizedException("企业微信登录尚未配置");
    const config = this.wecomConfig();
    const inWecomBrowser = /wxwork|wecom|wxworklocal/i.test(userAgent ?? "");
    const mode: WecomMode = inWecomBrowser ? "wecom-browser" : "qr-scan";
    const allowedOrigins = [...new Set([process.env.WEB_ORIGIN ?? "http://localhost:5173", process.env.MOBILE_ORIGIN ?? "http://localhost:5177", ...localOrigins])];
    const returnOrigin = requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
    const state = await this.jwt.signAsync({ purpose: "wecom-login", mode, returnOrigin, nonce: randomBytes(18).toString("hex") }, { expiresIn: "5m" });
    const authorizeUrl = inWecomBrowser
      ? `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(config.corpId!)}&redirect_uri=${encodeURIComponent(config.redirectUri)}&response_type=code&scope=${encodeURIComponent(config.scope)}&state=${state}#wechat_redirect`
      : `https://open.work.weixin.qq.com/wwopen/sso/qrConnect?appid=${encodeURIComponent(config.corpId!)}&agentid=${encodeURIComponent(config.agentId!)}&redirect_uri=${encodeURIComponent(config.redirectUri)}&state=${state}`;
    return { authorizeUrl, mode, state };
  }
  async wecomCallback(code: string, state?: string) {
    if (!code || !this.wecomEnabled() || !state) throw new UnauthorizedException("企业微信登录参数无效或未配置");
    let loginState: { purpose?: string; mode?: WecomMode; returnOrigin?: string };
    try { loginState = await this.jwt.verifyAsync(state); } catch { throw new UnauthorizedException("企业微信登录请求已失效，请重新登录"); }
    if (loginState.purpose !== "wecom-login" || !["qr-scan", "wecom-browser"].includes(loginState.mode ?? "")) throw new UnauthorizedException("企业微信登录参数无效");
    const config = this.wecomConfig();
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(config.corpId!)}&corpsecret=${encodeURIComponent(config.secret!)}`);
    const tokenData = await tokenResponse.json() as WecomApiResponse;
    if (!tokenResponse.ok || !tokenData.access_token || tokenData.errcode) throw new UnauthorizedException(tokenData.errmsg ?? "企业微信令牌获取失败");
    const identityApi = loginState.mode === "qr-scan" ? "auth/getuserinfo" : "user/getuserinfo";
    const userResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/${identityApi}?access_token=${encodeURIComponent(tokenData.access_token)}&code=${encodeURIComponent(code)}`);
    const userData = await userResponse.json() as WecomApiResponse;
    const wecomUserId = userData.UserId ?? userData.userid;
    if (!userResponse.ok || userData.errcode) throw new UnauthorizedException(userData.errmsg ?? "无法获取企业微信成员身份");
    if (!wecomUserId) throw new UnauthorizedException(userData.errmsg ?? "无法获取企业微信成员身份");
    const user = await this.prisma.user.findUnique({ where: { wecomUserId } });
    if (!user) throw new UnauthorizedException("该企业微信成员尚未绑定 ERP 账号，请联系管理员");
    return { ...(await this.issue(user.id)), returnOrigin: loginState.returnOrigin };
  }
  async wecomReturnOrigin(state?: string) {
    const fallback = process.env.WEB_ORIGIN ?? "http://localhost:5173";
    if (!state) return fallback;
    try {
      const payload = await this.jwt.verifyAsync(state) as { purpose?: string; returnOrigin?: string };
      const allowed = [...new Set([fallback, process.env.MOBILE_ORIGIN ?? "http://localhost:5177", ...localOrigins])];
      return payload.purpose === "wecom-login" && payload.returnOrigin && allowed.includes(payload.returnOrigin) ? payload.returnOrigin : fallback;
    } catch { return fallback; }
  }
  async me(id: string) { const user = await this.prisma.user.findUniqueOrThrow({ where: { id }, include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } } }); const permissions = [...new Set(user.userRoles.filter((item) => item.role.isActive).flatMap((item) => item.role.rolePermissions.map((rp) => rp.permission.code)))]; return { id: user.id, username: user.username, displayName: user.displayName, permissions }; }
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post("login") login(@Body() body: { username: string; password: string }) { return this.auth.login(body.username, body.password); }
  @Public()
  @Get("wecom/config") wecomConfig(@Req() req: any) { return this.auth.wecomStart(req.headers["user-agent"], req.headers.origin); }
  @Public()
  @Get("wecom/callback") async wecomCallback(@Query("code") code: string, @Query("state") state: string, @Res() response: Response) { try { const result = await this.auth.wecomCallback(code, state); const target = `${result.returnOrigin ?? process.env.WEB_ORIGIN ?? "http://localhost:5173"}/#wecom_token=${encodeURIComponent(result.accessToken)}`; return response.redirect(target); } catch (error: any) { const target = `${await this.auth.wecomReturnOrigin(state)}/#wecom_error=${encodeURIComponent(error?.message ?? "企业微信登录失败")}`; return response.redirect(target); } }
  @Get("me") me(@Req() req: any) { return this.auth.me(req.user.sub); }
}
