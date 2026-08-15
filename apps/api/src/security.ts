import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";

const PUBLIC_KEY = "public-route";
const PERMISSIONS_KEY = "required-permissions";

export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class ApiAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const authorization = request.headers.authorization as string | undefined;
    if (!authorization?.startsWith("Bearer ")) throw new UnauthorizedException("请先登录");
    try {
      request.user = await this.jwt.verifyAsync(authorization.slice(7));
      const { iat, exp, ...claims } = request.user;
      response.setHeader("X-Access-Token", await this.jwt.signAsync(claims, { expiresIn: "7d" }));
    } catch {
      throw new UnauthorizedException("登录已失效，请重新登录");
    }
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const granted = new Set<string>(request.user.permissions ?? []);
    if (required.length && !granted.has("system.manage") && !required.every((permission) => granted.has(permission))) throw new ForbiddenException("当前角色无权执行此操作");
    return true;
  }
}
