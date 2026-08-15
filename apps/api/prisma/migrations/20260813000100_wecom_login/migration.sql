-- 企业微信成员身份绑定
ALTER TABLE "User" ADD COLUMN "wecomUserId" TEXT;
CREATE UNIQUE INDEX "User_wecomUserId_key" ON "User"("wecomUserId");
