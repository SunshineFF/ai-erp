import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import OSS from "ali-oss";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type MediaUpload = { buffer: Buffer; contentType: string; originalName: string; size: number };
export type StoredMedia = { key: string; url: string; provider: string };

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
const maxSize = 10 * 1024 * 1024;

@Injectable()
export class MediaStorageService {
  private readonly provider = (process.env.MEDIA_STORAGE ?? "local").toLowerCase();
  private readonly localDirectory = resolve(process.cwd(), process.env.MEDIA_LOCAL_DIR ?? "storage/media");

  validate(file?: MediaUpload) {
    if (!file) throw new BadRequestException("请选择支付凭证");
    if (!allowedTypes.has(file.contentType)) throw new BadRequestException("支付凭证仅支持 JPG、PNG、WebP、GIF 或 PDF");
    if (file.size > maxSize) throw new BadRequestException("支付凭证大小不能超过 10MB");
  }

  async upload(file: MediaUpload, prefix: string): Promise<StoredMedia> {
    this.validate(file);
    const extension = this.extension(file.originalName, file.contentType);
    const key = `${prefix.replace(/^\/+|\/+$/g, "")}/${randomUUID()}${extension}`;
    if (this.provider === "aliyun-oss") return this.uploadOss(file, key);
    if (this.provider !== "local") throw new InternalServerErrorException(`不支持的媒体存储类型: ${this.provider}`);
    await mkdir(join(this.localDirectory, posix.dirname(key)), { recursive: true });
    await writeFile(join(this.localDirectory, key), file.buffer);
    const baseUrl = (process.env.MEDIA_PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3030}`).replace(/\/$/, "");
    return { key, url: `${baseUrl}/media/${key}`, provider: "local" };
  }

  async remove(media: StoredMedia) {
    if (media.provider === "aliyun-oss") {
      const client = this.ossClient();
      await client.delete(media.key);
      return;
    }
    await unlink(join(this.localDirectory, media.key));
  }

  async withRemoved<T>(media: StoredMedia, action: () => Promise<T>): Promise<T> {
    if (media.provider === "aliyun-oss") {
      const client = this.ossClient();
      const backup = await (client as OSS & { get(name: string): Promise<{ content: Buffer }> }).get(media.key);
      await client.delete(media.key);
      try { return await action(); }
      catch (error) {
        try { await client.put(media.key, backup.content); }
        catch { throw new InternalServerErrorException("数据库删除失败，且 OSS 对象恢复失败，请立即人工检查"); }
        throw error;
      }
    }
    const filePath = join(this.localDirectory, media.key);
    const backup = await readFile(filePath);
    await unlink(filePath);
    try { return await action(); }
    catch (error) {
      try { await mkdir(dirname(filePath), { recursive: true }); await writeFile(filePath, backup); }
      catch { throw new InternalServerErrorException("数据库删除失败，且本地文件恢复失败，请立即人工检查"); }
      throw error;
    }
  }

  private extension(name: string, contentType: string) {
    const match = /\.[a-z0-9]+$/i.exec(name);
    if (match) return match[0].toLowerCase();
    return ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "application/pdf": ".pdf" } as Record<string, string>)[contentType] ?? "";
  }

  private ossClient() {
    const region = process.env.ALIYUN_OSS_REGION;
    const bucket = process.env.ALIYUN_OSS_BUCKET;
    const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID;
    const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET;
    if (!region || !bucket || !accessKeyId || !accessKeySecret) throw new InternalServerErrorException("阿里云 OSS 配置不完整");
    return new OSS({ region, bucket, accessKeyId, accessKeySecret, endpoint: process.env.ALIYUN_OSS_ENDPOINT || undefined, secure: true });
  }

  private async uploadOss(file: MediaUpload, key: string): Promise<StoredMedia> {
    const client = this.ossClient();
    await client.put(key, file.buffer, { headers: { "Content-Type": file.contentType, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}` } });
    const baseUrl = (process.env.ALIYUN_OSS_CDN_BASE_URL || process.env.ALIYUN_OSS_PUBLIC_BASE_URL || client.generateObjectUrl(key)).replace(/\/$/, "");
    return { key, url: `${baseUrl}/${key}`, provider: "aliyun-oss" };
  }
}
