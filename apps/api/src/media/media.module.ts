import { Module } from "@nestjs/common";
import { MediaStorageService } from "./media.service";

@Module({ providers: [MediaStorageService], exports: [MediaStorageService] })
export class MediaModule {}
