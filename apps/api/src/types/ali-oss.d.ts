declare module "ali-oss" {
  type OssOptions = { region: string; bucket: string; accessKeyId: string; accessKeySecret: string; endpoint?: string; secure?: boolean };
  export default class OSS {
    constructor(options: OssOptions);
    put(key: string, content: Buffer, options?: { headers?: Record<string, string> }): Promise<unknown>;
    delete(key: string): Promise<unknown>;
    generateObjectUrl(key: string): string;
  }
}
